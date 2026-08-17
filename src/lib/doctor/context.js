import os from 'node:os';
import { detectBrowserPlatform } from '@puppeteer/browsers';

import { logger, isSea } from '../../globals.js';
import { gatherBrowserFacts } from '../browser/browser-facts.js';

/**
 * The facts every diagnostic check starts from.
 *
 * `ctx` is assembled once per run and handed to every check. Passing facts in, rather than letting
 * a check read the world for itself, is what makes checks unit-testable without mocking the
 * filesystem - and it is what lets the runner promise that a check never reaches the network.
 *
 * This module holds the part that is true of any subject, plus the registry that says where an
 * area's own facts come from.
 */

/**
 * Where each area's facts come from.
 *
 * The counterpart to the check registry, and it exists for the same reason: adding an area is one
 * entry here and one entry in `checks/index.js`, with no change to the runner or to any command.
 *
 * An area with no entry needs nothing beyond the base context - `environment` reads only host
 * facts - and areas with no checks yet have nothing to gather for.
 *
 * Gathering is gated on the areas actually being run, and that is a correctness requirement rather
 * than an economy: `gatherBrowserFacts` starts Chrome. `doctor check --area environment` asks
 * which account this process runs as, and must not launch a browser to answer it.
 *
 * The import specifier is a literal for the same reason the check registry's and the interactive
 * registry's are: a templated import is not statically analysable, so esbuild would not bundle the
 * target and the failure would appear only inside the packaged binary, on a user's machine.
 */
const AREA_FACTS = Object.freeze({
    browser: gatherBrowserFacts,
});

/**
 * The account this process is running as.
 *
 * `os.userInfo()` throws when the effective uid has no passwd entry, which happens in slim
 * containers. The account is diagnostic information, not a reason to fail a diagnosis.
 *
 * @returns {string} The username, or a plain statement that it could not be determined.
 */
const currentUser = () => {
    try {
        return os.userInfo().username;
    } catch {
        return 'unknown';
    }
};

/**
 * Builds the context every check receives.
 *
 * `user`, `homeDir` and `cwd` are here deliberately, and they earn their place on Windows Server:
 * a scheduled task running as LocalSystem has a home directory under
 * `C:\Windows\system32\config\systemprofile` and a working directory of `C:\Windows\system32`.
 * That turns "the browser cache is empty" into a one-glance diagnosis. The working directory
 * matters for a second reason: `globals.js` loads `dotenv/config`, so a `.env` file beside the
 * executable may never be found under a scheduled task.
 *
 * @param {object} options - Resolved CLI options for the command being run.
 * @param {object} [extra] - Extra fields to merge in.
 * @param {string} [extra.hostPlatform] - Puppeteer's name for this machine's platform, when it
 * could be detected.
 * @param {string} [extra.command] - The command path being run, e.g. `doctor check`. Checks that
 * suggest re-running the diagnostic build their remediation around this rather than naming a
 * command, so the advice matches what the administrator actually typed.
 *
 * @returns {object} The base context.
 */
export const buildBaseContext = (options, { hostPlatform, command = 'browser check' } = {}) => ({
    options,
    // Defaulted rather than required, because a check must never crash on a hand-built context -
    // the per-check tests construct one directly, and the runner's promise is that a broken check
    // cannot take the report down. `browser check` is the safe default: it is the narrower of the
    // two commands, so the worst case is advice that under-claims rather than advice that sends
    // someone to a command they did not run.
    command,
    // A snapshot rather than `process.env` itself, so a check cannot read a variable that was set
    // after the run began, and so the environment a report describes is the one it was made from.
    env: {
        PUPPETEER_CACHE_DIR: process.env.PUPPETEER_CACHE_DIR,
        PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH,
        BSI_BROWSER_CACHE_DIR: process.env.BSI_BROWSER_CACHE_DIR,
        BSI_BROWSER_EXECUTABLE_PATH: process.env.BSI_BROWSER_EXECUTABLE_PATH,
    },
    host: {
        hostPlatform,
        nodePlatform: process.platform,
        arch: process.arch,
        user: currentUser(),
        homeDir: os.homedir(),
        cwd: process.cwd(),
        isSea,
    },
    // For `debug` only. A check that logs anything a user is meant to read has taken over the
    // renderer's job, and the finding it should have returned is then invisible to JSON output.
    logger,
});

/**
 * Builds the context for one run, gathering the facts the selected areas need.
 *
 * `hostPlatform` is resolved here rather than by the browser gatherer even though it is Puppeteer's
 * name for this machine: the environment check prints it, so it has to be present on a run that
 * gathers no browser facts at all. `detectBrowserPlatform()` reads `process.platform` and
 * `process.arch` and touches nothing else, so it is safe on every path.
 *
 * @param {object} options - Resolved CLI options for the command being run.
 * @param {string[]} areas - The areas being checked.
 * @param {object} [extra] - Extra context fields.
 * @param {string} [extra.command] - The command path being run, e.g. `doctor check`.
 *
 * @returns {Promise<object>} The context every check is handed.
 */
export const buildCheckContext = async (options, areas, { command } = {}) => {
    const ctx = buildBaseContext(options, { hostPlatform: detectBrowserPlatform(), command });
    const gatherFailures = [];

    for (const area of areas) {
        const gather = AREA_FACTS[area];

        if (!gather) {
            continue;
        }

        // The same isolation the runner gives every check, extended to where the risk actually
        // moved: gathering is the part that reads the filesystem and starts a browser, and an
        // unguarded throw here rejected out of the whole run before the heading printed - no
        // Environment block, no disclaimer, no Result line. For a browser-gatherer failure that
        // destroyed precisely the section that would have explained it, since the LocalSystem
        // diagnosis lives in Environment. A failed area becomes a recorded failure; the worker
        // reports it as an error finding and the rest of the report still runs.
        try {
            Object.assign(ctx, await gather(options));
        } catch (err) {
            ctx.logger?.debug?.(
                `Doctor: could not gather facts for area "${area}": ${err?.message ?? err}`
            );
            gatherFailures.push({
                area,
                error: (err instanceof Error ? err.message : String(err)) || String(err),
            });
        }
    }

    // Attached after the loop, so a gatherer returning a key of this name cannot clobber the
    // record of its own failure. The name is thereby reserved: no gatherer may return it.
    ctx.gatherFailures = gatherFailures;

    return ctx;
};
