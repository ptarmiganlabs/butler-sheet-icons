import { install, resolveBuildId, detectBrowserPlatform, canDownload } from '@puppeteer/browsers';
import path from 'path';
import { homedir } from 'os';
import cliProgress from 'cli-progress';

import { logger, setLoggingLevel, bsiExecutablePath, isSea } from '../../globals.js';
import { getMostRecentUsableChromeBuildId } from './browser-list-available.js';

/**
 * Install a browser into the Puppeteer cache directory.
 *
 * Resolves a build ID (for `'latest'` Chrome this picks the most recent usable stable build),
 * downloads and unpacks the browser while showing a progress bar, and returns the installed
 * browser metadata on success.
 *
 * @param {object} options - Options object.
 * @param {string} options.browser - Browser to install (`chrome` or `firefox`).
 * @param {string} options.browserVersion - Browser version to install, or `latest` for Chrome to auto-pick the newest stable build.
 * @param {string} [options.loglevel] - Optional log level override (`error`, `warn`, `info`, `http`, `verbose`, `debug`, `silly`).
 * @param {object} [_command] - Commander command instance (unused, kept for symmetry with other command handlers).
 *
 * @returns {Promise<object>} Resolves with the installed browser metadata from `@puppeteer/browsers` (`browser`, `buildId`, `executablePath`, ...).
 *
 * @throws {Error} If required options are missing, the version cannot be resolved, the build is unavailable, or the install fails.
 */
export const browserInstall = async (options, _command) => {
    try {
        if (!options.browser || !options.browserVersion) {
            throw new Error('Missing required options: "browser" and "browserVersion"');
        }

        // Set log level
        if (options.loglevel === undefined || options.logLevel) {
            options.loglevel = options.logLevel;
        }
        setLoggingLevel(options.loglevel);

        logger.verbose('Starting browser install');
        logger.verbose(`Running as standalone app: ${isSea}`);
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
        logger.verbose(`Detected browser platform: ${platform}`);

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
            /**
             * Progress callback used by `@puppeteer/browsers` to report download progress.
             * Updates the CLI progress bar to reflect the current download percentage.
             *
             * @param {number} downloadedBytes - Bytes downloaded so far.
             * @param {number} totalBytes - Total bytes to download.
             *
             * @returns {void}
             */
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
