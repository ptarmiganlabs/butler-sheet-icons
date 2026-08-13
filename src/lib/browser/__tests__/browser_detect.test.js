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
    // `mockReturnValue`, not `mockResolvedValue`: the real `detectBrowserPlatform()` is
    // synchronous and returns `BrowserPlatform | undefined`. A promise here would be truthy,
    // match no entry's `platform`, and empty the cache funnel in every test - a failure that
    // looks like a bug in the filter rather than a bug in the mock.
    detectBrowserPlatform: jest.fn().mockReturnValue('mac_arm'),
    resolveBuildId: jest.fn(),
}));
const { getInstalledBrowsers, detectBrowserPlatform } = await import('@puppeteer/browsers');

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

    // `clearMocks` clears call records but keeps implementations, so both of these are set here
    // rather than in the factory: a test that overrides either one would otherwise leak its
    // override into every test that follows it.
    detectBrowserPlatform.mockReturnValue('mac_arm');

    // Path-aware rather than a blanket boolean. Detection now checks that a cached executable
    // exists, so `mockReturnValue(false)` for a missing *system* browser would delete the cached
    // entries too and prove the wrong thing.
    fs.existsSync.mockImplementation((candidate) => String(candidate).startsWith('/cache/'));
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
 * @param {string} [platform] - Puppeteer platform the build was made for. Defaults to the host
 * platform the mocked `detectBrowserPlatform()` reports, so an entry is usable unless a test
 * deliberately says otherwise.
 *
 * @returns {object} Entry with `browser`, `buildId`, `platform` and `executablePath`.
 */
function cachedBrowser(browser, buildId, platform = 'mac_arm') {
    return {
        browser,
        buildId,
        platform,
        executablePath: `/cache/${browser}/${platform}-${buildId}/${browser}`,
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
            executablePath: '/cache/chrome/mac_arm-138.0.7204.94/chrome',
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

describe('detectAvailableBrowser — cached builds this machine cannot run', () => {
    // Issue #943, reproduced against the released 4.0.0 image: a cache staged on the
    // administrator's Mac and copied to a Windows server was accepted, logged as
    // "Using cached browser", and then failed at launch with an unrelated-looking error.
    test('ignores a cached build made for another platform', async () => {
        detectBrowserPlatform.mockReturnValue('win64');
        getInstalledBrowsers.mockResolvedValue([
            cachedBrowser('chrome', '138.0.7204.94', 'mac_arm'),
        ]);

        expect(await detectAvailableBrowser({ browser: 'chrome' })).toBeNull();
    });

    test('names both platforms when the cache was staged on another operating system', async () => {
        detectBrowserPlatform.mockReturnValue('win64');
        getInstalledBrowsers.mockResolvedValue([
            cachedBrowser('chrome', '138.0.7204.94', 'mac_arm'),
            cachedBrowser('chrome', '131.0.6778.204', 'mac_arm'),
        ]);

        await detectAvailableBrowser({ browser: 'chrome' });

        // Both sides of the mismatch have to appear: "wrong platform" alone leaves the reader
        // guessing which machine is wrong, and this text is quoted verbatim by the
        // troubleshooting documentation.
        const warned = logger.warn.mock.calls.map(([msg]) => msg).join('\n');
        expect(warned).toContain('win64');
        expect(warned).toContain('mac_arm');
        expect(warned).toContain('2 cached chrome build(s)');
    });

    test('names the cache directory that was searched', async () => {
        // Quoted verbatim by the troubleshooting documentation, and the single most useful fact
        // in the message now that --browser-cache-dir can point somewhere unexpected.
        detectBrowserPlatform.mockReturnValue('win64');
        getInstalledBrowsers.mockResolvedValue([
            cachedBrowser('chrome', '138.0.7204.94', 'mac_arm'),
        ]);

        await detectAvailableBrowser({ browser: 'chrome', browserCacheDir: '/qlik/browsers' });

        const warned = logger.warn.mock.calls.map(([msg]) => msg).join('\n');
        expect(warned).toContain(path.resolve('/qlik/browsers'));
    });

    test('logs each build it skipped for being unrunnable', async () => {
        // The per-entry lines are what let a support log account for every build the funnel
        // discarded; the summary warning only gives counts.
        detectBrowserPlatform.mockReturnValue('win64');
        getInstalledBrowsers.mockResolvedValue([
            cachedBrowser('chrome', '138.0.7204.94', 'mac_arm'),
        ]);

        await detectAvailableBrowser({ browser: 'chrome' });

        const verbose = logger.verbose.mock.calls.map(([msg]) => msg).join('\n');
        expect(verbose).toContain('138.0.7204.94');
        expect(verbose).toContain('mac_arm');
    });

    test('logs each build it skipped for a missing executable', async () => {
        getInstalledBrowsers.mockResolvedValue([cachedBrowser('chrome', '138.0.7204.94')]);
        fs.existsSync.mockReturnValue(false);

        await detectAvailableBrowser({ browser: 'chrome' });

        const verbose = logger.verbose.mock.calls.map(([msg]) => msg).join('\n');
        expect(verbose).toContain('executable not found');
        expect(verbose).toContain('138.0.7204.94');
    });

    test('accepts a 32-bit Windows build on a 64-bit Windows host', async () => {
        // WOW64 has been standard for two decades, so rejecting this would break a setup that
        // works - and offline, a rejection means a download that cannot succeed.
        detectBrowserPlatform.mockReturnValue('win64');
        getInstalledBrowsers.mockResolvedValue([cachedBrowser('chrome', '138.0.7204.94', 'win32')]);

        const result = await detectAvailableBrowser({ browser: 'chrome' });

        expect(result?.buildId).toBe('138.0.7204.94');
        expect(logger.warn).not.toHaveBeenCalled();
    });

    test('accepts an Intel macOS build on Apple Silicon', async () => {
        // Runs under Rosetta 2. Optimistic if Rosetta is absent, but that was the behaviour
        // before cached builds were filtered at all, and it still fails at launch as it did.
        detectBrowserPlatform.mockReturnValue('mac_arm');
        getInstalledBrowsers.mockResolvedValue([cachedBrowser('chrome', '138.0.7204.94', 'mac')]);

        const result = await detectAvailableBrowser({ browser: 'chrome' });

        expect(result?.buildId).toBe('138.0.7204.94');
    });

    test('still rejects a Windows build on macOS', async () => {
        // The compatibility rule widens equality; it does not abandon it.
        detectBrowserPlatform.mockReturnValue('mac_arm');
        getInstalledBrowsers.mockResolvedValue([cachedBrowser('chrome', '138.0.7204.94', 'win64')]);

        expect(await detectAvailableBrowser({ browser: 'chrome' })).toBeNull();
    });

    test('does not filter by platform when the host platform is unknown', async () => {
        // `detectBrowserPlatform()` returns undefined off darwin/linux/win32. Filtering on that
        // would empty the funnel and break a setup that works today.
        detectBrowserPlatform.mockReturnValue(undefined);
        // A real BrowserPlatform value, and deliberately not the host's: with no host platform
        // to compare against, even a foreign build has to survive the filter.
        getInstalledBrowsers.mockResolvedValue([cachedBrowser('chrome', '138.0.7204.94', 'linux')]);

        const result = await detectAvailableBrowser({ browser: 'chrome' });

        expect(result?.buildId).toBe('138.0.7204.94');
    });

    test('ignores a cached build whose executable is missing', async () => {
        // What a `tar` invocation that skips dotfiles produces: the directory is there and
        // parses, but `computeExecutablePath()` points at a file that was never copied.
        getInstalledBrowsers.mockResolvedValue([cachedBrowser('chrome', '138.0.7204.94')]);
        fs.existsSync.mockReturnValue(false);

        expect(await detectAvailableBrowser({ browser: 'chrome' })).toBeNull();
    });

    test('says the cache may be incomplete when no executable is present', async () => {
        getInstalledBrowsers.mockResolvedValue([cachedBrowser('chrome', '138.0.7204.94')]);
        fs.existsSync.mockReturnValue(false);

        await detectAvailableBrowser({ browser: 'chrome' });

        const warned = logger.warn.mock.calls.map(([msg]) => msg).join('\n');
        expect(warned).toContain('usable executable');
    });

    test('stays quiet when a usable build sits beside an unusable one', async () => {
        // The funnel never empties here, so a single stale directory in an otherwise healthy
        // cache must not produce a warning. Warn on every successful run and administrators
        // learn to ignore the warnings that matter.
        getInstalledBrowsers.mockResolvedValue([
            cachedBrowser('chrome', '131.0.6778.204', 'win64'),
            cachedBrowser('chrome', '138.0.7204.94'),
        ]);

        const result = await detectAvailableBrowser({ browser: 'chrome' });

        expect(result?.buildId).toBe('138.0.7204.94');
        expect(logger.warn).not.toHaveBeenCalled();
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
        // Saying "no browsers of type chrome" here, as this once did, sends the reader looking
        // for the wrong problem. The report was a debug line until the cache funnel landed; a
        // pin that misses on an offline machine is a failed run, so it is now a warning.
        getInstalledBrowsers.mockResolvedValue([cachedBrowser('chrome', '138.0.7204.94')]);

        await detectAvailableBrowser({ browser: 'chrome' }, '121.0.6167.85');

        const warned = logger.warn.mock.calls.map(([msg]) => msg).join('\n');
        expect(warned).toContain('No cached chrome build matches');
        expect(warned).not.toContain('matching type');
    });

    test('names the usable cached builds when the pin misses', async () => {
        // The pin missed but the machine does have a browser it can run. Offline that is the
        // difference between a fixable situation and a run that dies on a download it can
        // never make, so the alternatives have to be named rather than logged at debug.
        getInstalledBrowsers.mockResolvedValue([cachedBrowser('chrome', '138.0.7204.94')]);

        await detectAvailableBrowser(
            { browser: 'chrome', browserVersion: '121.0.6167.85' },
            '121.0.6167.85'
        );

        const warned = logger.warn.mock.calls.map(([msg]) => msg).join('\n');
        expect(warned).toContain('138.0.7204.94');
        expect(warned).toContain('121.0.6167.85');
        expect(warned).toContain('internet access');
    });

    test('quotes the version the user set, not the build it resolved to', async () => {
        // `recommended` is the default, and resolves from a constant to a concrete build. Naming
        // the resolved id as the value of --browser-version describes a command line nobody
        // typed, and sends the reader hunting through scheduled tasks for a version they never
        // set.
        getInstalledBrowsers.mockResolvedValue([cachedBrowser('chrome', '131.0.6778.204')]);

        await detectAvailableBrowser(
            { browser: 'chrome', browserVersion: 'recommended' },
            '138.0.7204.94'
        );

        const warned = logger.warn.mock.calls.map(([msg]) => msg).join('\n');
        expect(warned).toContain('--browser-version "recommended"');
        expect(warned).toContain('build 138.0.7204.94');
    });

    test('does not advise --browser-version latest, which is also an exact pin', async () => {
        // Since issue #878 every version resolves to exactly one build before the cache is
        // searched, so `latest` misses in precisely the same way. Advising it would send the
        // administrator round the same loop with a different build id.
        getInstalledBrowsers.mockResolvedValue([cachedBrowser('chrome', '138.0.7204.94')]);

        await detectAvailableBrowser(
            { browser: 'chrome', browserVersion: 'latest' },
            '121.0.6167.85'
        );

        const warned = logger.warn.mock.calls.map(([msg]) => msg).join('\n');
        expect(warned).not.toContain('--browser-version latest');
        expect(warned).toContain('Set --browser-version to one of those build ids');
    });

    test('does not offer alternatives that this machine cannot run', async () => {
        // The pinned build is absent and the only other cached build is foreign. Listing it as
        // an alternative would send the administrator to a build that fails at launch.
        detectBrowserPlatform.mockReturnValue('win64');
        getInstalledBrowsers.mockResolvedValue([
            cachedBrowser('chrome', '138.0.7204.94', 'mac_arm'),
        ]);

        await detectAvailableBrowser({ browser: 'chrome' }, '121.0.6167.85');

        const warned = logger.warn.mock.calls.map(([msg]) => msg).join('\n');
        expect(warned).toContain('mac_arm');
        expect(warned).not.toContain('Use --browser-version latest');
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
        fs.existsSync.mockImplementation(
            (candidate) =>
                candidate === '/usr/bin/chromium-browser' || String(candidate).startsWith('/cache/')
        );

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
        // The default implementation already answers `false` for this path and `true` for the
        // cached executable. A blanket `mockReturnValue(false)` would also hide the cached build
        // and turn a fall-through test into a no-browser-anywhere test.
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
