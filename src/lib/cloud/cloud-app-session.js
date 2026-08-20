import { logger, sleep } from '../../globals.js';
import { launchBrowserForApp, closeBrowserQuietly } from '../browser/browser-launch.js';
import { CloudError } from '../util/errors.js';
import { formLogin, assertAuthenticated } from '../browser/form-login.js';
import { removeStaleImage } from '../util/image-dir.js';

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
