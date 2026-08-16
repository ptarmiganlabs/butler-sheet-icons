import { logger, setLoggingLevel } from '../../globals.js';
import { redactOptions } from '../util/redact-secrets.js';
import { runDoctorCheck } from '../doctor/doctor-check.js';
import { BEST_EFFORT_DISCLAIMER } from '../doctor/render-report.js';

/**
 * `browser check` - can this machine take screenshots?
 *
 * Answers that without touching Qlik Sense, so it is safe to hand to a customer as the first
 * troubleshooting step and safe to script into a deployment check.
 *
 * Since #1063 this is a **selection of `doctor check`**, not a separate implementation: the same
 * gatherers, the same runner and the same renderer, asked for two areas instead of all of them.
 * Its output, its options and its exit codes are unchanged, and
 * `__tests__/browser_check_output_contract.test.js` holds the printed report line for line, because
 * this command has shipped and people have scripted it as a deployment gate.
 *
 * Both commands remain, and neither is redundant - they are found by different people at different
 * moments. An administrator whose thumbnails came out blank goes looking under `browser`; one
 * holding a failed run and no theory runs `doctor`.
 *
 * The facts are gathered in `browser-facts.js`, the reasoning lives in the checks under
 * `src/lib/doctor/checks/`, and the formatting in the shared renderer.
 */

/**
 * The areas of the check registry this command runs.
 *
 * **Not just `browser`.** §15.2 of the design describes this command as an alias for
 * `doctor check --area browser`, and that would be a mistake: the environment check is where the
 * LocalSystem trap is diagnosed - which account the run is under, which home directory, whether
 * this is a standalone binary - and those facts are what *explain* the browser symptoms. A cached
 * browser "missing" because a scheduled task runs as LocalSystem is diagnosed by the environment
 * section, not the browser one. Dropping it would take the most useful thing this report says
 * about a Windows Server with it.
 *
 * Exported so `checks.test.js` can assert that every registered check is actually selected by it,
 * rather than restating the list and proving only that two copies agree. A check whose `area` does
 * not match one of these vanishes from the report with no warning at all.
 */
export const BROWSER_CHECK_AREAS = Object.freeze(['environment', 'browser']);

/**
 * Runs the browser diagnostic and reports on it.
 *
 * Returns structured data as well as printing a report, so tests assert on values rather than on
 * log strings.
 *
 * @param {object} [options] - Options bag as Commander produces it.
 * @param {string} [options.browser] - Browser to check for. `chrome` is the only supported value.
 * @param {string} [options.browserVersion] - Build to look for. Resolved locally or not at all.
 * @param {string} [options.browserCacheDir] - Cache directory to search.
 * @param {string} [options.browserExecutablePath] - A browser executable to use instead.
 * @param {boolean|string} [options.headless] - Whether to start the browser headless.
 * @param {boolean} [options.skipLaunch] - Find a browser but do not start it.
 * @param {string} [options.loglevel] - Log level.
 *
 * @returns {Promise<object>} The report. `ok` is `false` when a real run would fail on this
 * machine; every command handler turns that into the process exit code, and nothing here touches
 * process state.
 */
export const browserCheck = async (options = {}) => {
    setLoggingLevel(options.loglevel);

    logger.verbose('Starting browser check');
    logger.debug(`Options: ${JSON.stringify(redactOptions(options), null, 2)}`);

    const { ok, ctx, results, findings } = await runDoctorCheck({
        options,
        // Derived from the exported constant rather than written out again here. A second copy
        // would prove only that two lists agree, and the failure mode is silent: a check whose
        // area is not selected simply is not in the report.
        areas: [...BROWSER_CHECK_AREAS],
        command: 'browser check',
        heading: 'Butler Sheet Icons browser check',
        // Qualified when the browser was never started, because "can take screenshots" is a
        // stronger claim than a skipped launch supports.
        okMessage: (checked) =>
            checked.launch.skipped
                ? 'a browser was found on this machine. It was not started, so whether it runs here is untested.'
                : 'Butler Sheet Icons can take screenshots on this machine without internet access.',
    });

    return {
        ok,
        hostPlatform: ctx.host.hostPlatform,
        nodePlatform: ctx.host.nodePlatform,
        arch: ctx.host.arch,
        user: ctx.host.user,
        homeDir: ctx.host.homeDir,
        cwd: ctx.host.cwd,
        isSea: ctx.host.isSea,
        executableOverride: ctx.executableOverride
            ? {
                  path: ctx.executableOverride.path,
                  source: ctx.executableOverride.source,
                  exists: ctx.executableOverride.exists,
              }
            : null,
        cacheDir: ctx.cache.dir,
        cacheDirSource: ctx.cache.source,
        cacheDirExists: ctx.cache.exists,
        cacheDirUsed: ctx.cache.inUse,
        legacyCacheDirInUse: ctx.cache.legacyInUse,
        cachedBrowsers: ctx.cache.builds.map((build) => ({
            browser: build.browser,
            buildId: build.buildId,
            platform: build.platform,
            executablePath: build.executablePath,
            executableExists: build.executableExists,
            usable: build.usable,
            reason: build.reason,
        })),
        selection: ctx.detection.selection,
        wouldDownload: ctx.detection.wouldDownload,
        launched: ctx.launch.ok,
        browserVersion: ctx.launch.version,
        launchError: ctx.launch.error,
        findings,
        results,
        disclaimer: BEST_EFFORT_DISCLAIMER,
    };
};
