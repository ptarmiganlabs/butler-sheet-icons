const { install, resolveBuildId, detectBrowserPlatform } = require('@puppeteer/browsers');
const path = require('path');
const { homedir } = require('os');

const { logger, setLoggingLevel, bsiExecutablePath, isPkg } = require('../../globals');

/**
 * Install browser
 * Returns true if browser installed successfully
 * @param {object} options
 * @param {string} options.browser - Browser to install
 * @param {string} options.browserVersion - Browser version to install
 * @returns {boolean} - True if browser installed successfully
 * @throws {Error} - If browser not installed successfully
 * @throws {Error} - If browser version not found
 * @throws {Error} - If error installing browser
 * @throws {Error} - If error resolving browser build id
 * @throws {Error} - If error detecting browser platform
 * @throws {Error} - If error getting browser cache path
 * @throws {Error} - If error getting browser executable path
 */
// eslint-disable-next-line no-unused-vars
const browserInstall = async (options, _command) => {
    try {
        // Set log level
        setLoggingLevel(options.loglevel);

        logger.verbose('Starting browser install');
        logger.verbose(`Running as standalone app: ${isPkg}`);
        logger.debug(`BSI executable path: ${bsiExecutablePath}`);
        logger.debug(`Options: ${JSON.stringify(options, null, 2)}`);

        // Install browser
        const browserPath = path.join(homedir(), '.cache/puppeteer');
        logger.debug(`Browser cache path: ${browserPath}`);

        const platform = await detectBrowserPlatform();
        logger.debug(`Detected browser platform: ${platform}`);

        // Determine which browser version to install
        const buildId = await resolveBuildId(options.browser, platform, options.browserVersion);
        logger.info(
            `Resolved browser build id: "${buildId}" for browser "${options.browser}" version "${options.browserVersion}"`
        );
        logger.info('Installing browser...');

        const browser = await install({
            browser: options.browser,
            buildId,
            cacheDir: browserPath,
        });

        logger.info(`Browser "${browser.browser}" version "${browser.buildId}" installed`);

        return true;
    } catch (err) {
        // Check if error is due to browser version missing
        if (err.message.includes('Download failed: server returned code 404.')) {
            logger.error(`Browser version "${options.browserVersion}" not found`);
        } else {
            logger.error(`Error installing browser: ${err}`);
        }

        throw err;
    }
};

module.exports = { browserInstall };
