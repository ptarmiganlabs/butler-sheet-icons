import { getVersionComparator, detectBrowserPlatform } from '@puppeteer/browsers';
import { getBrowserInventory, hasUsableExecutable } from './browser-inventory.js';
import { resolveBrowserCacheDir } from './browser-paths.js';
import fs from 'fs';

import { logger } from '../../globals.js';
import { isVersionKeyword } from './browser-version.js';

/**
 * Orders cached builds newest first.
 *
 * Only used when no specific build was requested. `@puppeteer/browsers` provides a per-browser
 * comparator because build ids are not comparable as plain strings - `151.0.7922.109` sorts before
 * `151.0.7922.77` lexically, but is the newer build.
 *
 * The comparator throws on anything that is not a valid version for that browser, so a stray
 * directory in the cache must not be allowed to take down detection: on failure the list is
 * returned untouched.
 *
 * @param {Array<object>} browsers - Installed browser entries.
 * @param {string} browser - Browser type the entries belong to.
 *
 * @returns {Array<object>} The entries, newest first where that could be determined.
 */
const sortNewestFirst = (browsers, browser) => {
    const comparator = getVersionComparator(browser);

    if (!comparator) {
        return browsers;
    }

    try {
        return [...browsers].sort((a, b) => comparator(b.buildId, a.buildId));
    } catch (err) {
        logger.debug(`Could not order cached builds by version: ${err?.message ?? err}`);
        return browsers;
    }
};

/**
 * Lists the distinct platforms a set of cache entries was built for.
 *
 * @param {Array<object>} browsers - Installed browser entries.
 *
 * @returns {string} Comma-separated platform names.
 */
const platformsOf = (browsers) => [...new Set(browsers.map((b) => b.platform))].join(', ');

/**
 * Explains why the cache yielded nothing usable.
 *
 * Called only once the funnel has emptied, and reports on the last stage that still had
 * entries, so the message describes the real obstacle rather than the final emptiness.
 *
 * The exact wording matters more than usual: these strings are what an administrator pastes
 * into a search box, and the troubleshooting documentation quotes them verbatim.
 *
 * @param {object} args - Funnel state.
 * @param {string} args.browser - Requested browser type.
 * @param {string} [args.requestedVersion] - What the user actually asked for, which may be a
 * keyword such as `recommended`. Never the resolved build id: quoting a resolved id back as the
 * value of `--browser-version` sends the reader looking for a version they never set.
 * @param {string} [args.resolvedBuildId] - The concrete build that version resolved to.
 * @param {string} args.cacheDir - Directory that was searched.
 * @param {string} [args.hostPlatform] - Platform this machine runs, if recognised.
 * @param {Array<object>} args.ofType - Entries matching the requested browser type.
 * @param {Array<object>} args.ofPlatform - Of those, the ones built for this machine.
 * @param {Array<object>} args.usable - Of those, the ones whose executable exists.
 *
 * @returns {void}
 */
const reportEmptyFunnel = ({
    browser,
    requestedVersion,
    resolvedBuildId,
    cacheDir,
    hostPlatform,
    ofType,
    ofPlatform,
    usable,
}) => {
    if (ofType.length === 0) {
        logger.debug(`No cached browsers matching type "${browser}" found`);
        return;
    }

    if (ofPlatform.length === 0) {
        // The highest-value message here. The connected machine is usually the administrator's
        // Mac and the target a Windows server, so this is the most likely staging mistake -
        // and until now the only sign of it was an unrelated-looking failure at launch.
        logger.warn(
            `Found ${ofType.length} cached ${browser} build(s), but none built for this machine (platform "${hostPlatform}"). ` +
                `Cached ${browser} builds are for: ${platformsOf(ofType)}. A browser cache copied from a machine with a different operating system cannot be used. ` +
                `Browser cache directory: ${cacheDir}`
        );
        return;
    }

    if (usable.length === 0) {
        logger.warn(
            `Found ${ofPlatform.length} cached ${browser} build(s) for this machine, but none has a usable executable. ` +
                `The cache directory may be incomplete - for example copied without the browser binary, or left behind by a failed install. ` +
                `Browser cache directory: ${cacheDir}`
        );
        return;
    }

    // Only reachable with a pinned build: without one, every usable entry matches.
    //
    // The version is named as the user set it, with the build it resolved to in brackets. A
    // keyword is the normal case - `recommended` is the default - so quoting the resolved id as
    // though it were the flag's value would describe a command line nobody typed.
    const asked = requestedVersion
        ? `--browser-version "${requestedVersion}"${
              resolvedBuildId && resolvedBuildId !== requestedVersion
                  ? ` (build ${resolvedBuildId})`
                  : ''
          }`
        : `build ${resolvedBuildId}`;

    // No "use --browser-version latest to accept any of them" here: since issue #878 every
    // version, keyword included, resolves to exactly one build before the cache is searched, so
    // `latest` would miss in precisely the same way. Naming the build ids is the only advice
    // that actually works.
    //
    // `warn` rather than `error` because on a connected machine the run still succeeds by
    // downloading. The last sentence is what makes it actionable offline, where it will not.
    logger.warn(
        `No cached ${browser} build matches ${asked}. ` +
            `Cached ${browser} builds that this machine can run: ${usable.map((b) => b.buildId).join(', ')}. Set --browser-version to one of those build ids to use it instead. ` +
            `Butler Sheet Icons will now try to download ${browser} ${resolvedBuildId}, which needs internet access. On a machine without internet access this will fail.`
    );
};

/**
 * Detects available browsers in the following priority order:
 * 1. System browser (via PUPPETEER_EXECUTABLE_PATH environment variable)
 * 2. Cached browsers in the resolved browser cache directory
 * 3. Returns null if no browser found (caller should download)
 *
 * A cached browser has to survive four narrowing stages before it is offered: it must be the
 * requested type, built for this machine's platform, have an executable that actually exists,
 * and match the pinned build id when one was given. The first two of those were missing until
 * issue #943, where a cache staged on macOS and mounted into a Linux container was accepted and
 * then failed at launch with an error that named none of this.
 *
 * Version matching works on a build id that the caller has already resolved, never on the raw
 * `--browser-version` value. That is what makes a keyword mean exactly one build: before this,
 * `latest` accepted any cached build of the right type in filesystem order, so two machines on the
 * same Butler Sheet Icons version could silently run different Chrome builds - and did, which is
 * how a broken build survived unnoticed on one CI runner while another passed (issue #878).
 *
 * @param {object} options - Options object.
 * @param {string} options.browser - Browser type. `chrome` is the only supported value; a cache
 * entry of any other type is ignored.
 * @param {string} [options.browserCacheDir] - Cache directory to search. Resolved here rather
 * than by the caller, so a worker called directly with a bare options bag still works.
 * @param {string} [options.browserVersion] - The raw value the user asked for. Used only to decide
 * how loudly to report an override; matching uses `resolvedBuildId`.
 * @param {string} [resolvedBuildId] - Concrete build id from `resolveBrowserVersion`. When omitted,
 * any cached build of the requested type is acceptable and the newest is chosen - the fallback used
 * when a machine is offline and the requested keyword could not be resolved.
 *
 * @returns {Promise<object|null>} Browser info object, or `null` if no browser was found.
 * Returns an object with `executablePath`, `source` (`'system'` or `'cache'`), `browser`, and `buildId`.
 */
export const detectAvailableBrowser = async (options, resolvedBuildId) => {
    try {
        // Priority 1: Check for system browser via PUPPETEER_EXECUTABLE_PATH
        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            const systemBrowserPath = process.env.PUPPETEER_EXECUTABLE_PATH;

            // Verify the path exists
            if (fs.existsSync(systemBrowserPath)) {
                logger.info(`Found system browser at: ${systemBrowserPath}`);
                logger.info('Using system browser (PUPPETEER_EXECUTABLE_PATH is set)');

                // Asking for a specific build and silently getting a different one is worth a
                // warning: the version was requested deliberately, and this path ignores it.
                // A keyword is Butler Sheet Icons' own choice, so overriding it is unremarkable.
                if (options.browserVersion && !isVersionKeyword(options.browserVersion)) {
                    logger.warn(
                        `PUPPETEER_EXECUTABLE_PATH overrides --browser-version "${options.browserVersion}": the browser at ${systemBrowserPath} will be used instead. Unset PUPPETEER_EXECUTABLE_PATH to use the requested build.`
                    );
                }

                return {
                    executablePath: systemBrowserPath,
                    source: 'system',
                    browser: options.browser,
                    buildId: 'system-installed',
                };
            } else {
                logger.warn(
                    `PUPPETEER_EXECUTABLE_PATH is set to "${systemBrowserPath}" but file does not exist`
                );
            }
        }

        // Priority 2: Check for cached browsers in the browser cache directory
        const browserPath = resolveBrowserCacheDir(options);

        // The shared inventory rather than getInstalledBrowsers() directly: it already answers
        // "can this machine run that build" as `canRunHere`, and a second copy of that rule here
        // would drift from the one `browser list-installed` and `browser uninstall` report.
        const installedBrowsers = await getBrowserInventory({ cacheDir: browserPath });

        if (installedBrowsers && installedBrowsers.length > 0) {
            logger.info(`Found ${installedBrowsers.length} cached browser(s)`);

            // A funnel rather than a single filter, because the stage that empties *is* the
            // diagnosis. Reporting only "no usable browser found" throws away the one fact the
            // administrator needs: whether the cache is for the wrong machine, incomplete, or
            // simply missing the pinned build.
            const ofType = options.browser
                ? installedBrowsers.filter((b) => b.browser === options.browser)
                : installedBrowsers;

            // `canRunHere` is computed by the inventory, which owns the compatibility rule -
            // it is wider than equality, because 64-bit Windows runs 32-bit builds and Apple
            // Silicon runs Intel ones. An undetectable host platform leaves every build
            // runnable, so a machine Butler Sheet Icons does not recognise keeps working.
            //
            // Read here only to name the host in the diagnostic below; the decision itself is
            // not made from it. Synchronous, despite several call sites in this codebase
            // awaiting it.
            const hostPlatform = detectBrowserPlatform();
            const ofPlatform = ofType.filter((b) => {
                if (b.canRunHere) {
                    return true;
                }

                logger.verbose(
                    `Skipping cached ${b.browser} ${b.buildId}: built for ${b.platform}, which this machine (${hostPlatform}) cannot run`
                );
                return false;
            });

            // Shared with `browser install`, so the two cannot disagree about whether a cached
            // build is real - see hasUsableExecutable().
            const usable = ofPlatform.filter((b) => {
                if (hasUsableExecutable(b)) {
                    return true;
                }

                logger.verbose(
                    `Skipping cached ${b.browser} ${b.buildId}: executable not found at ${b.executablePath}`
                );
                return false;
            });

            const matching = resolvedBuildId
                ? usable.filter((b) => b.buildId === resolvedBuildId)
                : sortNewestFirst(usable, options.browser);

            if (matching.length > 0) {
                const browser = matching[0];
                logger.info(`Using cached browser: ${browser.browser} ${browser.buildId}`);

                return {
                    executablePath: browser.executablePath,
                    source: 'cache',
                    browser: browser.browser,
                    buildId: browser.buildId,
                };
            }

            // Report from the last stage that still had entries. The `warn` blocks fire only
            // when the funnel has emptied - a healthy run with one stale directory beside a
            // usable build stays quiet, because warnings that fire on success get ignored.
            reportEmptyFunnel({
                browser: options.browser,
                requestedVersion: options.browserVersion,
                resolvedBuildId,
                cacheDir: browserPath,
                hostPlatform,
                ofType,
                ofPlatform,
                usable,
            });
        } else {
            logger.debug('No cached browsers found');
        }

        // Priority 3: No browser found - caller should download
        logger.debug('No system or cached browser available - download will be required');
        return null;
    } catch (err) {
        logger.error(`Error detecting available browser: ${err.message}`);
        if (err.stack) {
            logger.debug(err.stack);
        }
        return null;
    }
};
