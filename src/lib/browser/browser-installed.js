import { logger, setLoggingLevel, bsiExecutablePath, isSea } from '../../globals.js';
import { redactOptions } from '../util/redact-secrets.js';
import { getBrowserCacheDir } from './browser-cache-dir.js';
import { getBrowserInventory } from './browser-inventory.js';

/**
 * List all installed browsers.
 *
 * A logging wrapper over {@link getBrowserInventory}. The printed output is
 * deliberately unchanged - `browser list-installed` is a documented command and
 * its format is what users grep.
 *
 * @param {object} options - An options object.
 * @param {string} [options.loglevel] - The log level. Can be one of "error", "warn", "info", "verbose", "debug", "silly". Default is "info".
 *
 * @returns {Promise<import('./browser-inventory.js').InstalledBrowserInfo[]>} A promise that resolves to the installed builds as plain objects.
 */
export async function browserInstalled(options) {
    try {
        setLoggingLevel(options.loglevel);

        logger.verbose('Starting check for installed browser');
        logger.verbose(`Running as standalone app: ${isSea}`);
        logger.debug(`BSI executable path: ${bsiExecutablePath}`);
        logger.debug(`Options: ${JSON.stringify(redactOptions(options), null, 2)}`);

        const browserPath = getBrowserCacheDir();
        logger.debug(`Browser cache path: ${browserPath}`);

        const browsersInstalled = await getBrowserInventory({ cacheDir: browserPath });

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
