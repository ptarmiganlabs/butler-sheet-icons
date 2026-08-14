#!/usr/bin/env node
// Platform: Cross-platform (macOS, Linux, Windows)
// Requires: Node.js

/**
 * Single entry point for every GitNexus invocation in this repository.
 *
 * The pinned version and the analyze flags are defined here exactly once, so the
 * `gitnexus:*` npm scripts have no second copy of either to keep in sync. Ported from
 * butler-sos, which uses the same wrapper; keep the two in step when changing either.
 *
 * Run via: npm run gitnexus:install | gitnexus:status | gitnexus:index | gitnexus:refresh
 *
 * Extra arguments are forwarded to gitnexus, so `npm run gitnexus:index -- --embeddings`
 * behaves as it would when calling the tool directly.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Pinned deliberately.
 *
 * An unpinned `npx gitnexus` executes whatever the registry serves at that moment - a new
 * major, or a compromised release - with no repository change and no review. That matters
 * more once the re-index runs from a git hook (see issue #829).
 *
 * This constant is the only place the version appears. It matches the pin in butler-sos;
 * bump both together.
 */
const GITNEXUS_VERSION = '1.6.9';

/**
 * Flags shared by every `analyze` run.
 *
 * `--skip-agents-md` is load-bearing, not cosmetic: it stops gitnexus rewriting the managed
 * block in CLAUDE.md and AGENTS.md. Both files carry hand-written content, the block itself
 * is now hand-maintained, and without `--skills` a bare `analyze` does not merely regenerate
 * that block but *reduces* it - in butler-sos it once deleted the whole generated-skills
 * table from both files. `--no-stats` is belt-and-braces for the same reason.
 */
const ANALYZE_FLAGS = ['--no-stats', '--skip-agents-md'];

/**
 * Subcommands, and how each maps onto a gitnexus invocation.
 *
 * `fetch` marks the one command allowed to download the package. Everything else runs under
 * `npx --no-install`, which executes an already-present copy and never fetches one. GitNexus
 * is deliberately not a devDependency - ~40 MB unpacked with native tree-sitter builds is too
 * much to add to every CI install for a local developer tool - so `install` is the one
 * deliberate, human-invoked fetch.
 *
 * `index` omits `--embeddings` because that is the slow part, and a plain analyze preserves
 * any embeddings already in the index. `refresh` regenerates them together with the generated
 * skill files under `.claude/skills/generated/`.
 *
 * `check` reports through its exit code alone and prints nothing. Nothing calls it yet; it is
 * the interface the git hooks in issue #829 will use to detect a missing install.
 */
const COMMANDS = {
    install: { args: ['--version'], fetch: true },
    check: { args: ['--version'], quiet: true },
    status: { args: ['status'] },
    index: { args: ['analyze', ...ANALYZE_FLAGS] },
    refresh: { args: ['analyze', ...ANALYZE_FLAGS, '--embeddings', '--skills'] },
};

/**
 * Removes any cached npx install of GitNexus.
 *
 * npx skips the install entirely when the requested spec is already in its cache, which makes
 * `--allow-scripts` below silently useless on a machine that installed before that flag
 * existed: the cached copy keeps its unbuilt `@ladybugdb/core`, `--version` still prints a
 * version, `check` still passes, and only `analyze` fails. Clearing the entry first is what
 * makes `install` genuinely re-fetch.
 *
 * Best-effort by design. A cache that cannot be read or removed is not a reason to refuse to
 * install; the fetch below simply reuses whatever is there.
 *
 * @returns {void}
 */
function clearCachedNpxInstall() {
    // npm sets npm_config_cache when this runs through an npm script, which is the documented
    // entry point. The homedir default matches npm's own when it is absent.
    const npxRoot = join(process.env.npm_config_cache || join(homedir(), '.npm'), '_npx');

    let entries;
    try {
        entries = readdirSync(npxRoot, { withFileTypes: true });
    } catch {
        return; // no cache yet, or unreadable
    }

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dir = join(npxRoot, entry.name);
        try {
            const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
            if (Object.hasOwn(manifest.dependencies ?? {}, 'gitnexus')) {
                rmSync(dir, { recursive: true, force: true });
            }
        } catch {
            // Not a gitnexus entry, or not removable. Leave it alone.
        }
    }
}

/**
 * Resolves the subcommand and runs it.
 *
 * Returns the exit code rather than calling process.exit() itself - see the note at the
 * bottom of the file for why that distinction matters.
 *
 * @returns {number} Exit code to report to the shell.
 */
function main() {
    // Anything after the subcommand is forwarded to gitnexus untouched, so
    // `npm run gitnexus:index -- --embeddings` works. Dropping these silently would leave the
    // caller believing a flag took effect when it never reached the tool.
    const [, , name, ...passthrough] = process.argv;
    const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;

    if (!command) {
        console.error(
            `Usage: node scripts/gitnexus.js <${Object.keys(COMMANDS).join('|')}> [...args]`
        );
        return 1;
    }

    // npx is a .cmd shim on Windows and spawn() will not find it without the extension.
    // Resolving it here keeps `shell: true` - and the quoting hazards that come with it - out
    // of the picture.
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

    // npm 12 blocks dependency install scripts by default, and @ladybugdb/core needs its own to
    // move the native graph-database binary out of its platform sub-package. Without it every
    // `gitnexus analyze` dies with ERR_DLOPEN_FAILED while `gitnexus status` still passes,
    // because status only reads cached metadata - a silent failure. Scoped to this one fetch
    // rather than set in .npmrc, where a project-wide allow-scripts would also reach tools that
    // shell out to npm.
    if (command.fetch) clearCachedNpxInstall();

    const fetchArgs = command.fetch
        ? ['--yes', '--allow-scripts=@ladybugdb/core']
        : ['--no-install'];

    const result = spawnSync(
        npx,
        [...fetchArgs, `gitnexus@${GITNEXUS_VERSION}`, ...command.args, ...passthrough],
        { stdio: command.quiet ? 'ignore' : 'inherit' }
    );

    if (result.error) {
        if (!command.quiet) {
            console.error(`gitnexus: could not run npx: ${result.error.message}`);
        }
        return 1;
    }

    // null status means the child was killed by a signal; treat that as a failure.
    return result.status ?? 1;
}

// Setting exitCode lets Node exit on its own once stderr has drained. process.exit()
// terminates before pending asynchronous stdio writes complete, and writes to a pipe are
// asynchronous while writes to a TTY are not - so the messages above would survive an
// interactive run and could be lost under `... 2>&1 | tee log` or on a CI runner.
process.exitCode = main();
