import { getInstalledBrowsers } from '@puppeteer/browsers';
import path from 'path';
import { homedir } from 'os';

import { logger, setLoggingLevel, bsiExecutablePath, isSea } from '../../globals.js';
import { redactOptions } from '../util/redact-secrets.js';

/**
 * List all installed browsers.
 *
 * @param {object} options - An options object.
 * @param {string} [options.loglevel] - The log level. Can be one of "error", "warn", "info", "verbose", "debug", "silly". Default is "info".
 *
 * @returns {Promise<Array<object>>} A promise that resolves to an array of installed browsers.
 * Each browser is represented by an object with `browser` (name), `buildId`, `platform`, and `path` (executable path).
 */
export async function browserInstalled(options) {
    try {
        // Set log level
        if (options.loglevel === undefined || options.logLevel) {
            options.loglevel = options.logLevel;
        }
        setLoggingLevel(options.loglevel);

        logger.verbose('Starting check for installed browser');
        logger.verbose(`Running as standalone app: ${isSea}`);
        logger.debug(`BSI executable path: ${bsiExecutablePath}`);
        logger.debug(`Options: ${JSON.stringify(redactOptions(options), null, 2)}`);

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
