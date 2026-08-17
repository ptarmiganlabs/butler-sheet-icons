// filepath: /Users/goran/code/butler-sheet-icons/src/__tests__/butler-sheet-icons.test.js
import {
    test,
    expect,
    describe,
    jest,
    beforeAll,
    afterAll,
    beforeEach,
    afterEach,
} from '@jest/globals';
import 'dotenv/config';
import {} from 'commander';
import {} from '../globals.js';
import childProcess from 'child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import { BROKEN_PIPE_EXIT_CODE } from '../lib/util/fatal-handlers.js';

// Mock all the imported modules that are used in the main file
jest.mock('../globals.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
    },
    appVersion: '1.0.0-test',
}));

jest.mock('../lib/qseow/qseow-create-thumbnails.js', () => ({
    qseowCreateThumbnails: jest.fn().mockResolvedValue(true),
}));

jest.mock('../lib/cloud/cloud-create-thumbnails.js', () => ({
    qscloudCreateThumbnails: jest.fn().mockResolvedValue(true),
}));

jest.mock('../lib/cloud/cloud-collections.js', () => ({
    qscloudListCollections: jest.fn().mockResolvedValue(true),
}));

jest.mock('../lib/cloud/cloud-remove-sheet-icons.js', () => ({
    qscloudRemoveSheetIcons: jest.fn().mockResolvedValue(true),
}));

jest.mock('../lib/browser/browser-installed.js', () => ({
    browserInstalled: jest.fn().mockResolvedValue([]),
}));

jest.mock('../lib/browser/browser-uninstall.js', () => ({
    browserUninstall: jest.fn().mockResolvedValue(true),
    browserUninstallAll: jest.fn().mockResolvedValue(true),
}));

jest.mock('../lib/browser/browser-list-available.js', () => ({
    browserListAvailable: jest.fn().mockResolvedValue([]),
}));

/**
 * Runs the butler-sheet-icons CLI in a child process and returns the result.
 *
 * @param {string[]} [args] - CLI arguments to pass to the spawned process. Defaults to `[]`.
 * @param {object} [options] - Extra `spawnSync` options, merged over the defaults. Use `env` to override the environment and `input`/`timeout` to prove a command does not block.
 *
 * @returns {import('child_process').SpawnSyncReturns<string>} The `spawnSync` result containing `status`, `stdout`, `stderr`, etc.
 */
const execCLI = (args = [], options = {}) => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const cliPath = path.resolve(__dirname, '../butler-sheet-icons.js');

    // Execute the CLI script with the provided arguments
    const result = childProcess.spawnSync('node', [cliPath, ...args], {
        encoding: 'utf-8',
        env: process.env,
        ...options,
    });

    return result;
};

describe('butler-sheet-icons CLI', () => {
    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
    });

    test('should show version info', () => {
        const result = execCLI(['--version']);
        // We don't need to check the exact version, just that it doesn't error
        expect(result.status).toBe(0);
    });

    test('should show help info', () => {
        const result = execCLI(['--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('Usage:');
        expect(result.stdout).toContain('Options:');
        expect(result.stdout).toContain('Commands:');
    });

    describe('BSI_LOG_TIMESTAMPS (issue #1002)', () => {
        // One pattern, composed everywhere it is asserted, so the three copies
        // cannot drift: the prefix winston emits is an ISO-8601 timestamp.
        const STAMP = String.raw`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z`;

        // Ambient colour settings rewrite `info.level` in the child and break
        // any regex anchored on a bare `info:` - jest-worker itself injects
        // FORCE_COLOR=1 into worker children, so this bites anyone running
        // this file outside the --runInBand npm scripts. Same scrub as
        // NON_TTY_ENV below.
        const scrubbedEnv = { ...process.env };
        delete scrubbedEnv.NO_COLOR;
        delete scrubbedEnv.FORCE_COLOR;

        // The default (stamped) case is asserted in-process against the real
        // transport in globals.test.js - spawning a child for it would cost
        // ~3.5 s on the Windows runner. Only the disabled branch needs a real
        // process, because `consoleTimestamps` is fixed at module load.
        //
        // `browser list-installed` is the cheapest command that routes a real
        // line through the logger: no network, no config, read-only. No
        // assertion on exit status - a corrupt entry in the host's browser
        // cache fails the command for reasons unrelated to timestamps, and
        // the App version line is emitted before any cache work happens.
        test('BSI_LOG_TIMESTAMPS=false drops the prefix but keeps level and message', () => {
            const result = execCLI(['browser', 'list-installed'], {
                env: { ...scrubbedEnv, BSI_LOG_TIMESTAMPS: 'false' },
                timeout: 20000,
            });
            expect(result.stdout).toMatch(/^info: App version:/m);
            // No line anywhere in the output may still carry the stamp.
            expect(result.stdout).not.toMatch(new RegExp(`^${STAMP}`, 'm'));
        });
    });

    test('should handle qseow create-sheet-thumbnails command', () => {
        // Since we don't want to actually run the command and we've mocked all the dependencies,
        // we'll test that the command is registered correctly
        const result = execCLI(['qseow', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('create-sheet-thumbnails');
    });

    test('should handle qscloud create-sheet-thumbnails command', () => {
        const result = execCLI(['qscloud', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('create-sheet-thumbnails');
    });

    test('should handle qscloud list-collections command', () => {
        const result = execCLI(['qscloud', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('list-collections');
    });

    test('should handle qscloud remove-sheet-icons command', () => {
        const result = execCLI(['qscloud', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('remove-sheet-icons');
    });

    test('should handle browser list-installed command', () => {
        const result = execCLI(['browser', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('list-installed');
    });

    test('should handle browser uninstall command', () => {
        const result = execCLI(['browser', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('uninstall');
    });

    test('should handle browser uninstall-all command', () => {
        const result = execCLI(['browser', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('uninstall-all');
    });

    test('should handle browser install command', () => {
        const result = execCLI(['browser', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('install');
    });

    test('should handle browser list-available command', () => {
        const result = execCLI(['browser', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('list-available');
    });

    test('should handle browser check command', () => {
        const result = execCLI(['browser', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('check');
    });
});

/** Printed by the child once the handlers are installed, to prove it got that far. */
const HANDLERS_READY = '__bsi_fatal_handlers_installed__';

describe('fatal error safety net, end to end (issue #946)', () => {
    // No mocks here: a real child process, the real handlers, the real crash
    // dump writer, and a real directory on disk. Measured against the handlers
    // as they were before the fix, this burst wrote 400 files.
    let dumpDir;

    beforeEach(() => {
        dumpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsi-fatal-e2e-'));
    });

    afterEach(() => {
        fs.rmSync(dumpDir, { recursive: true, force: true });
    });

    /**
     * Runs a child process that installs the real fatal handlers and then
     * emits a burst of unhandled rejections.
     *
     * @param {number} rejectionCount - How many rejections the child should produce.
     *
     * @returns {import('child_process').SpawnSyncReturns<string>} The `spawnSync` result.
     */
    const runFatalBurst = (rejectionCount) => {
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const handlersPath = path.resolve(__dirname, '../lib/util/fatal-handlers.js');
        // A bare Windows path is not a valid ESM specifier — `import 'C:\...'`
        // fails with ERR_UNSUPPORTED_ESM_URL_SCHEME. Feed the loader a file URL
        // on every platform.
        const handlersUrl = pathToFileURL(handlersPath).href;
        const source = [
            `import { installFatalHandlers } from ${JSON.stringify(handlersUrl)};`,
            'installFatalHandlers();',
            `console.log(${JSON.stringify(HANDLERS_READY)});`,
            `for (let i = 0; i < ${rejectionCount}; i += 1) Promise.reject(new Error('boom ' + i));`,
        ].join('\n');

        const result = childProcess.spawnSync('node', ['--input-type=module', '-e', source], {
            encoding: 'utf-8',
            timeout: 30000,
            env: {
                ...process.env,
                BSI_CRASH_DUMP_DIR: dumpDir,
                BSI_CRASH_DUMP_ENABLE: '1',
                BSI_CRASH_DUMP_CREATE_JSON: '1',
                BSI_CRASH_DUMP_CREATE_TEXT: '1',
            },
        });

        // A child that never got as far as installing the handlers would fail
        // every assertion below as "no crash dumps written", which points at
        // the wrong thing entirely. Fail here instead, quoting the child.
        if (!result.stdout?.includes(HANDLERS_READY)) {
            throw new Error(
                [
                    'The child process did not reach installFatalHandlers().',
                    `status: ${result.status}, signal: ${result.signal}`,
                    `stdout: ${result.stdout}`,
                    `stderr: ${result.stderr}`,
                ].join('\n')
            );
        }

        return result;
    };

    test('a burst of 200 unhandled rejections writes exactly one crash dump', () => {
        const result = runFatalBurst(200);

        const files = fs.readdirSync(dumpDir);
        expect(files.filter((f) => f.endsWith('.json'))).toHaveLength(1);
        expect(files.filter((f) => f.endsWith('.txt'))).toHaveLength(1);
        expect(files).toHaveLength(2);

        // Zero-byte dumps were the visible symptom in the issue. Both files
        // must have actually been written, not merely created.
        for (const file of files) {
            expect(fs.statSync(path.join(dumpDir, file)).size).toBeGreaterThan(0);
        }

        expect(result.status).toBe(1);
    });

    test('the process exits with code 1 rather than hanging', () => {
        const result = runFatalBurst(1);

        // `spawnSync` reports a timeout kill via `signal`, so a null signal is
        // the assertion that the process ended on its own.
        expect(result.signal).toBeNull();
        expect(result.status).toBe(1);
    });

    test('a single FATAL line is logged, naming the first failure only', () => {
        const result = runFatalBurst(200);

        // The winston console transport writes every level to stdout.
        const fatalLines = result.stdout
            .split('\n')
            .filter((line) => line.includes('FATAL: Unhandled promise rejection'));

        expect(fatalLines).toHaveLength(1);
        expect(fatalLines[0]).toContain('boom 0');
    });
});

describe('a closed output pipe leaves nothing behind, end to end (issue #1019)', () => {
    // `butler-sheet-icons browser list-available ... | head -12` used to leave a
    // crash report in the working directory, because `head` closing the pipe
    // raised EPIPE and nothing was listening for it.
    //
    // The read end is closed from this side rather than by a real `head`, so
    // there is no shell and no `head` binary involved and the test runs
    // identically on the Windows runner.
    let dumpDir;
    let result;

    /** Exit code the child uses if it is still writing long after the pipe closed. */
    const CHILD_GAVE_UP = 20;

    /**
     * Runs a child that installs the real handlers and writes steadily to
     * stdout, then closes the read end as soon as the first output arrives.
     *
     * @returns {Promise<{status: number|null, signal: string|null, stdout: string, stderr: string}>}
     *   The child's exit status and the output seen before the pipe was closed.
     */
    const runUntilPipeCloses = () =>
        new Promise((resolve, reject) => {
            const __dirname = path.dirname(fileURLToPath(import.meta.url));
            const handlersPath = path.resolve(__dirname, '../lib/util/fatal-handlers.js');
            const handlersUrl = pathToFileURL(handlersPath).href;
            const source = [
                `import { installFatalHandlers } from ${JSON.stringify(handlersUrl)};`,
                'installFatalHandlers();',
                `console.log(${JSON.stringify(HANDLERS_READY)});`,
                // Keep writing, so a write is guaranteed to land after the pipe
                // has gone. The counter is a safety valve: a child that is
                // somehow still writing has failed the test, and should say so
                // by exiting rather than by hanging.
                'let ticks = 0;',
                'const tick = () => {',
                `    if (ticks > 200) process.exit(${CHILD_GAVE_UP});`,
                '    ticks += 1;',
                '    for (let i = 0; i < 200; i += 1) process.stdout.write(`line ${ticks}:${i}\\n`);',
                '    setTimeout(tick, 5);',
                '};',
                'tick();',
            ].join('\n');

            const child = childProcess.spawn('node', ['--input-type=module', '-e', source], {
                stdio: ['ignore', 'pipe', 'pipe'],
                timeout: 20000,
                env: {
                    ...process.env,
                    BSI_CRASH_DUMP_DIR: dumpDir,
                    BSI_CRASH_DUMP_ENABLE: '1',
                    BSI_CRASH_DUMP_CREATE_JSON: '1',
                    BSI_CRASH_DUMP_CREATE_TEXT: '1',
                },
            });

            let stdout = '';
            let stderr = '';
            child.stderr.setEncoding('utf-8');
            child.stderr.on('data', (chunk) => {
                stderr += chunk;
            });

            // This is the `head` moment: enough output has been read, so the
            // reader goes away.
            child.stdout.setEncoding('utf-8');
            child.stdout.once('data', (chunk) => {
                stdout += chunk;
                child.stdout.destroy();
            });

            child.on('error', reject);
            child.on('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
        });

    beforeAll(async () => {
        dumpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsi-epipe-e2e-'));
        result = await runUntilPipeCloses();

        // A child that never installed the handlers would pass "no crash dumps
        // written" while proving nothing at all.
        if (!result.stdout.includes(HANDLERS_READY)) {
            throw new Error(
                [
                    'The child process did not reach installFatalHandlers().',
                    `status: ${result.status}, signal: ${result.signal}`,
                    `stdout: ${result.stdout}`,
                    `stderr: ${result.stderr}`,
                ].join('\n')
            );
        }
    }, 30000);

    afterAll(() => {
        fs.rmSync(dumpDir, { recursive: true, force: true });
    });

    test('no crash dump is written', () => {
        // The whole point of the issue: an operator piping to `head` should not
        // accumulate crash reports in the working directory.
        //
        // Asserted with the dump's own error message rather than as a bare file
        // list, because a bare list cannot be diagnosed after the fact. Which
        // error a dead output stream raises depends on whether it is a pipe or a
        // socket and on how much was still unread when the reader went - so a
        // failure here is almost always one more code that is not recognised as
        // the reader leaving. `ENOTCONN` was exactly that, and cost several
        // hundred re-runs to identify from a list of two filenames.
        const files = fs.readdirSync(dumpDir);
        const reasons = files
            .filter((file) => file.endsWith('.json'))
            .map((file) => JSON.parse(fs.readFileSync(path.join(dumpDir, file), 'utf-8')))
            .map((dump) => `${dump?.context?.source}: ${dump?.error?.message}`);

        expect({ files, reasons }).toEqual({ files: [], reasons: [] });
    });

    test('the run ends on its own, with the shell convention for a closed pipe', () => {
        expect(result.signal).toBeNull();
        expect(result.status).toBe(BROKEN_PIPE_EXIT_CODE);
    });

    test('nothing is printed about it', () => {
        // Not even a FATAL line: the pipe closing is what the operator asked
        // for, and any message would be going into the stream that just closed.
        expect(result.stderr).toBe('');
    });
});

/**
 * Spawns the CLI once per distinct argument/environment pair, reusing the
 * result for every assertion that needs it.
 *
 * Several assertions below examine different aspects of the same run - the exit
 * code, the guidance text, the absence of a stack trace, the absence of escape
 * codes. Spawning a fresh process for each cost ~3.5 s apiece on the Windows
 * runner, where process creation is far more expensive than on Linux, and took
 * this file from 4 s to 56 s. Caching keeps the assertions separate, which is
 * what makes a failure legible, without paying for the separation.
 *
 * @param {string[]} args - CLI arguments.
 * @param {object} options - `spawnSync` options, as for {@link execCLI}.
 *
 * @returns {import('child_process').SpawnSyncReturns<string>} The cached `spawnSync` result.
 */
const cachedCLI = (() => {
    const cache = new Map();

    return (args, options) => {
        const key = JSON.stringify([args, options.env, options.input, options.timeout]);

        if (!cache.has(key)) {
            cache.set(key, execCLI(args, options));
        }

        return cache.get(key);
    };
})();

// The rows of the #900 verification matrix that a machine can check. The
// Windows console rows - code pages, PowerShell hosts, cursor redraw - need a
// human looking at a screen, but everything below runs unattended on both
// ubuntu-latest and windows-latest via pr-unit-tests.yaml, which is what stops
// these properties from silently regressing between manual passes.
describe('interactive mode without a terminal', () => {
    // spawnSync gives the child a pipe for stdin and stdout, so every run in
    // this block is non-TTY by construction - no pty harness needed.
    const NON_TTY_ENV = { ...process.env };
    delete NON_TTY_ENV.BSI_NO_INTERACTIVE;
    delete NON_TTY_ENV.BSI_ASCII_ONLY;
    delete NON_TTY_ENV.NO_COLOR;
    delete NON_TTY_ENV.FORCE_COLOR;

    const ESCAPE_CODE = new RegExp(`${String.fromCharCode(27)}\\[`);

    test('fails fast instead of hanging on a stdin that will never answer', () => {
        // The single most important property in the whole feature. A wizard
        // blocking on a closed stdin inside a scheduled container run is an
        // outage, not a cosmetic problem.
        const result = cachedCLI(['interactive'], {
            input: '',
            timeout: 20000,
            env: NON_TTY_ENV,
        });

        // spawnSync reports a timeout kill via `signal`, so a null signal is
        // the assertion that the process ended on its own rather than being
        // killed after blocking.
        expect(result.signal).toBeNull();
        expect(result.status).toBe(1);
    });

    test('explains why, and how to proceed, rather than just failing', () => {
        const result = cachedCLI(['interactive'], { input: '', timeout: 20000, env: NON_TTY_ENV });
        const output = result.stdout + result.stderr;

        expect(output).toContain('needs a terminal');
        expect(output).toContain('docker run -it');
    });

    test('the explanation carries no stack trace', () => {
        // The guidance is already a complete explanation. Issue #785 was about
        // exactly this kind of noise drowning the useful line.
        const result = cachedCLI(['interactive'], { input: '', timeout: 20000, env: NON_TTY_ENV });
        const output = result.stdout + result.stderr;

        expect(output).not.toContain('    at ');
    });

    test('BSI_NO_INTERACTIVE is honoured independently of terminal detection', () => {
        const result = execCLI(['interactive'], {
            input: '',
            timeout: 20000,
            env: { ...NON_TTY_ENV, BSI_NO_INTERACTIVE: '1' },
        });

        expect(result.signal).toBeNull();
        expect(result.status).toBe(1);
        expect(result.stdout + result.stderr).toContain('BSI_NO_INTERACTIVE');
    });

    test('redirected output carries no escape codes', () => {
        // False for the whole program until the console transport learned to
        // check isTTY, so this guards every command, not just this one.
        const result = cachedCLI(['interactive'], { input: '', timeout: 20000, env: NON_TTY_ENV });

        expect(result.stdout).not.toMatch(ESCAPE_CODE);
        expect(result.stderr).not.toMatch(ESCAPE_CODE);
    });

    test('NO_COLOR is honoured', () => {
        const result = execCLI(['browser', 'list-installed'], {
            timeout: 20000,
            env: { ...NON_TTY_ENV, NO_COLOR: '1' },
        });

        expect(result.stdout).not.toMatch(ESCAPE_CODE);
    });
});

describe('interactive --self-test', () => {
    const SELF_TEST_ENV = { ...process.env };
    delete SELF_TEST_ENV.BSI_ASCII_ONLY;
    delete SELF_TEST_ENV.BSI_NO_INTERACTIVE;

    const NON_ASCII_PATTERN = /[^\x20-\x7e\r\n\t]/;

    test('succeeds with no terminal, so it can run unattended', () => {
        // Exiting 0 here is what lets this be the CI check guarding the non-TTY
        // path. The capability report is complete and useful without prompts;
        // only the prompt gallery needs a terminal.
        const result = cachedCLI(['interactive', '--self-test'], {
            input: '',
            timeout: 30000,
            env: SELF_TEST_ENV,
        });

        expect(result.signal).toBeNull();
        expect(result.status).toBe(0);
    });

    test('reports the capabilities that decide how the wizard renders', () => {
        const result = cachedCLI(['interactive', '--self-test'], {
            input: '',
            timeout: 30000,
            env: SELF_TEST_ENV,
        });

        for (const row of [
            'stdin is a terminal',
            'typeof stdout.hasColors',
            'colour enabled',
            'unicode symbols in use',
            'table border set',
            'available',
        ]) {
            expect(result.stdout).toContain(row);
        }
    });

    test('skips the prompt gallery, saying why', () => {
        const result = cachedCLI(['interactive', '--self-test'], {
            input: '',
            timeout: 30000,
            env: SELF_TEST_ENV,
        });

        expect(result.stdout).toContain('skipped');
    });

    test('emits nothing outside printable ASCII when the fallback is forced', () => {
        // "No mojibake" as a mechanical assertion rather than a screenshot -
        // the only degradation criterion checkable without a human at a Windows
        // console.
        const result = execCLI(['interactive', '--self-test'], {
            input: '',
            timeout: 30000,
            env: { ...SELF_TEST_ENV, BSI_ASCII_ONLY: '1' },
        });

        expect(result.status).toBe(0);
        expect(result.stdout).not.toMatch(NON_ASCII_PATTERN);
    });
});

describe('adding interactive mode changes nothing that already worked', () => {
    test('bare invocation still prints help and exits 1', () => {
        const result = execCLI([]);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('Usage:');
    });

    test('the new command is discoverable from top-level help', () => {
        const result = execCLI(['--help']);

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('interactive');
    });

    test('--self-test stays out of help, being a diagnostic rather than a feature', () => {
        const result = execCLI(['interactive', '--help']);

        expect(result.status).toBe(0);
        expect(result.stdout).not.toContain('--self-test');
    });

    test('the browser commands are untouched', () => {
        const result = execCLI(['browser', '--help']);

        expect(result.status).toBe(0);
        for (const leaf of [
            'install',
            'uninstall',
            'uninstall-all',
            'list-installed',
            'list-available',
            'check',
        ]) {
            expect(result.stdout).toContain(leaf);
        }
        expect(result.stdout).not.toContain('interactive');
    });
});
