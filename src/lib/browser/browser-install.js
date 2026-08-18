import { install, detectBrowserPlatform, canDownload, uninstall } from '@puppeteer/browsers';
import {
    assertCacheDirWritable,
    isPermissionDenied,
    resolveBrowserCacheDir,
    resolveBrowserCacheDirForWriting,
    unwritableCacheDirMessage,
} from './browser-paths.js';
import { getBrowserInventory, hasUsableExecutable } from './browser-inventory.js';
import cliProgress from 'cli-progress';
import { activeLiveView, liveDownloadBar } from '../util/run-live.js';

import { logger, setLoggingLevel, bsiExecutablePath, isSea, sleep } from '../../globals.js';
import { redactOptions } from '../util/redact-secrets.js';
import { resolveBrowserVersion } from './browser-version.js';
import { alreadyReported } from '../util/reported-error.js';

/**
 * Finds a build already in the cache that makes downloading unnecessary.
 *
 * This is what lets an administrator confirm a staged browser *on the air-gapped machine itself*,
 * which is the first thing they will try. Without it `browser install` runs `canDownload()` first
 * and reports that a browser sitting right there on disk "cannot be downloaded".
 *
 * Three decisions worth stating, because each one is a way this could quietly be wrong:
 *
 * - **The reading resolver, not the writing one.** They differ for a standalone build whose
 *   primary cache is empty while the previous default location still holds browsers. Looking in
 *   the write target would miss a browser that detection is happily using, and re-download
 *   ~150 MB - the exact outcome the legacy fallback exists to prevent.
 * - **An exact platform match against the platform this install would download for**, rather
 *   than the inventory's `canRunHere`. Detection asks whether a build will start, so it accepts
 *   a 32-bit build on 64-bit Windows. Install asks whether the build it would otherwise fetch is
 *   already here, and that is a narrower question. It is also why `isCurrentPlatform` is not
 *   used: that field reports every build as current when the host platform cannot be detected,
 *   which is the right answer for "can I run this" and the wrong one here - `install()` would
 *   throw `Unable to detect browser platform` rather than accept a foreign build, so a
 *   `platform` of `undefined` must match nothing and fall through to that honest failure.
 * - **The executable has to exist.** Reporting "already installed" for a directory with no
 *   browser in it would reintroduce the false success that cached-browser detection stopped
 *   producing in issue #943.
 *
 * @param {object} options - Options object, carrying `browser` and any cache directory override.
 * @param {string} buildId - The exact build the caller is about to install.
 * @param {string} [platform] - Platform this install would download for. Passed in rather than
 * detected again here, so the platform named in the log and the one matched against are one value.
 *
 * @returns {Promise<object|null>} The staged build's inventory entry, or `null` to install.
 */
const findStagedBuild = async (options, buildId, platform) => {
    const cacheDir = resolveBrowserCacheDir(options);

    let inventory;
    try {
        inventory = await getBrowserInventory({ cacheDir });
    } catch (err) {
        // A short-circuit over the install path, not a precondition for it: an unreadable cache
        // must fall through to a normal install rather than abort one that would have worked.
        logger.debug(`Could not read the browser cache at ${cacheDir}: ${err?.message ?? err}`);
        return null;
    }

    const sameBuild = inventory.filter(
        (build) => build.browser === options.browser && build.buildId === buildId
    );

    // Every decline gets a line. Without them an administrator who staged a browser watches the
    // download start with nothing anywhere in the log saying why their copy was not accepted.
    if (sameBuild.length === 0) {
        logger.debug(
            `No cached ${options.browser} ${buildId} found in ${cacheDir}; it will be installed.`
        );
        return null;
    }

    const staged = sameBuild.find((build) => build.platform === platform);

    if (!staged) {
        logger.verbose(
            `Cached ${options.browser} ${buildId} is present in ${cacheDir} but built for ${sameBuild
                .map((build) => build.platform)
                .join(', ')}, not "${platform}". Installing the build for this machine instead.`
        );
        return null;
    }

    if (!hasUsableExecutable(staged)) {
        logger.warn(
            `A cached ${options.browser} ${buildId} directory exists at ${staged.path}, but the browser executable is missing from it. ` +
                `Butler Sheet Icons will remove that directory and install the build again, which needs internet access.`
        );

        // Removed here rather than left for install() to trip over. `install()` treats an
        // existing install directory as an already-installed browser, so it skips the download
        // and fails validation with "The browser folder exists but the executable is missing" -
        // the retry loop below recovers from that, but only after a failed attempt the operator
        // has to read past. Clearing it up front makes the warning above true, and loses
        // nothing: the directory has no browser in it.
        try {
            await uninstall({ browser: options.browser, buildId, cacheDir, platform });
        } catch (err) {
            // Never let cleanup mask the install that follows.
            logger.debug(
                `Could not clear the incomplete install directory: ${err?.message ?? err}`
            );
        }

        return null;
    }

    return staged;
};

/**
 * Install a browser into the Puppeteer cache directory.
 *
 * Downloads and unpacks the browser while showing a progress bar, and returns the installed
 * browser metadata on success. The version is interpreted by `resolveBrowserVersion`, which is the
 * only place in Butler Sheet Icons that reads a `--browser-version` value.
 *
 * **Installing is a no-op when the requested build is already staged in the cache.** That case
 * returns without touching the network, which is what lets an administrator confirm a staged
 * browser on an air-gapped machine - see `findStagedBuild`. It also means this function no longer
 * reinstalls over the top of an existing build; there is no `--force` yet, so removing the build
 * with `browser uninstall` is the way to replace one.
 *
 * The returned object therefore comes from one of two places, and callers must not depend on
 * which: an `InstalledBrowser` instance from `@puppeteer/browsers` after a real install, or a
 * plain inventory entry from {@link getBrowserInventory} for an already-staged build. Both carry
 * `browser`, `buildId`, `platform`, `path` and `executablePath`; only the latter carries the
 * inventory's own fields. Prefer the returned `executablePath` over recomputing one, because a
 * staged build may have been found in the previous default cache location rather than the
 * directory this function would have installed into.
 *
 * Failure is signalled by throwing, never by a falsy return value: the single `return` is
 * guarded by `if (!browser) throw lastError;`. Callers that need to add context to a failure
 * must therefore wrap the call in try/catch rather than test the result.
 *
 * @param {object} options - Options object.
 * @param {string} options.browser - Browser to install. `chrome` is the only supported value.
 * @param {string} options.browserVersion - Browser version to install: the keyword `recommended` or
 * `stable`, or an explicit build id.
 * @param {string} [options.browserCacheDir] - Directory to install into. Defaults to the resolver's
 * answer for this machine, which for a standalone build is a folder beside the executable.
 * @param {string} [options.loglevel] - Optional log level override (`error`, `warn`, `info`, `http`, `verbose`, `debug`, `silly`).
 * @param {object} [_command] - Commander command instance (unused, kept for symmetry with other command handlers).
 * @param {string} [resolvedBuildId] - Build id already resolved by the caller. Passing it keeps a
 * single run to one resolution, so the build that is installed is the same one the cache was
 * searched for.
 *
 * @returns {Promise<object>} Resolves with the installed browser metadata (`browser`, `buildId`, `executablePath`, ...), whether it was just installed or already staged.
 *
 * @throws {Error} If required options are missing, the version cannot be resolved, the build is unavailable, or the install fails.
 */
export const browserInstall = async (options, _command, resolvedBuildId) => {
    try {
        // Optional chaining because a nullish options object has to produce this message rather
        // than a TypeError about reading a property of null. Command handlers hand their options
        // straight through, so whatever Commander gives them arrives here unfiltered.
        if (!options?.browser || !options?.browserVersion) {
            throw new Error('Missing required options: "browser" and "browserVersion"');
        }

        setLoggingLevel(options.loglevel);

        logger.verbose('Starting browser install');
        logger.verbose(`Running as standalone app: ${isSea}`);
        logger.debug(`BSI executable path: ${bsiExecutablePath}`);
        logger.debug(`Options: ${JSON.stringify(redactOptions(options), null, 2)}`);

        // The download progress bar. Two writers repainting one cursor is
        // mojibake, so while the live run view (issue #1075) is active the
        // cli-progress bar is never constructed - the download reports into
        // the live view's phase label instead, and the two can never be
        // active at once. `activeLiveView()` is read once here: the view
        // starts before the app loop and stops after it, so it cannot appear
        // or vanish while this install runs.
        const live = activeLiveView();
        const progressBar = live
            ? liveDownloadBar(live)
            : new cliProgress.SingleBar(
                  {
                      format: ' {bar} {percentage}% | ETA: {eta_formatted}',
                  },
                  cliProgress.Presets.shades_classic
              );

        // Install browser. The writing resolver, so a standalone build reading from the
        // previous default location still installs beside its own executable.
        const browserPath = resolveBrowserCacheDirForWriting(options);

        const platform = await detectBrowserPlatform();
        logger.verbose(`Detected browser platform: ${platform}`);

        const buildId =
            resolvedBuildId ??
            (await resolveBrowserVersion(options.browser, options.browserVersion)).buildId;

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

        // Before anything that needs the network, and before the cache is required to be
        // writable: a build already staged here needs neither.
        //
        // Note this makes `browser install` a no-op when the build is present, where it used to
        // reinstall unconditionally. There is no --force yet; add one only if someone needs to
        // reinstall over the top.
        const staged = await findStagedBuild(options, buildId, platform);

        if (staged) {
            logger.info(
                `${options.browser} ${buildId} is already installed at ${staged.path}. Nothing to download. ` +
                    `To replace it, remove it first with "butler-sheet-icons browser uninstall --browser-version ${buildId}".`
            );
            return staged;
        }

        // Checked after the staged-build lookup but before the download, so a binary unzipped
        // somewhere unwritable fails with an explanation rather than after 150 MB, while a
        // browser already staged into a read-only cache still works.
        //
        // This used to run before the version lookup, which cost one round trip but did surface
        // an unwritable directory even when that lookup failed. It no longer does: offline, a
        // `--browser-version stable` run now reports only the version-service failure, and the
        // unwritable cache is found on the next attempt. The default `recommended` resolves from
        // a constant, so it reaches this line without a network call either way.
        assertCacheDirWritable(browserPath);

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

        const installOptions = {
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
        };

        // `@puppeteer/browsers` v3+ uses the OS `unzip` binary for extraction, which reports a
        // damaged archive as "End-of-central-directory signature not found". Retry to ride out
        // the transient failures that were not present with v2's JS-based `extract-zip`.
        //
        // Note the archive is usually damaged rather than mis-read: `downloadFile` streams
        // straight to a deterministic path under the cache dir with no temp file or atomic
        // rename, `install()` reuses any archive already sitting at that path, and its `finally`
        // unlinks it. Two Butler Sheet Icons processes sharing the cache therefore race on one
        // file - and `browserUninstallAll` removes each browser's whole folder, so it can delete
        // an archive another process is still downloading. Retrying does not make concurrent runs
        // safe; only giving them separate cache directories would - which `--browser-cache-dir`
        // now makes possible.
        const MAX_INSTALL_ATTEMPTS = 3;
        const RETRY_DELAY_MS = 2000;
        let browser;
        let lastError;
        for (let attempt = 1; attempt <= MAX_INSTALL_ATTEMPTS; attempt++) {
            try {
                browser = await install(installOptions);
                if (browser) {
                    break;
                }
                throw new Error('install returned no browser metadata');
            } catch (err) {
                lastError = err;
                if (attempt < MAX_INSTALL_ATTEMPTS) {
                    progressBar.stop();
                    logger.warn(
                        `Install attempt ${attempt}/${MAX_INSTALL_ATTEMPTS} failed: ${err.message}. Retrying in ${RETRY_DELAY_MS / 1000}s...`
                    );

                    // A failed extraction leaves a partially unpacked install directory behind, and
                    // `install()` treats an existing install directory as an already-installed
                    // browser: it skips the download entirely, then fails validation with "The
                    // browser folder exists but the executable is missing". Without this cleanup
                    // every retry hit that instead of retrying the download, so the loop could
                    // never recover - and the misleading validation error replaced the real
                    // extraction failure as the error the caller finally saw.
                    try {
                        await uninstall({
                            browser: options.browser,
                            buildId,
                            cacheDir: browserPath,
                        });
                    } catch (cleanupErr) {
                        // Nothing to clean up is the common case - the attempt may have failed
                        // before anything was written. Never let cleanup mask the install error.
                        logger.debug(
                            `Could not clear partial install directory: ${cleanupErr?.message ?? cleanupErr}`
                        );
                    }

                    // The shared helper rather than an inline setTimeout promise: it is the
                    // same implementation, and going through globals.js lets tests mock the
                    // delay instead of really waiting out every retry.
                    await sleep(RETRY_DELAY_MS);
                    progressBar.start(100, 0);
                }
            }
        }

        // stop the progress bar
        progressBar.update(100);
        progressBar.stop();

        if (!browser) {
            // All attempts failed. Throw the last error so the outer catch
            // block logs the diagnostic context and the error propagates to
            // the caller unchanged.
            throw lastError;
        }

        logger.info(`Browser "${browser.browser}" version "${browser.buildId}" installed`);

        return browser;
    } catch (err) {
        // Optional chaining because a catch cannot assume it was handed an Error. Reading
        // `.message` unguarded here previously turned a non-Error throw - such as the code-less
        // TypeError axios has been seen to produce offline - into a second, more confusing
        // TypeError raised from inside the error handler, losing the original cause (issue #785).
        if (err?.message?.includes('Download failed: server returned code 404.')) {
            logger.error(`Browser version "${options.browserVersion}" not found`);
        } else if (isPermissionDenied(err)) {
            // Not only the pre-flight check above: on Windows `fs.access(W_OK)` inspects the
            // read-only attribute and not the ACLs, so a binary unzipped under
            // `C:\Program Files\` passes that check and fails here instead. Both paths end at
            // the same sentence, which names the directory and the fix.
            logger.error(unwritableCacheDirMessage(resolveBrowserCacheDirForWriting(options)));
            logger.debug(err?.stack ?? String(err));
        } else if (!alreadyReported(err)) {
            // Only report what nothing else has explained. Version resolution already describes
            // connectivity failures in detail; repeating the raw message and a stack trace on top
            // is what made an offline run unreadable. The stack stays available at debug.
            logger.error(`Error installing browser: ${err?.message ?? err}`);
            logger.debug(err?.stack ?? String(err));
        }

        throw err;
    }
};
