import { describe, test, expect } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// What the macOS binary is signed with, beside the hardened runtime, by scripts/release-macos.sh
// and scripts/insider-build-mac.sh. The binary is a copy of node, and the official node binary is
// signed with six entitlements. V8 needs two of them, for memory that is writable and executable,
// which the hardened runtime refuses without them: signed with the runtime and no entitlements,
// the binary dies at start. The other four are node's needs as a development tool. get-task-allow
// lets any process of the same user attach a debugger, and allow-dyld-environment-variables with
// disable-library-validation let a library be injected. A binary that holds a QSEoW client
// certificate or a Qlik Cloud API key has no business granting them on a customer's Mac.
// Notarization does not ask for them either: Apple accepts all six.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ENTITLEMENTS = path.join(repoRoot, 'release-config', 'butler-sheet-icons.entitlements');
const WANTED = [
    'com.apple.security.cs.allow-jit',
    'com.apple.security.cs.allow-unsigned-executable-memory',
];

/**
 * The keys a plist holds, sorted.
 *
 * @param {string} xml - The plist.
 *
 * @returns {string[]} Its keys.
 */
const keysOf = (xml) => [...xml.matchAll(/<key>([^<]+)<\/key>/g)].map((match) => match[1]).sort();

describe('the macOS entitlements', () => {
    test('are the two V8 needs, and no others', () => {
        expect(keysOf(readFileSync(ENTITLEMENTS, 'utf8'))).toEqual(WANTED);
    });

    // codesign reads the file with AMFI's XML parser, which is stricter than plutil: a `--` inside
    // a comment, which XML forbids, failed otlet's first signing rehearsal with
    // "AMFIUnserializeXML: syntax error near line 6" while `plutil -lint` called the file OK. Say
    // why beside the codesign call in scripts/release-macos.sh instead.
    test('carry no comment for codesign to parse', () => {
        expect(readFileSync(ENTITLEMENTS, 'utf8')).not.toMatch(/<!--/);
    });

    (process.platform === 'darwin' ? test : test.skip)(
        'are parsed by codesign, which signs with exactly those (macOS only)',
        () => {
            // Ad hoc, on a copy of a small system binary, with the hardened runtime as the release
            // signs: no keychain, no identity.
            const dir = mkdtempSync(path.join(os.tmpdir(), 'bsi-entitlements-'));

            try {
                const exe = path.join(dir, 'true');

                copyFileSync('/usr/bin/true', exe);

                const signed = spawnSync(
                    '/usr/bin/codesign',
                    [
                        '--force',
                        '-s',
                        '-',
                        '--options=runtime',
                        '--entitlements',
                        ENTITLEMENTS,
                        exe,
                    ],
                    { encoding: 'utf8' }
                );

                expect(signed.stderr).not.toMatch(/AMFIUnserializeXML|Failed to parse/);
                expect(signed.status).toBe(0);

                const shown = spawnSync(
                    '/usr/bin/codesign',
                    ['-d', '--entitlements', '-', '--xml', exe],
                    { encoding: 'utf8' }
                );

                expect(shown.status).toBe(0);
                expect(keysOf(shown.stdout)).toEqual(WANTED);
            } finally {
                rmSync(dir, { recursive: true, force: true });
            }
        }
    );
});
