import { beforeEach, describe, expect, jest, test } from '@jest/globals';

/**
 * Tests for the sign-in `--change-app-owner` makes at the start of a Qlik Cloud run, to learn who
 * the browser signs in as (issue #1209). The form login and the signed-in assertion have their own
 * tests in `browser/__tests__`; here they are stand-ins, so what is tested is which one runs and
 * what is done with the answer.
 */

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        debug: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        verbose: jest.fn(),
        warn: jest.fn(),
    },
    sleep: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../browser/browser-launch.js', () => ({
    launchBrowserForApp: jest.fn(),
    closeBrowserQuietly: jest.fn(),
}));

jest.unstable_mockModule('../../browser/form-login.js', () => ({
    formLogin: jest.fn().mockResolvedValue(undefined),
    assertAuthenticated: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../util/image-dir.js', () => ({
    createAppImageDir: jest.fn(
        ({ imagedir, platform, appId }) => `${imagedir}/${platform}/${appId}`
    ),
    removeStaleImage: jest.fn(),
}));

const { readCloudBrowserUser } = await import('../cloud-app-session.js');
const { launchBrowserForApp, closeBrowserQuietly } =
    await import('../../browser/browser-launch.js');
const { formLogin, assertAuthenticated } = await import('../../browser/form-login.js');
const { CloudError } = await import('../../util/errors.js');

const OPTIONS = {
    tenanturl: 'tenant.eu.qlikcloud.com',
    logonuserid: 'joe@example.com',
    logonpwd: 'secret',
    imagedir: './img',
    pagewait: 0,
};

/**
 * A page that has signed in, and a browser serving it.
 *
 * @param {object|null} user - What the tenant answers to `users/me` from inside the page.
 *
 * @returns {{page: object, browser: object}} The page and the browser.
 */
const signedInBrowser = (user) => {
    const page = {
        setDefaultTimeout: jest.fn().mockResolvedValue(undefined),
        goto: jest.fn().mockResolvedValue(undefined),
        screenshot: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue(user),
    };
    const browser = { newPage: jest.fn().mockResolvedValue(page) };
    launchBrowserForApp.mockResolvedValue(browser);

    return { page, browser };
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('readCloudBrowserUser', () => {
    const JOE = { id: 'u-joe', name: 'Joe', email: 'joe@example.com', tenantId: 't-1' };

    test('signs in with the logon credentials and asks the tenant who that is', async () => {
        const { page, browser } = signedInBrowser(JOE);

        await expect(readCloudBrowserUser({ ...OPTIONS })).resolves.toEqual({
            id: 'u-joe',
            name: 'Joe',
            email: 'joe@example.com',
        });

        expect(page.goto.mock.calls[0][0]).toBe('https://tenant.eu.qlikcloud.com/');
        expect(formLogin).toHaveBeenCalledTimes(1);
        expect(formLogin.mock.calls[0][1]).toMatchObject({
            username: 'joe@example.com',
            password: 'secret',
            screenshotPath: './img/cloud/change-app-owner/loginpage-2.png',
        });
        expect(assertAuthenticated).not.toHaveBeenCalled();
        expect(closeBrowserQuietly).toHaveBeenCalledWith(browser, 'CLOUD');
    });

    test('with --skip-login types nothing and checks the browser is signed in', async () => {
        signedInBrowser(JOE);

        await readCloudBrowserUser({ ...OPTIONS, skipLogin: true });

        expect(formLogin).not.toHaveBeenCalled();
        expect(assertAuthenticated).toHaveBeenCalledTimes(1);
    });

    test('refuses when the tenant does not say who is signed in, and still closes the browser', async () => {
        signedInBrowser(null);

        const err = await readCloudBrowserUser({ ...OPTIONS }).catch((e) => e);

        expect(err).toBeInstanceOf(CloudError);
        expect(err.message).toContain('cannot tell which user should own the apps');
        expect(closeBrowserQuietly).toHaveBeenCalledTimes(1);
    });

    test('closes the browser when the sign-in fails', async () => {
        signedInBrowser(JOE);
        formLogin.mockRejectedValueOnce(new CloudError('CLOUD: login failed'));

        await expect(readCloudBrowserUser({ ...OPTIONS })).rejects.toThrow('login failed');
        expect(closeBrowserQuietly).toHaveBeenCalledTimes(1);
    });
});
