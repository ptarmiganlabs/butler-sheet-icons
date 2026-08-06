import puppeteer from 'puppeteer-core';
import path from 'path';
import { homedir } from 'os';
import { computeExecutablePath } from '@puppeteer/browsers';

import { logger } from '../../globals.js';
import { detectAvailableBrowser } from './browser-detect.js';
import { browserInstall } from './browser-install.js';
import { parseHeadlessOption } from '../util/headless-option.js';

/**
 * Chromium flags used for every Butler Sheet Icons browser launch.
 *
 * Copied verbatim from the two process-app modules this was extracted from; the list was
 * already identical in both.
 */
const BASE_BROWSER_ARGS = [
    '--proxy-bypass-list=*',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-setuid-sandbox',
    '--no-first-run',
    '--no-sandbox',
    '--no-zygote',
    '--ignore-certificate-errors',
    '--ignore-certificate-errors-spki-list',
    '--enable-features=NetworkService',
];

/**
 * Detects whether the process is running inside a container.
 *
 * `--single-process` helps on native Linux and macOS but crashes Chromium both in containers and
 * on Windows, so those two cases have to be told apart from a plain native run.
 *
 * The Windows half is not theoretical: it caused issue #742, "Updating thumbnails in QS Cloud
 * fails on Windows, works on macOS", and was fixed in 482559c by skipping the flag there. Do not
 * reintroduce it for Windows.
 *
 * @returns {Promise<boolean>} `true` when a container environment is detected.
 */
const detectDocker = async () => {
    try {
        const fs = await import('fs');
        // Check for .dockerenv file (common Docker indicator)
        if (fs.existsSync('/.dockerenv')) return true;
        // Check if running as PID 1 with tini/node (Docker entrypoint pattern)
        if (process.pid === 1) return true;
        // Check for Alpine Linux
        if (fs.existsSync('/etc/alpine-release')) return true;
        return false;
    } catch {
        return false;
    }
};

/**
 * Builds the Chromium argument list for the current platform.
 *
 * @returns {Promise<string[]>} Browser arguments, including `--single-process` where safe.
 */
export const buildBrowserArgs = async () => {
    const browserArgs = [...BASE_BROWSER_ARGS];

    const isDocker = await detectDocker();

    if (process.platform !== 'win32' && !isDocker) {
        browserArgs.push('--single-process');
        logger.debug('Added --single-process flag for non-Windows native environment');
    } else if (isDocker) {
        logger.debug('Skipping --single-process flag in Docker/containerized environment');
    } else {
        logger.debug('Skipping --single-process flag on Windows to keep Chromium stable');
    }

    return browserArgs;
};

/**
 * Resolves a usable browser executable, downloading one only if neither a system nor a cached
 * browser is available.
 *
 * @param {object} options - Options object, passed through to browser detection and install.
 *
 * @returns {Promise<string>} Path to the browser executable.
 *
 * @throws {Error} If no browser is available and the install fails. Callers are expected to wrap
 * this in a platform-specific typed error carrying the app id.
 */
export const resolveBrowserExecutablePath = async (options) => {
    const browserPath = path.join(homedir(), '.cache/puppeteer');
    logger.debug(`Browser cache path: ${browserPath}`);

    logger.info(`Checking for available browsers...`);
    const browserInfo = await detectAvailableBrowser(options);

    if (browserInfo) {
        // Found system or cached browser
        logger.info(
            `Browser ready from ${browserInfo.source}: ${browserInfo.browser} ${browserInfo.buildId}`
        );
        return browserInfo.executablePath;
    }

    // No browser found - download required
    logger.info(`No local browser found. Downloading and installing browser...`);

    // browserInstall() signals failure by throwing - see its JSDoc. The throw propagates to the
    // caller, which attaches the app context.
    const browserInstallResult = await browserInstall(options);

    const executablePath = computeExecutablePath({
        browser: browserInstallResult.browser,
        buildId: browserInstallResult.buildId,
        cacheDir: browserPath,
    });

    logger.info(`Browser downloaded successfully`);

    return executablePath;
};

/**
 * Resolves a browser and launches it, ready for page work.
 *
 * Extracted from `process-cloud-app.js` and `qseow-process-app.js`, which carried this sequence
 * as ~90 lines of duplicated code differing only in log prefix and error type (see issue #834).
 *
 * @param {object} options - Options object. `headless` is parsed here; the rest is passed through
 * to browser detection and install.
 * @param {object} context - Platform-specific labelling and error construction.
 * @param {string} context.appId - App being processed, used in error messages.
 * @param {string} context.logPrefix - Log line prefix, e.g. `QSEOW` or `CLOUD APP:`.
 * @param {string} context.appLabel - Human-readable app description, e.g. `QSEoW app`.
 * @param {Function} context.ErrorClass - Typed error to throw, e.g. `QseowError` or `CloudError`.
 *
 * @returns {Promise<object>} The launched Puppeteer browser instance.
 *
 * @throws {Error} An instance of `context.ErrorClass` if the browser cannot be installed or
 * launched, with the original error attached as `cause`.
 */
export const launchBrowserForApp = async (options, { appId, logPrefix, appLabel, ErrorClass }) => {
    let executablePath;
    try {
        executablePath = await resolveBrowserExecutablePath(options);
    } catch (err) {
        throw new ErrorClass(`Failed to install a browser for ${appLabel} ${appId}`, {
            cause: err,
        });
    }

    logger.info(`Browser setup complete. Launching browser...`);
    logger.verbose(`Using browser at ${executablePath}`);

    const headless = parseHeadlessOption(options.headless);
    const browserArgs = await buildBrowserArgs();

    try {
        return await puppeteer.launch({
            executablePath,
            headless,
            ignoreHTTPSErrors: true,
            args: browserArgs,
        });
    } catch (err) {
        // Falls back to the value itself so a non-Error throw still logs something useful
        // rather than "undefined".
        logger.error(
            `${logPrefix} Could not launch virtual browser: ${err.stack ?? err.message ?? err}`
        );

        throw new ErrorClass(`Failed to launch virtual browser for ${appLabel} ${appId}`, {
            cause: err,
        });
    }
};
