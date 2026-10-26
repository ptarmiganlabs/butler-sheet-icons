import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { httpResponse, withLoginForm } from '../../browser/test-helpers/login-page.js';

const logger = {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    verbose: jest.fn(),
    warn: jest.fn(),
};
const sleep = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../../../globals.js', () => ({ logger, sleep }));

// The session helper only needs these for the after-capture, which is not under test here, and
// the real ones would pull in puppeteer.
jest.unstable_mockModule('../../browser/browser-launch.js', () => ({
    launchBrowserForApp: jest.fn(),
    closeBrowserQuietly: jest.fn(),
}));
jest.unstable_mockModule('../qseow-logout.js', () => ({ qseowLogoutQuietly: jest.fn() }));
jest.unstable_mockModule('../../util/image-dir.js', () => ({ removeStaleImage: jest.fn() }));

// The account is the machine's; a fixed one keeps the messages assertable on any host. The helper
// itself is covered in util/__tests__/os_account.test.js.
const currentAccount = jest.fn(() => 'ACME\\svc-bsi');
jest.unstable_mockModule('../../util/os-account.js', () => ({ currentAccount }));

const {
    ambientAuthHostFor,
    buildQseowAppUrls,
    describeHttpFailure,
    openQseowAppOverviewPage,
    readQseowSessionUser,
    readQseowSessionUserParts,
    readQseowBrowserUser,
    QSEOW_SESSION_USER_TIMEOUT_MS,
} = await import('../qseow-app-session.js');
const { QseowError } = await import('../../util/errors.js');
const { launchBrowserForApp, closeBrowserQuietly } =
    await import('../../browser/browser-launch.js');
const { qseowLogoutQuietly } = await import('../qseow-logout.js');

const USERNAME_SELECTOR = '#username-input';
const APP_URL = 'https://sense.example.com/sense/app/app-1';

const OPTIONS = {
    host: 'sense.example.com',
    secure: 'true',
    prefix: '',
    pagewait: 0,
    logonuserdir: 'ACME',
    logonuserid: 'goran',
    logonpwd: 'secret',
};

const PARAMS = { imgDir: './img', pageTimeout: 90000, loginPagePrefix: 'loginpage' };

/**
 * A page that is past the login form - signed in by the virtual proxy, or after a form login.
 *
 * @param {object} [response] - What `goto` resolves to. Defaults to a 200 for the app URL.
 *
 * @returns {object} Puppeteer-shaped page mock.
 */
const buildPage = (response = httpResponse(200, APP_URL)) => ({
    setViewport: jest.fn().mockResolvedValue(undefined),
    setDefaultTimeout: jest.fn().mockResolvedValue(undefined),
    goto: jest.fn().mockResolvedValue(response),
    waitForNavigation: jest.fn().mockResolvedValue(undefined),
    screenshot: jest.fn().mockResolvedValue(undefined),
    click: jest.fn().mockResolvedValue(undefined),
    keyboard: { type: jest.fn().mockResolvedValue(undefined) },
    $: jest.fn().mockResolvedValue(null),
    evaluate: jest.fn(),
    url: jest.fn(() => APP_URL),
    title: jest.fn().mockResolvedValue('Sales dashboard'),
});

/**
 * A browser whose one page is `page`.
 *
 * @param {object} page - The page `newPage()` resolves to.
 *
 * @returns {object} Puppeteer-shaped browser mock.
 */
const browserFor = (page) => ({ newPage: jest.fn().mockResolvedValue(page) });

/**
 * Opens the app overview the way qseow-process-app.js does.
 *
 * @param {object} page - The page to use.
 * @param {object} [options] - Fields to merge over {@link OPTIONS}.
 *
 * @returns {Promise<object>} What `openQseowAppOverviewPage` resolves to.
 */
const open = (page, options = {}) =>
    openQseowAppOverviewPage(browserFor(page), { ...OPTIONS, ...options }, 'app-1', PARAMS);

/**
 * The error `open` rejects with.
 *
 * @param {object} page - The page to use.
 * @param {object} [options] - Fields to merge over {@link OPTIONS}.
 *
 * @returns {Promise<Error>} The rejection.
 */
const failureOf = async (page, options) => {
    try {
        await open(page, options);
    } catch (err) {
        return err;
    }

    throw new Error('expected openQseowAppOverviewPage to reject');
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('buildQseowAppUrls', () => {
    test('puts the session-user endpoint on the same virtual proxy as the app', () => {
        const urls = buildQseowAppUrls(
            { host: 'sense.example.com', secure: 'true', prefix: 'win', port: 8443 },
            'app-1'
        );

        expect(urls).toEqual({
            appUrl: 'https://sense.example.com:8443/win/sense/app/app-1',
            hubUrl: 'https://sense.example.com:8443/win/hub',
            qpsUserPath: '/win/qps/user',
        });
    });

    test('gives the session-user endpoint as a path, so the page resolves it against its own origin', () => {
        // The browser can end up on a host name other than --host - an IP given, the FQDN
        // reached - and only a same-origin request carries the session cookie.
        expect(
            buildQseowAppUrls({ host: '192.168.100.165', secure: true, prefix: '' }, 'a')
                .qpsUserPath
        ).toBe('/qps/user');
    });
});

describe('ambientAuthHostFor', () => {
    test('is --host with --skip-login', () => {
        expect(ambientAuthHostFor({ skipLogin: true, host: 'sense.example.com' })).toBe(
            'sense.example.com'
        );
    });

    test.each([false, undefined, 'true'])('is nothing when skipLogin is %p', (skipLogin) => {
        expect(ambientAuthHostFor({ skipLogin, host: 'sense.example.com' })).toBeUndefined();
    });
});

describe('describeHttpFailure', () => {
    const describeIt = (response, skipLogin = false) =>
        describeHttpFailure(response, { appUrl: APP_URL, host: 'sense.example.com', skipLogin });

    test.each([
        ['a 2xx response', httpResponse(200, APP_URL)],
        ['no response at all', null],
    ])('says nothing for %s', (_label, response) => {
        expect(describeIt(response)).toBeNull();
    });

    test('states the status and where the browser ended up before any cause', () => {
        const text = describeIt(
            httpResponse(
                401,
                'https://sense.example.com/internal_windows_authentication/?targetId=1',
                'Unauthorized'
            )
        );

        expect(text).toMatch(
            /^opening https:\/\/sense\.example\.com\/sense\/app\/app-1 ended on HTTP 401 Unauthorized at https:\/\/sense\.example\.com\/internal_windows_authentication\/\?targetId=1/
        );
    });

    test('with --skip-login, a 401 names the Windows account that was not accepted', () => {
        const text = describeIt(httpResponse(401, APP_URL), true);

        expect(text).toContain('ACME\\svc-bsi');
        expect(currentAccount).toHaveBeenCalledWith({ withDomain: true });
    });

    test('without --skip-login, a 403 points at a form-login proxy and at --skip-login', () => {
        const text = describeIt(httpResponse(403, APP_URL));

        expect(text).toContain('--prefix');
        expect(text).toContain('--skip-login');
    });

    test('a 400 names the host-allow-list cause as one possibility, with the --host value', () => {
        // The known case: a proxy answers a host name it does not list with a bare 400.
        const text = describeIt(httpResponse(400, APP_URL, 'Bad Request'));

        expect(text).toContain('One known cause');
        expect(text).toContain('"sense.example.com", from --host');
        expect(text).not.toContain('signed in');
    });

    test('any other status gets the facts and a neutral next step', () => {
        expect(describeIt(httpResponse(500, APP_URL))).toContain('Check that the app opens');
    });
});

describe('openQseowAppOverviewPage with --skip-login', () => {
    test('types nothing into the page', async () => {
        const page = buildPage();

        await open(page, { skipLogin: true });

        expect(page.keyboard.type).not.toHaveBeenCalled();
        expect(page.click).not.toHaveBeenCalled();
    });

    test('says login was skipped, and where to ask who the browser is', async () => {
        const result = await open(buildPage(), { skipLogin: true });

        expect(result.loginSkipped).toBe(true);
        expect(result.qpsUserPath).toBe('/qps/user');
    });

    test('fails on an HTTP error page rather than taking "no form" for "signed in"', async () => {
        // A 401 from the Windows authentication leg has no login form either. Read as signed
        // in, it would be photographed as the overview and once per sheet.
        const err = await failureOf(buildPage(httpResponse(401, APP_URL, 'Unauthorized')), {
            skipLogin: true,
        });

        expect(err).toBeInstanceOf(QseowError);
        expect(err.message).toContain('not signed in with --skip-login');
        expect(err.message).toContain('HTTP 401');
        expect(err.message).toContain('ACME\\svc-bsi');
    });

    test('fails when the proxy served its login form instead of signing the browser in', async () => {
        // The pattern did not match, or the proxy is not set up for Windows authentication.
        // Without this check BSI would photograph the login form once per sheet.
        const err = await failureOf(withLoginForm(buildPage(), USERNAME_SELECTOR), {
            skipLogin: true,
        });

        expect(err).toBeInstanceOf(QseowError);
        expect(err.message).toContain('--skip-login');
        expect(err.message).toContain('Windows authentication pattern');
    });

    test('a string "true" is not --skip-login - only the parsed boolean is', async () => {
        // Commander's parser produces a boolean; anything else reaching here is a caller bug,
        // and treating it as true would skip a login nobody asked to skip.
        const page = withLoginForm(buildPage(), USERNAME_SELECTOR);

        const result = await open(page, { skipLogin: 'true' });

        expect(result.loginSkipped).toBe(false);
        expect(page.keyboard.type).toHaveBeenCalledWith('ACME\\goran');
    });
});

describe('openQseowAppOverviewPage without --skip-login', () => {
    test('signs in through the login form', async () => {
        const page = withLoginForm(buildPage(), USERNAME_SELECTOR);

        const result = await open(page);

        expect(result.loginSkipped).toBe(false);
        expect(page.keyboard.type).toHaveBeenCalledWith('ACME\\goran');
        expect(page.keyboard.type).toHaveBeenCalledWith('secret');
    });

    test('still signs in when the login page came with an error status', async () => {
        // The form decides whether a form login can proceed. Gating on the status as well would
        // stake every working run on which status a Sense release gives its login page.
        const page = withLoginForm(buildPage(httpResponse(401, APP_URL)), USERNAME_SELECTOR);

        await open(page);

        expect(page.keyboard.type).toHaveBeenCalledWith('secret');
    });

    test('with no login form, says what the page was and offers --skip-login as one possibility', async () => {
        // The scenario behind --skip-login: on a Windows authentication proxy the browser goes
        // straight to the app. Puppeteer's own message named only the selector.
        const err = await failureOf(buildPage());

        expect(err).toBeInstanceOf(QseowError);
        expect(err.message).toContain(`no login form on the page`);
        expect(err.message).toContain(`${APP_URL} (title "Sales dashboard")`);
        expect(err.message).toContain('If that page is the app itself');
        expect(err.message).toContain('--skip-login');
    });

    test('with no login form on an HTTP error page, gives the status and not the signed-in remedy', async () => {
        // A proxy that does not list --host answers with a bare 400. Telling that operator the
        // browser "may already be signed in" sent them to --skip-login, which cannot help.
        const err = await failureOf(buildPage(httpResponse(400, APP_URL, 'Bad Request')));

        expect(err).toBeInstanceOf(QseowError);
        expect(err.message).toContain('HTTP 400 Bad Request');
        expect(err.message).toContain('host allow list');
        expect(err.message).not.toContain('If that page is the app itself');
    });
});

describe('a browser refused with ERR_INVALID_AUTH_CREDENTIALS', () => {
    const refused = () => {
        const page = buildPage();
        page.goto.mockRejectedValue(
            new Error(
                'net::ERR_INVALID_AUTH_CREDENTIALS at https://sense.example.com/sense/app/app-1'
            )
        );
        return page;
    };

    test('with --skip-login, names the Windows account that was refused', async () => {
        // A scheduled task runs as its own account, not as the administrator who created it.
        const err = await failureOf(refused(), { skipLogin: true });

        expect(err).toBeInstanceOf(QseowError);
        expect(err.message).toContain('ACME\\svc-bsi');
        expect(err.message).toContain('ERR_INVALID_AUTH_CREDENTIALS');
    });

    test('without it, points at a form-login proxy and at --skip-login', async () => {
        const err = await failureOf(refused());

        expect(err).toBeInstanceOf(QseowError);
        expect(err.message).toContain('--prefix');
        expect(err.message).toContain('--skip-login');
        expect(err.message).toContain("'Form'");
    });

    test('keeps the browser error as the cause', async () => {
        const err = await failureOf(refused());

        expect(err.cause.message).toContain('net::ERR_INVALID_AUTH_CREDENTIALS');
    });

    test('leaves every other navigation failure as it was', async () => {
        const page = buildPage();
        const original = new Error('net::ERR_NAME_NOT_RESOLVED at https://sense.example.com/');
        page.goto.mockRejectedValue(original);

        await expect(open(page, { skipLogin: true })).rejects.toBe(original);
    });
});

describe('readQseowSessionUser', () => {
    const PATH = '/qps/user';

    test('names the proxy session user as DIRECTORY\\userid', async () => {
        const page = buildPage();
        page.evaluate.mockResolvedValue({ userDirectory: 'ACME', userId: 'goran' });

        await expect(readQseowSessionUser(page, PATH)).resolves.toBe('ACME\\goran');
    });

    test('asks from inside the page, with a time limit', async () => {
        // Without a limit a proxy that holds the request open stalls every app until
        // Puppeteer's protocol timeout, three minutes, for a fact the run does not need.
        const page = buildPage();
        page.evaluate.mockResolvedValue(null);

        await readQseowSessionUser(page, PATH);
        await readQseowSessionUser(page, PATH, 250);

        expect(page.evaluate).toHaveBeenNthCalledWith(
            1,
            expect.any(Function),
            PATH,
            QSEOW_SESSION_USER_TIMEOUT_MS
        );
        expect(page.evaluate).toHaveBeenNthCalledWith(2, expect.any(Function), PATH, 250);
        expect(QSEOW_SESSION_USER_TIMEOUT_MS).toBeLessThanOrEqual(10000);
    });

    test('the in-page request aborts itself when the limit passes', async () => {
        // The function handed to page.evaluate, run here against a fetch that never answers on
        // its own: only the signal can end it.
        const page = buildPage();
        page.evaluate.mockImplementation((fn, ...args) => fn(...args));
        const realFetch = globalThis.fetch;
        globalThis.fetch = (_url, { signal }) =>
            new Promise((_resolve, reject) => {
                signal.addEventListener('abort', () => reject(signal.reason));
            });

        try {
            await expect(readQseowSessionUser(page, PATH, 20)).resolves.toBeNull();
        } finally {
            globalThis.fetch = realFetch;
        }

        expect(logger.debug.mock.calls.join('\n')).toContain('could not read the session user');
    });

    test('returns null rather than failing the run when the proxy does not answer', async () => {
        const page = buildPage();
        page.evaluate.mockRejectedValue(new Error('Failed to fetch'));

        await expect(readQseowSessionUser(page, PATH)).resolves.toBeNull();
        expect(logger.debug.mock.calls.join('\n')).toContain('Failed to fetch');
    });

    test('returns null for an answer that names no user, without logging its values', async () => {
        // The body carries the session id, which is a credential for as long as it lives.
        const page = buildPage();
        page.evaluate.mockResolvedValue({ session: 'inactive', sessionId: 'abc123-secret' });

        await expect(readQseowSessionUser(page, PATH)).resolves.toBeNull();

        const logged = logger.debug.mock.calls.join('\n');
        expect(logged).toContain('sessionId');
        expect(logged).not.toContain('abc123-secret');
    });

    test('returns null when the endpoint answers with an error status', async () => {
        const page = buildPage();
        page.evaluate.mockResolvedValue(null);

        await expect(readQseowSessionUser(page, PATH)).resolves.toBeNull();
    });
});

describe('readQseowSessionUserParts', () => {
    test('answers the directory and the id separately', async () => {
        const page = buildPage();
        page.evaluate.mockResolvedValue({ userDirectory: 'ACME', userId: 'goran', session: 'x' });

        await expect(readQseowSessionUserParts(page, '/qps/user')).resolves.toEqual({
            userDirectory: 'ACME',
            userId: 'goran',
        });
    });

    test('is null when the proxy names no one', async () => {
        const page = buildPage();
        page.evaluate.mockResolvedValue({ session: 'inactive' });

        await expect(readQseowSessionUserParts(page, '/qps/user')).resolves.toBeNull();
    });
});

describe('readQseowBrowserUser (issue #1209)', () => {
    const HUB_URL = 'https://sense.example.com/windows/hub';
    const SKIP = { ...OPTIONS, skipLogin: true, prefix: 'windows', senseVersion: '2026-May' };

    /**
     * A browser whose one page is the given page.
     *
     * @param {object} page - The page.
     *
     * @returns {object} The browser.
     */
    const browserWith = (page) => {
        const browser = { newPage: jest.fn().mockResolvedValue(page) };
        launchBrowserForApp.mockResolvedValue(browser);

        return browser;
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('signs in on the hub and returns who the proxy signed in, then signs out', async () => {
        const page = buildPage(httpResponse(200, HUB_URL));
        page.evaluate.mockResolvedValue({ userDirectory: 'ACME', userId: 'goran' });
        const browser = browserWith(page);

        await expect(readQseowBrowserUser(SKIP)).resolves.toEqual({
            userDirectory: 'ACME',
            userId: 'goran',
        });

        expect(page.goto.mock.calls[0][0]).toBe(HUB_URL);
        // The same Windows-authentication allowance as an app's own session.
        expect(launchBrowserForApp.mock.calls[0][1].ambientAuthHost).toBe('sense.example.com');
        expect(page.keyboard.type).not.toHaveBeenCalled();
        expect(qseowLogoutQuietly).toHaveBeenCalledTimes(1);
        expect(closeBrowserQuietly).toHaveBeenCalledWith(browser, 'QSEOW');
    });

    test('refuses when the proxy does not say who it signed in, and still signs out', async () => {
        const page = buildPage(httpResponse(200, HUB_URL));
        page.evaluate.mockResolvedValue(null);
        browserWith(page);

        const err = await readQseowBrowserUser(SKIP).catch((e) => e);

        expect(err).toBeInstanceOf(QseowError);
        expect(err.message).toContain('cannot tell which account should own the apps');
        expect(qseowLogoutQuietly).toHaveBeenCalledTimes(1);
        expect(closeBrowserQuietly).toHaveBeenCalledTimes(1);
    });

    test('refuses an HTTP error page rather than reading it as signed in', async () => {
        browserWith(buildPage(httpResponse(401, HUB_URL, 'Unauthorized')));

        const err = await readQseowBrowserUser(SKIP).catch((e) => e);

        expect(err.message).toContain('could not sign in to find the app owner');
        expect(err.message).toContain('HTTP 401');
        expect(closeBrowserQuietly).toHaveBeenCalledTimes(1);
    });

    test('refuses when the proxy served its login form instead', async () => {
        browserWith(withLoginForm(buildPage(httpResponse(200, HUB_URL)), USERNAME_SELECTOR));

        await expect(readQseowBrowserUser(SKIP)).rejects.toBeInstanceOf(QseowError);
        expect(closeBrowserQuietly).toHaveBeenCalledTimes(1);
    });
});
