import { logger, sleep } from '../../globals.js';
import { launchBrowserForApp, closeBrowserQuietly } from '../browser/browser-launch.js';
import { CloudError } from '../util/errors.js';
import { formLogin, assertAuthenticated } from '../browser/form-login.js';
import { createAppImageDir, removeStaleImage } from '../util/image-dir.js';

// Selector paths to elements on login page
const selectorLoginPageUserName = '[id="\u0031-email"]';
const selectorLoginPageUserPwd = '[id="\u0031-password"]';
const selectorLoginPageLoginButton = '[id="\u0031-submit"]';

/** The login form, as one set, so the skip-login assertion and the form login cannot disagree. */
const loginSelectors = {
    username: selectorLoginPageUserName,
    password: selectorLoginPageUserPwd,
    submit: selectorLoginPageLoginButton,
};

/**
 * Builds the app URL for a Qlik Sense Cloud tenant.
 *
 * @param {object} options - Command options (`tenanturl`).
 * @param {string} appId - Qlik Sense app ID.
 *
 * @returns {string} The app URL.
 */
export const buildCloudAppUrl = (options, appId) =>
    `https://${options.tenanturl}/sense/app/${appId}`;

/**
 * Opens a page, signs in to the Qlik Sense Cloud web UI and leaves the browser
 * sitting on the app overview.
 *
 * Shared by the main thumbnail session and the after-capture session so the second
 * login cannot drift away from the first: a login sequence that exists twice is a
 * login sequence that gets fixed once.
 *
 * `loginPagePrefix` names the two login screenshots. The two sessions must use
 * different prefixes - reusing `loginpage` for both would have the after-capture
 * silently overwrite the main session's login evidence, which is exactly the
 * material an operator needs when diagnosing a failed run.
 *
 * @param {object} browser - Puppeteer browser instance.
 * @param {object} options - Command options.
 * @param {string} appId - Qlik Sense app ID.
 * @param {object} params - Capture parameters.
 * @param {string} params.imgDir - Root image directory.
 * @param {number} params.pageTimeout - Page operation timeout in milliseconds.
 * @param {string} params.loginPagePrefix - Basename stem for the login screenshots.
 *
 * @returns {Promise<{page: object, appUrl: string, loginSkipped: boolean}>} The page,
 *     and whether login was skipped so the caller can report it.
 */
export const openCloudAppOverviewPage = async (
    browser,
    options,
    appId,
    { imgDir, pageTimeout, loginPagePrefix }
) => {
    const page = await browser.newPage();

    // Thumbnails should be 410x270 pixels, so set the viewport to a multiple of this.
    await page.setViewport({
        width: 1230,
        height: 810,
        deviceScaleFactor: 1,
    });

    // Set default timeout for all page operations to 90 seconds
    await page.setDefaultTimeout(pageTimeout);

    const appUrl = buildCloudAppUrl(options, appId);
    logger.debug(`App URL: ${appUrl}`);

    await Promise.all([page.goto(appUrl, { waitUntil: 'networkidle2', timeout: pageTimeout })]);

    await sleep(options.pagewait * 1000);
    await page.screenshot({ path: `${imgDir}/cloud/${appId}/${loginPagePrefix}-1.png` });

    // Should login be skipped?
    //
    // `skipLogin`, not `skiplogin`: Commander camel-cases a hyphenated long
    // flag, so `--skip-login` lands on `options.skipLogin`. Reading the
    // run-together spelling gave `undefined`, so this branch was unreachable
    // and login was always attempted - see issue #890.
    // Reported by the caller, not here: this helper opens both the main session and the
    // after-capture session, so logging it here announced a skipped login twice per app.
    if (options.skipLogin === true) {
        // Skipped, not proven. If the session the caller was relying on has expired, the browser
        // is sitting on the login form right now - and without this check BSI would screenshot
        // that form once per sheet and report the run as successful. Nothing on this path typed a
        // credential, so a login form here can only mean there was no session to skip to.
        await assertAuthenticated(page, {
            selectors: loginSelectors,
            logPrefix: 'CLOUD APP',
            ErrorClass: CloudError,
            logger,
            situation: 'opening the app with --skip-login',
            remedy:
                'The session --skip-login relies on is not signed in. Sign in to Qlik Sense Cloud ' +
                'in the browser profile BSI uses, or drop --skip-login and supply credentials.',
        });

        return { page, appUrl, loginSkipped: true };
    }

    await formLogin(page, {
        selectors: loginSelectors,
        username: `${options.logonuserid}`,
        password: options.logonpwd,
        pagewait: options.pagewait,
        pageTimeout,
        screenshotPath: `${imgDir}/cloud/${appId}/${loginPagePrefix}-2.png`,
        logPrefix: 'CLOUD APP',
        ErrorClass: CloudError,
        logger,
        noFormRemedy:
            'If that page is the app itself, the browser profile is already signed in to Qlik ' +
            'Sense Cloud, and --skip-login is how to run against it.',
    });

    return { page, appUrl, loginSkipped: false };
};

/**
 * Captures the app overview once the run's thumbnails are already in place.
 *
 * This runs in its own browser session because the main session has closed by the
 * time the thumbnails exist: uploading to the app's media library and pointing the
 * sheets at those images both happen after the browser is gone. A second login is
 * therefore the cost of showing the result rather than the starting state.
 *
 * @param {object} options - Command options.
 * @param {string} appId - Qlik Sense app ID.
 * @param {object} params - Capture parameters.
 * @param {string} params.imgDir - Root image directory.
 * @param {number} params.pageTimeout - Page operation timeout in milliseconds.
 *
 * @returns {Promise<string>} Path of the written screenshot.
 */
export const captureCloudOverviewAfter = async (options, appId, { imgDir, pageTimeout }) => {
    const imagePath = `${imgDir}/cloud/${appId}/overview-after.png`;

    // Cleared before the attempt, not after a failure - see the QSEoW twin for why a
    // leftover after-image is worse than none.
    removeStaleImage(imagePath);

    const browser = await launchBrowserForApp(options, {
        appId,
        logPrefix: 'CLOUD APP',
        appLabel: 'Qlik Sense Cloud app',
        ErrorClass: CloudError,
    });

    try {
        const { page } = await openCloudAppOverviewPage(browser, options, appId, {
            imgDir,
            pageTimeout,
            loginPagePrefix: 'loginpage-after',
        });

        await page.screenshot({ path: imagePath });
    } finally {
        await closeBrowserQuietly(browser, 'CLOUD APP');
    }

    return imagePath;
};

/**
 * How long reading the signed-in user from the browser session may take.
 *
 * The same bound, for the same reason, as the QSEoW twin's `QSEOW_SESSION_USER_TIMEOUT_MS`: a
 * request held open would otherwise stall until Puppeteer's own protocol timeout.
 */
export const CLOUD_SESSION_USER_TIMEOUT_MS = 5000;

/**
 * Signs in once, before the first app, to learn which Qlik Cloud user the browser signs in as
 * (issue #1209).
 *
 * `--change-app-owner` makes that user each app's owner while the app is processed. Neither login
 * mode says who it is in a form the owner change can use: `--logonuserid` is an email address,
 * not a user id, and with `--skip-login` there is nothing to go on at all. So the browser signs in
 * exactly as a capture would and asks the tenant, from inside the signed-in page, who it is. That
 * costs one extra sign-in per run, before any app is touched - and a browser that cannot sign in
 * stops the run here, before any owner has changed.
 *
 * @param {object} options - Command options.
 *
 * @returns {Promise<{id: string, name: string, email: string}>} The signed-in user.
 *
 * @throws {CloudError} When the browser cannot sign in, or the tenant does not say who it is.
 */
export const readCloudBrowserUser = async (options) => {
    const pageTimeout =
        options.browserPageTimeout && options.browserPageTimeout > 0
            ? options.browserPageTimeout * 1000
            : 90000;

    // Login evidence goes where each app's goes, in a folder of its own.
    const imgDir = createAppImageDir({
        imagedir: options.imagedir,
        platform: 'cloud',
        appId: 'change-app-owner',
        logPrefix: 'CLOUD',
        ErrorClass: CloudError,
    });

    const browser = await launchBrowserForApp(options, {
        appId: 'to learn who the browser signs in as',
        logPrefix: 'CLOUD',
        appLabel: '--change-app-owner',
        ErrorClass: CloudError,
    });

    try {
        const page = await browser.newPage();
        await page.setDefaultTimeout(pageTimeout);

        // The tenant's front page, not an app: no app has been chosen to open yet, and the
        // tenant asks for credentials there exactly as it does on an app.
        await page.goto(`https://${options.tenanturl}/`, {
            waitUntil: 'networkidle2',
            timeout: pageTimeout,
        });
        await sleep(options.pagewait * 1000);
        await page.screenshot({ path: `${imgDir}/loginpage-1.png` });

        if (options.skipLogin === true) {
            await assertAuthenticated(page, {
                selectors: loginSelectors,
                logPrefix: 'CLOUD',
                ErrorClass: CloudError,
                logger,
                situation:
                    'opening the tenant with --skip-login, to find out who should own the apps',
                remedy:
                    'The session --skip-login relies on is not signed in. Sign in to Qlik Sense Cloud ' +
                    'in the browser profile BSI uses, or drop --skip-login and supply credentials.',
            });
        } else {
            await formLogin(page, {
                selectors: loginSelectors,
                username: `${options.logonuserid}`,
                password: options.logonpwd,
                pagewait: options.pagewait,
                pageTimeout,
                screenshotPath: `${imgDir}/loginpage-2.png`,
                logPrefix: 'CLOUD',
                ErrorClass: CloudError,
                logger,
                noFormRemedy:
                    'If that page is the hub, the browser profile is already signed in to Qlik ' +
                    'Sense Cloud, and --skip-login is how to run against it.',
            });
        }

        // Asked from inside the page, so it is the browser's own session answering - not the API
        // key, which may belong to someone else.
        const user = await page.evaluate(async (limit) => {
            const response = await fetch('/api/v1/users/me', {
                credentials: 'same-origin',
                signal: AbortSignal.timeout(limit),
            });

            return response.ok ? response.json() : null;
        }, CLOUD_SESSION_USER_TIMEOUT_MS);

        if (!user?.id) {
            throw new CloudError(
                'CLOUD: signed in, but the tenant did not say as whom, so --change-app-owner ' +
                    'cannot tell which user should own the apps.'
            );
        }

        return { id: user.id, name: user.name, email: user.email };
    } finally {
        await closeBrowserQuietly(browser, 'CLOUD');
    }
};
