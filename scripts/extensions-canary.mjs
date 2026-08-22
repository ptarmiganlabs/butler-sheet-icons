#!/usr/bin/env node
// Platform: Cross-platform (macOS, Linux, Windows)
// Requires: Node.js

/**
 * Does the `#extensions` build-time override still work once the binary has been packaged?
 *
 * The override landed with issue #1135 and was only ever exercised on macOS/arm64. This repo ships
 * SEA binaries for three platforms, and its signature failure mode is "works everywhere except
 * inside the packaged binary" - the Windows signing timestamp URL changed in May 2026 and nothing
 * noticed until a release failed in August. Issue #1137.
 *
 * A Node script rather than a workflow step written twice, for the same reason `scripts/bundle.mjs`
 * is one: the alternative is the same logic in bash and in PowerShell, and the two drift. That is
 * the problem #1128 was filed about.
 *
 * What it asserts, on whichever platform it runs:
 *
 *   1. A binary built WITH an override registers what the override describes - a whole command, an
 *      option on a command that already exists, and the `beforeAction` hook.
 *   2. `node:crypto` still works inside that packaged binary. `src/lib/qseow/qseow-logout.js`
 *      imports it, so every binary already depends on it, and nothing asserted it survived
 *      packaging on any platform.
 *   3. A binary built WITHOUT an override is unchanged - none of the above is present, and the
 *      version is what it should be.
 *
 * Signing is deliberately not part of this. The two signing canaries already cover that path, and
 * the question here is packaging and module resolution. See #1137 for the gap that leaves on
 * Windows, where the release script strips and re-applies a signature around postject.
 *
 * Usage:
 *   node scripts/extensions-canary.mjs
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

const BUILD_DIR = 'build';

/**
 * The throwaway extensions module, written into `build/` rather than a system temp directory.
 *
 * That is not laziness about temp files: the module imports `commander`, and
 * `scripts/bundle.mjs` both imports it to read `seamVersion` and refuses a build whose Commander
 * major differs from core's. Somewhere under the repo root is the only place a bare `commander`
 * specifier resolves to the same copy core uses. `build/` is already git-ignored and already
 * cleaned by the release scripts.
 */
const MODULE_PATH = join(BUILD_DIR, 'canary-extensions.mjs');

/** Named for what it is, so nobody finds it in a process list and wonders. */
const BINARY_PATH = join(BUILD_DIR, process.platform === 'win32' ? 'bsi-canary.exe' : 'bsi-canary');

/** Markers the contributed code prints, matched in the assertions below. */
const COMMAND_MARKER = 'CANARY_COMMAND_RAN';
const HOOK_MARKER = 'CANARY_HOOK_RAN';
const CRYPTO_MARKER = 'CANARY_CRYPTO';
const REFUSAL_MARKER = 'CANARY_REFUSED_THIS_RUN';

/** Where the safety net writes, relative to the binary's working directory. */
const CRASH_DUMP_DIR = 'crash_dumps';

const EXTENSIONS_MODULE_SOURCE = `import { Command, Option } from 'commander';
import { createHash, randomBytes, generateKeyPairSync, sign, verify } from 'node:crypto';

// Exercises node:crypto's native binding from inside the packaged binary. Several primitives
// rather than one, because the interesting question is whether the binding survives packaging at
// all, and a single hash would not touch the asymmetric paths.
const cryptoSmoke = () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const data = Buffer.from('butler-sheet-icons canary');
    const signature = sign(null, data, privateKey);

    return {
        hash: createHash('sha256').update(data).digest('hex').slice(0, 8),
        randomBytes: randomBytes(8).length,
        roundTrip: verify(null, data, publicKey, signature),
        rejectsTampered: !verify(null, Buffer.from('tampered'), publicKey, signature),
    };
};

export const extensions = {
    seamVersion: 1,
    variant: 'canary',
    commands: [
        new Command('canary-check')
            .description('Canary: report what this binary can do.')
            .action(() => {
                console.log('${COMMAND_MARKER}');
                console.log('${CRYPTO_MARKER} ' + JSON.stringify(cryptoSmoke()));
            }),
        new Command('canary-refuse')
            .description('Canary: a command the hook stops before it runs.')
            .addOption(new Option('--canary-fault', 'Canary: throw an unmarked error instead.'))
            .action(() => {
                console.log('THIS_ACTION_MUST_NOT_RUN');
            }),
    ],
    options: [
        {
            path: 'qseow create-sheet-thumbnails',
            option: new Option('--canary-note <text>', 'Canary: a contributed option.'),
        },
    ],
    hooks: {
        beforeAction: (path) => {
            console.log('${HOOK_MARKER} ' + path);

            // Stopping a run deliberately, the way the contract says to: throw, and mark the error
            // so it is reported as a failed command line rather than as a crash. Issue #1150.
            if (path === 'canary-refuse') {
                // Unmarked when asked for: a fault must still reach the safety net, or "no crash
                // dump" would be satisfiable by simply removing the net.
                if (process.argv.includes('--canary-fault')) {
                    throw new TypeError('canary fault, not a refusal');
                }

                throw Object.assign(new Error('${REFUSAL_MARKER}'), { expected: true });
            }
        },
    },
};
`;

/**
 * Run a command, failing the canary if it does not succeed.
 *
 * @param {string} label - What this step is, for the failure message.
 * @param {string} command - Executable to run.
 * @param {string[]} args - Arguments.
 * @param {object} [env] - Extra environment variables.
 *
 * @returns {void} Nothing.
 *
 * @throws {Error} When the command exits non-zero, so a failed build is not mistaken for a passed
 *     assertion further down.
 */
const run = (label, command, args, env = {}) => {
    console.log(`\n--- ${label}`);

    const result = spawnSync(command, args, {
        stdio: 'inherit',
        env: { ...process.env, ...env },
        shell: false,
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(`${label} failed with status ${result.status}`);
    }
};

/** Assertions that failed, collected so one run reports every problem rather than the first. */
const failures = [];

/**
 * Record whether one expectation held.
 *
 * @param {string} description - What was expected.
 * @param {boolean} passed - Whether it held.
 * @param {string} [detail] - Extra context shown when it did not.
 *
 * @returns {void} Nothing.
 */
const check = (description, passed, detail = '') => {
    console.log(`  ${passed ? 'ok  ' : 'FAIL'}  ${description}`);

    if (!passed) {
        failures.push(`${description}${detail ? ` - ${detail}` : ''}`);
    }
};

/**
 * Run the packaged binary, assert it exited cleanly, and return what it printed.
 *
 * stdout and stderr are joined: Commander writes help to stdout and errors to stderr, and an
 * assertion that cares which one a string arrived on would be asserting Commander's behaviour
 * rather than the binary's.
 *
 * The exit status is asserted **here** rather than at each call site, because every caller wants
 * the same thing and one that forgot would be the bug: a binary that prints all the right markers
 * and then dies during teardown - an unhandled rejection inside a contributed hook is exactly the
 * platform-specific fault this canary exists to find - would otherwise satisfy every assertion
 * that reads its output, and the run would go green on a binary that crashed.
 *
 * @param {string} label - What this invocation is, for the assertion line.
 * @param {string[]} args - Arguments to pass to the binary.
 *
 * @returns {{output: string, status: number}} What it printed, and how it exited.
 */
const runBinary = (label, args) => {
    const result = spawnSync(BINARY_PATH, args, { encoding: 'utf8', shell: false });

    if (result.error) {
        throw result.error;
    }

    check(`${label} exits cleanly`, result.status === 0, `exit status ${result.status}`);

    return { output: `${result.stdout ?? ''}${result.stderr ?? ''}`, status: result.status };
};

/**
 * Run the binary expecting it to refuse, and report how it refused.
 *
 * Separate from {@link runBinary} because that one asserts a clean exit, and the whole point here is
 * a non-zero one. Issue #1150.
 *
 * @param {string} label - What is being checked, for the assertion text.
 * @param {string[]} args - Arguments to pass to the binary.
 *
 * @returns {{output: string, status: number}} Combined output and exit status.
 */
const runBinaryExpectingFailure = (label, args) => {
    const result = spawnSync(BINARY_PATH, args, { encoding: 'utf8', shell: false });

    if (result.error) {
        throw result.error;
    }

    check(`${label} exits non-zero`, result.status !== 0, `exit status ${result.status}`);

    return { output: `${result.stdout ?? ''}${result.stderr ?? ''}`, status: result.status };
};

/**
 * Bundle, package and inject a SEA binary from the current source tree.
 *
 * Mirrors what the release scripts do, minus real code signing: bundle, generate the blob, copy the
 * running Node executable, inject.
 *
 * macOS gets an **ad-hoc** signature, exactly as `build-script/build-macos.sh` does. That is not a
 * step towards signing coverage - it needs no certificate and asserts no identity - it is simply
 * that arm64 macOS refuses to run an unsigned binary at all, so without it this script could not be
 * developed or tried on the machine most likely to be running it. Windows and Linux need nothing:
 * Windows runs a binary whose signature postject invalidated, and Linux has no such notion. Real
 * signing stays with the two signing canaries, per #1137.
 *
 * @param {string} [extensionsModule] - Value for `EXTENSIONS_MODULE`, or undefined for a plain build.
 *
 * @returns {void} Nothing. Leaves the binary at `BINARY_PATH`.
 */
const buildBinary = (extensionsModule) => {
    // Set to the empty string rather than omitted for a plain build. `run()` merges over
    // `process.env`, so omitting it would let an EXTENSIONS_MODULE exported in the surrounding
    // shell reach the build that is supposed to have none - and the leg whose entire claim is
    // "no override was applied" would be assuming it rather than asserting it. bundle.mjs already
    // treats an empty value as absent.
    const env = { EXTENSIONS_MODULE: extensionsModule ?? '' };

    run('esbuild bundle', process.execPath, ['scripts/bundle.mjs', 'bundle'], env);
    run('SEA blob', process.execPath, [
        '--experimental-sea-config',
        'build-script/sea-config.json',
    ]);

    rmSync(BINARY_PATH, { force: true });
    copyFileSync(process.execPath, BINARY_PATH);

    // The release scripts use `cp`, which carries the execute bit across. copyFileSync does too on
    // the platforms measured, but the canary would fail confusingly rather than informatively if it
    // ever did not - and an exec bit is not the platform difference this exists to find.
    if (process.platform !== 'win32') {
        chmodSync(BINARY_PATH, 0o755);
    }

    if (process.platform === 'darwin') {
        run('strip signature', 'codesign', ['--remove-signature', BINARY_PATH]);
    }

    run('postject inject', process.execPath, ['scripts/bundle.mjs', 'inject', BINARY_PATH]);

    if (process.platform === 'darwin') {
        run('ad-hoc sign', 'codesign', ['--sign', '-', BINARY_PATH]);
    }
};

console.log(`extensions canary - ${process.platform}/${process.arch}, node ${process.version}`);

mkdirSync(BUILD_DIR, { recursive: true });
writeFileSync(MODULE_PATH, EXTENSIONS_MODULE_SOURCE);

// ---------------------------------------------------------------------------------------------
// A binary built WITH an override
//
// MODULE_PATH is relative, so bundle.mjs resolves it to an absolute path and hands that to esbuild
// as an alias value and to pathToFileURL. On Windows that is a C:\ path with backslashes, which is
// the part of #1135 that had never run anywhere but macOS.
// ---------------------------------------------------------------------------------------------
buildBinary(MODULE_PATH);

console.log('\n=== with an override ===');

const contributed = runBinary('the contributed command', ['canary-check']);

check('the contributed command runs', contributed.output.includes(COMMAND_MARKER));
check('the beforeAction hook fires', contributed.output.includes(HOOK_MARKER));
check(
    'the hook is given the command path',
    contributed.output.includes(`${HOOK_MARKER} canary-check`),
    contributed.output.trim()
);

const cryptoLine = contributed.output.split('\n').find((line) => line.includes(CRYPTO_MARKER));
const braceAt = cryptoLine ? cryptoLine.indexOf('{') : -1;

// Parsed defensively rather than inline. An unguarded JSON.parse here would throw out of the
// script on a line that arrived malformed or interleaved, skipping every remaining assertion and
// the whole no-override half of the run - so the report would be a stack trace instead of a list
// naming which checks failed, which is the opposite of what `failures` exists for.
let cryptoResult = {};
let parseError = braceAt >= 0 ? '' : 'no readable marker line';

if (braceAt >= 0) {
    try {
        cryptoResult = JSON.parse(cryptoLine.slice(braceAt));
    } catch (err) {
        parseError = err.message;
    }
}

check(
    'the packaged binary reported a readable node:crypto result',
    parseError === '',
    `${parseError}${cryptoLine ? ` - ${cryptoLine.trim()}` : ''}`
);

check('node:crypto hashes inside the packaged binary', cryptoResult.hash?.length === 8);
check('node:crypto produces random bytes', cryptoResult.randomBytes === 8);
check('node:crypto completes a sign/verify round trip', cryptoResult.roundTrip === true);
check('node:crypto rejects a payload that does not match', cryptoResult.rejectsTampered === true);

// ---------------------------------------------------------------------------------------------
// What the binary says it is - issue #1152
// ---------------------------------------------------------------------------------------------
//
// A variant build used to report exactly what a stock one did, so an issue filed from one could not
// say so and could not be told apart. The variant version is derived by the bundler from the
// extensions module's nearest package.json, which here is this repository's own.
const variantVersion = runBinary('--version on a variant build', ['--version']);
const canaryVersion = require('../package.json').version;

check(
    'the headline names the variant',
    variantVersion.output.includes(`butler-sheet-icons ${canaryVersion} (canary)`),
    variantVersion.output.trim()
);
check(
    'the core version is reported',
    /\n\s+core\s+/.test(variantVersion.output),
    variantVersion.output.trim()
);
check(
    'the extensions module version is derived and reported',
    new RegExp(`\\n\\s+canary\\s+${canaryVersion.replace(/\./g, '\\.')}`).test(
        variantVersion.output
    ),
    variantVersion.output.trim()
);
check(
    'the build date is reported',
    /\n\s+built\s+\d{4}-\d{2}-\d{2}/.test(variantVersion.output),
    variantVersion.output.trim()
);

const contributedHelp = runBinary('help for a command carrying a contributed option', [
    'qseow',
    'create-sheet-thumbnails',
    '--help',
]);

check(
    'a contributed option reaches an existing command',
    contributedHelp.output.includes('--canary-note')
);

// ---------------------------------------------------------------------------------------------
// A hook that stops the run deliberately - issue #1150
// ---------------------------------------------------------------------------------------------
//
// `src/lib/extensions/apply.js` documents throwing as the way a `beforeAction` hook aborts a run.
// It did abort it, and then reported it as a crash: `FATAL: Unhandled promise rejection` plus a
// crash dump on disk, because the rejection reached the process-level safety net with nobody
// handling it. Both halves were behaving correctly and disagreeing about what the throw meant.
//
// Asserted here rather than only in a unit test because the unit tests were green throughout: they
// call the hook directly, so nothing exercised the path between the throw and the process's
// reaction to it. That path only exists in a real run.
rmSync(CRASH_DUMP_DIR, { recursive: true, force: true });

const refused = runBinaryExpectingFailure('a run the hook refuses', ['canary-refuse']);

check(
    'the refusal message is reported',
    refused.output.includes(REFUSAL_MARKER),
    refused.output.trim().split('\n').slice(-3).join(' | ')
);
check('the action handler did not run', !refused.output.includes('THIS_ACTION_MUST_NOT_RUN'));
check(
    'the refusal is not reported as an unhandled rejection',
    !refused.output.includes('Unhandled promise rejection'),
    refused.output.trim().split('\n').slice(-3).join(' | ')
);
check('the refusal writes no crash dump', !existsSync(CRASH_DUMP_DIR));

// The other half of the same guarantee: an unmarked throw is a fault, and a fault still crashes.
// Without this, "no crash dump" could be satisfied by removing the safety net altogether.
const faulted = runBinaryExpectingFailure('a run the hook faults on', [
    'canary-refuse',
    '--canary-fault',
]);

check(
    'an unmarked failure still takes the crash path',
    faulted.output.includes('Unhandled promise rejection'),
    faulted.output.trim().split('\n').slice(-3).join(' | ')
);
check('an unmarked failure still writes a crash dump', existsSync(CRASH_DUMP_DIR));

rmSync(CRASH_DUMP_DIR, { recursive: true, force: true });

// ---------------------------------------------------------------------------------------------
// A binary built WITHOUT one - the build every release actually makes
// ---------------------------------------------------------------------------------------------
buildBinary(undefined);

console.log('\n=== without an override ===');

const version = runBinary('--version', ['--version']);
const expectedVersion = require('../package.json').version;

check(
    `--version reports ${expectedVersion}`,
    version.output.split('\n')[0].trim() === `butler-sheet-icons ${expectedVersion}`,
    version.output.trim()
);

// The half that keeps the feature honest: no override, so nothing to name, and the block must not
// appear at all. A stock binary still says only what it is and when it was built.
check(
    'no variant is named on a stock build',
    !version.output.includes('(') && !version.output.includes('canary'),
    version.output.trim()
);
check(
    'a stock build still reports its build date',
    /\n\s+built\s+\d{4}-\d{2}-\d{2}/.test(version.output),
    version.output.trim()
);
check(
    'a stock build reports no core/variant split',
    !/\n\s+core\s+/.test(version.output),
    version.output.trim()
);

const plainHelp = runBinary('--help', ['--help']);

check('the contributed command is absent', !plainHelp.output.includes('canary-check'));

const plainCommandHelp = runBinary('help for the unmodified command', [
    'qseow',
    'create-sheet-thumbnails',
    '--help',
]);

check('the contributed option is absent', !plainCommandHelp.output.includes('--canary-note'));
check(
    'the ordinary command tree is intact',
    plainHelp.output.includes('qseow') && plainHelp.output.includes('qscloud')
);

rmSync(MODULE_PATH, { force: true });
rmSync(BINARY_PATH, { force: true });

if (failures.length > 0) {
    console.error(`\n${failures.length} assertion(s) failed:`);

    for (const failure of failures) {
        console.error(`  - ${failure}`);
    }

    // `process.exitCode`, never `process.exit()` - the codebase's standing rule, and it matters
    // most precisely here. A hard exit discards whatever is still buffered, which on a TTY is
    // invisible because terminal writes are synchronous, but a CI log collector is a pipe.
    // `src/lib/util/flush-exit.js` carries the measurement: 400 lines followed by a hard exit
    // delivered 333 and lost the final report block entirely. The list just written *is* this
    // canary's whole diagnostic value on a platform nobody can reproduce locally, and the two
    // exceptions the rule allows both exist for Puppeteer and enigma handles that can hang a
    // shutdown. Nothing here holds the event loop open - every step is spawnSync - so the process
    // ends on its own the moment this returns.
    process.exitCode = 1;
} else {
    console.log('\nAll assertions passed.');
}
