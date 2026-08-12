import { detectBrowserPlatform, canDownload } from '@puppeteer/browsers';
import { resolveBrowserCacheDir } from './browser-paths.js';
import axios from 'axios';

import { logger, setLoggingLevel, bsiExecutablePath, isSea } from '../../globals.js';
import { redactOptions } from '../util/redact-secrets.js';
import { getErrorCategory } from '../util/error-categorizer.js';
import { markReported, alreadyReported } from '../util/reported-error.js';

/** Host queried for the list of published Chrome versions. */
const CHROME_VERSION_HISTORY_HOST = 'versionhistory.googleapis.com';

/**
 * Error categories that mean "the request never reached the server".
 *
 * Kept separate from HTTP-level failures (4xx/5xx), which indicate the service was reached but
 * refused or failed the request - a different problem, with different advice.
 */
const CONNECTIVITY_CATEGORIES = new Set([
    'timeout',
    'connection_refused',
    'host_not_found',
    'connection_reset',
]);

/**
 * Logs an actionable message for a failure returned by the Chrome version history service.
 *
 * Only call this for errors thrown by the HTTP request itself, so that Butler Sheet Icons' own
 * validation errors are never mistaken for connectivity problems.
 *
 * Two shapes have to be handled. A well-formed network failure carries a code such as
 * `ENOTFOUND`. But an offline run has also been seen to surface as
 * `TypeError: Cannot read properties of undefined (reading 'status')` thrown from inside axios
 * itself, with no code at all (issue #785). The reliable signal common to both is the **absence
 * of an HTTP response**: if there is no `response`, the service was never reached.
 *
 * @param {Error|unknown} err - The error thrown while contacting the service.
 *
 * @returns {void}
 */
function logVersionHistoryFailure(err) {
    const category = getErrorCategory(err);
    const gotHttpResponse = Boolean(err?.response);

    if (!gotHttpResponse || CONNECTIVITY_CATEGORIES.has(category)) {
        logger.error(
            `Could not reach ${CHROME_VERSION_HISTORY_HOST} to look up available browser versions.`
        );
        logger.error(
            'Butler Sheet Icons needs internet access for this command. If this machine is offline or behind a proxy, use "butler-sheet-icons browser list-installed" to see the browsers already available locally.'
        );
        logger.verbose(`Connectivity failure category: ${category}`);
    } else {
        // The service answered, but not with success - a different problem, different advice.
        logger.error(
            `${CHROME_VERSION_HISTORY_HOST} returned HTTP ${err.response.status} while listing available browser versions.`
        );
    }

    logger.debug(err?.stack ?? String(err));
    markReported(err);
}

/**
 * Extracts the version array from a version history response, rejecting anything unexpected.
 *
 * The response body is not assumed to be well formed. A captive portal or intercepting proxy can
 * answer HTTP 200 with an HTML login page, and reading `.versions` off that yields `undefined` -
 * which then throws `Cannot read properties of undefined (reading 'length')` further down, the
 * same class of unhelpful error this module already had (issue #785).
 *
 * @param {object} response - Axios response for the version history request.
 *
 * @returns {Array<object>} The `versions` array from the response body.
 *
 * @throws {Error} If the body does not contain a `versions` array.
 */
function extractVersions(response) {
    const versions = response?.data?.versions;

    if (!Array.isArray(versions)) {
        logger.error(
            `Unexpected response from ${CHROME_VERSION_HISTORY_HOST} when listing available browser versions.`
        );
        logger.error(
            'This can happen when a proxy or captive portal intercepts the request. Check that this machine can reach the internet directly.'
        );
        logger.debug(`Response body: ${JSON.stringify(response?.data)}`);

        const err = new Error(`Unexpected response from ${CHROME_VERSION_HISTORY_HOST}`);
        markReported(err);
        throw err;
    }

    return versions;
}

/**
 * Maps Puppeteer's platform values to corresponding Chrome version history API platform values.
 * Converts `win*` to `win`, `mac*` to `mac`, and `linux*` to `linux`.
 * If the platform cannot be mapped, it returns the original Puppeteer platform value.
 *
 * @param {string} puppeteerPlatform - Platform value from `detectBrowserPlatform()`.
 *
 * @returns {string} Platform value suitable for the Chrome version history API.
 */
function mapPlatformToChrome(puppeteerPlatform) {
    // Chrome API expects: win, mac, linux
    if (puppeteerPlatform.startsWith('win')) {
        return 'win';
    }
    if (puppeteerPlatform.startsWith('mac')) {
        return 'mac';
    }
    if (puppeteerPlatform.startsWith('linux')) {
        return 'linux';
    }
    // Default to original value if we can't map it
    return puppeteerPlatform;
}

/**
 * Fetch the Chrome versions Google currently publishes.
 *
 * Fetching only: no availability checking, no per-version logging. That
 * separation is the point. The availability check is one HTTP request per
 * version, run strictly serially, and it exists purely to decide the log level
 * of each printed line - so a caller that just wants the list (an interactive
 * version picker, say) previously had to wait for hundreds of round trips it
 * had no use for.
 *
 * The `logPrefix` exists because this used to have two callers with different
 * debug output, and sharing the fetch without it would have quietly rewritten
 * one of them. The prefixing caller has since been removed, so every current
 * caller leaves it at the default.
 *
 * @param {object} options - An options object.
 * @param {string} options.channel - Chrome release channel.
 * @param {string} [options.logPrefix] - Prefix for this function's debug lines.
 *
 * @returns {Promise<Array<{version: string, name: string}>>} Published versions, newest first, as the API returns them.
 *
 * @throws {Error} If the version history API cannot be reached or returns something unusable.
 */
export async function fetchAvailableVersions({ channel, logPrefix = '' }) {
    // The real detectBrowserPlatform is synchronous, so this await does nothing
    // - but it is what the code did before this function was extracted, and
    // dropping it would change what a promise-returning stub does. Left as-is
    // to keep this a behaviour-preserving extraction.
    const platform = await detectBrowserPlatform();
    logger.debug(`${logPrefix}Detected browser platform: ${platform}`);

    const chromePlatform = mapPlatformToChrome(platform);
    logger.debug(`${logPrefix}Mapped Chrome API platform: ${chromePlatform}`);

    const url = `https://versionhistory.googleapis.com/v1/chrome/platforms/${chromePlatform}/channels/${channel}/versions`;
    logger.debug(`Get Chrome versions from: ${url}`);

    let response;
    try {
        response = await axios({ method: 'get', responseType: 'json', url });
    } catch (err) {
        // Scoped to the request so that a caller's own validation errors are
        // never reported as connectivity problems.
        logVersionHistoryFailure(err);
        throw err;
    }

    const versions = extractVersions(response);
    logger.debug(`Chrome versions: ${JSON.stringify(versions, null, 2)}`);

    return versions;
}

/**
 * List all available browser versions.
 *
 * The available versions are fetched from the Chrome version history API and filtered to those
 * that Puppeteer can actually download.
 *
 * @param {object} options - An options object.
 * @param {string} options.browser - Browser to list available versions for. `chrome` is the only
 * supported value.
 * @param {string} options.channel - Which Chrome release channel to list (`stable`, `beta`, `dev`, or `canary`).
 * @param {string} [options.loglevel] - The log level. Can be one of "error", "warn", "info", "verbose", "debug", or "silly".
 *
 * @returns {Promise<Array<object>>} A promise that resolves to an array of available browsers.
 * Each entry has a `version` (e.g. `115.0.5790.90`) and a `name` (the API path for that version).
 */
export async function browserListAvailable(options) {
    try {
        setLoggingLevel(options.loglevel);

        logger.verbose('Starting check for available browser versions');
        logger.verbose(`Running as standalone app: ${isSea}`);
        logger.debug(`BSI executable path: ${bsiExecutablePath}`);
        logger.debug(`Options: ${JSON.stringify(redactOptions(options), null, 2)}`);

        // Reported as a bad browser rather than a bad channel: the two are separate mistakes
        // and the messages must not be swapped.
        if (options.browser !== 'chrome') {
            throw new Error(`Invalid browser "${options.browser}"`);
        }

        // Verify the release channel is one the version history API publishes
        if (
            options.channel !== 'stable' &&
            options.channel !== 'beta' &&
            options.channel !== 'dev' &&
            options.channel !== 'canary'
        ) {
            throw new Error(
                `Invalid release channel "${options.channel}" for browser "${options.browser}"`
            );
        }

        // No --browser-cache-dir on this command: this value is only ever handed to
        // canDownload(), which ignores cacheDir entirely, so an option here would be a knob
        // that provably does nothing. Resolved the same way as everywhere else regardless,
        // so there is one answer to "where is the cache" rather than two.
        const browserPath = resolveBrowserCacheDir(options);

        // https://developer.chrome.com/docs/web-platform/versionhistory/guide
        //
        // Chome version history API:
        // https://developer.chrome.com/docs/versionhistory/guide/
        //
        // Get chrome versions from this URL:
        // https://versionhistory.googleapis.com/v1/chrome/platforms/<platform>/channels/<channel>/versions
        //
        // Example:
        // https://versionhistory.googleapis.com/v1/chrome/platforms/win/channels/stable/versions
        //
        // Response:
        // {
        //     "versions": [
        //         {
        //             "name": "chrome/platforms/win/channels/stable/versions/115.0.5790.90",
        //             "version": "115.0.5790.90"
        //         },
        //         {
        //             "name": "chrome/platforms/win/channels/stable/versions/114.0.5735.200"
        //             ""version": "114.0.5735.200"
        //         }
        //     ],
        //     "nextPageToken": ""
        // }

        const browsersAvailable = await fetchAvailableVersions({
            channel: options.channel,
        });

        // Output Chrome versions and names to info log
        if (browsersAvailable.length > 0) {
            logger.info(`Chrome versions from "${options.channel}" channel:`);
            logger.verbose(
                'Note that not all versions may be available for use with Butler Sheet Icons.'
            );

            for (const version of browsersAvailable) {
                // Can this version be downloaded?

                const canDownloadBrowser = await canDownload({
                    browser: options.browser,
                    buildId: version.version,
                    cacheDir: browserPath,
                    unpack: true,
                });

                if (canDownloadBrowser) {
                    logger.info(`    ${version.version}, "${version.name}"`);
                } else {
                    logger.verbose(`    ${version.version}, "${version.name}" (not available)`);
                }
            }
        } else {
            logger.info('No Chrome versions available');
        }

        return browsersAvailable;
    } catch (err) {
        // Only report failures nothing else has explained. Request and response problems are
        // already described in detail above; repeating them here is what left the reported
        // `Cannot read properties of undefined` text in the output (issue #785).
        if (!alreadyReported(err)) {
            logger.error(`Error checking for available browsers: ${err?.message || err}`);
            logger.debug(err?.stack ?? String(err));
        }
        throw err;
    }
}
