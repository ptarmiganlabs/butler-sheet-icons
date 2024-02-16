const {
    install,
    resolveBuildId,
    detectBrowserPlatform,
    canDownload,
} = require('@puppeteer/browsers');
const path = require('path');
const { homedir } = require('os');
const ProgressBar = require('progress');

const { logger, setLoggingLevel, bsiExecutablePath, isPkg } = require('../../globals');
const { getMostRecentUsableChromeBuildId } = require('./browser-list-available');

/**
 * Install browser
 * Returns object with browser info if browser installed successfully
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

        // Create a new progress bar instance
        const bar = new ProgressBar('(:percent) :bar', { total: 100 });

        // Install browser
        const browserPath = path.join(homedir(), '.cache/puppeteer');
        logger.debug(`Browser cache path: ${browserPath}`);

        const platform = await detectBrowserPlatform();
        logger.debug(`Detected browser platform: ${platform}`);

        let buildId;
        if (options.browser === 'chrome') {
            if (options.browserVersion === 'latest') {
                // Get most recent stable Chrome build id that works with Puppeteer
                buildId = await getMostRecentUsableChromeBuildId('stable');
            } else {
                buildId = await resolveBuildId(options.browser, platform, options.browserVersion);
            }
        } else if (options.browser === 'firefox') {
            buildId = await resolveBuildId(options.browser, platform, options.browserVersion);
        }

        logger.info(
            `Resolved browser build id: "${buildId}" for browser "${options.browser}" version "${options.browserVersion}"`
        );

        // Ensure browser can be downloaded
        const canDownloadBrowser = await canDownload({
            browser: options.browser,
            buildId,
            cacheDir: browserPath,
            unpack: true,
        });

        if (!canDownloadBrowser) {
            throw new Error(
                `Browser "${options.browser}" version "${options.browserVersion}" cannot be downloaded. Please use the "list-available" command to check available versions`
            );
        }

        logger.info('Installing browser...');

        const browser = await install({
            browser: options.browser,
            buildId,
            cacheDir: browserPath,
            downloadProgressCallback: (downloadedBytes, totalBytes) => {
                logger.verbose(
                    `Downloaded ${downloadedBytes} of ${totalBytes} bytes (${(
                        (downloadedBytes / totalBytes) *
                        100
                    ).toFixed(2)}%)`
                );

                // Update the progress bar. Make sure to pass integer values to `bar.tick()`
                bar.tick((downloadedBytes / totalBytes) * 100 - bar.curr);
            },
            unpack: true,
        });

        logger.info(`Browser "${browser.browser}" version "${browser.buildId}" installed`);

        return browser;
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
