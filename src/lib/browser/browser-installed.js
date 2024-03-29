const { getInstalledBrowsers } = require('@puppeteer/browsers');
const path = require('path');
const { homedir } = require('os');

const { logger, setLoggingLevel, bsiExecutablePath, isPkg } = require('../../globals');

// Function to list all installed browsers
// Returns an array of installed browsers
async function browserInstalled(options) {
    try {
        // Set log level
        if (options.loglevel === undefined || options.logLevel) {
            // eslint-disable-next-line no-param-reassign
            options.loglevel = options.logLevel;
        }
        setLoggingLevel(options.loglevel);

        logger.verbose('Starting check for installed browser');
        logger.verbose(`Running as standalone app: ${isPkg}`);
        logger.debug(`BSI executable path: ${bsiExecutablePath}`);
        logger.debug(`Options: ${JSON.stringify(options, null, 2)}`);

        const browserPath = path.join(homedir(), '.cache/puppeteer');
        logger.debug(`Browser cache path: ${browserPath}`);

        const browsersInstalled = await getInstalledBrowsers({
            cacheDir: browserPath,
        });

        // Output installed browsers to info log
        if (browsersInstalled.length > 0) {
            logger.info(`Installed browsers:`);
            browsersInstalled.forEach((browser) => {
                logger.info(
                    `    ${browser.browser}, build id=${browser.buildId}, platform=${browser.platform}, path=${browser.path} `
                );
            });
        } else {
            logger.info('No browsers installed');
        }

        return browsersInstalled;
    } catch (err) {
        logger.error(`Error checking for installed browsers: ${err}`);
        throw err;
    }
}

module.exports = { browserInstalled };
