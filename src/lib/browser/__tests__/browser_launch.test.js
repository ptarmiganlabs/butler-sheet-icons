import { jest, describe, test, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('puppeteer-core', () => ({
    default: { launch: jest.fn() },
}));
const puppeteer = (await import('puppeteer-core')).default;

jest.unstable_mockModule('@puppeteer/browsers', () => ({
    computeExecutablePath: jest.fn().mockReturnValue('/downloaded/chrome'),
}));
const { computeExecutablePath } = await import('@puppeteer/browsers');

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    },
}));
const { logger } = await import('../../../globals.js');

jest.unstable_mockModule('../browser-detect.js', () => ({
    detectAvailableBrowser: jest.fn(),
}));
const { detectAvailableBrowser } = await import('../browser-detect.js');

jest.unstable_mockModule('../browser-install.js', () => ({
    browserInstall: jest.fn(),
}));
const { browserInstall } = await import('../browser-install.js');

// Docker detection imports fs dynamically; existsSync drives which branch is taken.
jest.unstable_mockModule('node:fs', () => ({
    default: { existsSync: jest.fn() },
    existsSync: jest.fn().mockReturnValue(false),
}));
const fs = await import('node:fs');

const { launchBrowserForApp, buildBrowserArgs, resolveBrowserExecutablePath, closeBrowserQuietly } =
    await import('../browser-launch.js');

/** Stand-in typed error, matching the (message, { cause }) shape of the real ones. */
class TestError extends Error {
    /**
     * Construct a test error carrying an optional cause.
     *
     * @param {string} message - Error message.
     * @param {object} [options] - Error options, including `cause`.
     */
    constructor(message, options) {
        super(message, options);
        this.name = 'TestError';
    }
}

const CONTEXT = {
    appId: 'test-app-id',
    logPrefix: 'TEST',
    appLabel: 'test app',
    ErrorClass: TestError,
};

const OPTIONS = { browser: 'chrome', browserVersion: 'latest', headless: true };

beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
});

describe('buildBrowserArgs', () => {
    test('includes the shared Chromium flags', async () => {
        const args = await buildBrowserArgs();

        expect(args).toEqual(expect.arrayContaining(['--no-sandbox', '--disable-gpu']));
    });

    test('adds --single-process on non-Windows hosts outside Docker', async () => {
        expect(await buildBrowserArgs({ platform: 'linux' })).toContain('--single-process');
    });

    test('omits --single-process on Windows, where it broke QS Cloud (issue #742)', async () => {
        expect(await buildBrowserArgs({ platform: 'win32' })).not.toContain('--single-process');
    });

    test('omits --single-process in Docker, where it crashes Chromium', async () => {
        fs.existsSync.mockImplementation((p) => p === '/.dockerenv');

        // A non-Windows platform, so the Docker check is what omits the flag rather than the
        // Windows check short-circuiting ahead of it.
        expect(await buildBrowserArgs({ platform: 'linux' })).not.toContain('--single-process');
    });
});

describe('resolveBrowserExecutablePath', () => {
    test('uses a detected browser without installing', async () => {
        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/cached/chrome',
            source: 'cache',
            browser: 'chrome',
            buildId: '138.0.0.1',
        });

        expect(await resolveBrowserExecutablePath(OPTIONS)).toBe('/cached/chrome');
        expect(browserInstall).not.toHaveBeenCalled();
    });

    test('installs when no browser is available', async () => {
        detectAvailableBrowser.mockResolvedValue(null);
        browserInstall.mockResolvedValue({ browser: 'chrome', buildId: '138.0.0.1' });

        expect(await resolveBrowserExecutablePath(OPTIONS)).toBe('/downloaded/chrome');
        expect(browserInstall).toHaveBeenCalledTimes(1);
        expect(computeExecutablePath).toHaveBeenCalledWith(
            expect.objectContaining({ browser: 'chrome', buildId: '138.0.0.1' })
        );
    });
});

describe('launchBrowserForApp', () => {
    test('launches with the v25-compatible option shape', async () => {
        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/cached/chrome',
            source: 'cache',
            browser: 'chrome',
            buildId: '138.0.0.1',
        });
        const fakeBrowser = { id: 'browser' };
        puppeteer.launch.mockResolvedValue(fakeBrowser);

        const browser = await launchBrowserForApp(OPTIONS, CONTEXT);

        expect(browser).toBe(fakeBrowser);
        expect(puppeteer.launch).toHaveBeenCalledWith(
            expect.objectContaining({
                executablePath: '/cached/chrome',
                headless: true,
                ignoreHTTPSErrors: true,
            })
        );
        expect(puppeteer.launch).not.toHaveBeenCalledWith(
            expect.objectContaining({ acceptInsecureCerts: expect.anything() })
        );
    });

    test('wraps an install failure in the caller-supplied error, with app context', async () => {
        detectAvailableBrowser.mockResolvedValue(null);
        const cause = new Error('network unreachable');
        browserInstall.mockRejectedValue(cause);

        await expect(launchBrowserForApp(OPTIONS, CONTEXT)).rejects.toThrow(TestError);
        await expect(launchBrowserForApp(OPTIONS, CONTEXT)).rejects.toThrow(
            'Failed to install a browser for test app test-app-id'
        );
        expect(puppeteer.launch).not.toHaveBeenCalled();
    });

    test('wraps a launch failure, preserving the original as cause', async () => {
        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/cached/chrome',
            source: 'cache',
            browser: 'chrome',
            buildId: '138.0.0.1',
        });
        const cause = new Error('no display');
        puppeteer.launch.mockRejectedValue(cause);

        const err = await launchBrowserForApp(OPTIONS, CONTEXT).catch((e) => e);

        expect(err).toBeInstanceOf(TestError);
        expect(err.message).toBe('Failed to launch virtual browser for test app test-app-id');
        expect(err.cause).toBe(cause);
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('TEST:'));
    });

    test('logs the thrown value itself when it is not an Error', async () => {
        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/cached/chrome',
            source: 'cache',
            browser: 'chrome',
            buildId: '138.0.0.1',
        });
        // A bare string has neither .stack nor .message; without a final fallback the log
        // line would read "... : undefined" and lose the only diagnostic available.
        puppeteer.launch.mockRejectedValue('no display available');

        await launchBrowserForApp(OPTIONS, CONTEXT).catch(() => undefined);

        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('no display available'));
    });
});

describe('closeBrowserQuietly', () => {
    test('closes the browser', async () => {
        const browser = { close: jest.fn().mockResolvedValue(undefined) };

        await closeBrowserQuietly(browser, 'QSEOW');

        expect(browser.close).toHaveBeenCalledTimes(1);
    });

    test('swallows a close failure rather than throwing', async () => {
        // This runs from a finally that may already be unwinding a real failure. Throwing here
        // would replace the cause the operator needs to see.
        const browser = { close: jest.fn().mockRejectedValue(new Error('browser is wedged')) };

        await expect(closeBrowserQuietly(browser, 'QSEOW')).resolves.toBeUndefined();
    });

    test('logs the failure with the caller prefix, so it is not lost silently', async () => {
        const browser = { close: jest.fn().mockRejectedValue(new Error('browser is wedged')) };

        await closeBrowserQuietly(browser, 'CLOUD APP');

        const logged = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
        expect(logged).toContain('CLOUD APP');
        expect(logged).toContain('browser is wedged');
    });

    test.each([
        ['undefined', undefined],
        ['null', null],
    ])('ignores a %s browser, so a failed launch can share the finally', async (_l, browser) => {
        await expect(closeBrowserQuietly(browser, 'QSEOW')).resolves.toBeUndefined();
        expect(logger.error).not.toHaveBeenCalled();
    });
});

describe('log prefix shape', () => {
    test('adds the colon itself, so both platforms render the same shape', async () => {
        // QSEoW passed 'QSEOW' and Cloud passed 'CLOUD APP:', against a template with no colon.
        // QSEoW therefore logged "QSEOW Could not launch ..." while Cloud logged
        // "CLOUD APP: Could not launch ...". The colon belongs in one place.
        puppeteer.launch.mockRejectedValue(new Error('no browser here'));

        await expect(launchBrowserForApp(OPTIONS, CONTEXT)).rejects.toThrow();

        const logged = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
        expect(logged).toContain('TEST: Could not launch virtual browser');
        expect(logged).not.toContain('TEST Could not launch');
        expect(logged).not.toContain('TEST:: Could not launch');
    });
});
