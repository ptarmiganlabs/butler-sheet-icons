import { jest, test, expect, describe, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';

// resolveBuildId is a stub with no behaviour: it exists only so the real
// browser-version.js can be imported. Uninstall's version handling is
// deliberately local - resolveLocalBrowserBuildId never touches the network -
// and the tests below assert that it is never called.
//
// detectBrowserPlatform is different. It used to be in the same category, but
// the inventory now calls it to work out which cached builds can run here. That
// is a local, synchronous read of process.platform and process.arch, so the
// offline guarantee is untouched; only the network lookup ever mattered.
jest.unstable_mockModule('@puppeteer/browsers', () => ({
    getInstalledBrowsers: jest.fn(),
    uninstall: jest.fn(),
    detectBrowserPlatform: jest.fn(),
    resolveBuildId: jest.fn(),
}));
const { getInstalledBrowsers, uninstall, detectBrowserPlatform, resolveBuildId } =
    await import('@puppeteer/browsers');

/**
 * Makes the cache appear to change as uninstall() removes things from it.
 *
 * Uninstall now re-reads the cache afterwards and reports on what it finds, so
 * a test whose cache never changes is describing a failed removal. Feeding the
 * successive states explicitly is what keeps "it worked" and "it was attempted"
 * distinguishable.
 *
 * @param {...Array} states - One array of cached builds per read, in order.
 *
 * @returns {void}
 */
const cacheReads = (...states) => {
    getInstalledBrowsers.mockReset();
    for (const state of states) {
        getInstalledBrowsers.mockResolvedValueOnce(state);
    }
    // Any read past the ones listed sees the final state.
    getInstalledBrowsers.mockResolvedValue(states.at(-1) ?? []);
};

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    },
    setLoggingLevel: jest.fn(),
    bsiExecutablePath: '/test/path',
    isSea: false,
}));
const { logger } = await import('../../../globals.js');

// The real module, not a mock: uninstall's local-only version interpretation is part of what
// these tests cover, and a stub with different semantics would let it drift unnoticed.
const { getRecommendedBuildId } = await import('../browser-version.js');

const { browserUninstall, browserUninstallAll } = await import('../browser-uninstall.js');

// The real list, not a copy: a test that spelled out the subdirectories again would keep
// passing after the two drifted apart.
const { BROWSER_CACHE_SUBDIRS } = await import('../browser-paths.js');

// Ambient, and behaviour-affecting since the cache directory became configurable.
const SAVED_ENV = {
    BSI_BROWSER_CACHE_DIR: process.env.BSI_BROWSER_CACHE_DIR,
    PUPPETEER_CACHE_DIR: process.env.PUPPETEER_CACHE_DIR,
};

beforeEach(() => {
    delete process.env.BSI_BROWSER_CACHE_DIR;
    delete process.env.PUPPETEER_CACHE_DIR;
});

afterEach(() => {
    for (const [name, value] of Object.entries(SAVED_ENV)) {
        if (value === undefined) {
            delete process.env[name];
        } else {
            process.env[name] = value;
        }
    }
});

describe('browserUninstall — version interpretation (issue #878 review)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('uninstalls the recommended build by keyword, without any network lookup', async () => {
        const pinned = getRecommendedBuildId('chrome');
        cacheReads([{ browser: 'chrome', buildId: pinned, platform: 'mac_arm', path: '/p/1' }], []);
        uninstall.mockResolvedValue(undefined);

        const result = await browserUninstall({ browser: 'chrome', browserVersion: 'recommended' });

        expect(result).toBe(true);
        expect(uninstall).toHaveBeenCalledWith(expect.objectContaining({ buildId: pinned }));
        expect(resolveBuildId).not.toHaveBeenCalled();
    });

    // `stable` and `latest` resolve to whatever the vendor currently publishes - almost never a
    // build in the local cache - so accepting them here either deleted the wrong build or
    // reported "not found" after a pointless network round trip. They are refused with guidance
    // before the cache is even read.
    test.each([['stable'], ['latest'], ['beta']])(
        'refuses the floating "%s" without touching the cache or the network',
        async (browserVersion) => {
            const result = await browserUninstall({ browser: 'chrome', browserVersion });

            expect(result).toBe(false);
            expect(uninstall).not.toHaveBeenCalled();
            expect(getInstalledBrowsers).not.toHaveBeenCalled();
            expect(resolveBuildId).not.toHaveBeenCalled();

            const advice = logger.error.mock.calls.map(([msg]) => msg).join('\n');
            expect(advice).toContain('list-installed');
        }
    );

    test('matches an exact build id against the cache', async () => {
        cacheReads(
            [{ browser: 'chrome', buildId: '151.0.7922.77', platform: 'mac_arm', path: '/p/1' }],
            []
        );
        uninstall.mockResolvedValue(undefined);

        const result = await browserUninstall({
            browser: 'chrome',
            browserVersion: '151.0.7922.77',
        });

        expect(result).toBe(true);
        expect(uninstall).toHaveBeenCalledWith(
            expect.objectContaining({ buildId: '151.0.7922.77' })
        );
    });

    test('reports a build that is not cached without throwing', async () => {
        cacheReads([
            { browser: 'chrome', buildId: '151.0.7922.77', platform: 'mac_arm', path: '/p/1' },
        ]);

        const result = await browserUninstall({
            browser: 'chrome',
            browserVersion: '99.0.1234.56',
        });

        expect(result).toBe(false);
        expect(uninstall).not.toHaveBeenCalled();
    });
});

describe('browserUninstall — platform handling (issue #892)', () => {
    const FOREIGN = {
        browser: 'chrome',
        buildId: '151.0.7922.77',
        platform: 'win64',
        path: '/p/win',
    };
    const LOCAL = {
        browser: 'chrome',
        buildId: '151.0.7922.77',
        platform: 'mac_arm',
        path: '/p/mac',
    };

    beforeEach(() => {
        jest.clearAllMocks();
        detectBrowserPlatform.mockReturnValue('mac_arm');
        uninstall.mockResolvedValue(undefined);
    });

    test('names the platform of the build being removed', async () => {
        // UninstallOptions.platform is documented "auto-detected", so leaving it
        // out targeted the *host* platform's directory. For a build downloaded
        // elsewhere that directory does not exist, the call resolved anyway, and
        // the build stayed on disk while success was reported.
        cacheReads([FOREIGN], []);

        await browserUninstall({ browser: 'chrome', browserVersion: '151.0.7922.77' });

        expect(uninstall).toHaveBeenCalledWith(expect.objectContaining({ platform: 'win64' }));
    });

    test('reports failure when the build is still cached afterwards', async () => {
        // The heart of the bug: uninstall() resolves whether or not it removed
        // anything, so the only honest way to claim success is to look again.
        cacheReads([FOREIGN], [FOREIGN]);

        const result = await browserUninstall({
            browser: 'chrome',
            browserVersion: '151.0.7922.77',
        });

        expect(result).toBe(false);

        const errors = logger.error.mock.calls.map(([msg]) => msg).join('\n');
        expect(errors).toContain('could not be removed');
        expect(errors).toContain('win64');
        expect(errors).toContain('/p/win');
    });

    test('prefers the build that can run here when one id is cached for two platforms', async () => {
        // Previously this was whichever entry the filesystem listed first.
        cacheReads([FOREIGN, LOCAL], [FOREIGN]);

        const result = await browserUninstall({
            browser: 'chrome',
            browserVersion: '151.0.7922.77',
        });

        expect(result).toBe(true);
        expect(uninstall).toHaveBeenCalledWith(expect.objectContaining({ platform: 'mac_arm' }));
    });

    test('says so when a build id is cached for more than one platform', async () => {
        cacheReads([FOREIGN, LOCAL], [FOREIGN]);

        await browserUninstall({ browser: 'chrome', browserVersion: '151.0.7922.77' });

        const warnings = logger.warn.mock.calls.map(([msg]) => msg).join('\n');
        expect(warnings).toContain('2 platforms');
        expect(warnings).toContain('win64');
        expect(warnings).toContain('re-run');
    });

    test('removes a foreign-platform build when it is the only match', async () => {
        // Foreign builds stay removable on purpose - wanting the disk space
        // back is a perfectly good reason to delete a build you cannot run.
        cacheReads([FOREIGN], []);

        const result = await browserUninstall({
            browser: 'chrome',
            browserVersion: '151.0.7922.77',
        });

        expect(result).toBe(true);
    });
});

describe('browserUninstallAll — race fix', () => {
    let callOrder;
    let emptyDirSpy;
    let removeSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        callOrder = [];
        emptyDirSpy = jest.spyOn(fs, 'emptyDir').mockImplementation(async () => {
            callOrder.push('emptyDir');
        });
        removeSpy = jest.spyOn(fs, 'remove').mockImplementation(async () => {
            // One entry however many subdirectories are swept, so the ordering
            // assertions below stay about uninstall-before-cleanup.
            if (callOrder.at(-1) !== 'cleanup') {
                callOrder.push('cleanup');
            }
        });
    });

    test('awaits every uninstall() before cleaning up', async () => {
        getInstalledBrowsers.mockResolvedValue([
            { browser: 'chrome', buildId: '123.0.0.0', platform: 'mac', path: '/p/1' },
            {
                browser: 'chrome-headless-shell',
                buildId: '100.0.0.0',
                platform: 'mac',
                path: '/p/2',
            },
        ]);

        uninstall.mockImplementation(async () => {
            callOrder.push('uninstall');
            return undefined;
        });

        await browserUninstallAll({ loglevel: 'info' });

        // Each uninstall must be recorded before the cleanup fires.
        expect(callOrder).toEqual(['uninstall', 'uninstall', 'cleanup']);
        expect(uninstall).toHaveBeenCalledTimes(2);
        expect(removeSpy).toHaveBeenCalled();
    });

    test('continues uninstalling remaining browsers when one throws', async () => {
        getInstalledBrowsers.mockResolvedValue([
            { browser: 'chrome', buildId: '123.0.0.0', platform: 'mac', path: '/p/1' },
            {
                browser: 'chrome-headless-shell',
                buildId: '100.0.0.0',
                platform: 'mac',
                path: '/p/2',
            },
            { browser: 'chrome', buildId: '124.0.0.0', platform: 'mac', path: '/p/3' },
        ]);

        uninstall
            .mockImplementationOnce(async () => {
                callOrder.push('uninstall-1');
                return undefined;
            })
            .mockImplementationOnce(async () => {
                callOrder.push('uninstall-2-fail');
                throw new Error('disk gone');
            })
            .mockImplementationOnce(async () => {
                callOrder.push('uninstall-3');
                return undefined;
            });

        const result = await browserUninstallAll({ loglevel: 'info' });

        expect(result).toBe(true);
        // All three uninstalls were attempted in order, then the cleanup ran.
        expect(callOrder).toEqual(['uninstall-1', 'uninstall-2-fail', 'uninstall-3', 'cleanup']);
        expect(uninstall).toHaveBeenCalledTimes(3);
        expect(removeSpy).toHaveBeenCalled();
    });

    test('resolves to true with no uninstall calls and no cleanup when nothing is installed', async () => {
        getInstalledBrowsers.mockResolvedValue([]);

        const result = await browserUninstallAll({ loglevel: 'info' });

        expect(result).toBe(true);
        expect(uninstall).not.toHaveBeenCalled();
        expect(removeSpy).not.toHaveBeenCalled();
        expect(emptyDirSpy).not.toHaveBeenCalled();
    });
});

describe('browserUninstallAll — only removes what it owns', () => {
    let removeSpy;
    let emptyDirSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        emptyDirSpy = jest.spyOn(fs, 'emptyDir').mockResolvedValue(undefined);
        removeSpy = jest.spyOn(fs, 'remove').mockResolvedValue(undefined);
        getInstalledBrowsers.mockResolvedValue([
            { browser: 'chrome', buildId: '123.0.0.0', platform: 'mac_arm', path: '/p/1' },
        ]);
        uninstall.mockResolvedValue(undefined);
    });

    // The blast radius used to be bounded by the cache path being hardcoded. With
    // --browser-cache-dir it is not: BSI_BROWSER_CACHE_DIR=D:\qlik would have made this
    // command empty a directory Butler Sheet Icons does not own.
    test('never empties the cache directory itself', async () => {
        await browserUninstallAll({ loglevel: 'info', browserCacheDir: '/qlik/browsers' });

        expect(emptyDirSpy).not.toHaveBeenCalled();
        expect(removeSpy).not.toHaveBeenCalledWith(path.resolve('/qlik/browsers'));
    });

    test('sweeps only the browser subdirectories of the cache', async () => {
        await browserUninstallAll({ loglevel: 'info', browserCacheDir: '/qlik/browsers' });

        const removed = removeSpy.mock.calls.map(([target]) => target);
        const cacheDir = path.resolve('/qlik/browsers');

        expect(removed).toEqual(BROWSER_CACHE_SUBDIRS.map((subdir) => path.join(cacheDir, subdir)));
    });

    test('uninstalls from the directory named by --browser-cache-dir', async () => {
        await browserUninstallAll({ loglevel: 'info', browserCacheDir: '/qlik/browsers' });

        expect(getInstalledBrowsers).toHaveBeenCalledWith({
            cacheDir: path.resolve('/qlik/browsers'),
        });
        expect(uninstall).toHaveBeenCalledWith(
            expect.objectContaining({ cacheDir: path.resolve('/qlik/browsers') })
        );
    });
});

describe('browserUninstall — cache directory', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('removes the build from the directory named by --browser-cache-dir', async () => {
        cacheReads(
            [{ browser: 'chrome', buildId: '151.0.7922.77', platform: 'mac_arm', path: '/p/1' }],
            []
        );
        uninstall.mockResolvedValue(undefined);

        await browserUninstall({
            browser: 'chrome',
            browserVersion: '151.0.7922.77',
            browserCacheDir: '/qlik/browsers',
        });

        expect(uninstall).toHaveBeenCalledWith(
            expect.objectContaining({ cacheDir: path.resolve('/qlik/browsers') })
        );
    });
});
