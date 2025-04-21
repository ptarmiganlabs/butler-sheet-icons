const { getInstalledBrowsers, uninstall } = require('@puppeteer/browsers');
const path = require('path');
const { homedir } = require('os');
const fs = require('fs-extra');

const { logger, setLoggingLevel, bsiExecutablePath, isSea } = require('../../globals');

/**
 * Uninstall a browser from the Butler Sheet Icons cache.
 * @param {object} options - An options object.
 * @param {string} options.browser - The browser to uninstall.
 * @param {string} options.browserVersion - The version of the browser to uninstall.
 * @param {string} [options.loglevel] - The log level. Can be one of "error", "warn", "info", "verbose", "debug", "silly". Default is "info".
 *
 * @returns {Promise<boolean>} - A promise that resolves to true if the browser was uninstalled successfully, false otherwise.
 *
 * @throws {Error} - If the browser was not found.
 * @throws {Error} - If there was an error uninstalling the browser.
 */
const browserUninstall = async (options) => {
    try {
        // Set log level
        if (options.loglevel === undefined || options.logLevel) {
            // eslint-disable-next-line no-param-reassign
            options.loglevel = options.logLevel;
        }
        setLoggingLevel(options.loglevel);

        logger.info('Starting browser uninstallation');
        logger.verbose(`Running as standalone app: ${isSea}`);
        logger.debug(`BSI executable path: ${bsiExecutablePath}`);
        logger.debug(`Options: ${JSON.stringify(options, null, 2)}`);

        const browserPath = path.join(homedir(), '.cache/puppeteer');

        logger.debug(`Browser cache path: ${browserPath}`);

        // Get list of all installed browsers
        const browsersInstalled = await getInstalledBrowsers({
            cacheDir: browserPath,
        });

        // Get specifics of browser to be uninstalled
        const browserToUninstall = browsersInstalled.find(
            (browser) =>
                browser.browser === options.browser && browser.buildId === options.browserVersion
        );

        // Check if browser to uninstall was found
        if (browserToUninstall) {
            logger.info(
                `Uninstalling browser: ${browserToUninstall.browser}, build id=${browserToUninstall.buildId}, platform=${browserToUninstall.platform}, path=${browserToUninstall.path}`
            );

            await uninstall({
                browser: browserToUninstall.browser,
                buildId: browserToUninstall.buildId,
                cacheDir: browserPath,
            });

            logger.info(
                `Browser "${browserToUninstall.browser}", version "${browserToUninstall.buildId}" uninstalled.`
            );
        } else {
            logger.info(`Browser not found: ${options.browser}, platform=${options.platform}`);
            return false;
        }

        return true;
    } catch (err) {
        logger.error(`Error deleting browser: ${err}`);
        throw err;
    }
};

/**
 * Uninstall all browsers from the Butler Sheet Icons cache.
 *
 * @param {object} options - An options object.
 * @param {string} [options.loglevel] - The log level. Can be one of "error", "warn", "info", "verbose", "debug", "silly". Default is "info".
 *
 * @returns {Promise<boolean>} - A promise that resolves to true when all browsers are uninstalled.
 *
 * @throws {Error} - If there is an error during the uninstallation process.
 */
const browserUninstallAll = async (options) => {
    try {
        // Set log level
        if (options.loglevel === undefined || options.logLevel) {
            // eslint-disable-next-line no-param-reassign
            options.loglevel = options.logLevel;
        }
        setLoggingLevel(options.loglevel);

        logger.info('Starting uninstallation of all browsers');
        logger.verbose(`Running as standalone app: ${isSea}`);
        logger.debug(`BSI executable path: ${bsiExecutablePath}`);
        logger.debug(`Options: ${JSON.stringify(options, null, 2)}`);

        const browserPath = path.join(homedir(), '.cache/puppeteer');
        logger.debug(`Browser cache path: ${browserPath}`);

        // Get list of all installed browsers
        const browsersInstalled = await getInstalledBrowsers({
            cacheDir: browserPath,
        });

        // Check if any browsers are installed
        if (browsersInstalled.length > 0) {
            logger.info(`Uninstalling ${browsersInstalled.length} browsers:`);
            browsersInstalled.forEach(async (browser) => {
                logger.info(
                    `    Starting uninstallation of "${browser.browser}", build id "${browser.buildId}", platform "${browser.platform}", path "${browser.path}"`
                );

                await uninstall({
                    browser: browser.browser,
                    buildId: browser.buildId,
                    cacheDir: browserPath,
                });

                logger.info(`Browser "${browser.browser}" (${browser.buildId}) uninstalled.`);
            });

            // Remove any remaining files and directories in the browser cache directory
            // This is necessary because Puppeteer's uninstall function may not remove all files
            // and directories in the browser cache directory
            logger.info(
                'Removing any remaining files and directories in the browser cache directory'
            );

            await fs.emptyDir(browserPath);
        } else {
            logger.info('No browsers installed');
        }

        return true;
    } catch (err) {
        logger.error(`Error deleting all browsers: ${err}`);
        throw err;
    }
};

module.exports = { browserUninstall, browserUninstallAll };
