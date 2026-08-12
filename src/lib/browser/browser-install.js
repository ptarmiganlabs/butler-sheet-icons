import { install, detectBrowserPlatform, canDownload, uninstall } from '@puppeteer/browsers';
import {
    assertCacheDirWritable,
    isPermissionDenied,
    resolveBrowserCacheDirForWriting,
    unwritableCacheDirMessage,
} from './browser-paths.js';
import cliProgress from 'cli-progress';

import { logger, setLoggingLevel, bsiExecutablePath, isSea, sleep } from '../../globals.js';
import { redactOptions } from '../util/redact-secrets.js';
import { resolveBrowserVersion } from './browser-version.js';
import { alreadyReported } from '../util/reported-error.js';

/**
 * Install a browser into the Puppeteer cache directory.
 *
 * Downloads and unpacks the browser while showing a progress bar, and returns the installed
 * browser metadata on success. The version is interpreted by `resolveBrowserVersion`, which is the
 * only place in Butler Sheet Icons that reads a `--browser-version` value.
 *
 * Failure is signalled by throwing, never by a falsy return value: the single `return` is
 * guarded by `if (!browser) throw lastError;`. Callers that need to add context to a failure
 * must therefore wrap the call in try/catch rather than test the result.
 *
 * @param {object} options - Options object.
 * @param {string} options.browser - Browser to install (`chrome` or `firefox`).
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
 * @returns {Promise<object>} Resolves with the installed browser metadata from `@puppeteer/browsers` (`browser`, `buildId`, `executablePath`, ...).
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

        // Create a new progress bar instance using cli-progress
        const progressBar = new cliProgress.SingleBar(
            {
                format: ' {bar} {percentage}% | ETA: {eta_formatted}',
            },
            cliProgress.Presets.shades_classic
        );

        // Install browser. The writing resolver, so a standalone build reading from the
        // previous default location still installs beside its own executable.
        const browserPath = resolveBrowserCacheDirForWriting(options);

        // Checked before the version lookup and the download, so a binary unzipped somewhere
        // unwritable fails in one second with an explanation rather than after 150 MB.
        assertCacheDirWritable(browserPath);

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
