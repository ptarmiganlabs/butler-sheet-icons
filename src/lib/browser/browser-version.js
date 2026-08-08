import { detectBrowserPlatform, resolveBuildId } from '@puppeteer/browsers';
// Deliberately the leaf module rather than the puppeteer-core package root, which also
// re-exports this. revisions.js is a single frozen object with no imports of its own, so pulling
// it in costs nothing and - unlike the package root - does not drag the whole puppeteer-core
// module graph into every module that needs to know a build id.
import { PUPPETEER_REVISIONS } from 'puppeteer-core/internal/revisions.js';

import { logger } from '../../globals.js';
import { markReported } from '../util/reported-error.js';
import { getErrorCategory } from '../util/error-categorizer.js';

/**
 * The browser build this release of Butler Sheet Icons is tested against. The default.
 *
 * Resolves from a constant compiled into puppeteer-core, so it needs no network at all.
 */
export const VERSION_RECOMMENDED = 'recommended';

/**
 * The newest stable release of the selected browser, looked up live.
 */
export const VERSION_STABLE = 'stable';

/**
 * Accepted before version 3.13.0 as the default, and still accepted as an alias for
 * {@link VERSION_STABLE}. See `normalizeVersionKeyword`.
 */
export const VERSION_LATEST = 'latest';

/**
 * Every keyword Butler Sheet Icons understands, for help text and error messages.
 */
export const VERSION_KEYWORDS = [VERSION_RECOMMENDED, VERSION_STABLE];

/**
 * Builds the help text for a `--browser-version` option.
 *
 * Shared by all four commands that declare the option, so the accepted values are described the
 * same way everywhere. The old text - "Version (=build id) of the browser to install" - said
 * nothing about the keywords and left it ambiguous whether a full version string or just a
 * version number was wanted.
 *
 * @param {string} action - What the command does with the browser, e.g. `install` or `use`.
 *
 * @returns {string} Description for Commander.
 */
export const describeBrowserVersionOption = (action) =>
    `Browser build to ${action}. Either a keyword - "${VERSION_RECOMMENDED}" for the build Butler Sheet Icons is tested with, or "${VERSION_STABLE}" for the newest stable release of the browser - or an exact version. For Chrome that is a milestone ("151"), a build prefix ("151.0.7922") or a full build id ("151.0.7922.77"); for Firefox a channel-prefixed build id ("stable_153.0.3"). Use "butler-sheet-icons browser list-available" to see what is available.`;

/**
 * Reports whether a `--browser-version` value is one of the keywords rather than a specific build.
 *
 * Callers use this to tell "the user asked for a particular build" from "Butler Sheet Icons chose
 * one", which changes how loudly an override should be reported.
 *
 * @param {string} browserVersion - Raw value from the command line or environment.
 *
 * @returns {boolean} `true` for `recommended`, `stable` and the `latest` alias.
 */
export const isVersionKeyword = (browserVersion) =>
    browserVersion === VERSION_RECOMMENDED ||
    browserVersion === VERSION_STABLE ||
    browserVersion === VERSION_LATEST;

/**
 * Explicit version forms accepted per browser.
 *
 * Chrome accepts three shapes, all of which `@puppeteer/browsers` resolves against the
 * Chrome for Testing "known good versions" data:
 *
 * - a milestone, `151`
 * - a build prefix without the patch component, `151.0.7922`
 * - a full build id, `151.0.7922.77`
 *
 * Firefox build ids are channel-prefixed, `stable_153.0.3`. A bare Firefox version is
 * deliberately **not** accepted: `@puppeteer/browsers` treats an unprefixed build id as
 * `FirefoxChannel.NIGHTLY`, so `--browser-version 152.0.1` would quietly install a nightly
 * build. Rejecting it and naming the correct form is the whole point of this validation.
 */
const EXPLICIT_VERSION_PATTERNS = {
    chrome: [/^\d+$/, /^\d+\.\d+\.\d+$/, /^\d+\.\d+\.\d+\.\d+$/],
    firefox: [/^(stable|beta|nightly|devedition|esr)_\S+$/],
};

/** Browsers Butler Sheet Icons knows how to resolve a version for. */
const SUPPORTED_BROWSERS = Object.keys(EXPLICIT_VERSION_PATTERNS);

/**
 * Human-readable description of the accepted explicit forms, used in error text.
 */
const EXPLICIT_VERSION_HELP = {
    chrome: 'a milestone such as "151", a build prefix such as "151.0.7922", or a full build id such as "151.0.7922.77"',
    firefox: 'a channel-prefixed build id such as "stable_153.0.3"',
};

/**
 * Whether the deprecation warning for `latest` has already been emitted in this process.
 *
 * Resolution happens more than once per run - detection and install each ask - and repeating
 * the same advisory line makes the real output harder to read.
 */
let latestDeprecationWarned = false;

/**
 * Returns the browser build that this release of Butler Sheet Icons is tested against.
 *
 * The value comes from `PUPPETEER_REVISIONS`, the same constant the full `puppeteer` package
 * uses to decide what to install. It is re-exported from puppeteer-core's package root but
 * carries an `@internal` JSDoc tag, so it is read here behind a single function with an explicit
 * failure path: if a future puppeteer-core drops or renames it, this throws with a clear cause
 * instead of silently yielding `undefined` and defaulting the whole product to nothing.
 *
 * @param {string} browser - Browser to look up (`chrome` or `firefox`).
 *
 * @returns {string} The pinned build id, e.g. `150.0.7871.24`.
 *
 * @throws {Error} If puppeteer-core does not publish a pinned build for this browser.
 */
export const getRecommendedBuildId = (browser) => {
    const buildId = PUPPETEER_REVISIONS?.[browser];

    if (typeof buildId !== 'string' || buildId.length === 0) {
        throw new Error(
            `Could not determine the recommended "${browser}" build: this version of puppeteer-core does not publish one. Pass an explicit --browser-version, or use --browser-version ${VERSION_STABLE}.`
        );
    }

    return buildId;
};

/**
 * Maps a user-supplied keyword onto the keyword actually used for resolution.
 *
 * `latest` used to be the default, so it is present in existing scripts, scheduled jobs and
 * `BSI_*_BROWSER_VERSION` variables everywhere. It is kept working rather than rejected, but it
 * no longer means what it did: it used to select the newest *published* build, which is how a
 * build that puppeteer could not drive got selected in the first place (issue #878).
 *
 * @param {string} browserVersion - Raw value from the command line or environment.
 *
 * @returns {string|null} The keyword to resolve with, or `null` when the value is not a keyword.
 */
const normalizeVersionKeyword = (browserVersion) => {
    if (browserVersion === VERSION_RECOMMENDED) {
        return VERSION_RECOMMENDED;
    }

    if (browserVersion === VERSION_STABLE) {
        return VERSION_STABLE;
    }

    if (browserVersion === VERSION_LATEST) {
        if (!latestDeprecationWarned) {
            logger.warn(
                `--browser-version "${VERSION_LATEST}" now means "${VERSION_STABLE}" - the newest stable release of the browser.`
            );
            logger.warn(
                `It previously meant the newest published build, which could be one the browser automation library cannot drive. Use "${VERSION_RECOMMENDED}" for the build Butler Sheet Icons is tested against, or "${VERSION_STABLE}" to keep tracking the newest stable release.`
            );
            latestDeprecationWarned = true;
        }

        return VERSION_STABLE;
    }

    return null;
};

/**
 * Rejects an explicit version that cannot be a valid build id for this browser.
 *
 * This exists because `resolveBuildId` returns input it does not recognise **verbatim** rather
 * than failing: both `151.0.7922.999` and `garbage` resolve to themselves, and the run then dies
 * much later inside `canDownload` with "cannot be downloaded", which reads like a connectivity
 * problem rather than a typo. Checking the shape here turns that into an immediate, specific
 * error.
 *
 * Only the *shape* is checked. Whether a well-formed build id actually exists is `canDownload`'s
 * job, and duplicating that here would mean a second network round trip.
 *
 * @param {string} browser - Browser the version belongs to.
 * @param {string} browserVersion - The explicit version to validate.
 *
 * @returns {void}
 *
 * @throws {Error} If the value is neither a keyword nor a plausible build id.
 */
const assertExplicitVersionIsWellFormed = (browser, browserVersion) => {
    // The browser is known to be supported: resolveBrowserVersion checks that first.
    const patterns = EXPLICIT_VERSION_PATTERNS[browser];

    if (patterns.some((pattern) => pattern.test(browserVersion))) {
        return;
    }

    logger.error(`"${browserVersion}" is not a valid --browser-version for ${browser}.`);
    logger.error(
        `Use a keyword - "${VERSION_RECOMMENDED}" (the build Butler Sheet Icons is tested against) or "${VERSION_STABLE}" (the newest stable release) - or ${EXPLICIT_VERSION_HELP[browser]}.`
    );
    logger.error(
        `Run "butler-sheet-icons browser list-available --browser ${browser}" to see the versions that can be installed.`
    );

    throw markReported(
        new Error(`Invalid --browser-version "${browserVersion}" for browser "${browser}"`)
    );
};

/**
 * Error categories that mean the request never reached the version service.
 *
 * Same set, and same reasoning, as `browser-list-available.js`: a failure to reach the service is
 * a different problem from the service answering with an error, and deserves different advice.
 */
const CONNECTIVITY_CATEGORIES = new Set([
    'timeout',
    'connection_refused',
    'host_not_found',
    'connection_reset',
]);

/**
 * Explains why a version could not be looked up, in terms an administrator can act on.
 *
 * Every version form except `recommended` and a full build id needs to reach the browser vendor's
 * version service, so this is the failure an offline or proxied machine hits. Left unhandled it
 * surfaces as a bare `getaddrinfo ENOTFOUND` with no indication that a version lookup was even
 * involved - the class of unreadable output issue #785 was about.
 *
 * @param {string} browser - Browser being resolved.
 * @param {string} browserVersion - The version value that could not be resolved.
 * @param {Error|unknown} err - The failure raised while looking it up.
 *
 * @returns {void}
 */
const logVersionLookupFailure = (browser, browserVersion, err) => {
    const category = getErrorCategory(err);

    if (!CONNECTIVITY_CATEGORIES.has(category)) {
        return;
    }

    logger.error(
        `Could not look up which ${browser} build "${browserVersion}" refers to: this machine could not reach the browser vendor's version service.`
    );
    logger.error(
        `Butler Sheet Icons needs internet access to resolve "${browserVersion}". Use "--browser-version ${VERSION_RECOMMENDED}", which needs no lookup, or name an exact build id. "butler-sheet-icons browser list-installed" shows the builds already available locally.`
    );
    logger.verbose(`Connectivity failure category: ${category}`);
    logger.debug(err?.stack ?? String(err));

    markReported(err);
};

/**
 * Turns a `--browser-version` value into a concrete browser build id.
 *
 * This is the only place in Butler Sheet Icons that interprets the version string. Everything
 * downstream - cache detection, install, uninstall - works with the resolved build id, so a
 * keyword means exactly one build within a run, and two machines running the same Butler Sheet
 * Icons release with the same options select the same build.
 *
 * @param {string} browser - Browser to resolve for (`chrome` or `firefox`).
 * @param {string} browserVersion - Keyword or explicit version from the CLI or environment.
 *
 * @returns {Promise<object>} `{ buildId, source, requested, usedNetwork }`, where `source` is
 * `recommended`, `stable` or `explicit`, and `usedNetwork` says whether resolving needed the
 * internet - `false` for `recommended`, which is what lets an offline machine start.
 *
 * @throws {Error} If the version is malformed, or the browser vendor's version data cannot be
 * reached to resolve a keyword.
 */
export const resolveBrowserVersion = async (browser, browserVersion) => {
    if (!browser) {
        throw new Error('Missing required option: "browser"');
    }

    if (!browserVersion) {
        throw new Error('Missing required option: "browserVersion"');
    }

    // Checked before anything else so an unknown browser is reported as an unknown browser.
    // Without this the run failed further down with "Could not resolve --browser-version ... to a
    // <name> build", which blames the version for a problem with the browser.
    if (!SUPPORTED_BROWSERS.includes(browser)) {
        throw new Error(
            `Unsupported browser "${browser}". Butler Sheet Icons can install ${SUPPORTED_BROWSERS.join(' and ')}.`
        );
    }

    const keyword = normalizeVersionKeyword(browserVersion);

    // The recommended build is a compile-time constant, so this branch returns without touching
    // the network. That is deliberate and load-bearing: it is what allows the cache lookup to
    // match on an exact build id while still working on an air-gapped or cold-start machine.
    if (keyword === VERSION_RECOMMENDED) {
        const buildId = getRecommendedBuildId(browser);

        logger.info(
            `Browser version "${browserVersion}" resolved to ${browser} build ${buildId} (the build this version of Butler Sheet Icons is tested with)`
        );

        return {
            buildId,
            source: VERSION_RECOMMENDED,
            requested: browserVersion,
            usedNetwork: false,
        };
    }

    if (!keyword) {
        assertExplicitVersionIsWellFormed(browser, browserVersion);
    }

    const platform = await detectBrowserPlatform();
    logger.debug(`Detected browser platform: ${platform}`);

    // `stable` is a tag @puppeteer/browsers understands for both browsers, which is why one
    // Butler Sheet Icons keyword can serve both. Note that its `latest` tag is NOT the
    // equivalent - for Chrome it means the canary channel, and for Firefox nightly.
    const tag = keyword === VERSION_STABLE ? VERSION_STABLE : browserVersion;

    let buildId;
    try {
        buildId = await resolveBuildId(browser, platform, tag);
    } catch (err) {
        // Rethrown unchanged, including non-Error throws: the reporter only adds an explanation,
        // and replacing the value here would discard the real cause.
        logVersionLookupFailure(browser, browserVersion, err);
        throw err;
    }

    if (!buildId) {
        throw new Error(
            `Could not resolve --browser-version "${browserVersion}" to a ${browser} build for platform "${platform}"`
        );
    }

    const source = keyword === VERSION_STABLE ? VERSION_STABLE : 'explicit';

    logger.info(
        `Browser version "${browserVersion}" resolved to ${browser} build ${buildId} on platform "${platform}"`
    );

    return { buildId, source, requested: browserVersion, usedNetwork: true };
};

/**
 * Resets the once-per-process deprecation warning. Exported for tests only.
 *
 * @returns {void}
 */
export const resetVersionWarningsForTesting = () => {
    latestDeprecationWarned = false;
};
