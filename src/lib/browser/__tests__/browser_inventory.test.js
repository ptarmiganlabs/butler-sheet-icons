import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import path from 'path';

const getInstalledBrowsers = jest.fn();
const detectBrowserPlatform = jest.fn(() => 'mac_arm');

jest.unstable_mockModule('@puppeteer/browsers', () => ({
    getInstalledBrowsers,
    detectBrowserPlatform,
}));

jest.unstable_mockModule('os', () => ({
    default: { homedir: () => '/home/tester' },
    homedir: () => '/home/tester',
}));

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
    },
    // browser-paths.js gates the standalone cache location on this, and ESM checks
    // named exports when the module graph is linked, so leaving it out is a hard error
    // rather than an undefined.
    isSea: false,
}));

const { getBrowserInventory } = await import('../browser-inventory.js');
const { redactValue } = await import('../../util/redact-secrets.js');

/**
 * Stands in for the `InstalledBrowser` class from `@puppeteer/browsers`, where
 * `path` is a getter over a private cache reference and `executablePath` is a
 * readonly field - which is why the real ones cannot be spread or JSON
 * round-tripped, and why redaction flattens them.
 */
class FakeInstalledBrowser {
    #root;

    /**
     * Build a stand-in for one cached browser.
     *
     * @param {object} build - The build to represent.
     * @param {string} build.browser - Browser name.
     * @param {string} build.buildId - Exact build id.
     * @param {string} build.platform - Platform the build was downloaded for.
     * @param {string} build.root - Installation folder, exposed through the `path` getter.
     */
    constructor({ browser, buildId, platform, root }) {
        this.browser = browser;
        this.buildId = buildId;
        this.platform = platform;
        this.#root = root;
        this.executablePath = `${root}/chrome-mac-arm64/chrome`;
    }

    /**
     * The installation folder, as a getter over private state.
     *
     * A getter rather than a field on purpose: this is what makes the real
     * objects impossible to spread or clone without silently losing the value.
     *
     * @returns {string} Path to the installation folder.
     */
    get path() {
        return this.#root;
    }
}

const fakeBuild = (overrides = {}) =>
    new FakeInstalledBrowser({
        browser: 'chrome',
        buildId: '151.0.7922.77',
        platform: 'mac_arm',
        root: '/home/tester/.cache/puppeteer/chrome/mac_arm-151.0.7922.77',
        ...overrides,
    });

beforeEach(() => {
    jest.clearAllMocks();
    detectBrowserPlatform.mockReturnValue('mac_arm');
    getInstalledBrowsers.mockResolvedValue([fakeBuild()]);
});

// Resolving the cache directory moved to browser-paths.js when it grew tiers, and is covered
// in full by browser_paths.test.js. What matters here is only that this module still asks it.

describe('getBrowserInventory', () => {
    test('defaults to the standard cache directory', async () => {
        await getBrowserInventory();

        expect(getInstalledBrowsers).toHaveBeenCalledWith({
            cacheDir: path.join('/home/tester', '.cache/puppeteer'),
        });
    });

    test('reads an explicitly supplied cache directory', async () => {
        await getBrowserInventory({ cacheDir: '/opt/shared-cache' });

        expect(getInstalledBrowsers).toHaveBeenCalledWith({ cacheDir: '/opt/shared-cache' });
    });

    test('carries both the installation folder and the binary', async () => {
        // The codebase has used `path` in one place and `executablePath` in
        // another; with names this close, an inventory that exposed only one
        // would guarantee the wrong one gets used somewhere.
        const [entry] = await getBrowserInventory();

        expect(entry.path).toBe('/home/tester/.cache/puppeteer/chrome/mac_arm-151.0.7922.77');
        expect(entry.executablePath).toBe(
            '/home/tester/.cache/puppeteer/chrome/mac_arm-151.0.7922.77/chrome-mac-arm64/chrome'
        );
    });

    test('flattens the class instances into plain objects', async () => {
        const [entry] = await getBrowserInventory();

        expect(Object.getPrototypeOf(entry)).toBe(Object.prototype);
        expect(entry).toEqual({
            browser: 'chrome',
            buildId: '151.0.7922.77',
            platform: 'mac_arm',
            path: '/home/tester/.cache/puppeteer/chrome/mac_arm-151.0.7922.77',
            executablePath:
                '/home/tester/.cache/puppeteer/chrome/mac_arm-151.0.7922.77/chrome-mac-arm64/chrome',
            isCurrentPlatform: true,
        });
    });

    test('survives redaction, which the class instances do not', async () => {
        // redactValue() returns '***redacted***' for anything whose prototype
        // is not Object.prototype, so the previous return value became a wall
        // of markers the moment a caller logged it at debug level.
        const inventory = await getBrowserInventory();

        expect(redactValue(inventory)).toEqual(inventory);
        expect(redactValue([fakeBuild()])).toEqual(['***redacted***']);
    });

    test('preserves the order the cache reports', async () => {
        getInstalledBrowsers.mockResolvedValue([
            fakeBuild({ buildId: '150.0.0.1' }),
            fakeBuild({ buildId: '151.0.7922.77' }),
        ]);

        const inventory = await getBrowserInventory();

        expect(inventory.map((b) => b.buildId)).toEqual(['150.0.0.1', '151.0.7922.77']);
    });

    test('returns an empty array for an empty cache', async () => {
        getInstalledBrowsers.mockResolvedValue([]);

        await expect(getBrowserInventory()).resolves.toEqual([]);
    });

    test('does not swallow a failure to read the cache', async () => {
        // browser-detect.js returns null on error; this one must throw, because
        // its caller reports the failure to the operator.
        getInstalledBrowsers.mockRejectedValue(new Error('EACCES: permission denied'));

        await expect(getBrowserInventory()).rejects.toThrow('EACCES: permission denied');
    });
});

describe('isCurrentPlatform', () => {
    test('is true for a build matching the host', async () => {
        const [entry] = await getBrowserInventory();

        expect(entry.isCurrentPlatform).toBe(true);
    });

    test('is false for a build downloaded for another platform', async () => {
        getInstalledBrowsers.mockResolvedValue([fakeBuild({ platform: 'win64' })]);

        const [entry] = await getBrowserInventory();

        expect(entry.isCurrentPlatform).toBe(false);
    });

    test('is true when the host platform cannot be detected', async () => {
        detectBrowserPlatform.mockReturnValue(undefined);
        getInstalledBrowsers.mockResolvedValue([fakeBuild({ platform: 'win64' })]);

        const [entry] = await getBrowserInventory();

        expect(entry.isCurrentPlatform).toBe(true);
    });

    test('detects the host platform once, not once per build', async () => {
        getInstalledBrowsers.mockResolvedValue([fakeBuild(), fakeBuild(), fakeBuild()]);

        await getBrowserInventory();

        expect(detectBrowserPlatform).toHaveBeenCalledTimes(1);
    });
});
