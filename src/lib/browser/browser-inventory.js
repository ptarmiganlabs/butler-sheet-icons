import { getInstalledBrowsers, detectBrowserPlatform } from '@puppeteer/browsers';

import { logger } from '../../globals.js';
import { getBrowserCacheDir } from './browser-cache-dir.js';

/**
 * @typedef {object} InstalledBrowserInfo
 * @property {string} browser - Browser name, e.g. `chrome`.
 * @property {string} buildId - Exact build, e.g. `151.0.7922.77`.
 * @property {string} platform - Platform the build was downloaded for, e.g. `mac_arm`.
 * @property {string} path - Installation folder.
 * @property {string} executablePath - The browser binary itself.
 * @property {boolean} isCurrentPlatform - Whether this build can run on this machine.
 */

/**
 * List the browsers in the cache, as plain data.
 *
 * `getInstalledBrowsers()` hands back `InstalledBrowser` class instances, which
 * are awkward for everything except the one thing they were used for here
 * (logging a list). They cannot be spread or cloned - `path` is a getter over a
 * private cache reference, so a copy silently loses it - and `redactValue()`
 * collapses any object whose prototype is not `Object.prototype` to
 * `***redacted***`, which means passing the class instances through
 * `redactOptions()` turns real diagnostic data into redaction markers.
 *
 * Both `path` (the installation folder) and `executablePath` (the binary) are
 * carried through explicitly. The codebase has used one in one place and the
 * other in another, and the distinction is easy to get wrong when the names are
 * this close.
 *
 * `isCurrentPlatform` makes visible something the cache does not say on its own:
 * `getInstalledBrowsers()` does not filter by platform, so a cache directory
 * copied between machines - or mounted into a container - genuinely can contain
 * builds that cannot run here.
 *
 * @param {object} [options] - Options.
 * @param {string} [options.cacheDir] - Cache directory to read. Defaults to {@link getBrowserCacheDir}.
 *
 * @returns {Promise<InstalledBrowserInfo[]>} The installed builds, in the order the cache reports them.
 */
export const getBrowserInventory = async ({ cacheDir = getBrowserCacheDir() } = {}) => {
    const installed = await getInstalledBrowsers({ cacheDir });

    // Synchronous, despite three call sites in this codebase awaiting it.
    const hostPlatform = detectBrowserPlatform();

    if (!hostPlatform) {
        logger.debug(
            'Could not detect the host browser platform; every cached build will be reported as usable here.'
        );
    }

    return installed.map((browser) => ({
        browser: browser.browser,
        buildId: browser.buildId,
        platform: browser.platform,
        path: browser.path,
        executablePath: browser.executablePath,
        // With no host platform detected there is no evidence a build is
        // foreign, and claiming otherwise would label every entry "cannot run
        // here". Absence of evidence is reported as usable, not as unusable.
        isCurrentPlatform: hostPlatform ? browser.platform === hostPlatform : true,
    }));
};
