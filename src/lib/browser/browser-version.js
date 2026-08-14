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
 * Chrome release channels accepted as a `--browser-version` value.
 *
 * Resolved live through the same `@puppeteer/browsers` tag handling that resolves `stable`.
 * These worked before the `recommended`/`stable` vocabulary existed - every value used to be
 * handed to `resolveBuildId` verbatim, which recognises them as tags - and administrators use
 * them to track a vendor channel, so they must keep working.
 */
const CHANNEL_KEYWORDS = ['beta', 'dev', 'canary'];

/**
 * Builds the help text for a `--browser-version` option.
 *
 * Shared by the commands that install or drive a browser, so the accepted values are described
 * the same way everywhere. The old text - "Version (=build id) of the browser to install" - said
 * nothing about the keywords and left it ambiguous whether a full version string or just a
 * version number was wanted. `browser uninstall` carries its own description: it accepts a
 * narrower set, see `resolveLocalBrowserBuildId`.
 *
 * @param {string} action - What the command does with the browser, e.g. `install` or `use`.
 *
 * @returns {string} Description for Commander.
 */
export const describeBrowserVersionOption = (action) =>
    `Browser build to ${action}. Either a keyword - "${VERSION_RECOMMENDED}" for the build Butler Sheet Icons is tested with, "${VERSION_STABLE}" for the newest stable release, or a release channel such as "beta" - or an exact version: a milestone ("151"), a build prefix ("151.0.7922") or a full build id ("151.0.7922.77"). Use "butler-sheet-icons browser list-available" to see what is available.`;

/**
 * Commander argument parser for `--browser-version` options that default to `recommended`.
 *
 * Exists for one input Commander's `.default()` cannot handle: an environment variable that is
 * set but empty. Commander checks `envVar in process.env`, so a bare
 * `BSI_..._BROWSER_VERSION=` line in a systemd unit or docker-compose file beats the declared
 * default and would otherwise reach the resolver as an empty string - which used to be absorbed
 * by handler-level normalization before the `recommended` vocabulary existed. Treating empty as
 * "use the default" keeps those deployments working.
 *
 * @param {string} value - Raw value from the command line or environment.
 *
 * @returns {string} The value, or the default keyword when the value is empty.
 */
export const parseBrowserVersionValue = (value) => (value === '' ? VERSION_RECOMMENDED : value);

/**
 * Reports whether a `--browser-version` value is a keyword rather than a specific build.
 *
 * True for every value that floats - `recommended`, `stable`, the `latest` alias, and the
 * release channels. Callers use this to tell "the user asked for a particular build" from
 * "Butler Sheet Icons or the vendor chose one", which changes how loudly an override should be
 * reported, and whether degrading to a cached build can ever be acceptable.
 *
 * @param {string} browserVersion - Raw value from the command line or environment.
 *
 * @returns {boolean} `true` for `recommended`, `stable`, the `latest` alias and release channels.
 */
export const isVersionKeyword = (browserVersion) =>
    browserVersion === VERSION_RECOMMENDED ||
    browserVersion === VERSION_STABLE ||
    browserVersion === VERSION_LATEST ||
    CHANNEL_KEYWORDS.includes(browserVersion);

/**
 * Explicit version forms accepted for Chrome.
 *
 * Three shapes, all of which `@puppeteer/browsers` resolves against the Chrome for Testing
 * "known good versions" data:
 *
 * - a milestone, `151`
 * - a build prefix without the patch component, `151.0.7922`
 * - a full build id, `151.0.7922.77`
 */
const EXPLICIT_VERSION_PATTERNS = [/^\d+$/, /^\d+\.\d+\.\d+$/, /^\d+\.\d+\.\d+\.\d+$/];

/**
 * What a `--browser-version` value is, and - the part callers actually need - whether it can be
 * turned into a build id without asking the vendor.
 *
 * This exists because `browser check` must answer "which build would a real run use?" **without
 * touching the network**, and the honest answer differs per form. Before it existed, that command
 * carried its own copy of the build-id regex and treated everything else as a floating keyword,
 * so `--browser-version garbage` passed the check and killed the real run, and `--browser-version
 * 151` - an explicit pin - was described to the user as a value that floats.
 *
 * One classifier rather than a predicate per form, so the doctor and the resolver cannot hold
 * different opinions about the same string. {@link assertExplicitVersionIsWellFormed} is built on
 * it too.
 */
export const VERSION_FORM = Object.freeze({
    /** `recommended`. Resolves from a constant compiled into puppeteer-core; no lookup. */
    RECOMMENDED: 'recommended',
    /** A full build id such as `151.0.7922.77`. Names exactly one build; no lookup. */
    BUILD_ID: 'build-id',
    /** A milestone (`151`) or build prefix (`151.0.7922`). An explicit pin, but resolving it to a build needs the vendor's version service. */
    PARTIAL: 'partial',
    /** `stable`, the `latest` alias, or a release channel. Whatever is newest at the time it runs. */
    FLOATING: 'floating',
    /** Not a form Butler Sheet Icons accepts at all. */
    INVALID: 'invalid',
});

/**
 * Classifies a `--browser-version` value. Pure: no logging, no network, no throwing.
 *
 * @param {string} browserVersion - Raw value from the command line or environment.
 *
 * @returns {string} One of {@link VERSION_FORM}.
 */
export const classifyBrowserVersion = (browserVersion) => {
    if (browserVersion === VERSION_RECOMMENDED) {
        return VERSION_FORM.RECOMMENDED;
    }

    if (isVersionKeyword(browserVersion)) {
        return VERSION_FORM.FLOATING;
    }

    if (typeof browserVersion !== 'string') {
        return VERSION_FORM.INVALID;
    }

    // Checked before the partial forms so a full build id is never reported as needing a lookup.
    if (/^\d+\.\d+\.\d+\.\d+$/.test(browserVersion)) {
        return VERSION_FORM.BUILD_ID;
    }

    return EXPLICIT_VERSION_PATTERNS.some((pattern) => pattern.test(browserVersion))
        ? VERSION_FORM.PARTIAL
        : VERSION_FORM.INVALID;
};

/**
 * Browsers Butler Sheet Icons knows how to resolve a version for.
 *
 * Chrome, and only Chrome: the render path speaks the Chrome DevTools Protocol and passes a
 * Chromium-only argument list, so no other browser could be driven. Kept as a list, and checked
 * by name, so a bad `browser` value from a directly-called worker is reported as a bad browser
 * rather than failing later as a version that cannot be resolved.
 */
const SUPPORTED_BROWSERS = ['chrome'];

/**
 * Refuses a browser Butler Sheet Icons cannot drive.
 *
 * One helper rather than a check per entry point, so every path answers the same way. The two
 * that matter are `resolveBrowserVersion` (the network path) and `getRecommendedBuildId` (the
 * offline one, reached by `resolveLocalBrowserBuildId` on the uninstall path): before this was
 * shared, the second read straight from `PUPPETEER_REVISIONS` and returned a build id for
 * browsers the first rejected by name.
 *
 * @param {string} browser - Browser name from the CLI, the environment, or a directly-called
 * worker.
 *
 * @returns {void}
 *
 * @throws {Error} If the browser is not one Butler Sheet Icons supports.
 */
const assertBrowserIsSupported = (browser) => {
    if (!SUPPORTED_BROWSERS.includes(browser)) {
        throw new Error(
            `Unsupported browser "${browser}". Butler Sheet Icons can install ${SUPPORTED_BROWSERS.join(' and ')}.`
        );
    }
};

/**
 * Human-readable description of the accepted explicit forms, used in error text.
 */
const EXPLICIT_VERSION_HELP =
    'a release channel ("beta", "dev", "canary"), a milestone such as "151", a build prefix such as "151.0.7922", or a full build id such as "151.0.7922.77"';

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
 * The browser is checked against {@link SUPPORTED_BROWSERS} first, and that check is
 * load-bearing rather than defensive: `PUPPETEER_REVISIONS` carries a pin for every browser
 * puppeteer itself supports, which is a wider set than the one Butler Sheet Icons can drive.
 * Without it this function answers happily for a browser nothing else accepts - so
 * `resolveBrowserVersion` would reject a name that `resolveLocalBrowserBuildId` resolved, and the
 * product would hold two contradictory opinions about which browsers exist.
 *
 * @param {string} browser - Browser to look up. `chrome` is the only supported value.
 *
 * @returns {string} The pinned build id, e.g. `150.0.7871.24`.
 *
 * @throws {Error} If the browser is not one Butler Sheet Icons supports, or if puppeteer-core
 * does not publish a pinned build for it.
 */
export const getRecommendedBuildId = (browser) => {
    assertBrowserIsSupported(browser);

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
    // Through the shared classifier, so `browser check` cannot accept a value this rejects.
    if (classifyBrowserVersion(browserVersion) !== VERSION_FORM.INVALID) {
        return;
    }

    logger.error(`"${browserVersion}" is not a valid --browser-version for ${browser}.`);
    logger.error(
        `Use a keyword - "${VERSION_RECOMMENDED}" (the build Butler Sheet Icons is tested against) or "${VERSION_STABLE}" (the newest stable release) - or ${EXPLICIT_VERSION_HELP}.`
    );
    logger.error(
        `Run "butler-sheet-icons browser list-available --browser ${browser}" to see the versions that can be installed.`
    );

    throw markReported(
        new Error(`Invalid --browser-version "${browserVersion}" for browser "${browser}"`)
    );
};

/**
 * Marker for errors raised while asking the vendor's version service which build a value means.
 *
 * The launch path has to tell "the lookup itself failed" - an environment problem, where
 * degrading to a cached build can be reasonable for a floating keyword - apart from "the input
 * is wrong", where it never is: falling back there means running a build the user did not
 * choose, the exact failure mode issue #878 is about. A Symbol property, following the pattern
 * of `reported-error.js`, so the marker survives rethrows without appearing in serialized
 * output.
 */
const VERSION_LOOKUP_FAILED = Symbol('butler-sheet-icons.versionLookupFailed');

/**
 * Tags an error as raised by the version-service lookup.
 *
 * Values that cannot carry a property (strings, numbers) are returned unmarked rather than
 * wrapped, so the original thrown value is preserved for the caller.
 *
 * @param {Error|unknown} err - The error to mark.
 *
 * @returns {Error|unknown} The same value, for use in `throw markLookupFailure(err)`.
 */
const markLookupFailure = (err) => {
    if (err && typeof err === 'object' && Object.isExtensible(err)) {
        err[VERSION_LOOKUP_FAILED] = true;
    }

    return err;
};

/**
 * Reports whether an error came from the version-service lookup inside
 * {@link resolveBrowserVersion}, as opposed to validation of the input.
 *
 * @param {Error|unknown} err - The error to test.
 *
 * @returns {boolean} `true` when the lookup itself failed.
 */
export const isVersionLookupFailure = (err) =>
    Boolean(err && typeof err === 'object' && err[VERSION_LOOKUP_FAILED]);

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
 * @param {string} browser - Browser to resolve for. `chrome` is the only supported value;
 * anything else is rejected by name.
 * @param {string} browserVersion - Keyword, release channel, or explicit version from the CLI or
 * environment.
 *
 * @returns {Promise<object>} `{ buildId, source, requested, usedNetwork }`, where `source` is
 * `recommended`, `stable`, `channel` or `explicit`, and `usedNetwork` says whether resolving
 * needed the internet - `false` for `recommended`, which is what lets an offline machine start.
 *
 * @throws {Error} If the version is malformed, or the browser vendor's version data cannot be
 * reached to resolve a keyword. Lookup failures are distinguishable via
 * {@link isVersionLookupFailure}.
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
    assertBrowserIsSupported(browser);

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

    // A release channel is validated by name, not by shape - "beta" is a real Chrome channel
    // but matches none of the explicit build-id patterns.
    const isChannel = !keyword && CHANNEL_KEYWORDS.includes(browserVersion);

    if (!keyword && !isChannel) {
        assertExplicitVersionIsWellFormed(browser, browserVersion);
    }

    const platform = await detectBrowserPlatform();
    logger.debug(`Detected browser platform: ${platform}`);

    // `stable` and the release channels are tags @puppeteer/browsers understands. Note that its
    // `latest` tag is NOT the equivalent of `stable` - for Chrome it means the canary channel.
    const tag = keyword === VERSION_STABLE ? VERSION_STABLE : browserVersion;

    let buildId;
    try {
        buildId = await resolveBuildId(browser, platform, tag);
    } catch (err) {
        // Rethrown unchanged, including non-Error throws: the reporter only adds an explanation,
        // and replacing the value here would discard the real cause. The lookup marker lets the
        // launch path tell this environment failure apart from bad input.
        logVersionLookupFailure(browser, browserVersion, err);
        throw markLookupFailure(err);
    }

    if (!buildId) {
        throw new Error(
            `Could not resolve --browser-version "${browserVersion}" to a ${browser} build for platform "${platform}"`
        );
    }

    let source = 'explicit';
    if (keyword === VERSION_STABLE) {
        source = VERSION_STABLE;
    } else if (isChannel) {
        source = 'channel';
    }

    logger.info(
        `Browser version "${browserVersion}" resolved to ${browser} build ${buildId} on platform "${platform}"`
    );

    return { buildId, source, requested: browserVersion, usedNetwork: true };
};

/**
 * Interprets a `--browser-version` value against the local machine only.
 *
 * `browser uninstall` must work offline - removing a cached browser is a purely local
 * operation - and a floating keyword cannot name a build on this machine anyway: `stable`
 * resolves to whatever the vendor currently publishes, which is usually not what is cached.
 * So only two forms make sense here: an exact build id, and `recommended`, whose build id is a
 * compile-time constant. Everything else is refused with guidance rather than resolved over the
 * network.
 *
 * A value that matches no accepted form is passed through unvalidated: it simply will not match
 * any cache entry, and "not found in cache" is the honest outcome for it. Note what that means
 * for `browser`: only the `recommended` path consults it, through `getRecommendedBuildId`, so an
 * exact build id is matched against the cache without regard to which browser it belongs to.
 * That is deliberate - this function's job is to name a build, and the caller filters the
 * inventory by browser itself - but it does mean an unsupported browser is refused here only
 * when the version is `recommended`.
 *
 * @param {string} browser - Browser the version belongs to. `chrome` is the only supported value.
 * @param {string} browserVersion - Raw `--browser-version` value.
 *
 * @returns {string|null} The build id to match against the cache, or `null` when the value
 * cannot name a local build - in which case the reason has already been logged.
 *
 * @throws {Error} If `browserVersion` is `recommended` and the browser is not supported, or
 * puppeteer-core publishes no pin for it.
 */
export const resolveLocalBrowserBuildId = (browser, browserVersion) => {
    if (!browserVersion) {
        logger.error(
            'No browser version given. Name the exact build id; "butler-sheet-icons browser list-installed" shows the installed builds.'
        );
        return null;
    }

    if (browserVersion === VERSION_RECOMMENDED) {
        return getRecommendedBuildId(browser);
    }

    if (isVersionKeyword(browserVersion)) {
        logger.error(
            `--browser-version "${browserVersion}" cannot be used here: it names whichever build is currently newest, not a specific build on this machine.`
        );
        logger.error(
            `Name the exact build id, or use "${VERSION_RECOMMENDED}" for the build Butler Sheet Icons is tested with. "butler-sheet-icons browser list-installed" shows the installed builds.`
        );
        return null;
    }

    return browserVersion;
};

/**
 * Resets the once-per-process deprecation warning. Exported for tests only.
 *
 * @returns {void}
 */
export const resetVersionWarningsForTesting = () => {
    latestDeprecationWarned = false;
};
