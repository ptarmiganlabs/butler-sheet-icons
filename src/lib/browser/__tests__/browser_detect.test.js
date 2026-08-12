import { jest, test, expect, describe, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import { homedir } from 'node:os';

jest.unstable_mockModule('@puppeteer/browsers', () => ({
    getInstalledBrowsers: jest.fn(),
    // Real comparator semantics: build ids are not comparable as strings, and the "newest cached
    // build" behaviour depends on ordering them correctly.
    getVersionComparator: jest.fn(
        () => (a, b) =>
            a.split('.').map(Number)[3] - b.split('.').map(Number)[3] ||
            a.localeCompare(b, undefined, { numeric: true })
    ),
    detectBrowserPlatform: jest.fn().mockResolvedValue('mac_arm'),
    resolveBuildId: jest.fn(),
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
    // browser-paths.js gates the standalone cache location on this, and ESM checks
    // named exports when the module graph is linked, so leaving it out is a hard error
    // rather than an undefined.
    isSea: false,
}));
const { logger } = await import('../../../globals.js');

jest.unstable_mockModule('fs', () => ({
    default: { existsSync: jest.fn() },
    existsSync: jest.fn(),
}));
const fs = (await import('fs')).default;

const { detectAvailableBrowser } = await import('../browser-detect.js');

// These are ambient and leak between test files, so capture and restore them around every
// test rather than assuming they start unset. PUPPETEER_CACHE_DIR joined the list when the
// cache directory became configurable - until then it did nothing at all in Butler Sheet
// Icons, and now it decides where this function looks.
const AMBIENT_ENV = ['PUPPETEER_EXECUTABLE_PATH', 'PUPPETEER_CACHE_DIR', 'BSI_BROWSER_CACHE_DIR'];
let savedEnv;

beforeEach(() => {
    savedEnv = Object.fromEntries(AMBIENT_ENV.map((name) => [name, process.env[name]]));
    for (const name of AMBIENT_ENV) {
        delete process.env[name];
    }
});

afterEach(() => {
    for (const [name, value] of Object.entries(savedEnv)) {
        if (value === undefined) {
            delete process.env[name];
        } else {
            process.env[name] = value;
        }
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
        getInstalledBrowsers.mockResolvedValue([
            cachedBrowser('chrome-headless-shell', '130.0.6099.109'),
        ]);

        expect(await detectAvailableBrowser({ browser: 'chrome' })).toBeNull();
    });
});

describe('detectAvailableBrowser — where the cache is', () => {
    test('reads the directory named by --browser-cache-dir', async () => {
        getInstalledBrowsers.mockResolvedValue([]);

        await detectAvailableBrowser({ browser: 'chrome', browserCacheDir: '/qlik/browsers' });

        expect(getInstalledBrowsers).toHaveBeenCalledWith({
            cacheDir: path.resolve('/qlik/browsers'),
        });
    });

    test('reads PUPPETEER_CACHE_DIR when no directory was named', async () => {
        // Widely known, and until now it did nothing here at all.
        process.env.PUPPETEER_CACHE_DIR = '/qlik/puppeteer';
        getInstalledBrowsers.mockResolvedValue([]);

        await detectAvailableBrowser({ browser: 'chrome' });

        expect(getInstalledBrowsers).toHaveBeenCalledWith({
            cacheDir: path.resolve('/qlik/puppeteer'),
        });
    });

    test('falls back to the home directory cache', async () => {
        getInstalledBrowsers.mockResolvedValue([]);

        await detectAvailableBrowser({ browser: 'chrome' });

        expect(getInstalledBrowsers).toHaveBeenCalledWith({
            cacheDir: path.join(homedir(), '.cache', 'puppeteer'),
        });
    });
});

describe('detectAvailableBrowser — build id matching', () => {
    test('returns the requested build when it is cached', async () => {
        getInstalledBrowsers.mockResolvedValue([cachedBrowser('chrome', '138.0.7204.94')]);

        const result = await detectAvailableBrowser({ browser: 'chrome' }, '138.0.7204.94');

        expect(result.buildId).toBe('138.0.7204.94');
    });

    test('falls through to download when the requested build is not cached', async () => {
        getInstalledBrowsers.mockResolvedValue([cachedBrowser('chrome', '138.0.7204.94')]);

        const result = await detectAvailableBrowser({ browser: 'chrome' }, '121.0.6167.85');

        expect(result).toBeNull();
    });

    // The regression behind issue #878: with several builds cached, matching had to be exact,
    // because "any cached build of this type" meant two machines on the same Butler Sheet Icons
    // version silently ran different Chrome builds - one of which could not be driven.
    test('picks the requested build out of several cached builds', async () => {
        getInstalledBrowsers.mockResolvedValue([
            cachedBrowser('chrome', '151.0.7922.109'),
            cachedBrowser('chrome', '150.0.7871.24'),
            cachedBrowser('chrome', '151.0.7922.77'),
        ]);

        const result = await detectAvailableBrowser({ browser: 'chrome' }, '150.0.7871.24');

        expect(result.buildId).toBe('150.0.7871.24');
    });

    test('reports a build miss as a build miss, not a type miss', async () => {
        getInstalledBrowsers.mockResolvedValue([cachedBrowser('chrome', '138.0.7204.94')]);

        await detectAvailableBrowser({ browser: 'chrome' }, '121.0.6167.85');

        const debugOutput = logger.debug.mock.calls.map(([msg]) => msg).join('\n');
        expect(debugOutput).toContain('none matching build 121.0.6167.85');
    });
});

describe('detectAvailableBrowser — no resolved build id (offline fallback)', () => {
    // Reached when the requested version could not be looked up, e.g. `stable` on a machine with
    // no internet access. Any cached build is better than failing outright, but it must be the
    // newest rather than whatever the filesystem happened to list first.
    test('accepts any cached build of the requested type', async () => {
        getInstalledBrowsers.mockResolvedValue([cachedBrowser('chrome', '138.0.7204.94')]);

        const result = await detectAvailableBrowser({ browser: 'chrome' });

        expect(result.buildId).toBe('138.0.7204.94');
    });

    test('chooses the newest cached build, not the first listed', async () => {
        // Listed oldest-first on purpose: taking entry [0] unsorted, as this used to, would
        // return 150.0.7871.24. Note 151.0.7922.109 sorts *before* 151.0.7922.77 as a plain
        // string, which is why a version-aware comparator is needed.
        getInstalledBrowsers.mockResolvedValue([
            cachedBrowser('chrome', '150.0.7871.24'),
            cachedBrowser('chrome', '151.0.7922.77'),
            cachedBrowser('chrome', '151.0.7922.109'),
        ]);

        const result = await detectAvailableBrowser({ browser: 'chrome' });

        expect(result.buildId).toBe('151.0.7922.109');
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
