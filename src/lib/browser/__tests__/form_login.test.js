import { jest, describe, test, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../globals.js', () => ({
    sleep: jest.fn().mockResolvedValue(undefined),
}));

const { sleep } = await import('../../../globals.js');
const { formLogin, assertAuthenticated } = await import('../form-login.js');

/** Stands in for QseowError / CloudError, so the tests can assert the platform class is used. */
class TestError extends Error {}

const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
};

// The two platforms' real selector sets, so this suite exercises both rather than
// standing in for one - a fix that lands on one twin and not the other is the class
// of defect #1091 exists to remove.
const QSEOW_SELECTORS = {
    username: '#username-input',
    password: '#password-input',
    submit: '#loginbtn',
};

const CLOUD_SELECTORS = {
    username: '[id="1-email"]',
    password: '[id="1-password"]',
    submit: '[id="1-submit"]',
};

/**
 * Builds a page stub that records every interaction in call order.
 *
 * Order is the thing under test: the extraction is only behaviour-preserving if the
 * clicks, the typing, the screenshot and the submit still happen in the same sequence.
 *
 * @param {object} [opts] - Stub behaviour.
 * @param {boolean} [opts.stillOnLoginPage] - Whether `page.$` finds the username field afterwards.
 *
 * @returns {object} A page-shaped object with a `calls` array.
 */
const createPage = ({ stillOnLoginPage = false } = {}) => {
    const calls = [];

    return {
        calls,
        click: jest.fn((selector, opts) => {
            calls.push(['click', selector, opts]);
            return Promise.resolve();
        }),
        keyboard: {
            type: jest.fn((text) => {
                calls.push(['type', text]);
                return Promise.resolve();
            }),
        },
        screenshot: jest.fn((opts) => {
            calls.push(['screenshot', opts.path]);
            return Promise.resolve();
        }),
        waitForNavigation: jest.fn((opts) => {
            calls.push(['waitForNavigation', opts]);
            return Promise.resolve();
        }),
        $: jest.fn(() => Promise.resolve(stillOnLoginPage ? {} : null)),
    };
};

/**
 * Runs `formLogin` with defaults for everything a test does not care about.
 *
 * @param {object} page - Page stub from `createPage`.
 * @param {object} [overrides] - Fields to merge over the defaults.
 *
 * @returns {Promise<void>} Whatever `formLogin` resolves or rejects with.
 */
const run = (page, overrides = {}) =>
    formLogin(page, {
        selectors: QSEOW_SELECTORS,
        username: 'MYDOMAIN\\goran',
        password: 'secret',
        pagewait: 5,
        pageTimeout: 90000,
        screenshotPath: './img/qseow/app-1/loginpage-2.png',
        logPrefix: 'QSEOW APP',
        ErrorClass: TestError,
        logger: mockLogger,
        ...overrides,
    });

beforeEach(() => {
    jest.clearAllMocks();
});

describe('formLogin', () => {
    test('performs the login steps in the order the platforms used before extraction', async () => {
        const page = createPage();
        await run(page);

        expect(page.calls.map((c) => c[0])).toEqual([
            'click',
            'type',
            'click',
            'type',
            'screenshot',
            'click',
            'waitForNavigation',
        ]);
    });

    test('clicks each field before typing into it', async () => {
        const page = createPage();
        await run(page);

        expect(page.calls[0]).toEqual(['click', '#username-input', { button: 'left', delay: 10 }]);
        expect(page.calls[1]).toEqual(['type', 'MYDOMAIN\\goran']);
        expect(page.calls[2]).toEqual(['click', '#password-input', { button: 'left', delay: 10 }]);
        expect(page.calls[3]).toEqual(['type', 'secret']);
    });

    test('screenshots after the credentials are entered and before submitting', async () => {
        const page = createPage();
        await run(page);

        expect(page.calls[4]).toEqual(['screenshot', './img/qseow/app-1/loginpage-2.png']);
        expect(page.calls[5][1]).toBe('#loginbtn');
    });

    test('waits for navigation with the run page timeout', async () => {
        const page = createPage();
        await run(page, { pageTimeout: 120000 });

        expect(page.waitForNavigation).toHaveBeenCalledWith({
            waitUntil: 'networkidle2',
            timeout: 120000,
        });
    });

    test('settles for the configured page wait afterwards', async () => {
        const page = createPage();
        await run(page, { pagewait: 7 });

        expect(sleep).toHaveBeenCalledWith(7000);
    });

    test('drives the Cloud selectors just as it drives the QSEoW ones', async () => {
        const page = createPage();
        await run(page, { selectors: CLOUD_SELECTORS, username: 'goran@example.com' });

        expect(page.calls[0][1]).toBe('[id="1-email"]');
        expect(page.calls[2][1]).toBe('[id="1-password"]');
        expect(page.calls[5][1]).toBe('[id="1-submit"]');
    });

    test('rejects when the login form is still on the page afterwards', async () => {
        const page = createPage({ stillOnLoginPage: true });

        await expect(run(page)).rejects.toThrow(TestError);
    });
});

describe('assertAuthenticated', () => {
    /**
     * Runs the assertion against a page that either still shows the login form or does not.
     *
     * @param {boolean} stillOnLoginPage - Whether `page.$` finds the username field.
     * @param {object} [overrides] - Fields to merge over the defaults.
     *
     * @returns {Promise<void>} Whatever the assertion resolves or rejects with.
     */
    const assertWith = (stillOnLoginPage, overrides = {}) =>
        assertAuthenticated(createPage({ stillOnLoginPage }), {
            selectors: QSEOW_SELECTORS,
            logPrefix: 'QSEOW APP',
            ErrorClass: TestError,
            logger: mockLogger,
            situation: 'submitting the credentials and waiting for navigation',
            remedy: 'Check the username and password supplied to BSI.',
            ...overrides,
        });

    test('resolves when the login form is gone', async () => {
        await expect(assertWith(false)).resolves.toBeUndefined();
    });

    test('throws the platform error class, not a bare Error', async () => {
        await expect(assertWith(true)).rejects.toBeInstanceOf(TestError);
    });

    test('names what was tried, the platform and the field it still sees', async () => {
        await expect(assertWith(true)).rejects.toThrow(
            /not authenticated after submitting the credentials/
        );
        await expect(assertWith(true)).rejects.toThrow(/QSEOW APP/);
        await expect(assertWith(true)).rejects.toThrow(/#username-input/);
    });

    test('carries the remedy the caller supplied', async () => {
        await expect(assertWith(true)).rejects.toThrow(/Check the username and password/);
    });

    test('describes the situation the caller was in, not always a form login', async () => {
        // The --skip-login path never typed a credential, so a message about submitting
        // credentials would send the operator looking in the wrong place.
        await expect(
            assertWith(true, {
                logPrefix: 'CLOUD APP',
                situation: 'opening the app with --skip-login',
                remedy: 'Sign in in the browser profile BSI uses.',
            })
        ).rejects.toThrow(/not authenticated after opening the app with --skip-login/);
    });

    test('says why continuing would be worse than failing', async () => {
        // The whole point of the check: without it BSI screenshots the login screen and
        // reports success. The message has to say that, or the next person removes it.
        await expect(assertWith(true)).rejects.toThrow(/as though it were a sheet/);
    });

    test('reports the Cloud field when run against Cloud selectors', async () => {
        await expect(assertWith(true, { selectors: CLOUD_SELECTORS })).rejects.toThrow(/1-email/);
    });
});
