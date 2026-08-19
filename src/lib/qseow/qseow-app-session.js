import { logger, sleep } from '../../globals.js';
import { launchBrowserForApp, closeBrowserQuietly } from '../browser/browser-launch.js';
import { QseowError } from '../util/errors.js';
import { normalizeVirtualProxyPrefix } from './qseow-prefix.js';
import { qseowLogoutQuietly } from './qseow-logout.js';
import { removeStaleImage } from '../util/image-dir.js';

const selectorLoginPageUserName = '#username-input';
const selectorLoginPageUserPwd = '#password-input';
const selectorLoginPageLoginButton = '#loginbtn';

/**
 * Builds the app and hub URLs for a QSEoW server.
 *
 * Both are derived from the same origin so they cannot disagree about which host,
 * scheme or port is being addressed - a class of bug that is invisible until a run
 * authenticates against one host and then navigates to another.
 *
 * @param {object} options - Command options (`host`, `port`, `secure`, `prefix`).
 * @param {string} appId - Qlik Sense app ID.
 *
 * @returns {{appUrl: string, hubUrl: string}} The two URLs.
 */
export const buildQseowAppUrls = (options, appId) => {
    const scheme = options.secure === 'true' || options.secure === true ? 'https://' : 'http://';

    // --port is the web port, distinct from --engineport (4747) and --qrsport
    // (4242). It was declared and parsed but never reached the URL, so a
    // server on a non-standard web port could not be reached at all.
    const origin = options.port
        ? `${scheme}${options.host}:${options.port}`
        : `${scheme}${options.host}`;

    // Normalised, not used raw: a prefix written as it appears in the browser
    // address bar ("/form") produced "https://host//form/sense/app/<id>", which
    // authenticates fine and then never renders, failing 90 seconds later on a
    // selector that says nothing about the prefix.
    const prefix = normalizeVirtualProxyPrefix(options.prefix);

    if (prefix.length > 0) {
        return {
            appUrl: `${origin}/${prefix}/sense/app/${appId}`,
            hubUrl: `${origin}/${prefix}/hub`,
        };
    }

    return { appUrl: `${origin}/sense/app/${appId}`, hubUrl: `${origin}/hub` };
};

/**
 * Opens a page, signs in to the QSEoW web UI and leaves the browser sitting on the
 * app overview.
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
 * @returns {Promise<{page: object, appUrl: string, hubUrl: string}>} The signed-in page.
 */
export const openQseowAppOverviewPage = async (
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
    // https://stackoverflow.com/questions/52163547/node-js-puppeteer-how-to-set-navigation-timeout
    await page.setDefaultTimeout(pageTimeout);

    const { appUrl, hubUrl } = buildQseowAppUrls(options, appId);

    logger.debug(`App URL: ${appUrl}`);
    logger.debug(`Hub URL: ${hubUrl}`);

    await Promise.all([page.goto(appUrl, { waitUntil: 'networkidle2', timeout: pageTimeout })]);

    await sleep(options.pagewait * 1000);
    await page.screenshot({ path: `${imgDir}/qseow/${appId}/${loginPagePrefix}-1.png` });

    // Enter credentials
    // User
    await page.click(selectorLoginPageUserName, {
        button: 'left',
        delay: 10,
    });

    const user = `${options.logonuserdir}\\${options.logonuserid}`;
    await page.keyboard.type(user);

    // Pwd
    await page.click(selectorLoginPageUserPwd, {
        button: 'left',
        delay: 10,
    });
    await page.keyboard.type(options.logonpwd);

    await page.screenshot({ path: `${imgDir}/qseow/${appId}/${loginPagePrefix}-2.png` });

    // Click login button and wait for page to load
    await Promise.all([
        page.click(selectorLoginPageLoginButton, {
            button: 'left',
            delay: 10,
        }),
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
    ]);

    await sleep(options.pagewait * 1000);

    return { page, appUrl, hubUrl };
};

/**
 * Captures the app overview once the run's thumbnails are already in place.
 *
 * This runs in its own browser session because the main session has logged out and
 * closed by the time the thumbnails exist: uploading to the content library and
 * pointing the sheets at those images both happen after the browser is gone. A
 * second login is therefore the cost of showing the result rather than the
 * starting state.
 *
 * @param {object} options - Command options.
 * @param {string} appId - Qlik Sense app ID.
 * @param {object} params - Capture parameters.
 * @param {string} params.imgDir - Root image directory.
 * @param {number} params.pageTimeout - Page operation timeout in milliseconds.
 * @param {string} params.userMenuButton - Hub user-menu selector, for the logout fallback.
 * @param {string} params.legacyLogoutButton - Legacy logout selector, for the logout fallback.
 *
 * @returns {Promise<string>} Path of the written screenshot.
 */
export const captureQseowOverviewAfter = async (
    options,
    appId,
    { imgDir, pageTimeout, userMenuButton, legacyLogoutButton }
) => {
    const imagePath = `${imgDir}/qseow/${appId}/overview-after.png`;

    // Cleared before the attempt, not after a failure: this capture is allowed to fail
    // without failing the run, and the run has already overwritten overview-before.png.
    // A leftover after-image from a previous run would pair a fresh before with a stale
    // after, which reads as one run's evidence and is not.
    removeStaleImage(imagePath);

    const browser = await launchBrowserForApp(options, {
        appId,
        logPrefix: 'QSEOW',
        appLabel: 'QSEoW app',
        ErrorClass: QseowError,
    });

    let signedInPage;
    let signedInHubUrl;

    try {
        const { page, hubUrl } = await openQseowAppOverviewPage(browser, options, appId, {
            imgDir,
            pageTimeout,
            loginPagePrefix: 'loginpage-after',
        });

        signedInPage = page;
        signedInHubUrl = hubUrl;

        await page.screenshot({ path: imagePath });
    } finally {
        // Same reasoning as the main session: this session has to be released however the
        // block ends, and a logout failure must not surface as "could not capture the app
        // overview" when the screenshot is already on disk.
        await qseowLogoutQuietly(
            signedInPage,
            {
                prefix: options.prefix,
                hubUrl: signedInHubUrl,
                pageTimeout,
                pagewait: options.pagewait,
                senseVersion: options.senseVersion,
            },
            userMenuButton,
            legacyLogoutButton
        );

        await closeBrowserQuietly(browser, 'QSEOW');
    }

    return imagePath;
};
