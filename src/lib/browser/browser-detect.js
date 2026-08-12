import { getInstalledBrowsers, getVersionComparator } from '@puppeteer/browsers';
import { resolveBrowserCacheDir } from './browser-paths.js';
import fs from 'fs';

import { logger } from '../../globals.js';
import { isVersionKeyword } from './browser-version.js';

/**
 * Orders cached builds newest first.
 *
 * Only used when no specific build was requested. `@puppeteer/browsers` provides a per-browser
 * comparator because build ids are not comparable as plain strings - `151.0.7922.109` sorts before
 * `151.0.7922.77` lexically, but is the newer build.
 *
 * The comparator throws on anything that is not a valid version for that browser, so a stray
 * directory in the cache must not be allowed to take down detection: on failure the list is
 * returned untouched.
 *
 * @param {Array<object>} browsers - Installed browser entries.
 * @param {string} browser - Browser type the entries belong to.
 *
 * @returns {Array<object>} The entries, newest first where that could be determined.
 */
const sortNewestFirst = (browsers, browser) => {
    const comparator = getVersionComparator(browser);

    if (!comparator) {
        return browsers;
    }

    try {
        return [...browsers].sort((a, b) => comparator(b.buildId, a.buildId));
    } catch (err) {
        logger.debug(`Could not order cached builds by version: ${err?.message ?? err}`);
        return browsers;
    }
};

/**
 * Detects available browsers in the following priority order:
 * 1. System browser (via PUPPETEER_EXECUTABLE_PATH environment variable)
 * 2. Cached browsers in Puppeteer cache directory
 * 3. Returns null if no browser found (caller should download)
 *
 * Version matching works on a build id that the caller has already resolved, never on the raw
 * `--browser-version` value. That is what makes a keyword mean exactly one build: before this,
 * `latest` accepted any cached build of the right type in filesystem order, so two machines on the
 * same Butler Sheet Icons version could silently run different Chrome builds - and did, which is
 * how a broken build survived unnoticed on one CI runner while another passed (issue #878).
 *
 * @param {object} options - Options object.
 * @param {string} options.browser - Browser type (e.g. `chrome`, `firefox`).
 * @param {string} [options.browserCacheDir] - Cache directory to search. Resolved here rather
 * than by the caller, so a worker called directly with a bare options bag still works.
 * @param {string} [options.browserVersion] - The raw value the user asked for. Used only to decide
 * how loudly to report an override; matching uses `resolvedBuildId`.
 * @param {string} [resolvedBuildId] - Concrete build id from `resolveBrowserVersion`. When omitted,
 * any cached build of the requested type is acceptable and the newest is chosen - the fallback used
 * when a machine is offline and the requested keyword could not be resolved.
 *
 * @returns {Promise<object|null>} Browser info object, or `null` if no browser was found.
 * Returns an object with `executablePath`, `source` (`'system'` or `'cache'`), `browser`, and `buildId`.
 */
export const detectAvailableBrowser = async (options, resolvedBuildId) => {
    try {
        // Priority 1: Check for system browser via PUPPETEER_EXECUTABLE_PATH
        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            const systemBrowserPath = process.env.PUPPETEER_EXECUTABLE_PATH;

            // Verify the path exists
            if (fs.existsSync(systemBrowserPath)) {
                logger.info(`Found system browser at: ${systemBrowserPath}`);
                logger.info('Using system browser (PUPPETEER_EXECUTABLE_PATH is set)');

                // Asking for a specific build and silently getting a different one is worth a
                // warning: the version was requested deliberately, and this path ignores it.
                // A keyword is Butler Sheet Icons' own choice, so overriding it is unremarkable.
                if (options.browserVersion && !isVersionKeyword(options.browserVersion)) {
                    logger.warn(
                        `PUPPETEER_EXECUTABLE_PATH overrides --browser-version "${options.browserVersion}": the browser at ${systemBrowserPath} will be used instead. Unset PUPPETEER_EXECUTABLE_PATH to use the requested build.`
                    );
                }

                return {
                    executablePath: systemBrowserPath,
                    source: 'system',
                    browser: options.browser,
                    buildId: 'system-installed',
                };
            } else {
                logger.warn(
                    `PUPPETEER_EXECUTABLE_PATH is set to "${systemBrowserPath}" but file does not exist`
                );
            }
        }

        // Priority 2: Check for cached browsers in the browser cache directory
        const browserPath = resolveBrowserCacheDir(options);

        const installedBrowsers = await getInstalledBrowsers({
            cacheDir: browserPath,
        });

        if (installedBrowsers && installedBrowsers.length > 0) {
            logger.info(`Found ${installedBrowsers.length} cached browser(s)`);

            // Filter by requested browser type if specified
            let matchingBrowsers = installedBrowsers;
            if (options.browser) {
                matchingBrowsers = matchingBrowsers.filter((b) => b.browser === options.browser);
            }

            const ofRequestedType = matchingBrowsers.length;

            if (resolvedBuildId) {
                matchingBrowsers = matchingBrowsers.filter((b) => b.buildId === resolvedBuildId);
            } else {
                matchingBrowsers = sortNewestFirst(matchingBrowsers, options.browser);
            }

            if (matchingBrowsers.length > 0) {
                const browser = matchingBrowsers[0];
                logger.info(`Using cached browser: ${browser.browser} ${browser.buildId}`);

                return {
                    executablePath: browser.executablePath,
                    source: 'cache',
                    browser: browser.browser,
                    buildId: browser.buildId,
                };
            } else if (ofRequestedType > 0) {
                // The type matched and only the build did. Saying "no browsers of type chrome"
                // here, as this used to, sends the reader looking for the wrong problem.
                logger.debug(
                    `Cached "${options.browser}" browsers found, but none matching build ${resolvedBuildId}`
                );
            } else {
                logger.debug(`No cached browsers matching type "${options.browser}" found`);
            }
        } else {
            logger.debug('No cached browsers found');
        }

        // Priority 3: No browser found - caller should download
        logger.debug('No system or cached browser available - download will be required');
        return null;
    } catch (err) {
        logger.error(`Error detecting available browser: ${err.message}`);
        if (err.stack) {
            logger.debug(err.stack);
        }
        return null;
    }
};
