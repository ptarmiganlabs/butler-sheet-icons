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

// The identifier scripts/release-macos.sh and scripts/insider-build-mac.sh sign with, and the
// designated requirement codesign writes for it under a Developer ID signature, team included. macOS
// recognises a later build as the same program by that requirement, so it is pinned: a script that
// drops or changes the identifier, or a signing secret swapped for another team's identity, fails
// here rather than shipping. homing and xray pin theirs the same way.
const IDENTIFIER = 'com.ptarmiganlabs.butler-sheet-icons';
const REQUIREMENT = `identifier "${IDENTIFIER}" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and certificate leaf[subject.OU] = "8DSHWRDQ8C"`;

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
 * taken out, and a version stamp cut back to its headline.
 */
const run = (which, args) => {
    const [file, argv] =
        which === 'binary' ? [BINARY, args] : [process.execPath, [SOURCE, ...args]];
    const result = spawnSync(file, argv, { cwd: workDir, encoding: 'utf8', timeout: 60_000 });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
        .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z /gm, '')
        // A run that stops before its header opens with a version stamp, and the binary's carries
        // the build date a source run cannot know - the same reason the `--version` test below
        // compares headlines only. Issue #1207.
        .replace(/^(butler-sheet-icons \S+(?: \([^)]*\))?) - .*$/m, '$1');

    return { status: result.status, signal: result.signal, output };
};

/**
 * What codesign says of the binary: its identifier, its flags, whether a Developer ID signed it,
 * and the keys of its entitlements.
 *
 * @returns {{identifier: string, flags: string, developerId: boolean, entitlements: string[]}} The
 * Identifier and flags lines' values, whether an Authority line names a Developer ID Application
 * certificate, and the entitlement keys, sorted.
 */
const signature = () => {
    const details = spawnSync('/usr/bin/codesign', ['-dvv', BINARY], { encoding: 'utf8' });
    const shown = spawnSync('/usr/bin/codesign', ['-d', '--entitlements', '-', '--xml', BINARY], {
        encoding: 'utf8',
    });

    return {
        identifier: /^Identifier=(.*)$/m.exec(details.stderr)?.[1] ?? '',
        flags: /flags=(\S+)/.exec(details.stderr)?.[1] ?? '',
        developerId: /^Authority=Developer ID Application: /m.test(details.stderr),
        entitlements: [...(shown.stdout ?? '').matchAll(/<key>([^<]+)<\/key>/g)]
            .map((match) => match[1])
            .sort(),
    };
};

const onMac = BINARY && process.platform === 'darwin';
const signed = onMac ? signature() : undefined;
const hardened = signed?.flags.includes('runtime') ?? false;
const developerId = signed?.developerId ?? false;

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
    // without the runtime, and then carries no entitlements and is named after its file.
    (hardened ? test : test.skip)(
        'signed with the hardened runtime, carries the two entitlements V8 needs and no others',
        () => {
            expect(signed.entitlements).toEqual(ENTITLEMENTS);
        }
    );

    (hardened ? test : test.skip)(`signed with the hardened runtime, is ${IDENTIFIER}`, () => {
        expect(signed.identifier).toBe(IDENTIFIER);
    });

    // An ad hoc signature has no certificate to pin, so this runs only where a Developer ID signed
    // the binary: the release, the insider build and the signing canary.
    (developerId ? test : test.skip)(
        'signed with the Developer ID, satisfies the pinned designated requirement',
        () => {
            const verified = spawnSync(
                '/usr/bin/codesign',
                ['--verify', '--strict', `--test-requirement==${REQUIREMENT}`, BINARY],
                { encoding: 'utf8' }
            );

            expect(verified.stderr).toBe('');
            expect(verified.status).toBe(0);
        }
    );
});
