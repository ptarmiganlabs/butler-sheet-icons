import puppeteer from 'puppeteer-core';
import { resolveBrowserCacheDirForWriting } from './browser-paths.js';
import { computeExecutablePath } from '@puppeteer/browsers';

import { logger } from '../../globals.js';
import { detectAvailableBrowser } from './browser-detect.js';
import { browserInstall } from './browser-install.js';
import {
    resolveBrowserVersion,
    isVersionKeyword,
    isVersionLookupFailure,
    VERSION_RECOMMENDED,
} from './browser-version.js';
import { parseHeadlessOption } from '../util/headless-option.js';
import { markReported } from '../util/reported-error.js';

/**
 * Chromium flags used for every Butler Sheet Icons browser launch.
 *
 * Copied verbatim from the two process-app modules this was extracted from; the list was
 * already identical in both.
 *
 * Exported so `scripts/diag/browser-flag-probe.mjs` can A/B the real launch arguments rather than
 * a hand-copied list. A diagnostic that has drifted from the product proves nothing.
 */
export const BASE_BROWSER_ARGS = [
    '--proxy-bypass-list=*',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-setuid-sandbox',
    '--no-first-run',
    '--no-sandbox',
    '--no-zygote',
    '--ignore-certificate-errors',
    '--ignore-certificate-errors-spki-list',
    '--enable-features=NetworkService',
];

/**
 * How long Puppeteer may spend getting a launched browser to announce its debugging endpoint.
 *
 * This is Puppeteer's own default, pinned here on purpose. Leaving it implicit means the budget
 * can change under us on a dependency bump, which is the same failure mode as letting the browser
 * version float: nothing in this repo changes, and the behaviour does.
 *
 * Note what it does *not* cover - see `launchBrowserForApp`.
 */
export const BROWSER_LAUNCH_TIMEOUT_MS = 30_000;

/**
 * How long a single DevTools protocol call may take once the browser is running.
 *
 * Also Puppeteer's default, pinned for the same reason. Deliberately generous rather than tight:
 * it bounds every subsequent CDP call, including screenshots of large sheets on a loaded Qlik
 * Sense server, and nothing in issue #870 implicated it. Lower it only with evidence.
 */
export const BROWSER_PROTOCOL_TIMEOUT_MS = 180_000;

/**
 * Detects whether the process is running inside a container.
 *
 * `--single-process` helps on native Linux and macOS but crashes Chromium both in containers and
 * on Windows, so those two cases have to be told apart from a plain native run.
 *
 * The Windows half is not theoretical: it caused issue #742, "Updating thumbnails in QS Cloud
 * fails on Windows, works on macOS", and was fixed in 482559c by skipping the flag there. Do not
 * reintroduce it for Windows.
 *
 * @returns {Promise<boolean>} `true` when a container environment is detected.
 */
const detectDocker = async () => {
    try {
        const fs = await import('node:fs');
        // Check for .dockerenv file (common Docker indicator)
        if (fs.existsSync('/.dockerenv')) return true;
        // Check if running as PID 1 with tini/node (Docker entrypoint pattern)
        if (process.pid === 1) return true;
        // Check for Alpine Linux
        if (fs.existsSync('/etc/alpine-release')) return true;
        return false;
    } catch {
        return false;
    }
};

/**
 * Builds the Chromium argument list for the given platform.
 *
 * @param {object} [options] - Overrides for values normally read from the running process.
 * @param {string} [options.platform] - Node platform identifier, e.g. `win32` or `linux`.
 * Defaults to `process.platform`; tests pass it explicitly so every branch is exercised
 * regardless of which host runs the suite.
 *
 * @returns {Promise<string[]>} Browser arguments, including `--single-process` where safe.
 */
export const buildBrowserArgs = async ({ platform = process.platform } = {}) => {
    const browserArgs = [...BASE_BROWSER_ARGS];

    const isDocker = await detectDocker();

    // At verbose rather than debug: --single-process is the first thing suspected whenever the
    // browser misbehaves, and during the investigation of issue #878 the fact that it could not be
    // seen at the default log level cost real time. It was ruled out as the cause there, but only
    // by reproducing the run outside Butler Sheet Icons.
    if (platform !== 'win32' && !isDocker) {
        browserArgs.push('--single-process');
        logger.verbose('Added --single-process flag for non-Windows native environment');
    } else if (isDocker) {
        logger.verbose('Skipping --single-process flag in Docker/containerized environment');
    } else {
        logger.verbose('Skipping --single-process flag on Windows to keep Chromium stable');
    }

    return browserArgs;
};

/**
 * Resolves the requested version to a build id, degrading gracefully only when a floating
 * keyword cannot be looked up.
 *
 * `recommended`, the default, resolves from a constant and never needs the network. `stable`,
 * the `latest` alias and the release channels need the vendor's version service, and a machine
 * that cannot reach it used to work offline against whatever was cached - so for those, and
 * only those, a failed lookup returns `undefined`, which tells detection to accept the newest
 * cached build of the right type instead.
 *
 * Everything else rethrows. A malformed version, an unsupported browser or an unresolvable
 * value is the user's input being wrong, and an explicit pin (milestone or build prefix) whose
 * lookup fails is a promise that cannot be kept - in both cases, quietly running some other
 * cached build would reintroduce the exact failure mode issue #878 is about: a build nobody
 * chose, selected silently.
 *
 * The fallback is only useful if the cache can still answer. If no browser is cached either,
 * the original resolution error is the honest one to report, so it is rethrown by the caller.
 *
 * @param {object} options - Options object carrying `browser` and `browserVersion`.
 *
 * @returns {Promise<object>} `{ buildId, resolveError }`. `buildId` is `undefined` when a
 * keyword lookup failed, in which case `resolveError` carries the reason.
 */
const resolveRequestedBuildId = async (options) => {
    try {
        const { buildId } = await resolveBrowserVersion(options.browser, options.browserVersion);
        return { buildId };
    } catch (err) {
        if (!(isVersionKeyword(options.browserVersion) && isVersionLookupFailure(err))) {
            throw err;
        }

        logger.warn(
            `Could not resolve --browser-version "${options.browserVersion}": ${err?.message ?? err}`
        );
        logger.warn('Falling back to the newest browser already in the local cache.');

        return { buildId: undefined, resolveError: err };
    }
};

/**
 * Resolves a usable browser executable, downloading one only if neither a system nor a cached
 * browser is available.
 *
 * @param {object} options - Options object, passed through to browser detection and install.
 *
 * @returns {Promise<object>} `{ executablePath, browser, buildId, source }`. The build id and
 * source travel with the path so that the launch step can name the exact build in an error - a
 * browser that cannot be driven is otherwise reported as an anonymous protocol failure with
 * nothing tying it to `--browser-version` (issue #878).
 *
 * @throws {Error} If no browser is available and the install fails. Callers are expected to wrap
 * this in a platform-specific typed error carrying the app id.
 */
export const resolveBrowserExecutablePath = async (options) => {
    // The writing resolver, because this value is only used to locate a browser this function
    // has just installed. Detection does its own read-side resolution, which is what may fall
    // back to the previous default location.
    const browserPath = resolveBrowserCacheDirForWriting(options);

    const { buildId: requestedBuildId, resolveError } = await resolveRequestedBuildId(options);

    logger.info(`Checking for available browsers...`);
    const browserInfo = await detectAvailableBrowser(options, requestedBuildId);

    if (browserInfo) {
        // Found system or cached browser
        logger.info(
            `Browser ready from ${browserInfo.source}: ${browserInfo.browser} ${browserInfo.buildId}`
        );
        return {
            executablePath: browserInfo.executablePath,
            browser: browserInfo.browser,
            buildId: browserInfo.buildId,
            source: browserInfo.source,
        };
    }

    // Nothing cached, and the version could not be resolved either. The resolution failure is the
    // real obstacle - downloading is not possible without knowing what to download - so report
    // that rather than a misleading install error.
    if (resolveError) {
        throw resolveError;
    }

    // No browser found - download required
    logger.info(`No local browser found. Downloading and installing browser...`);

    // browserInstall() signals failure by throwing - see its JSDoc. The throw propagates to the
    // caller, which attaches the app context. The already-resolved build id is passed through so
    // the install cannot pick a different build than the cache was searched for.
    const browserInstallResult = await browserInstall(options, undefined, requestedBuildId);

    const executablePath = computeExecutablePath({
        browser: browserInstallResult.browser,
        buildId: browserInstallResult.buildId,
        cacheDir: browserPath,
    });

    logger.info(`Browser downloaded successfully`);

    return {
        executablePath,
        browser: browserInstallResult.browser,
        buildId: browserInstallResult.buildId,
        source: 'download',
    };
};

/**
 * Browsers that Butler Sheet Icons is closing on purpose.
 *
 * The `disconnected` event cannot tell a crash from a normal shutdown, so intentional closes are
 * recorded here and the handler stays quiet for them. A `WeakSet` rather than a flag on the
 * browser object: it adds no enumerable property to a Puppeteer handle, and entries disappear with
 * the browser rather than accumulating over a long run.
 */
const intentionallyClosing = new WeakSet();

/**
 * Explains that a browser build cannot be driven, and what to do about it.
 *
 * The remedy for this failure is always "use a different browser version", and nothing in the
 * protocol error says so. Message shape follows `logVersionHistoryFailure` in
 * `browser-list-available.js`: what failed, then the command to run next, with diagnostics
 * demoted so they do not bury the advice.
 *
 * @param {string} buildId - The browser build that failed.
 * @param {string} logPrefix - Log line prefix, e.g. `'QSEOW'`.
 * @param {Error|unknown} [err] - The underlying failure, logged at debug.
 *
 * @returns {void}
 */
const logUnusableBrowser = (buildId, logPrefix, err) => {
    logger.error(
        `${logPrefix}: Browser build ${buildId} started but stopped responding immediately. This build cannot be driven by Butler Sheet Icons.`
    );
    logger.error(
        `Use a different browser build: "--browser-version ${VERSION_RECOMMENDED}" selects the build Butler Sheet Icons is tested with. The same value can be set via the command's BSI_*_BROWSER_VERSION environment variable.`
    );

    if (err) {
        logger.debug(err?.stack ?? String(err));
    }
};

/**
 * Reports a browser that dies after the health check has already passed.
 *
 * The health check covers the common case, where the build is unusable from the first command.
 * A build can also survive that and die on the next one - reports of this failure name
 * `Target.createTarget` and `Emulation.setTouchEmulationEnabled` as well as `Browser.getVersion`,
 * depending on timing. Listening for the disconnect catches every variant at the browser layer,
 * so the advice is emitted once no matter which call was in flight.
 *
 * @param {object} browser - Puppeteer browser handle.
 * @param {string} buildId - Build id in use, named in the message.
 * @param {string} logPrefix - Log line prefix, e.g. `'CLOUD APP'`.
 *
 * @returns {void}
 */
const watchForUnexpectedDisconnect = (browser, buildId, logPrefix) => {
    browser.on('disconnected', () => {
        if (intentionallyClosing.has(browser)) {
            return;
        }

        logUnusableBrowser(buildId, logPrefix);
    });
};

/**
 * Reports a browser launch that took longer than the timeout supposedly bounding it.
 *
 * This is the part of issue #870 that has teeth. `timeout` bounds the wait for the browser to
 * print its debugging endpoint - it does not bound getting the process off the ground in the
 * first place. `puppeteer.launch()` spawns the browser before that clock starts, and on Windows
 * process creation is synchronous inside libuv, so anything that stalls it stalls the Node event
 * loop with it. No JavaScript timer can fire while that is happening, which is why a 30s launch
 * timeout produced 30 minutes of silence in CI run 31148836253 rather than a timeout error: the
 * time was spent somewhere no timeout reaches.
 *
 * Two shapes follow from that, and both are worth a line in the log:
 *
 * - the stall clears, the launch *succeeds*, and the run is merely inexplicably slow - the case
 *   no timeout will ever catch, and the one this exists for;
 * - the stall clears past the 30s budget and Puppeteer then times out, in which case the elapsed
 *   time is what distinguishes "browser is broken" from "something held the process at startup".
 *
 * Anything over the launch budget is by definition time the launch timeout did not account for,
 * which makes it the natural threshold - no second number to keep in sync.
 *
 * That subtraction is why `timedOut` exists. When the launch times out, the budget was spent
 * waiting exactly as designed, so it is accounted for and has to come off before asking whether
 * anything is unexplained. Without that, every ordinary launch timeout would report itself as a
 * stall: the measurement starts before `puppeteer.launch()` and Puppeteer's own clock starts
 * later still, so a timeout always elapses a little over the budget, and the advice below - go
 * reconfigure endpoint protection - would be given for a browser build that simply cannot run.
 *
 * @param {number} elapsedMs - Time spent in `puppeteer.launch()`, from a monotonic clock.
 * @param {string} logPrefix - Log line prefix, e.g. `'QSEOW'`.
 * @param {object} [options] - Reporting options.
 * @param {boolean} [options.timedOut] - Whether the launch ended in Puppeteer's own timeout.
 *
 * @returns {void}
 */
const reportSlowLaunch = (elapsedMs, logPrefix, { timedOut = false } = {}) => {
    const unaccountedMs = timedOut ? elapsedMs - BROWSER_LAUNCH_TIMEOUT_MS : elapsedMs;

    if (unaccountedMs <= BROWSER_LAUNCH_TIMEOUT_MS) {
        logger.verbose(`Browser launch took ${Math.round(elapsedMs)} ms`);
        return;
    }

    logger.warn(
        `${logPrefix}: Browser launch took ${Math.round(elapsedMs / 1000)}s, longer than the ${BROWSER_LAUNCH_TIMEOUT_MS / 1000}s launch timeout allows for. The extra time went into starting the browser process, which no timeout covers.`
    );
    logger.warn(
        `${logPrefix}: On Windows this is typically antivirus or endpoint protection scanning a browser executable it has not seen before. Excluding the Butler Sheet Icons browser cache directory from real-time scanning avoids it.`
    );
};

/**
 * Resolves a browser and launches it, ready for page work.
 *
 * Extracted from `process-cloud-app.js` and `qseow-process-app.js`, which carried this sequence
 * as ~90 lines of duplicated code differing only in log prefix and error type (see issue #834).
 *
 * @param {object} options - Options object. `headless` is parsed here; the rest is passed through
 * to browser detection and install.
 * @param {object} context - Platform-specific labelling and error construction.
 * @param {string} context.appId - App being processed, used in error messages.
 * @param {string} context.logPrefix - Log line prefix without a trailing colon, e.g. `'QSEOW'`
 *     or `'CLOUD APP'`. The colon is added here, so both platforms render the same shape.
 * @param {string} context.appLabel - Human-readable app description, e.g. `QSEoW app`.
 * @param {Function} context.ErrorClass - Typed error to throw, e.g. `QseowError` or `CloudError`.
 *
 * @returns {Promise<object>} The launched Puppeteer browser instance.
 *
 * @throws {Error} An instance of `context.ErrorClass` if the browser cannot be installed or
 * launched, with the original error attached as `cause`.
 */
export const launchBrowserForApp = async (options, { appId, logPrefix, appLabel, ErrorClass }) => {
    let browserInfo;
    try {
        browserInfo = await resolveBrowserExecutablePath(options);
    } catch (err) {
        throw new ErrorClass(`Failed to install a browser for ${appLabel} ${appId}`, {
            cause: err,
        });
    }

    const { executablePath, buildId } = browserInfo;

    logger.info(`Browser setup complete. Launching browser...`);
    logger.verbose(`Using browser at ${executablePath}`);

    const headless = parseHeadlessOption(options.headless);
    const browserArgs = await buildBrowserArgs();

    let browser;
    // performance.now() rather than Date.now(): this measures a duration, and the machines the
    // measurement matters most on are virtualised CI runners, where an NTP step correction after
    // a guest pause is routine. A wall clock that jumps mid-launch would invent a stall that
    // never happened, or hide a real one behind a negative elapsed time.
    const launchStartedAt = performance.now();
    try {
        browser = await puppeteer.launch({
            // Both timeouts match Puppeteer's own defaults; see the constants for why they are
            // stated rather than inherited.
            //
            // They are NOT what issue #870 asked for. That issue proposed adding a launch timeout
            // to explain a 30-minute Windows CI hang, on the assumption there was none. There was:
            // puppeteer-core v25 already defaults `timeout` to 30s and `protocolTimeout` to 180s,
            // so adding them changes no behaviour and would not have shortened that hang by a
            // second. The reason is spelled out on `reportSlowLaunch`.
            timeout: BROWSER_LAUNCH_TIMEOUT_MS,
            protocolTimeout: BROWSER_PROTOCOL_TIMEOUT_MS,
            // Puppeteer removed `ignoreHTTPSErrors` in v23 and replaced it with
            // `acceptInsecureCerts`. Butler Sheet Icons kept passing the old name through the v25
            // upgrade, and because Puppeteer ignores unknown options in silence, the intent behind
            // that line - tolerate the self-signed certificates that are normal on a QSEoW server -
            // had quietly stopped being expressed at all. Certificate tolerance was resting
            // entirely on the --ignore-certificate-errors browser flag in BASE_BROWSER_ARGS.
            //
            // The name is not interchangeable: grep the installed puppeteer-core for
            // `ignoreHTTPSErrors` and there are zero hits, in the code and in the type definitions.
            acceptInsecureCerts: true,
            executablePath,
            headless,
            args: browserArgs,
        });
    } catch (err) {
        // Falls back to the value itself so a non-Error throw still logs something useful
        // rather than "undefined".
        logger.error(
            `${logPrefix}: Could not launch virtual browser: ${err?.stack || err?.message || err}`
        );

        // A launch timeout reads like any other launch failure in the log, but the remedy is
        // completely different - nothing is wrong with the arguments or the certificate setup,
        // the browser simply never reported itself ready. Say so where the distinction is known.
        const timedOut = err?.name === 'TimeoutError';
        if (timedOut) {
            logger.error(
                `${logPrefix}: The browser did not become ready within ${BROWSER_LAUNCH_TIMEOUT_MS / 1000}s. It was started but never reported a debugging endpoint - usually a browser build that cannot run on this machine, or security software holding it at startup.`
            );
        }

        reportSlowLaunch(performance.now() - launchStartedAt, logPrefix, { timedOut });

        throw new ErrorClass(`Failed to launch virtual browser for ${appLabel} ${appId}`, {
            cause: err,
        });
    }

    reportSlowLaunch(performance.now() - launchStartedAt, logPrefix);

    // A browser build that Puppeteer cannot drive starts perfectly well and then dies on the first
    // command sent to it - after launch() has already resolved. Without this check the failure
    // surfaces further along as a bare protocol error such as "Protocol error
    // (Emulation.setTouchEmulationEnabled): Session closed", attributed to whichever call happened
    // to be in flight, in a catch that knows nothing about browsers (issue #878).
    //
    // browser.version() is the cheapest possible round trip to the browser, and is exactly the
    // Browser.getVersion call seen failing in those reports. Doing it here means the failure is
    // reported where the build id is known.
    watchForUnexpectedDisconnect(browser, buildId, logPrefix);

    try {
        const version = await browser.version();
        logger.verbose(`Browser responded to version query: ${version}`);
    } catch (err) {
        logUnusableBrowser(buildId, logPrefix, err);

        await closeBrowserQuietly(browser, logPrefix);

        throw markReported(
            new ErrorClass(
                `Browser build ${buildId} could not be driven, and no thumbnails could be created for ${appLabel} ${appId}`,
                { cause: err }
            )
        );
    }

    return browser;
};

/**
 * Closes a virtual browser, swallowing and logging any failure.
 *
 * Belongs in a `finally`. Both screenshot paths launched the browser and closed it ~290 lines
 * later on the happy path only, so any failure in between - navigation, login, a screenshot,
 * image processing - stranded a Chrome process for the life of the run, once per failing app.
 * Each of those holds hundreds of MB.
 *
 * Failures are logged rather than thrown on purpose: this runs on the way out of a region that
 * may already be unwinding, and a throw here would replace the real cause. That mirrors what the
 * two hand-written copies did, minus the drifted log prefix.
 *
 * @param {object} browser - Puppeteer browser handle. A nullish value is ignored, so callers can
 *     put this in a `finally` that also covers a failed launch.
 * @param {string} logPrefix - Prefix for the error line, e.g. `'QSEOW'`.
 *
 * @returns {Promise<void>} Resolves once the browser is closed, or the failure is logged.
 */
export const closeBrowserQuietly = async (browser, logPrefix) => {
    if (!browser) {
        return;
    }

    // Recorded before the close so the `disconnected` handler installed at launch stays quiet:
    // every successful run ends with a disconnect, and reporting those as "the build cannot be
    // driven" would make the advice worthless.
    intentionallyClosing.add(browser);

    try {
        await browser.close();
        logger.verbose('Closed virtual browser');
    } catch (err) {
        logger.error(
            `${logPrefix}: Could not close virtual browser: ${err?.stack || err?.message || err}`
        );
    }
};
