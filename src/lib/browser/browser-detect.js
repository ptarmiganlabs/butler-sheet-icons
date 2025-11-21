import { getInstalledBrowsers } from '@puppeteer/browsers';
import path from 'path';
import { homedir } from 'os';
import fs from 'fs';

import { logger } from '../../globals.js';

/**
 * Detects available browsers in the following priority order:
 * 1. System browser (via PUPPETEER_EXECUTABLE_PATH environment variable)
 * 2. Cached browsers in Puppeteer cache directory
 * 3. Returns null if no browser found (caller should download)
 *
 * @param {object} options - Options object
 * @param {string} options.browser - Browser type (chrome, firefox)
 * @param {string} options.browserVersion - Requested browser version
 * @returns {Promise<Object|null>} Browser info object or null if no browser found
 * @returns {string} return.executablePath - Path to browser executable
 * @returns {string} return.source - Source of browser ('system', 'cache', or null)
 * @returns {string} return.browser - Browser type
 * @returns {string} return.buildId - Build ID (only for cached browsers)
 */
export const detectAvailableBrowser = async (options) => {
    try {
        // Priority 1: Check for system browser via PUPPETEER_EXECUTABLE_PATH
        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            const systemBrowserPath = process.env.PUPPETEER_EXECUTABLE_PATH;

            // Verify the path exists
            if (fs.existsSync(systemBrowserPath)) {
                logger.info(`Found system browser at: ${systemBrowserPath}`);
                logger.info('Using system browser (PUPPETEER_EXECUTABLE_PATH is set)');

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

        // Priority 2: Check for cached browsers in Puppeteer cache
        const browserPath = path.join(homedir(), '.cache/puppeteer');
        logger.debug(`Checking for cached browsers in: ${browserPath}`);

        const installedBrowsers = getInstalledBrowsers({
            cacheDir: browserPath,
        });

        if (installedBrowsers && installedBrowsers.length > 0) {
            logger.info(`Found ${installedBrowsers.length} cached browser(s)`);

            // Filter by requested browser type if specified
            let matchingBrowsers = installedBrowsers;
            if (options.browser) {
                matchingBrowsers = installedBrowsers.filter((b) => b.browser === options.browser);
            }

            if (matchingBrowsers.length > 0) {
                // Use the first matching browser
                const browser = matchingBrowsers[0];
                logger.info(`Using cached browser: ${browser.browser} ${browser.buildId}`);

                return {
                    executablePath: browser.executablePath,
                    source: 'cache',
                    browser: browser.browser,
                    buildId: browser.buildId,
                };
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
