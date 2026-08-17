import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

import { logger } from '../../globals.js';
import {
    describeBrowserCacheDir,
    resolveExecutablePathOverride,
    SOURCE_LABELS,
    EXECUTABLE_SOURCE_LABELS,
} from './browser-paths.js';
import { getBrowserInventory, hasUsableExecutable } from './browser-inventory.js';
import { detectAvailableBrowser } from './browser-detect.js';
import {
    BROWSER_LAUNCH_TIMEOUT_MS,
    BROWSER_PROTOCOL_TIMEOUT_MS,
    buildBrowserArgs,
} from './browser-launch.js';
import {
    classifyBrowserVersion,
    getRecommendedBuildId,
    VERSION_FORM,
    VERSION_RECOMMENDED,
} from './browser-version.js';
import { parseHeadlessOption } from '../util/headless-option.js';

/**
 * The facts the `browser` area of the diagnostic reasons about.
 *
 * All of the input/output for that area lives here, so each check stays a pure function of what
 * this produced - which is what makes them testable against a fabricated context, with no
 * filesystem and no browser. The checks themselves are in `src/lib/doctor/checks/`, and the
 * formatting is in the shared renderer.
 *
 * Two constraints shape everything here, and neither is negotiable.
 *
 * **It must not touch the network.** `detectAvailableBrowser()` is called directly, never
 * `resolveBrowserExecutablePath()` - the latter falls through to `browserInstall()` and
 * `canDownload()`, which makes a network request. A doctor that hangs on a DNS timeout on an
 * air-gapped server is worse than no doctor at all. The same rule is why the requested version is
 * resolved locally or not at all: `stable` and the release channels need the vendor's version
 * service, and this will not call it.
 *
 * **It does launch the browser.** Resolving a path proves far less than starting the process, so
 * unless `--skip-launch` is given the selected browser is started with the production arguments
 * and asked for its version. No page is opened, nothing is navigated to, and Qlik Sense is never
 * contacted.
 *
 * Gathering is therefore expensive and has side effects on the host, which is why
 * `buildCheckContext` calls this only when the `browser` area is actually being checked - a
 * `doctor check --area environment` asking which account this process runs as must not start
 * Chrome to answer.
 *
 * Lives under `src/lib/browser/` rather than beside the checks so that its `options.*` reads stay
 * inside the walk `commands.test.js` uses to prove every option name a worker reads is one
 * Commander actually stores (issue #890).
 */

/**
 * Interprets `--browser-version` without making a single network request.
 *
 * The form is classified by `classifyBrowserVersion`, which is the same function
 * `assertExplicitVersionIsWellFormed` uses on the real run's path - so this cannot accept a value
 * a real run rejects, which it used to: an unrecognised value was treated as a floating keyword,
 * `browser check` exited 0, and the thumbnail run then died with "Invalid --browser-version".
 *
 * Only two forms can be turned into a build id offline: `recommended`, which resolves from a
 * constant compiled into puppeteer-core, and a full build id, which needs no resolution at all.
 * The rest return no build id, which tells detection to accept the newest suitable cached build,
 * and carry their form so the report can say *why* the pin was not checked rather than implying it
 * was honoured.
 *
 * @param {object} options - Options bag carrying `browser` and `browserVersion`.
 *
 * @returns {{buildId: string|undefined, versionForm: string, requestedVersion: string, requested: string}}
 * What to match against the cache, the form the version takes, the version as the user gave it,
 * and how to describe the whole request.
 */
const resolveBuildIdOffline = (options) => {
    const browser = options.browser ?? 'chrome';
    // `||` rather than `??`: an empty string means "unset" here, exactly as
    // `parseBrowserVersionValue` treats it, so a bare `BSI_BROWSER_C_BROWSER_VERSION=` line in a
    // unit file lands on the default instead of being classified as invalid.
    const version = options.browserVersion || VERSION_RECOMMENDED;
    const versionForm = classifyBrowserVersion(version);
    const base = { versionForm, requestedVersion: version };

    if (versionForm === VERSION_FORM.RECOMMENDED) {
        try {
            const buildId = getRecommendedBuildId(browser);

            return { ...base, buildId, requested: `${browser} ${version} (build ${buildId})` };
        } catch (err) {
            // Only reachable for a browser Butler Sheet Icons does not support, which Commander's
            // `.choices()` already refuses - so this covers a worker called directly.
            //
            // Reported as an unsupported *browser*, not as a malformed version. Overwriting the
            // version form with INVALID here made the report say `--browser-version "recommended"
            // is neither a keyword nor a build id` - false, and it sent the administrator to
            // change the one setting that was correct.
            logger.debug(`Could not resolve the recommended build: ${err?.message ?? err}`);

            return {
                ...base,
                buildId: undefined,
                browserError: err instanceof Error ? err.message : String(err),
                requested: `${browser} ${version}`,
            };
        }
    }

    if (versionForm === VERSION_FORM.BUILD_ID) {
        return { ...base, buildId: version, requested: `${browser} ${version}` };
    }

    return { ...base, buildId: undefined, requested: `${browser} ${version}` };
};

/**
 * Why a cached build cannot be used, or `undefined` when it can.
 *
 * The order matters. Browser type first, because detection filters on it before anything else, so
 * a `chrome-headless-shell` build is invisible to a `chrome` run however runnable it looks - and
 * reporting it as usable made the report offer build ids in remediation commands that fail
 * identically. Platform next, because a build made for another operating system is unusable
 * whether or not its binary is present.
 *
 * This function is the sole definition of "usable" that the checks reason about, and the checks
 * must stay able to explain every reason it can return: an unusable build whose reason no check
 * reports would otherwise leave the run with no error. `browser-selection.js` names the findings
 * that cover these reasons in its `supersededBy`, and the runner demotes it only when one of them
 * actually fired - so a new reason added here fails safe rather than silently passing.
 *
 * @param {object} build - An inventory entry, with `executableExists` already computed.
 * @param {string} requestedBrowser - The browser type a real run would look for.
 *
 * @returns {string|undefined} The reason, in the words the report prints.
 */
const unusableReason = (build, requestedBrowser) => {
    if (requestedBrowser && build.browser !== requestedBrowser) {
        return `a ${build.browser} build, not the ${requestedBrowser} build this run needs`;
    }

    if (!build.canRunHere) {
        return 'built for another platform';
    }

    if (!build.executableExists) {
        return 'executable not found on disk';
    }

    return undefined;
};

/**
 * Starts the selected browser and asks it for its version.
 *
 * The production `buildBrowserArgs()` and `parseHeadlessOption()`, and the production timeouts, so
 * that a pass here means the same thing a real run means. `--headless` earns its place for the
 * same reason: a headed launch on a display-less server is a genuinely different test.
 *
 * The browser is closed in a `finally`. An unclosed browser holds hundreds of megabytes and, in
 * the test suite, hangs the run.
 *
 * Two phases, reported separately. `started` says the process came up; `ok` says it also answered.
 * A build that starts and then dies on the first command is issue #878, and its remedy - a
 * different build - has nothing to do with the remedy for a process that never started. Folding
 * them into one flag produced a finding that told an administrator their browser "could not be
 * started" about a browser that had started perfectly well.
 *
 * `elapsedMs` is measured for the same reason `launchBrowserForApp` measures it: `timeout` bounds
 * the wait for the debugging endpoint, not the process creation before it, and on Windows that
 * creation blocks the event loop. A launch that succeeds slowly is invisible to every timeout
 * there is, so the duration has to be carried out of here for a check to judge.
 *
 * `performance.now()` rather than `Date.now()`: this measures a duration on machines - virtualised
 * Sense servers - where an NTP step correction mid-launch is routine, and a wall clock that jumps
 * would invent a stall or hide one behind a negative elapsed time.
 *
 * @param {object} options - Options bag; `headless` is read from it.
 * @param {string} executablePath - The browser to start.
 *
 * @returns {Promise<{attempted: boolean, started: boolean, ok: boolean, version: string|null, error: string|null, skipped: boolean, elapsedMs: number}>}
 * What happened.
 */
const tryLaunch = async (options, executablePath) => {
    const result = {
        attempted: true,
        started: false,
        ok: false,
        version: null,
        error: null,
        skipped: false,
        elapsedMs: 0,
    };
    const headless = parseHeadlessOption(options.headless);
    const args = await buildBrowserArgs();

    logger.verbose(`Starting ${executablePath} to check that it runs on this machine`);

    let browser;
    const startedAt = performance.now();

    try {
        browser = await puppeteer.launch({
            timeout: BROWSER_LAUNCH_TIMEOUT_MS,
            protocolTimeout: BROWSER_PROTOCOL_TIMEOUT_MS,
            acceptInsecureCerts: true,
            executablePath,
            headless,
            args,
        });

        // Recorded between the two calls, which is the whole point of the split: everything after
        // this line is the browser refusing to be driven rather than refusing to start.
        result.started = true;
        result.elapsedMs = performance.now() - startedAt;

        // The cheapest possible round trip to the browser, and exactly the `Browser.getVersion`
        // call seen failing in issue #878: a build Puppeteer cannot drive launches perfectly well
        // and then dies on the first command sent to it.
        result.version = await browser.version();
        result.ok = true;
    } catch (err) {
        // `||`, not `??`: an Error carrying an empty message is not `null`, so `??` kept it and
        // produced a finding that named nothing at all.
        result.error = (err instanceof Error ? err.message : String(err)) || String(err);

        if (!result.started) {
            result.elapsedMs = performance.now() - startedAt;
        }
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (err) {
                logger.debug(`Could not close the browser after the check: ${err?.message ?? err}`);
            }
        }
    }

    return result;
};

/**
 * Reads the browser cache, turning a failure into a fact rather than an exception.
 *
 * This guard is the difference between a diagnosis and nothing at all. `getInstalledBrowsers()`
 * runs `readdirSync` on each browser subdirectory, so a cache that is unreadable (EACCES on a
 * directory staged by another account) or malformed (ENOTDIR where a file sits in place of a
 * browser folder) throws. Unguarded, that rejected out of the gatherer and the command printed
 * one error line and exited - no Environment block, no cache location, not even the best-effort
 * disclaimer.
 *
 * An unreadable cache staged by an administrator and read by a service account is precisely the
 * LocalSystem trap this command exists to expose, so it has to be reported *by* the report.
 * `detectAvailableBrowser` already degrades the same failure to "download one" (browser-detect.js),
 * which is why the run continues to a selection verdict rather than stopping here.
 *
 * @param {string} cacheDir - Cache directory to read.
 * @param {string} requestedBrowser - Browser type a real run would look for.
 *
 * @returns {Promise<{inventory: object[], builds: object[], readError: string|undefined}>} The
 * inventory exactly as read (handed to detection so it reasons about this same snapshot), the same
 * builds annotated for the report, or empty lists and the reason they could not be read.
 */
const readCache = async (cacheDir, requestedBrowser) => {
    try {
        const inventory = await getBrowserInventory({ cacheDir });

        return {
            inventory,
            builds: inventory.map((build) => {
                const withExistence = { ...build, executableExists: hasUsableExecutable(build) };
                const reason = unusableReason(withExistence, requestedBrowser);

                return { ...withExistence, usable: !reason, reason };
            }),
            readError: undefined,
        };
    } catch (err) {
        const readError = err instanceof Error ? err.message : String(err);

        logger.debug(`Could not read the browser cache at ${cacheDir}: ${readError}`);

        // An empty inventory rather than none: detection is handed this snapshot too, and it must
        // see the same "nothing here" the report describes rather than going and reading again.
        return { inventory: [], builds: [], readError };
    }
};

/**
 * Gathers every fact the browser checks reason about.
 *
 * @param {object} options - Resolved CLI options.
 *
 * @returns {Promise<object>} The browser slice of the check context: `cache`, `executableOverride`,
 * `detection` and `launch`.
 */
export const gatherBrowserFacts = async (options) => {
    // The pure describer rather than `resolveBrowserCacheDir()`: this command prints where the
    // cache is as part of its report, and the resolver's own announcement would say the same
    // thing twice in different words.
    const described = describeBrowserCacheDir(options);
    const rawOverride = resolveExecutablePathOverride(options);
    const override = rawOverride
        ? {
              ...rawOverride,
              sourceLabel: EXECUTABLE_SOURCE_LABELS[rawOverride.source],
              exists: fs.existsSync(rawOverride.path),
          }
        : null;

    // Whether the cache is consulted at all, following `detectAvailableBrowser` exactly. Two ways
    // it is not, and they are different enough to be worth telling apart in the report:
    //
    // - a named executable that is present wins outright, and detection returns it;
    // - a named executable that is *explicitly* configured and missing stops detection, so the
    //   cache is never reached either.
    //
    // A stale PUPPETEER_EXECUTABLE_PATH is the third case and does fall through, which is why
    // `explicit` is tested rather than just "an override exists". None of this is decoration:
    // without it the report says the cache is in use when nothing will read it, and an
    // administrator goes and re-stages a browser that was never the problem.
    const notConsultedReason = (() => {
        if (override?.exists) {
            return 'an executable path is configured, so the cache is not consulted';
        }

        if (override?.explicit) {
            return 'an executable path is configured but missing, so detection stops before the cache';
        }

        return undefined;
    })();
    const cacheInUse = !notConsultedReason;

    // Normalised once, here, and used for every subsequent decision. `detectAvailableBrowser` was
    // the one consumer still handed the raw bag, and it drops its browser-type filter entirely
    // when `options.browser` is absent - so a check run with no browser named selected a
    // chrome-headless-shell build the render path cannot drive, while the same report said the
    // cache held no chrome.
    const requestedBrowser = options.browser ?? 'chrome';
    const resolvedOptions = { ...options, browser: requestedBrowser };

    const { inventory, builds, readError } = await readCache(described.cacheDir, requestedBrowser);

    const { buildId, versionForm, requestedVersion, requested, browserError } =
        resolveBuildIdOffline(resolvedOptions);

    let selection = null;
    let detectionError = null;

    try {
        // The reading taken above, rather than letting detection take its own. One snapshot means
        // the cache this report describes is the cache this verdict came from.
        selection = await detectAvailableBrowser(resolvedOptions, buildId, {
            cacheDir: described.cacheDir,
            inventory,
        });
    } catch (err) {
        // Since #1061 detection throws when an explicitly named executable path does not exist,
        // rather than returning null. That is a finding, not a crash: it is arguably the most
        // valuable thing this command can catch, because it means somebody's explicit
        // configuration is wrong.
        detectionError = err;
    }

    const launch =
        selection && !options.skipLaunch
            ? await tryLaunch(options, selection.executablePath)
            : {
                  attempted: false,
                  started: false,
                  ok: false,
                  version: null,
                  error: null,
                  skipped: Boolean(selection && options.skipLaunch),
                  elapsedMs: 0,
              };

    return {
        cache: {
            dir: described.cacheDir,
            source: described.source,
            sourceLabel: SOURCE_LABELS[described.source],
            exists: fs.existsSync(described.cacheDir),
            inUse: cacheInUse,
            notConsultedReason,
            legacyInUse: described.source === 'legacy',
            builds,
            readError,
        },
        executableOverride: override,
        detection: {
            selection,
            error: detectionError,
            wouldDownload: !selection && !detectionError,
            requested,
            requestedVersion,
            versionForm,
            browserError,
            resolvedBuildId: buildId,
        },
        launch,
    };
};
