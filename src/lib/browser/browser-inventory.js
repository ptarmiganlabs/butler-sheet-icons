import { getInstalledBrowsers, detectBrowserPlatform } from '@puppeteer/browsers';

import { logger } from '../../globals.js';
import { resolveBrowserCacheDir } from './browser-paths.js';

/**
 * @typedef {object} InstalledBrowserInfo
 * @property {string} browser - Browser name, e.g. `chrome`.
 * @property {string} buildId - Exact build, e.g. `151.0.7922.77`.
 * @property {string} platform - Platform the build was downloaded for, e.g. `mac_arm`.
 * @property {string} path - Installation folder.
 * @property {string} executablePath - The browser binary itself.
 * @property {boolean} isCurrentPlatform - Whether this build was made for exactly this platform.
 * @property {boolean} canRunHere - Whether this machine can execute the build, which is a wider
 * question than `isCurrentPlatform` - see {@link RUNNABLE_PLATFORMS}.
 */

/**
 * Build platforms each host platform can execute, beyond its own.
 *
 * Equality is the wrong test for "can this machine run that build", and getting it wrong is
 * expensive in exactly the environment this matters most: rejecting a build that would have run
 * sends an air-gapped machine to a download it cannot make.
 *
 * - **64-bit Windows runs 32-bit Chrome.** WOW64 has been standard for two decades. Note that
 *   `detectBrowserPlatform()` also reports `win64` for Windows 11 on ARM, because that emulates
 *   x64 - so this entry covers that case too.
 * - **Apple Silicon runs Intel builds** through Rosetta 2. Rosetta is not guaranteed to be
 *   installed, so this is optimistic; it is the same optimism that shipped before cached builds
 *   were filtered at all, and a build that cannot start still fails at launch as it did then.
 *
 * Everything else is exact: a Linux host cannot run a Windows build, and an ARM Linux host
 * cannot run an x64 one.
 */
const RUNNABLE_PLATFORMS = Object.freeze({
    win64: ['win32'],
    mac_arm: ['mac'],
});

/**
 * Whether a cached build can be executed on the host.
 *
 * With no host platform detected there is no evidence a build is foreign, and claiming otherwise
 * would label every entry unusable. Absence of evidence is reported as runnable, not as broken.
 *
 * @param {string} [hostPlatform] - Platform this machine runs, if it could be detected.
 * @param {string} buildPlatform - Platform the cached build was made for.
 *
 * @returns {boolean} `true` when the build can run here.
 */
export const canRunOnHost = (hostPlatform, buildPlatform) => {
    if (!hostPlatform) {
        return true;
    }

    return (
        buildPlatform === hostPlatform ||
        (RUNNABLE_PLATFORMS[hostPlatform]?.includes(buildPlatform) ?? false)
    );
};

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
 * @param {string} [options.cacheDir] - Cache directory to read. Defaults to the location
 * {@link resolveBrowserCacheDir} resolves with no command options, which is the right answer only
 * for callers that have none - every worker passes the directory it resolved itself.
 *
 * @returns {Promise<InstalledBrowserInfo[]>} The installed builds, in the order the cache reports them.
 */
export const getBrowserInventory = async ({ cacheDir = resolveBrowserCacheDir() } = {}) => {
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
        // Deliberately a second field rather than a widening of the one above. They answer
        // different questions and have different callers: `browser uninstall` picks between
        // several builds of the same id and wants the exact host build, while detection asks
        // only whether a build will start.
        canRunHere: canRunOnHost(hostPlatform, browser.platform),
    }));
};
