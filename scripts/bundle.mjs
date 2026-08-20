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
    await build({
        entryPoints: [`src/${distFileName}.js`],
        bundle: true,
        outfile: OUTFILE,
        format: 'cjs',
        platform: 'node',
        target: 'node24',
        inject: ['./src/lib/util/import-meta-url.js'],
        define: { 'import.meta.url': 'import_meta_url' },
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
