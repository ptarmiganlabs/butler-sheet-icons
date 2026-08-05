import { jest, test, expect, describe, beforeEach, afterEach } from '@jest/globals';

jest.unstable_mockModule('@puppeteer/browsers', () => ({
    getInstalledBrowsers: jest.fn(),
}));
const { getInstalledBrowsers } = await import('@puppeteer/browsers');

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

jest.unstable_mockModule('fs', () => ({
    default: { existsSync: jest.fn() },
    existsSync: jest.fn(),
}));
const fs = (await import('fs')).default;

const { detectAvailableBrowser } = await import('../browser-detect.js');

// PUPPETEER_EXECUTABLE_PATH is ambient and leaks between test files, so capture and
// restore it around every test rather than assuming it starts unset.
let savedExecutablePath;

beforeEach(() => {
    savedExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
});

afterEach(() => {
    if (savedExecutablePath === undefined) {
        delete process.env.PUPPETEER_EXECUTABLE_PATH;
    } else {
        process.env.PUPPETEER_EXECUTABLE_PATH = savedExecutablePath;
    }
});

/**
 * Builds an InstalledBrowser-shaped entry as returned by `@puppeteer/browsers`.
 *
 * @param {string} browser - Browser type, e.g. `chrome`.
 * @param {string} buildId - Build id, e.g. `138.0.7204.94`.
 *
 * @returns {object} Entry with `browser`, `buildId` and `executablePath`.
 */
function cachedBrowser(browser, buildId) {
    return {
        browser,
        buildId,
        executablePath: `/cache/${browser}/${buildId}/${browser}`,
    };
}

describe('detectAvailableBrowser — cached browsers', () => {
    test('returns a cached browser when one matches', async () => {
        // Regression test for the missing `await` on getInstalledBrowsers(). Without it the
        // value is a Promise: truthy, but `.length` is undefined and `undefined > 0` is
        // false, so the whole cache block was skipped and this returned null.
        getInstalledBrowsers.mockResolvedValue([cachedBrowser('chrome', '138.0.7204.94')]);

        const result = await detectAvailableBrowser({ browser: 'chrome' });

        expect(result).toEqual({
            executablePath: '/cache/chrome/138.0.7204.94/chrome',
            source: 'cache',
            browser: 'chrome',
            buildId: '138.0.7204.94',
        });
    });

    test('returns null when the cache is empty', async () => {
        getInstalledBrowsers.mockResolvedValue([]);

        expect(await detectAvailableBrowser({ browser: 'chrome' })).toBeNull();
    });

    test('ignores cached browsers of a different type', async () => {
        getInstalledBrowsers.mockResolvedValue([cachedBrowser('firefox', '130.0')]);

        expect(await detectAvailableBrowser({ browser: 'chrome' })).toBeNull();
    });
});

describe('detectAvailableBrowser — browser version matching', () => {
    test('honours an exact version pin', async () => {
        getInstalledBrowsers.mockResolvedValue([cachedBrowser('chrome', '138.0.7204.94')]);

        const result = await detectAvailableBrowser({
            browser: 'chrome',
            browserVersion: '138.0.7204.94',
        });

        expect(result.buildId).toBe('138.0.7204.94');
    });

    test('falls through to download when no cached build matches the pin', async () => {
        getInstalledBrowsers.mockResolvedValue([cachedBrowser('chrome', '138.0.7204.94')]);

        const result = await detectAvailableBrowser({
            browser: 'chrome',
            browserVersion: '121.0.6167.85',
        });

        expect(result).toBeNull();
    });

    test('"latest" accepts any cached build of the requested type', async () => {
        getInstalledBrowsers.mockResolvedValue([cachedBrowser('chrome', '138.0.7204.94')]);

        const result = await detectAvailableBrowser({
            browser: 'chrome',
            browserVersion: 'latest',
        });

        expect(result.buildId).toBe('138.0.7204.94');
    });
});

describe('detectAvailableBrowser — system browser', () => {
    test('prefers PUPPETEER_EXECUTABLE_PATH and does not consult the cache', async () => {
        process.env.PUPPETEER_EXECUTABLE_PATH = '/usr/bin/chromium-browser';
        fs.existsSync.mockReturnValue(true);

        const result = await detectAvailableBrowser({ browser: 'chrome' });

        expect(result).toEqual({
            executablePath: '/usr/bin/chromium-browser',
            source: 'system',
            browser: 'chrome',
            buildId: 'system-installed',
        });
        expect(getInstalledBrowsers).not.toHaveBeenCalled();
    });

    test('warns and falls back to the cache when the configured path does not exist', async () => {
        process.env.PUPPETEER_EXECUTABLE_PATH = '/nope/chromium';
        fs.existsSync.mockReturnValue(false);
        getInstalledBrowsers.mockResolvedValue([cachedBrowser('chrome', '138.0.7204.94')]);

        const result = await detectAvailableBrowser({ browser: 'chrome' });

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('/nope/chromium'));
        expect(result.source).toBe('cache');
    });
});

describe('detectAvailableBrowser — failure handling', () => {
    test('returns null and logs when the cache lookup rejects', async () => {
        // Before the missing `await` was added the rejection escaped the surrounding
        // try/catch entirely and surfaced as an unhandled rejection.
        getInstalledBrowsers.mockRejectedValue(new Error('cache unreadable'));

        const result = await detectAvailableBrowser({ browser: 'chrome' });

        expect(result).toBeNull();
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('cache unreadable'));
    });
});
