#!/usr/bin/env node
// Platform: Cross-platform (macOS, Linux, Windows)
// Requires: Node.js

/**
 * The two SEA packaging steps that every build shares, defined once.
 *
 * Bundling and blob injection used to be written out in full in seven places - three release
 * scripts, three insider scripts and the local dev script - in a mix of bash and PowerShell. The
 * flag sets were identical, which is exactly the problem: a flag changed in six of them and missed
 * in the seventh produces a binary that differs on one platform or one channel only, and that
 * difference surfaces inside the packaged SEA binary rather than in any test. Issue #1128.
 *
 * `scripts/lib/macos-signing-keychain.sh` was extracted for the same reason, after two
 * hand-maintained copies had already drifted.
 *
 * Being a Node script rather than a shell library is deliberate: it removes the bash-vs-PowerShell
 * split rather than centralising each half separately, and it lets the one genuinely
 * platform-specific argument - macOS's `--macho-segment-name` - be derived from `process.platform`
 * instead of depending on which file the caller happens to be in.
 *
 * Usage:
 *   node scripts/bundle.mjs bundle
 *   node scripts/bundle.mjs inject <binary path>
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);

/** Set by every CI build; defaulted so the local dev script needs no environment. */
const distFileName = process.env.DIST_FILE_NAME ?? 'butler-sheet-icons';

const OUTFILE = './build/build.cjs';
const BLOB = './build/sea-prep.blob';

/** Must match the fuse Node itself looks for. Changing it breaks every binary. */
const SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

/** Mach-O only. Derived below rather than hand-placed at each call site. */
const MACHO_SEGMENT_NAME = 'NODE_SEA';

/**
 * Set by a variant build to substitute the module behind the `#extensions` specifier. Unset for
 * every build in this repository, which is what makes the committed default the bundled one.
 * Issue #1135.
 */
const extensionsModule = process.env.EXTENSIONS_MODULE
    ? resolve(process.env.EXTENSIONS_MODULE)
    : undefined;

/**
 * Stop a build whose extensions module targets a different contract version than this source tree.
 *
 * Both halves are always built together, so a mismatch belongs to the build rather than to the
 * machine the binary later runs on - which is why this is checked here and asserted nowhere at
 * runtime.
 *
 * @returns {Promise<void>} Resolves when the two versions agree; rejects otherwise, so the build
 *     stops before esbuild has produced anything.
 */
const checkExtensionsVersion = async () => {
    const { assertSeamVersion } = await import(
        new URL('../src/lib/extensions/version.js', import.meta.url).href
    );
    const { extensions } = await import(pathToFileURL(extensionsModule).href);

    assertSeamVersion(extensions, extensionsModule);
};

/**
 * Core's own Commander, aliased into an override build so exactly one copy is bundled.
 *
 * Without this, an extensions module outside this tree resolves `commander` from its own
 * `node_modules` and esbuild bundles a second copy. The two are different module instances, so a
 * `Command` built by one and added to a tree owned by the other fails - and it fails at run time
 * inside the packaged binary, after a build that reported success.
 */
const commanderEntry = require.resolve('commander');

/**
 * The version of Commander that a given file resolves.
 *
 * @param {string|URL} fromFile - The file to resolve from.
 *
 * @returns {string|undefined} The version, or undefined when it cannot be determined.
 */
const commanderVersionFrom = (fromFile) => {
    try {
        const entry = createRequire(fromFile).resolve('commander');

        // `commander/package.json` is not listed in the package's `exports`, so requiring it as a
        // subpath fails with ERR_PACKAGE_PATH_NOT_EXPORTED. Read from the package root instead.
        return JSON.parse(readFileSync(join(dirname(entry), 'package.json'), 'utf8')).version;
    } catch {
        return undefined;
    }
};

/**
 * Stop a build whose extensions module was written against a different major of Commander.
 *
 * The alias above guarantees one Commander in the bundle, which removes the two-instances crash.
 * What an alias cannot do is make code written against one major work against another, and that
 * failure lands in the same expensive place: a `Command` built against Commander 12 and dispatched
 * by core's 15 dies with `subCommand._prepareForParse is not a function`, at run time, on the
 * machine of whoever received the binary. Comparing the two here turns it into a build failure.
 *
 * Best effort by design: when either version cannot be determined the build proceeds rather than
 * being blocked by a guard that is itself unsure.
 *
 * @returns {void} Nothing. Returns normally when the majors agree or cannot be compared.
 *
 * @throws {Error} When the two majors differ, so the build stops before esbuild runs.
 */
const checkCommanderMatch = () => {
    const core = commanderVersionFrom(import.meta.url);
    const variant = commanderVersionFrom(pathToFileURL(extensionsModule));

    if (!core || !variant || core.split('.')[0] === variant.split('.')[0]) {
        return;
    }

    throw new Error(
        `Commander mismatch: ${extensionsModule} resolves commander ${variant}, this source tree uses ${core}. Only core's copy is bundled, so a description built against a different major would fail at run time rather than here. Align the extensions module on commander ${core}.`
    );
};

/**
 * The version declared by the nearest `package.json` above a file.
 *
 * Used to stamp a variant build with the version of the extensions module it bundled, so that
 * `--version` can report it. Derived rather than declared on purpose: a description cannot know its
 * own version without hard-coding a number, and a hard-coded number goes stale silently the first
 * time somebody forgets it. Issue #1152.
 *
 * Walks up rather than assuming the module sits beside its manifest - `src/index.js` is the ordinary
 * layout, and the manifest is a directory or two above it.
 *
 * @param {string} fromFile - Absolute path to the module.
 *
 * @returns {string|undefined} The version, or undefined when no manifest declares one.
 */
const packageVersionAbove = (fromFile) => {
    let directory = dirname(fromFile);

    for (;;) {
        try {
            const { version } = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));

            if (typeof version === 'string' && version !== '') {
                return version;
            }
        } catch {
            // No manifest here, or an unreadable one. Keep walking; the caller treats "not found"
            // as "do not report a variant version", which is the same as a source run.
        }

        const parent = dirname(directory);

        if (parent === directory) {
            return undefined;
        }

        directory = parent;
    }
};

/**
 * Seconds since the epoch, if the string is a plain non-negative integer.
 *
 * Deliberately strict. `SOURCE_DATE_EPOCH` is an integer by specification, and `Number('')` is 0
 * while `Number('   ')` is also 0 - so a loose parse would silently date every binary 1970-01-01
 * rather than falling through to something usable.
 *
 * @param {string|undefined} value - The candidate.
 *
 * @returns {number|undefined} The seconds, or undefined when it is not a usable integer.
 */
const epochSeconds = (value) => {
    if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
        return undefined;
    }

    const seconds = Number(value.trim());

    return Number.isSafeInteger(seconds) ? seconds : undefined;
};

/**
 * The commit this tree is at, as seconds since the epoch.
 *
 * @returns {number|undefined} The committer date, or undefined outside a usable git checkout.
 */
const commitEpochSeconds = () => {
    const result = spawnSync('git', ['log', '-1', '--format=%ct'], { encoding: 'utf8' });

    return result.status === 0 ? epochSeconds(String(result.stdout)) : undefined;
};

/**
 * The date stamped into every binary, as ISO yyyy-mm-dd in UTC.
 *
 * A date rather than a timestamp: it answers "roughly when did this come from?", and a
 * to-the-second value would make two builds of the same commit differ for no reader's benefit.
 *
 * **It is derived, not read off the clock, so that a build stays reproducible.** Stamping
 * `new Date()` meant two builds of the same commit on different days produced different bytes -
 * which quietly cost the project the ability to rebuild a published binary and compare it, the
 * check that distinguishes a benign difference from a tampered artifact. Three sources, in order:
 *
 * 1. **`SOURCE_DATE_EPOCH`**, the cross-ecosystem convention for exactly this. An explicit value
 *    wins, so a caller reproducing an old build can name its date.
 * 2. **The committer date of `HEAD`**, which makes every build of a given commit identical without
 *    anyone configuring anything - including the release jobs, which build from a checkout.
 * 3. **The wall clock**, only when neither is available: an exported tarball with no `.git` and no
 *    environment variable. Such a build is not reproducible, and nothing here can make it so.
 *
 * @returns {string} The date, in UTC.
 */
const buildDate = () => {
    const seconds = epochSeconds(process.env.SOURCE_DATE_EPOCH) ?? commitEpochSeconds();

    return new Date((seconds ?? Date.now() / 1000) * 1000).toISOString().slice(0, 10);
};

/**
 * Bundle the CLI into a single CJS file for the SEA blob.
 *
 * `format: 'cjs'` is not a preference: Node's SEA blob takes one CommonJS file. It is also why
 * top-level `await` cannot be used anywhere in the bundle - esbuild rejects it for this format,
 * while plain `node` accepts it, so it would pass the test suite and fail the release build.
 *
 * The `inject` + `define` pair rewrites `import.meta.url`, which has no meaning once the ESM
 * sources are flattened into CJS.
 *
 * @returns {Promise<void>} Resolves when the bundle has been written.
 */
const bundle = async () => {
    if (extensionsModule) {
        await checkExtensionsVersion();
        checkCommanderMatch();
    }

    const extensionsVersion = extensionsModule ? packageVersionAbove(extensionsModule) : undefined;

    await build({
        entryPoints: [`src/${distFileName}.js`],
        bundle: true,
        outfile: OUTFILE,
        format: 'cjs',
        platform: 'node',
        target: 'node24',
        inject: ['./src/lib/util/import-meta-url.js'],
        define: {
            'import.meta.url': 'import_meta_url',
            // Stamped into every binary so `--version` can report when it was built. A source run
            // has no define and reports no build date, which is why the reader guards on `typeof`.
            __BSI_BUILD_DATE__: JSON.stringify(buildDate()),
            // Only a variant build has an extensions version to report. `JSON.stringify(undefined)`
            // is `undefined` rather than a string, so this spreads to nothing for a stock build and
            // the identifier stays undeclared - exactly as in a source run.
            ...(extensionsVersion === undefined
                ? {}
                : { __BSI_EXTENSIONS_VERSION__: JSON.stringify(extensionsVersion) }),
        },
        alias: extensionsModule
            ? { '#extensions': extensionsModule, commander: commanderEntry }
            : undefined,
    });
};

/**
 * Inject the SEA blob into a copy of the Node executable.
 *
 * postject is invoked through its own CLI entry point with `node`, rather than through `npx` or the
 * `.bin` shim, so there is no dependence on npx cache state and no `.cmd` special case on Windows.
 * It is a pinned devDependency for the same reason - five of the seven previous call sites resolved
 * to whatever version happened to be latest.
 *
 * The caller must strip the executable's existing signature first: postject rewrites the binary,
 * which invalidates any signature already on it.
 *
 * @param {string} binaryPath - The Node executable copy to inject into.
 *
 * @returns {void}
 *
 * @throws {Error} When postject exits non-zero, so the build stops rather than shipping an
 *     executable with no blob in it.
 */
const inject = (binaryPath) => {
    const args = [
        require.resolve('postject/dist/cli.js'),
        binaryPath,
        'NODE_SEA_BLOB',
        BLOB,
        '--sentinel-fuse',
        SENTINEL_FUSE,
    ];

    if (process.platform === 'darwin') {
        args.push('--macho-segment-name', MACHO_SEGMENT_NAME);
    }

    const result = spawnSync(process.execPath, args, { stdio: 'inherit' });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(`postject exited with status ${result.status}`);
    }
};

const [step, target] = process.argv.slice(2);

if (step === 'bundle') {
    await bundle();
} else if (step === 'inject') {
    if (!target) {
        console.error('Usage: node scripts/bundle.mjs inject <binary path>');
        process.exit(1);
    }
    inject(target);
} else {
    console.error('Usage: node scripts/bundle.mjs <bundle|inject> [binary path]');
    process.exit(1);
}
