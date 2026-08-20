import { describe, test, expect } from '@jest/globals';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * End-to-end signal tests, in real child processes taking real signals.
 *
 * Every other test in this area installs the handlers onto a throwaway
 * `EventEmitter` with an injected `exit` spy — necessary, because a suite
 * cannot register listeners on the Jest worker's own `process` or actually
 * terminate it. The cost is that nothing proves the wiring: mutation testing
 * showed that deleting BOTH `installSignalHandlers()` and the outermost
 * `process.exit` block from the entry point left all 3371 unit tests green,
 * with Ctrl-C doing nothing at all. These close that gap (issue #1107).
 *
 * `.integration.test.js` because they spawn processes and are timing-bound.
 * They need no network, credentials or browser, so they are safe anywhere.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const signalHandlersUrl = pathToFileURL(
    path.resolve(HERE, '..', 'lib', 'util', 'signal-handlers.js')
).href;
const interruptUrl = pathToFileURL(path.resolve(HERE, '..', 'lib', 'util', 'interrupt.js')).href;
const flushExitUrl = pathToFileURL(path.resolve(HERE, '..', 'lib', 'util', 'flush-exit.js')).href;

const READY = '__BSI_READY__';

/**
 * Spawns a child that installs the real handlers, signals it, and reports how
 * it died.
 *
 * @param {object} spec - The scenario.
 * @param {string} spec.signal - Signal to send, e.g. `'SIGINT'`.
 * @param {string} [spec.body] - Extra module source run before READY is printed.
 *
 * @returns {Promise<{code: number|null, signal: string|null, stdout: string}>} How it ended.
 */
const runSignalled = ({ signal, body = '' }) =>
    new Promise((resolve, reject) => {
        const source = [
            `import { installSignalHandlers } from ${JSON.stringify(signalHandlersUrl)};`,
            `import { beginInterruptibleRun, isInterrupted, interruptExitCode } from ${JSON.stringify(interruptUrl)};`,
            `import { flushAndExit } from ${JSON.stringify(flushExitUrl)};`,
            'installSignalHandlers();',
            body,
            // Mirrors the entry point's own tail.
            'const idle = setInterval(() => {}, 1000);',
            `console.log(${JSON.stringify(READY)});`,
            'setTimeout(() => { clearInterval(idle); }, 25000);',
        ].join('\n');

        const child = childProcess.spawn('node', ['--input-type=module', '-e', source], {
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let signalled = false;
        child.stdout.on('data', (chunk) => {
            stdout += chunk;
            if (!signalled && stdout.includes(READY)) {
                signalled = true;
                child.kill(signal);
            }
        });

        child.on('error', reject);
        child.on('close', (code, closeSignal) => resolve({ code, signal: closeSignal, stdout }));
    });

describe('the real entry-point wiring (issue #1107)', () => {
    test('SIGINT outside a run exits 130, not killed by the signal', async () => {
        const result = await runSignalled({ signal: 'SIGINT' });

        // `signal: null` is the assertion that matters: with no handler the
        // process would be KILLED by SIGINT and report signal 'SIGINT' with a
        // null code. A real exit code means a listener ran.
        expect(result.signal).toBeNull();
        expect(result.code).toBe(130);
    }, 30000);

    test('SIGTERM exits 143', async () => {
        const result = await runSignalled({ signal: 'SIGTERM' });

        expect(result.signal).toBeNull();
        expect(result.code).toBe(143);
    }, 30000);

    test('SIGHUP exits 129 rather than dying on the OS default', async () => {
        // Node's default disposition for SIGHUP terminates WITHOUT running
        // `process.on('exit')`, which is the hook Puppeteer relies on to kill
        // Chromium — and its own SIGHUP handler is switched off at launch.
        const result = await runSignalled({ signal: 'SIGHUP' });

        expect(result.signal).toBeNull();
        expect(result.code).toBe(129);
    }, 30000);

    test('a signal during a run still exits, and reports the run first', async () => {
        const result = await runSignalled({
            signal: 'SIGINT',
            body: [
                'beginInterruptibleRun();',
                // Stands in for the app loop: something that only ends because
                // the interrupt tells it to.
                'const loop = setInterval(() => {',
                '  if (isInterrupted()) {',
                '    clearInterval(loop);',
                "    console.log('RESULT  INTERRUPTED');",
                '    flushAndExit(interruptExitCode());',
                '  }',
                '}, 10);',
            ].join('\n'),
        });

        expect(result.stdout).toContain('RESULT  INTERRUPTED');
        expect(result.signal).toBeNull();
        expect(result.code).toBe(130);
    }, 30000);

    test('the report survives the exit even when stdout is a pipe', async () => {
        // The regression this guards: `process.exit()` discards a pipe's
        // buffered writes. Measured before the fix at 333 of 400 lines
        // delivered, with the verdict block lost — invisible on a TTY, which
        // is why it survived manual testing.
        const result = await runSignalled({
            signal: 'SIGINT',
            body: [
                'beginInterruptibleRun();',
                'const loop = setInterval(() => {',
                '  if (isInterrupted()) {',
                '    clearInterval(loop);',
                "    for (let i = 0; i < 400; i += 1) console.log('pad ' + i + ' ' + 'x'.repeat(180));",
                "    console.log('RESULT  INTERRUPTED');",
                '    flushAndExit(interruptExitCode());',
                '  }',
                '}, 10);',
            ].join('\n'),
        });

        expect(result.stdout).toContain('RESULT  INTERRUPTED');
        expect(result.stdout.split('\n').filter((l) => l.startsWith('pad '))).toHaveLength(400);
        expect(result.code).toBe(130);
    }, 30000);
});

describe('the real CLI binary, end to end', () => {
    /**
     * A syntactically valid throwaway certificate pair. QSEoW options are
     * mandatory and the PEM is parsed before any connection is attempted, so
     * without one the command exits before a signal can reach it. Generated
     * offline; it is never presented to anything.
     *
     * @returns {{dir: string, cert: string, key: string}|null} Paths, or null
     *     if openssl is unavailable on this machine.
     */
    const makeCertPair = () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsi-signal-'));
        const cert = path.join(dir, 'c.pem');
        const key = path.join(dir, 'k.pem');
        const result = childProcess.spawnSync(
            'openssl',
            // prettier-ignore
            ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
             '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=bsi-test'],
            { encoding: 'utf-8', timeout: 30000 }
        );

        if (result.status !== 0 || !fs.existsSync(cert)) {
            fs.rmSync(dir, { recursive: true, force: true });
            return null;
        }

        return { dir, cert, key };
    };

    test('Ctrl-C on a real run exits 130, not killed by the signal', async () => {
        const certs = makeCertPair();

        if (!certs) {
            // No openssl: the module-level tests above still cover the
            // handlers; only the entry-point wiring goes unchecked here.
            return;
        }

        try {
            const entry = path.resolve(HERE, '..', 'butler-sheet-icons.js');
            // TEST-NET-1 (RFC 5737) is guaranteed unroutable, so the first QRS
            // call blocks and the process is alive and busy when the signal
            // lands. No traffic leaves the machine.
            const child = childProcess.spawn(
                'node',
                // prettier-ignore
                [entry, 'qseow', 'create-sheet-thumbnails',
                 '--host', '192.0.2.1', '--appid', 'deadbeef',
                 '--apiuserdir', 'X', '--apiuserid', 'Y',
                 '--logonuserdir', 'X', '--logonuserid', 'Y', '--logonpwd', 'Z',
                 '--contentlibrary', 'L',
                 '--certfile', certs.cert, '--certkeyfile', certs.key],
                { stdio: ['ignore', 'pipe', 'pipe'] }
            );

            let stdout = '';
            let signalled = false;
            child.stdout.on('data', (chunk) => {
                stdout += chunk;
                if (!signalled && stdout.includes('Starting creation of thumbnails')) {
                    signalled = true;
                    child.kill('SIGINT');
                }
            });

            const ended = await new Promise((resolve) => {
                child.on('close', (code, signal) => resolve({ code, signal }));
            });

            // This is the assertion the unit tests structurally cannot make.
            // Deleting `installSignalHandlers()` from the entry point left all
            // 3371 of them green while Ctrl-C did nothing; here the process
            // would come back as KILLED by SIGINT (signal set, code null)
            // instead of exiting 130.
            expect(ended.signal).toBeNull();
            expect(ended.code).toBe(130);
        } finally {
            fs.rmSync(certs.dir, { recursive: true, force: true });
        }
    }, 60000);
});
