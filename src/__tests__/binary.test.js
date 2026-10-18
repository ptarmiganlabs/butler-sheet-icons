import { afterAll, describe, test, expect } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The built binary, run beside the source on the same command lines. BSI has a binary for macOS,
// Windows and Linux, and until this suite nothing ran the macOS one after it was signed: a signature
// with the hardened runtime and an entitlement short of what V8 needs makes the binary die at
// start, exit 133, and that would have shipped. `npm run test:binary` runs it, on the binary
// BSI_BINARY names: the release, the insider build and the macOS leg of pr-unit-tests each run it
// on the binary they sign, after signing.
//
// Without BSI_BINARY the suite skips, which is what `npm run test:unit` sees. REQUIRE_BINARY=1
// turns that skip into a failure, so a job meant to test a binary cannot pass by testing nothing.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = path.join(repoRoot, 'src', 'butler-sheet-icons.js');
const BINARY = process.env.BSI_BINARY ? path.resolve(process.env.BSI_BINARY) : undefined;
const ENTITLEMENTS = [
    'com.apple.security.cs.allow-jit',
    'com.apple.security.cs.allow-unsigned-executable-memory',
];

if (!BINARY && process.env.REQUIRE_BINARY === '1') {
    throw new Error('REQUIRE_BINARY=1, but BSI_BINARY names no binary to test');
}

/** Where each run starts, so that nothing a run writes lands in the checkout. */
const workDir = mkdtempSync(path.join(os.tmpdir(), 'bsi-binary-'));

afterAll(() => rmSync(workDir, { recursive: true, force: true }));

/**
 * Run one command line, from the binary or from the source.
 *
 * @param {'binary'|'source'} which - What to run.
 * @param {string[]} args - The command line, without the program.
 *
 * @returns {{status: number|null, signal: string|null, output: string}} The exit status, the
 * signal that ended it, and stdout then stderr, with the timestamps the logger puts on each line
 * taken out.
 */
const run = (which, args) => {
    const [file, argv] =
        which === 'binary' ? [BINARY, args] : [process.execPath, [SOURCE, ...args]];
    const result = spawnSync(file, argv, { cwd: workDir, encoding: 'utf8', timeout: 60_000 });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.replace(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z /gm,
        ''
    );

    return { status: result.status, signal: result.signal, output };
};

/**
 * What codesign says of the binary: its flags, and the keys of its entitlements.
 *
 * @returns {{flags: string, entitlements: string[]}} The flags line's value, and the entitlement
 * keys, sorted.
 */
const signature = () => {
    const details = spawnSync('/usr/bin/codesign', ['-dv', BINARY], { encoding: 'utf8' });
    const shown = spawnSync('/usr/bin/codesign', ['-d', '--entitlements', '-', '--xml', BINARY], {
        encoding: 'utf8',
    });

    return {
        flags: /flags=(\S+)/.exec(details.stderr)?.[1] ?? '',
        entitlements: [...(shown.stdout ?? '').matchAll(/<key>([^<]+)<\/key>/g)]
            .map((match) => match[1])
            .sort(),
    };
};

const onMac = BINARY && process.platform === 'darwin';
const hardened = onMac && signature().flags.includes('runtime');

(BINARY ? describe : describe.skip)('the built binary', () => {
    test('is there', () => {
        expect(existsSync(BINARY)).toBe(true);
    });

    // The first thing a missing JIT entitlement stops: the binary never gets as far as parsing.
    test('starts, and reports the version the source does', () => {
        const binary = run('binary', ['--version']);
        const source = run('source', ['--version']);

        expect(binary.signal).toBeNull();
        expect(binary.status).toBe(0);
        expect(binary.output.split('\n')[0]).toBe(source.output.split('\n')[0]);
    });

    test.each([
        [['--help']],
        [['qseow', 'create-sheet-thumbnails', '--help']],
        [['qscloud', 'create-sheet-thumbnails', '--help']],
        [['browser', '--help']],
    ])('describes %j as the source does', (args) => {
        expect(run('binary', args)).toEqual(run('source', args));
    });

    test('rejects an unknown command as the source does', () => {
        const binary = run('binary', ['no-such-command']);

        expect(binary.status).not.toBe(0);
        expect(binary).toEqual(run('source', ['no-such-command']));
    });

    test('lists an empty browser cache as the source does', () => {
        const cache = path.join(workDir, 'browser-cache');

        mkdirSync(cache, { recursive: true });

        const args = ['browser', 'list-installed', '--browser-cache-dir', cache];
        const binary = run('binary', args);

        expect(binary.status).toBe(0);
        expect(binary).toEqual(run('source', args));
    });

    (onMac ? test : test.skip)('carries a valid signature (macOS)', () => {
        const verified = spawnSync('/usr/bin/codesign', ['--verify', '--strict', BINARY], {
            encoding: 'utf8',
        });

        expect(verified.stderr).toBe('');
        expect(verified.status).toBe(0);
    });

    // Only for a binary signed as the release signs it. `npm run build:macos` alone signs ad hoc
    // without the runtime, and then carries no entitlements at all.
    (hardened ? test : test.skip)(
        'signed with the hardened runtime, carries the two entitlements V8 needs and no others',
        () => {
            expect(signature().entitlements).toEqual(ENTITLEMENTS);
        }
    );
});
