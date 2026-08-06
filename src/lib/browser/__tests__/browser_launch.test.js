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
jest.unstable_mockModule('fs', () => ({
    default: { existsSync: jest.fn() },
    existsSync: jest.fn().mockReturnValue(false),
}));
const fs = await import('fs');

const { launchBrowserForApp, buildBrowserArgs, resolveBrowserExecutablePath } =
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
    logPrefix: 'TEST:',
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

    test('adds --single-process outside Windows and Docker', async () => {
        // The unit test hosts (macOS locally, Ubuntu in CI) are both non-Windows.
        expect(await buildBrowserArgs()).toContain('--single-process');
    });

    test('omits --single-process in Docker, where it crashes Chromium', async () => {
        fs.existsSync.mockImplementation((p) => p === '/.dockerenv');

        expect(await buildBrowserArgs()).not.toContain('--single-process');
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
