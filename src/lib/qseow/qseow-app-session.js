import { logger, sleep } from '../../globals.js';
import { launchBrowserForApp, closeBrowserQuietly } from '../browser/browser-launch.js';
import { QseowError } from '../util/errors.js';
import { formLogin, assertAuthenticated } from '../browser/form-login.js';
import { normalizeVirtualProxyPrefix } from './qseow-prefix.js';
import { qseowLogoutQuietly } from './qseow-logout.js';
import { removeStaleImage } from '../util/image-dir.js';
import { currentAccount } from '../util/os-account.js';
import { getQseowHubSelectors } from './qseow-selectors.js';

const selectorLoginPageUserName = '#username-input';
const selectorLoginPageUserPwd = '#password-input';
const selectorLoginPageLoginButton = '#loginbtn';

/** The login form, as one set, so the skip-login assertion and the form login cannot disagree. */
const loginSelectors = {
    username: selectorLoginPageUserName,
    password: selectorLoginPageUserPwd,
    submit: selectorLoginPageLoginButton,
};

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
 * @returns {{appUrl: string, hubUrl: string, qpsUserPath: string}} The app and hub URLs, and the
 *     path of the proxy's session-user endpoint on the same virtual proxy. A path, not a URL: it is
 *     fetched from inside the signed-in page, and has to resolve against wherever the browser
 *     actually ended up, which need not be the host `--host` names.
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

    const prefixPath = prefix.length > 0 ? `/${prefix}` : '';

    return {
        appUrl: `${origin}${prefixPath}/sense/app/${appId}`,
        hubUrl: `${origin}${prefixPath}/hub`,
        qpsUserPath: `${prefixPath}/qps/user`,
    };
};

/**
 * The one host the browser may offer the running account's Windows credentials to, if any.
 *
 * Decided here, by the QSEoW session code, and handed to the launcher explicitly: only a
 * `--skip-login` run relies on Windows authentication, and only QSEoW has one. Both QSEoW browser
 * sessions - the main one and the after-capture - launch through this.
 *
 * @param {object} options - Command options (`skipLogin`, `host`).
 *
 * @returns {string|undefined} `--host` with `--skip-login`, otherwise undefined.
 */
export const ambientAuthHostFor = (options) =>
    options.skipLogin === true ? options.host : undefined;

/**
 * How long the best-effort session-user lookup may take before it is given up on.
 *
 * Without a limit a proxy that holds the request open would stall every app until Puppeteer's
 * own protocol timeout - three minutes - for a fact the run does not need.
 */
export const QSEOW_SESSION_USER_TIMEOUT_MS = 5000;

/**
 * Turns Chromium's `net::ERR_INVALID_AUTH_CREDENTIALS` into what an operator can act on.
 *
 * Chromium raises it when the server asks for Windows authentication and the browser cannot
 * complete it. Which advice applies depends on whether BSI was expecting Windows authentication
 * at all: without `--skip-login` the proxy was expected to serve its login form, and the fix is
 * usually a different proxy; with it, the account running BSI was refused.
 *
 * @param {Error} err - The error from `page.goto`.
 * @param {string} appUrl - The URL that was being opened.
 * @param {boolean} skipLogin - Whether `--skip-login` is set.
 *
 * @returns {Error} A `QseowError` explaining it, or `err` itself for any other failure.
 */
const explainNavigationError = (err, appUrl, skipLogin) => {
    if (!String(err?.message).includes('ERR_INVALID_AUTH_CREDENTIALS')) {
        return err;
    }

    const prefix = `QSEOW APP: the browser could not sign in at ${appUrl} (ERR_INVALID_AUTH_CREDENTIALS).`;

    if (skipLogin) {
        return new QseowError(
            `${prefix} With --skip-login the virtual proxy signs the browser in with Windows ` +
                `authentication, as the Windows account running Butler Sheet Icons ` +
                `(${currentAccount({ withDomain: true })}), and it was refused. Check that this account can open the ` +
                'app in Qlik Sense, and that it is the account you expect.',
            { cause: err }
        );
    }

    return new QseowError(
        `${prefix} The virtual proxy asked for Windows authentication instead of serving its ` +
            "login form. Qlik Sense decides this from the browser's User-Agent, and a browser on " +
            'Windows matches the default pattern. Use --prefix with a virtual proxy whose Windows ' +
            "authentication pattern does not match (the convention is 'Form'), or, if the Windows " +
            'account running Butler Sheet Icons can open the app in Qlik Sense, use --skip-login.',
        { cause: err }
    );
};

/**
 * Says what the page a navigation ended on actually is, when it is an HTTP error.
 *
 * `page.goto` throws for network failures but resolves for HTTP errors, so a 401 from the Windows
 * authentication leg, a 400 from a proxy that does not recognise the host name, or a 500 all arrive
 * as an ordinary page. None of them has a login form, so without this the `--skip-login` check
 * would read "no login form" as "signed in", and the form path would read it as "already signed
 * in". Facts first - the status and where the browser ended up - and only then the causes known to
 * produce that status, worded as possibilities.
 *
 * @param {object|null} response - What `page.goto` resolved to. Null when Puppeteer had none.
 * @param {object} context - What was being opened.
 * @param {string} context.appUrl - The URL that was requested.
 * @param {string} context.host - `--host`, for the host-name cause of a 400.
 * @param {boolean} context.skipLogin - Whether `--skip-login` is set.
 *
 * @returns {string|null} A description of the failure, or null when the page is not an HTTP error.
 */
export const describeHttpFailure = (response, { appUrl, host, skipLogin }) => {
    if (!response || response.ok()) {
        return null;
    }

    const status = response.status();
    const statusText = response.statusText();
    const endedAt = response.url();

    const facts =
        `opening ${appUrl} ended on HTTP ${status}${statusText ? ` ${statusText}` : ''}` +
        `${endedAt && endedAt !== appUrl ? ` at ${endedAt}` : ''} - not the app, and not a login page.`;

    if (status === 401 || status === 403) {
        return skipLogin
            ? `${facts} With --skip-login the virtual proxy signs the browser in with Windows ` +
                  'authentication, as the Windows account running Butler Sheet Icons ' +
                  `(${currentAccount({ withDomain: true })}), and it was not accepted. Check that ` +
                  'this account can open the app in Qlik Sense, and that it is the account you expect.'
            : `${facts} The virtual proxy refused the browser before showing any login form. If it ` +
                  'uses Windows authentication, use --prefix with a virtual proxy that serves its ' +
                  'login form, or --skip-login if the Windows account running Butler Sheet Icons ' +
                  'can open the app in Qlik Sense.';
    }

    if (status === 400) {
        return (
            `${facts} One known cause: Qlik Sense answers 400 when the host name in the address ` +
            `("${host}", from --host) is not in the virtual proxy's host allow list. Compare --host ` +
            "with that list in the QMC, or with the name on the server's certificate."
        );
    }

    return `${facts} Check that the app opens in a browser on this machine, at the same address.`;
};

/**
 * Asks the proxy who the browser is signed in as.
 *
 * With `--skip-login` that identity is decided by Windows authentication, not by any option BSI
 * was given, and it decides what the thumbnails show: section access filters the data per user.
 * So it is worth stating, and the proxy session is the authority on it.
 *
 * Best effort: a proxy that does not answer, answers slowly, or answers in a shape not seen before
 * costs the run at most `timeoutMs` - the caller falls back to naming the mechanism instead of the
 * user. The body is not logged, because it carries the session id.
 *
 * The path is resolved by the page, against wherever the browser actually is, so the request is
 * same-origin and carries the session cookie even when the proxy moved the browser to a host name
 * other than the one `--host` gave.
 *
 * @param {object} page - Puppeteer page, signed in.
 * @param {string} qpsUserPath - Path of the proxy's `/qps/user` endpoint, from `buildQseowAppUrls`.
 * @param {number} [timeoutMs] - How long to wait for the answer.
 *
 * @returns {Promise<string|null>} `DIRECTORY\userid`, or null when it could not be read.
 */
export const readQseowSessionUser = async (
    page,
    qpsUserPath,
    timeoutMs = QSEOW_SESSION_USER_TIMEOUT_MS
) => {
    const user = await readQseowSessionUserParts(page, qpsUserPath, timeoutMs);

    return user ? `${user.userDirectory}\\${user.userId}` : null;
};

/**
 * The same question as {@link readQseowSessionUser}, answered as its two parts.
 *
 * The owner change needs the directory and the id separately, to find the user in QRS (issue
 * #1209); splitting the joined form back apart would only be guessing where one ends.
 *
 * @param {object} page - Puppeteer page, signed in.
 * @param {string} qpsUserPath - Path of the proxy's `/qps/user` endpoint, from `buildQseowAppUrls`.
 * @param {number} [timeoutMs] - How long to wait for the answer.
 *
 * @returns {Promise<{userDirectory: string, userId: string}|null>} The session user, or null when
 *     it could not be read.
 */
export const readQseowSessionUserParts = async (
    page,
    qpsUserPath,
    timeoutMs = QSEOW_SESSION_USER_TIMEOUT_MS
) => {
    try {
        const user = await page.evaluate(
            async (path, limit) => {
                const response = await fetch(path, {
                    credentials: 'same-origin',
                    signal: AbortSignal.timeout(limit),
                });

                return response.ok ? response.json() : null;
            },
            qpsUserPath,
            timeoutMs
        );

        if (user?.userDirectory && user?.userId) {
            return { userDirectory: user.userDirectory, userId: user.userId };
        }

        logger.debug(
            `QSEOW APP: ${qpsUserPath} did not name a session user (fields: ${Object.keys(user ?? {}).join(', ') || 'none'}).`
        );
    } catch (err) {
        logger.debug(
            `QSEOW APP: could not read the session user from ${qpsUserPath}: ${err.message}`
        );
    }

    return null;
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
 * With `--skip-login` nothing is typed: the virtual proxy is expected to sign the browser in by
 * itself - Windows authentication, as the account running BSI - and the page is asserted to be past
 * the login form instead.
 *
 * @returns {Promise<{page: object, appUrl: string, hubUrl: string, qpsUserPath: string, loginSkipped: boolean}>}
 *     The signed-in page, and whether login was skipped so the caller can report it.
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

    const { appUrl, hubUrl, qpsUserPath } = buildQseowAppUrls(options, appId);

    logger.debug(`App URL: ${appUrl}`);
    logger.debug(`Hub URL: ${hubUrl}`);

    // `skipLogin`, never `skiplogin` - see issue #890.
    const skipLogin = options.skipLogin === true;

    let response;
    try {
        response = await page.goto(appUrl, { waitUntil: 'networkidle2', timeout: pageTimeout });
    } catch (err) {
        throw explainNavigationError(err, appUrl, skipLogin);
    }

    await sleep(options.pagewait * 1000);
    await page.screenshot({ path: `${imgDir}/qseow/${appId}/${loginPagePrefix}-1.png` });

    const httpFailure = describeHttpFailure(response, {
        appUrl,
        host: options.host,
        skipLogin,
    });

    if (skipLogin) {
        // Skipped, not proven - the same reasoning as the Cloud twin. The virtual proxy was
        // expected to sign the browser in by itself. An HTTP error page has no login form either,
        // so the status is checked first: "no form" must not be read as "signed in" when the page
        // is a 401 from the Windows authentication leg.
        if (httpFailure) {
            throw new QseowError(`QSEOW APP: not signed in with --skip-login: ${httpFailure}`);
        }

        // If the proxy served its login form instead, BSI would otherwise photograph that form
        // once per sheet and report success.
        await assertAuthenticated(page, {
            selectors: loginSelectors,
            logPrefix: 'QSEOW APP',
            ErrorClass: QseowError,
            logger,
            situation: 'opening the app with --skip-login',
            remedy:
                'The virtual proxy served its login form instead of signing the browser in. Its ' +
                "Windows authentication pattern does not match this browser's User-Agent, or it " +
                'is not set up for Windows authentication. Use --prefix with a virtual proxy that ' +
                'signs Windows users in, or drop --skip-login and supply credentials.',
        });

        return { page, appUrl, hubUrl, qpsUserPath, loginSkipped: true };
    }

    // Not gated on the status on this path: the login form is what decides whether a form login
    // can proceed, and gating on the status as well would stake every working run on which status
    // a given Sense release gives its login page. The status only matters when the form is
    // missing, so it is handed over for that message.
    await formLogin(page, {
        selectors: loginSelectors,
        username: `${options.logonuserdir}\\${options.logonuserid}`,
        password: options.logonpwd,
        pagewait: options.pagewait,
        pageTimeout,
        screenshotPath: `${imgDir}/qseow/${appId}/${loginPagePrefix}-2.png`,
        logPrefix: 'QSEOW APP',
        ErrorClass: QseowError,
        logger,
        pageFailure: httpFailure,
        noFormRemedy:
            'If that page is the app itself, the browser is already signed in - a virtual proxy ' +
            'using Windows authentication does that - and --skip-login, without --logonuserdir, ' +
            '--logonuserid and --logonpwd, is how to run against it.',
    });

    return { page, appUrl, hubUrl, qpsUserPath, loginSkipped: false };
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
        ambientAuthHost: ambientAuthHostFor(options),
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

/**
 * Signs in once, before the first app, to learn which account the virtual proxy signs the
 * browser in as (issue #1209).
 *
 * `--change-app-owner` makes the browser login user each app's owner while the app is processed.
 * With `--skip-login` that account is chosen by Windows authentication, not by any option, and it
 * has to be known before anything is changed: by the time an app's own session has signed in, the
 * app is already open. So this spends one extra session up front, signed out and closed again
 * before any app is touched - and a browser that cannot sign in stops the run here, before any
 * owner has changed.
 *
 * Strict where {@link readQseowSessionUser} is lenient: there the answer only names the account in
 * the log, here it decides who the apps are handed to, so not knowing it is a failure.
 *
 * @param {object} options - Command options; `skipLogin` is expected to be set.
 *
 * @returns {Promise<{userDirectory: string, userId: string}>} The account the browser signs in as.
 *
 * @throws {QseowError} When the browser cannot sign in, or the proxy does not say who it signed in.
 */
export const readQseowBrowserUser = async (options) => {
    const pageTimeout =
        options.browserPageTimeout && options.browserPageTimeout > 0
            ? options.browserPageTimeout * 1000
            : 90000;
    const hubSelectors = getQseowHubSelectors(options.senseVersion) ?? {};
    const skipLogin = options.skipLogin === true;

    // An app URL is not wanted here - no app has been chosen to open - so the hub is where the
    // browser signs in; the proxy asks for credentials on the hub exactly as on an app.
    const { hubUrl, qpsUserPath } = buildQseowAppUrls(options, '');

    const browser = await launchBrowserForApp(options, {
        appId: 'to learn who the browser signs in as',
        logPrefix: 'QSEOW',
        appLabel: '--change-app-owner',
        ErrorClass: QseowError,
        ambientAuthHost: ambientAuthHostFor(options),
    });

    let page;
    try {
        page = await browser.newPage();
        await page.setDefaultTimeout(pageTimeout);

        let response;
        try {
            response = await page.goto(hubUrl, { waitUntil: 'networkidle2', timeout: pageTimeout });
        } catch (err) {
            throw explainNavigationError(err, hubUrl, skipLogin);
        }

        const httpFailure = describeHttpFailure(response, {
            appUrl: hubUrl,
            host: options.host,
            skipLogin,
        });
        if (httpFailure) {
            throw new QseowError(`QSEOW: could not sign in to find the app owner: ${httpFailure}`);
        }

        await assertAuthenticated(page, {
            selectors: loginSelectors,
            logPrefix: 'QSEOW',
            ErrorClass: QseowError,
            logger,
            situation: 'opening the hub with --skip-login, to find out who should own the apps',
            remedy:
                'The virtual proxy served its login form instead of signing the browser in, so ' +
                '--skip-login cannot work with it. Use --prefix with a virtual proxy that signs ' +
                'Windows users in, or drop --skip-login and supply credentials.',
        });

        const user = await readQseowSessionUserParts(page, qpsUserPath);
        if (!user) {
            throw new QseowError(
                `QSEOW: signed in, but ${qpsUserPath} did not say as whom, so --change-app-owner ` +
                    'cannot tell which account should own the apps.'
            );
        }

        return user;
    } finally {
        await qseowLogoutQuietly(
            page,
            {
                prefix: options.prefix,
                hubUrl,
                pageTimeout,
                pagewait: options.pagewait,
                senseVersion: options.senseVersion,
            },
            hubSelectors.userMenuButton,
            hubSelectors.legacyLogoutButton
        );

        await closeBrowserQuietly(browser, 'QSEOW');
    }
};
