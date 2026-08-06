import { detectBrowserPlatform, canDownload } from '@puppeteer/browsers';
import path from 'path';
import { homedir } from 'os';
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
 * List all available browser versions.
 *
 * For Chrome, the available versions are fetched from the Chrome version history API and filtered
 * to those that Puppeteer can actually download. For Firefox, only `latest` is supported at this time.
 *
 * @param {object} options - An options object.
 * @param {string} options.browser - Browser to list available versions for (`chrome` or `firefox`).
 * @param {string} options.channel - Which Chrome release channel to list (`stable`, `beta`, `dev`, or `canary`). Ignored for Firefox.
 * @param {string} [options.loglevel] - The log level. Can be one of "error", "warn", "info", "verbose", "debug", or "silly".
 *
 * @returns {Promise<Array<object>>} A promise that resolves to an array of available browsers.
 * Each entry has a `version` (e.g. `115.0.5790.90`) and a `name` (the API path for that version).
 */
export async function browserListAvailable(options) {
    try {
        // Set log level
        if (options.loglevel === undefined || options.logLevel) {
            options.loglevel = options.logLevel;
        }
        setLoggingLevel(options.loglevel);

        logger.verbose('Starting check for available browser versions');
        logger.verbose(`Running as standalone app: ${isSea}`);
        logger.debug(`BSI executable path: ${bsiExecutablePath}`);
        logger.debug(`Options: ${JSON.stringify(redactOptions(options), null, 2)}`);

        // Verify release channek is valid for the selected browser
        if (options.browser === 'chrome') {
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
        } else if (options.browser === 'firefox') {
            // Nothing to do here
        } else {
            throw new Error(`Invalid browser "${options.browser}"`);
        }

        const browserPath = path.join(homedir(), '.cache/puppeteer');
        logger.debug(`Browser cache path: ${browserPath}`);

        // Get current platform
        const platform = await detectBrowserPlatform();
        logger.debug(`Detected browser platform: ${platform}`);

        // Map platform to Chrome API compatible value
        const chromePlatform = mapPlatformToChrome(platform);
        logger.debug(`Mapped Chrome API platform: ${chromePlatform}`);

        // Get versions for the selected browser
        let browsersAvailable = [];
        if (options.browser === 'chrome') {
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

            logger.debug(
                `Get Chrome versions from: https://versionhistory.googleapis.com/v1/chrome/platforms/${chromePlatform}/channels/${options.channel}/versions`
            );

            const axiosConfig = {
                method: 'get',
                responseType: 'json',
                url: `https://versionhistory.googleapis.com/v1/chrome/platforms/${chromePlatform}/channels/${options.channel}/versions`,
            };

            let response;
            try {
                response = await axios(axiosConfig);
            } catch (err) {
                // Scoped to the request so that this module's own validation errors, thrown
                // earlier in the same try, are never reported as connectivity problems.
                logVersionHistoryFailure(err);
                throw err;
            }
            browsersAvailable = extractVersions(response);
            logger.debug(`Chrome versions: ${JSON.stringify(browsersAvailable, null, 2)}`);

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
        } else if (options.browser === 'firefox') {
            // For now support for older Firefox versions is not implemented
            logger.warn(
                'Firefox support is not implemented yet. Only latest version is supported, i.e. "browser install --browser firefox --browser-version latest", or simply "browser install --browser firefox".'
            );
            browsersAvailable.push({ version: 'latest' });

            // Firefox version history API:
            // https://wiki.mozilla.org/Release_Management/Product_details#firefox.json
            //
            // Get Firefox versions from this URL:
            // https://product-details.mozilla.org/1.0/firefox.json
            //
            // Response:
            // {
            //     "releases": [
            //         "firefox-114.0b7": {
            //             "build_number": 1,
            //             "category": "dev",
            //             "date": "2023-05-22",
            //             "description": null,
            //             "is_security_driven": false,
            //             "product": "firefox",
            //             "version": "114.0b7"
            //         }
            //     ]
            // }
        }
        return browsersAvailable;
    } catch (err) {
        // Only report failures nothing else has explained. Request and response problems are
        // already described in detail above; repeating them here is what left the reported
        // `Cannot read properties of undefined` text in the output (issue #785).
        if (!alreadyReported(err)) {
            logger.error(`Error checking for available browsers: ${err.message ?? err}`);
            logger.debug(err?.stack ?? String(err));
        }
        throw err;
    }
}

/**
 * Finds the most recent version of Chrome that Puppeteer can download and use.
 *
 * @param {string} channel - The Chrome release channel. Valid values are `stable`, `beta`, `dev`, `canary`.
 *
 * @returns {Promise<string|false>} A promise that resolves to the most recent usable Chrome build ID, or `false` if no usable version was found.
 */
export async function getMostRecentUsableChromeBuildId(channel) {
    try {
        logger.verbose(`Get most recent usable Chrome build ID: Channel "${channel}"`);

        // Verify release channek is valid
        if (
            channel !== 'stable' &&
            channel !== 'beta' &&
            channel !== 'dev' &&
            channel !== 'canary'
        ) {
            throw new Error(`Invalid Chrome release channel "${channel}"`);
        }

        const browserPath = path.join(homedir(), '.cache/puppeteer');
        logger.debug(`Get most recent usable Chrome build ID: Browser cache path: ${browserPath}`);

        // Get current platform
        const platform = await detectBrowserPlatform();
        logger.debug(
            `Get most recent usable Chrome build ID: Detected browser platform: ${platform}`
        );

        // Map platform to Chrome API compatible value
        const chromePlatform = mapPlatformToChrome(platform);
        logger.debug(
            `Get most recent usable Chrome build ID: Mapped Chrome API platform: ${chromePlatform}`
        );

        logger.debug(
            `Get Chrome versions from: https://versionhistory.googleapis.com/v1/chrome/platforms/${chromePlatform}/channels/${channel}/versions`
        );

        const axiosConfig = {
            method: 'get',
            responseType: 'json',
            url: `https://versionhistory.googleapis.com/v1/chrome/platforms/${chromePlatform}/channels/${channel}/versions`,
        };

        let response;
        try {
            response = await axios(axiosConfig);
        } catch (err) {
            // Scoped to the request, as in browserListAvailable above.
            logVersionHistoryFailure(err);
            throw err;
        }
        const browsersAvailable = extractVersions(response);
        logger.debug(`Chrome versions: ${JSON.stringify(browsersAvailable, null, 2)}`);

        // Output Chrome versions and names to info log
        if (browsersAvailable.length > 0) {
            for (const version of browsersAvailable) {
                // Can this version be downloaded?

                const canDownloadBrowser = await canDownload({
                    browser: 'chrome',
                    buildId: version.version,
                    cacheDir: browserPath,
                    unpack: false,
                });

                if (canDownloadBrowser) {
                    return version.version;
                }
            }
        }
        logger.info('No Chrome versions available');
        return false;
    } catch (err) {
        // As above: only report what has not already been explained.
        if (!alreadyReported(err)) {
            logger.error(`Error getting most recent usable Chrome build ID: ${err.message ?? err}`);
            logger.debug(err?.stack ?? String(err));
        }

        throw err;
    }
}
