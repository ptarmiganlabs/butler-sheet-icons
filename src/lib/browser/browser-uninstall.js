import { uninstall } from '@puppeteer/browsers';
import { getBrowserCacheDir } from './browser-cache-dir.js';
import { getBrowserInventory } from './browser-inventory.js';
import fs from 'fs-extra';

import { logger, setLoggingLevel, bsiExecutablePath, isSea } from '../../globals.js';
import { redactOptions } from '../util/redact-secrets.js';
import { resolveLocalBrowserBuildId, VERSION_RECOMMENDED } from './browser-version.js';

/**
 * Uninstall a browser from the Butler Sheet Icons cache.
 *
 * @param {object} options - An options object.
 * @param {string} options.browser - The browser to uninstall.
 * @param {string} options.browserVersion - The build to uninstall: an exact build id, or
 * `recommended` for the build Butler Sheet Icons is tested with. Floating keywords such as
 * `stable` are refused - they name whatever the vendor currently publishes, not a build on this
 * machine.
 * @param {string} [options.loglevel] - The log level. Can be one of "error", "warn", "info", "verbose", "debug", "silly". Default is "info".
 *
 * @returns {Promise<boolean>} A promise that resolves to `true` if the browser was uninstalled successfully, `false` if it was not found in the cache or the version could not name a local build.
 *
 * @throws {Error} If there was an error uninstalling the browser.
 */
export const browserUninstall = async (options) => {
    try {
        setLoggingLevel(options.loglevel);

        logger.info('Starting browser uninstallation');
        logger.verbose(`Running as standalone app: ${isSea}`);
        logger.debug(`BSI executable path: ${bsiExecutablePath}`);
        logger.debug(`Options: ${JSON.stringify(redactOptions(options), null, 2)}`);

        // Resolved locally, never over the network: uninstall removes local files and has to
        // work on an offline machine. Cache entries are exact build ids, so the raw option only
        // ever matched when the user typed one; `recommended` resolves from a constant, and
        // floating keywords are refused with guidance because they cannot name a local build.
        const buildId = resolveLocalBrowserBuildId(options.browser, options.browserVersion);

        if (buildId === null) {
            return false;
        }

        if (options.browserVersion === VERSION_RECOMMENDED) {
            logger.info(
                `Uninstall target "${options.browserVersion}" resolves to build ${buildId}`
            );
        }

        const browserPath = getBrowserCacheDir();

        logger.debug(`Browser cache path: ${browserPath}`);

        const inventory = await getBrowserInventory({ cacheDir: browserPath });

        // The cache is keyed by platform as well as by build, so the same build
        // id can legitimately appear more than once - a cache directory copied
        // between machines, or mounted into a container, is enough.
        const matches = inventory.filter(
            (browser) => browser.browser === options.browser && browser.buildId === buildId
        );

        if (matches.length === 0) {
            logger.info(
                `Browser not found in cache: ${options.browser} build ${buildId}. Use "butler-sheet-icons browser list-installed" to see what is installed.`
            );
            return false;
        }

        // Prefer the build that can actually run here. Previously this was
        // whichever entry the filesystem happened to list first.
        const browserToUninstall =
            matches.find((browser) => browser.isCurrentPlatform) ?? matches[0];

        if (matches.length > 1) {
            logger.warn(
                `Build ${buildId} is cached for ${matches.length} platforms (${matches
                    .map((browser) => browser.platform)
                    .join(
                        ', '
                    )}). Removing the "${browserToUninstall.platform}" build; re-run to remove the next one.`
            );
        }

        logger.info(
            `Uninstalling browser: ${browserToUninstall.browser}, build id=${browserToUninstall.buildId}, platform=${browserToUninstall.platform}, path=${browserToUninstall.path}`
        );

        await uninstall({
            browser: browserToUninstall.browser,
            buildId: browserToUninstall.buildId,
            // Without this, `platform` is auto-detected as the *host* platform,
            // so removing a build downloaded for another platform targeted a
            // directory that does not exist. The call then succeeded silently
            // and the build stayed on disk (issue #892).
            platform: browserToUninstall.platform,
            cacheDir: browserPath,
        });

        // Report what happened, not what was attempted. `uninstall()` resolves
        // whether or not it removed anything, so the only honest way to claim
        // success is to look again.
        const remaining = await getBrowserInventory({ cacheDir: browserPath });
        const stillCached = remaining.some(
            (browser) =>
                browser.browser === browserToUninstall.browser &&
                browser.buildId === browserToUninstall.buildId &&
                browser.platform === browserToUninstall.platform
        );

        if (stillCached) {
            logger.error(
                `Browser "${browserToUninstall.browser}", version "${browserToUninstall.buildId}" (built for ${browserToUninstall.platform}) could not be removed. It is still in the cache at ${browserToUninstall.path}.`
            );
            return false;
        }

        logger.info(
            `Browser "${browserToUninstall.browser}", version "${browserToUninstall.buildId}" uninstalled.`
        );

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
 * @returns {Promise<boolean>} A promise that resolves to `true` when all browsers are uninstalled.
 *
 * @throws {Error} If there is an error during the uninstallation process.
 */
export const browserUninstallAll = async (options) => {
    try {
        setLoggingLevel(options.loglevel);

        logger.info('Starting uninstallation of all browsers');
        logger.verbose(`Running as standalone app: ${isSea}`);
        logger.debug(`BSI executable path: ${bsiExecutablePath}`);
        logger.debug(`Options: ${JSON.stringify(redactOptions(options), null, 2)}`);

        const browserPath = getBrowserCacheDir();
        logger.debug(`Browser cache path: ${browserPath}`);

        const browsersInstalled = await getBrowserInventory({ cacheDir: browserPath });

        // Check if any browsers are installed
        if (browsersInstalled.length > 0) {
            logger.info(`Uninstalling ${browsersInstalled.length} browsers:`);

            // Use a for-of loop so each uninstall is awaited before the next
            // starts. The previous `.forEach(async ...)` did not await inner
            // promises, so the subsequent `fs.emptyDir` raced with in-flight
            // uninstalls and could leave the cache in an inconsistent state
            // (which then caused the next install to fail with an extraction
            // error on `@puppeteer/browsers` v3+).
            for (const browser of browsersInstalled) {
                logger.info(
                    `    Starting uninstallation of "${browser.browser}", build id "${browser.buildId}", platform "${browser.platform}", path "${browser.path}"`
                );

                try {
                    await uninstall({
                        browser: browser.browser,
                        buildId: browser.buildId,
                        // Same fix as browserUninstall: without an explicit
                        // platform this targets the host's directory, so a
                        // foreign-platform build is skipped silently. Here the
                        // emptyDir below would eventually remove it anyway, but
                        // only after reporting a removal that did not happen.
                        platform: browser.platform,
                        cacheDir: browserPath,
                    });
                } catch (err) {
                    // Continue with the remaining browsers even if one fails.
                    logger.warn(
                        `Failed to uninstall browser "${browser.browser}" (${browser.buildId}): ${err.message}. Continuing with remaining browsers.`
                    );
                    continue;
                }

                logger.info(`Browser "${browser.browser}" (${browser.buildId}) uninstalled.`);
            }

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
