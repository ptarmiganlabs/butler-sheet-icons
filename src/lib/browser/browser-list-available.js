const { detectBrowserPlatform, canDownload } = require('@puppeteer/browsers');
const path = require('path');
const { homedir } = require('os');
const axios = require('axios');

const { logger, setLoggingLevel, bsiExecutablePath, isPkg } = require('../../globals');

// Function to list all available browser versions
// Returns an array of available browsers
async function browserListAvailable(options) {
    try {
        // Set log level
        setLoggingLevel(options.loglevel);

        logger.verbose('Starting check for available browser versions');
        logger.verbose(`Running as standalone app: ${isPkg}`);
        logger.debug(`BSI executable path: ${bsiExecutablePath}`);
        logger.debug(`Options: ${JSON.stringify(options, null, 2)}`);

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
                `Get Chrome versions from: https://versionhistory.googleapis.com/v1/chrome/platforms/${platform}/channels/${options.channel}/versions`
            );

            const axiosConfig = {
                method: 'get',
                responseType: 'json',
                url: `https://versionhistory.googleapis.com/v1/chrome/platforms/${platform}/channels/${options.channel}/versions`,
            };

            const response = await axios(axiosConfig);
            browsersAvailable = response.data.versions;
            logger.debug(`Chrome versions: ${JSON.stringify(browsersAvailable, null, 2)}`);

            // Output Chrome versions and names to info log
            if (browsersAvailable.length > 0) {
                logger.info(`Chrome versions from "${options.channel}" channel:`);
                logger.verbose(
                    'Note that not all versions may be available for use with Butler Sheet Icons.'
                );

                // eslint-disable-next-line no-restricted-syntax
                for (const version of browsersAvailable) {
                    // Can this version be downloaded?
                    // eslint-disable-next-line no-await-in-loop
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

            //     const axiosConfig = {
            //         method: 'get',
            //         responseType: 'json',
            //         url: 'https://product-details.mozilla.org/1.0/firefox.json',
            //     };

            //     const response = await axios(axiosConfig);
            //     const firefoxVersions = response.data.releases;

            //     // Only include versions from past 12 months
            //     const today = new Date();
            //     const oneYearAgo = new Date();
            //     oneYearAgo.setFullYear(today.getFullYear() - 1);
            //     logger.debug(`Today: ${today}`);
            //     logger.debug(`One year ago: ${oneYearAgo}`);

            //     browsersAvailable = Object.keys(firefoxVersions)
            //         .filter((version) => {
            //             const versionDate = new Date(firefoxVersions[version].date);
            //             return versionDate > oneYearAgo;
            //         })
            //         .map((version) => ({
            //             date: firefoxVersions[version].date,
            //             category: firefoxVersions[version].category,
            //             version: firefoxVersions[version].version,
            //         }))
            //         .sort((a, b) => new Date(b.date) - new Date(a.date));

            //     // Output Firefox versions and names to info log
            //     if (browsersAvailable.length > 0) {
            //         logger.info(`Firefox versions from past 12 months:`);
            //         browsersAvailable.forEach((version) => {
            //             logger.info(`    ${version.date}, "${version.category}", "${version.version}"`);
            //         });
            //     } else {
            //         logger.info('No Firefox versions available');
            //     }
        }
        return browsersAvailable;
    } catch (err) {
        logger.error(`Error checking for available browsers: ${err}`);
        throw err;
    }
}
// Function to find most recent version of Chrome that Puppeteer can download and use
// Returns the version number
async function getMostRecentUsableChromeBuildId(channel) {
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

        logger.debug(
            `Get Chrome versions from: https://versionhistory.googleapis.com/v1/chrome/platforms/${platform}/channels/${channel}/versions`
        );

        const axiosConfig = {
            method: 'get',
            responseType: 'json',
            url: `https://versionhistory.googleapis.com/v1/chrome/platforms/${platform}/channels/${channel}/versions`,
        };

        const response = await axios(axiosConfig);
        const browsersAvailable = response.data.versions;
        logger.debug(`Chrome versions: ${JSON.stringify(browsersAvailable, null, 2)}`);

        // Output Chrome versions and names to info log
        if (browsersAvailable.length > 0) {
            // eslint-disable-next-line no-restricted-syntax
            for (const version of browsersAvailable) {
                // Can this version be downloaded?
                // eslint-disable-next-line no-await-in-loop
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
        logger.error(`Error getting most recent usable Chrome build ID: ${err}`);
        throw err;
    }
}

module.exports = { browserListAvailable, getMostRecentUsableChromeBuildId };
