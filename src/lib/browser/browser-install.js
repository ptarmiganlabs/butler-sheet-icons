const {
    install,
    resolveBuildId,
    detectBrowserPlatform,
    canDownload,
} = require('@puppeteer/browsers');
const path = require('path');
const { homedir } = require('os');
const cliProgress = require('cli-progress');

const { logger, setLoggingLevel, bsiExecutablePath, isPkg } = require('../../globals');
const { getMostRecentUsableChromeBuildId } = require('./browser-list-available');

/**
 * Install browser
 * Returns object with browser info if browser installed successfully
 * @param {object} options
 * @param {string} options.browser - Browser to install
 * @param {string} options.browserVersion - Browser version to install
 * @returns {boolean} - True if browser installed successfully
 *
 * @returns {Promise<Object>} - Browser info if installed successfully
 *
 * @throws {Error} - If browser not installed successfully
 * @throws {Error} - If browser version not found
 * @throws {Error} - If error installing browser
 * @throws {Error} - If error resolving browser build id
 * @throws {Error} - If error detecting browser platform
 * @throws {Error} - If error getting browser cache path
 * @throws {Error} - If error getting browser executable path
 */
const browserInstall = async (options, _command) => {
    try {
        if (!options.browser || !options.browserVersion) {
            throw new Error('Missing required options: "browser" and "browserVersion"');
        }

        // Set log level
        if (options.loglevel === undefined || options.logLevel) {
            // eslint-disable-next-line no-param-reassign
            options.loglevel = options.logLevel;
        }
        setLoggingLevel(options.loglevel);

        logger.verbose('Starting browser install');
        logger.verbose(`Running as standalone app: ${isPkg}`);
        logger.debug(`BSI executable path: ${bsiExecutablePath}`);
        logger.debug(`Options: ${JSON.stringify(options, null, 2)}`);

        // Create a new progress bar instance using cli-progress
        const progressBar = new cliProgress.SingleBar(
            {
                format: ' {bar} {percentage}% | ETA: {eta_formatted}',
            },
            cliProgress.Presets.shades_classic
        );

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

        // Check if build id is valid
        if (!buildId) {
            logger.error(
                `Invalid build id: "${buildId}" for browser "${options.browser}" version "${options.browserVersion}"`
            );

            throw new Error(
                `Invalid build id: "${buildId}" for browser "${options.browser}" version "${options.browserVersion}"`
            );
        }

        logger.info(
            `Resolved browser build id: "${buildId}" for browser "${options.browser}" version "${options.browserVersion}" on platform "${platform}"`
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

        // start the progress bar with a total value of 100 and start value of 0
        progressBar.start(100, 0);

        const browser = await install({
            browser: options.browser,
            buildId,
            cacheDir: browserPath,
            downloadProgressCallback: (downloadedBytes, totalBytes) => {
                // Update the progress bar.
                progressBar.update((downloadedBytes / totalBytes) * 100);
            },
            unpack: true,
        });

        // stop the progress bar
        progressBar.update(100);
        progressBar.stop();

        logger.info(`Browser "${browser.browser}" version "${browser.buildId}" installed`);

        return browser;
    } catch (err) {
        // Check if error is due to browser version missing
        if (err.message.includes('Download failed: server returned code 404.')) {
            logger.error(`Browser version "${options.browserVersion}" not found`);
        } else {
            logger.error(`Error installing browser: ${err.message}`);

            if (err.stack) {
                logger.error(err.stack);
            }
        }

        throw err;
    }
};

module.exports = { browserInstall };
