import { jest, test, expect, describe, beforeEach } from '@jest/globals';
import fs from 'fs-extra';

// detectBrowserPlatform and resolveBuildId are stubs with no behaviour: they exist only so the
// real browser-version.js can be imported. Uninstall's version handling is deliberately local -
// resolveLocalBrowserBuildId never touches the network - and the tests below assert that these
// two stubs are never called.
jest.unstable_mockModule('@puppeteer/browsers', () => ({
    getInstalledBrowsers: jest.fn(),
    uninstall: jest.fn(),
    detectBrowserPlatform: jest.fn(),
    resolveBuildId: jest.fn(),
}));
const { getInstalledBrowsers, uninstall, detectBrowserPlatform, resolveBuildId } =
    await import('@puppeteer/browsers');

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

describe('browserUninstall — version interpretation (issue #878 review)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('uninstalls the recommended build by keyword, without any network lookup', async () => {
        const pinned = getRecommendedBuildId('chrome');
        getInstalledBrowsers.mockResolvedValue([
            { browser: 'chrome', buildId: pinned, platform: 'mac_arm', path: '/p/1' },
        ]);
        uninstall.mockResolvedValue(undefined);

        const result = await browserUninstall({ browser: 'chrome', browserVersion: 'recommended' });

        expect(result).toBe(true);
        expect(uninstall).toHaveBeenCalledWith(expect.objectContaining({ buildId: pinned }));
        expect(resolveBuildId).not.toHaveBeenCalled();
        expect(detectBrowserPlatform).not.toHaveBeenCalled();
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
        getInstalledBrowsers.mockResolvedValue([
            { browser: 'chrome', buildId: '151.0.7922.77', platform: 'mac_arm', path: '/p/1' },
        ]);
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
        getInstalledBrowsers.mockResolvedValue([
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

describe('browserUninstallAll — race fix', () => {
    let callOrder;
    let emptyDirSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        callOrder = [];
        emptyDirSpy = jest.spyOn(fs, 'emptyDir').mockImplementation(async () => {
            callOrder.push('emptyDir');
        });
    });

    test('awaits every uninstall() before calling fs.emptyDir', async () => {
        getInstalledBrowsers.mockResolvedValue([
            { browser: 'chrome', buildId: '123.0.0.0', platform: 'mac', path: '/p/1' },
            { browser: 'firefox', buildId: '100.0.0.0', platform: 'mac', path: '/p/2' },
        ]);

        uninstall.mockImplementation(async () => {
            callOrder.push('uninstall');
            return undefined;
        });

        await browserUninstallAll({ loglevel: 'info' });

        // Each uninstall must be recorded before emptyDir fires.
        expect(callOrder).toEqual(['uninstall', 'uninstall', 'emptyDir']);
        expect(uninstall).toHaveBeenCalledTimes(2);
        expect(emptyDirSpy).toHaveBeenCalledTimes(1);
    });

    test('continues uninstalling remaining browsers when one throws', async () => {
        getInstalledBrowsers.mockResolvedValue([
            { browser: 'chrome', buildId: '123.0.0.0', platform: 'mac', path: '/p/1' },
            { browser: 'firefox', buildId: '100.0.0.0', platform: 'mac', path: '/p/2' },
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
        // All three uninstalls were attempted in order, then emptyDir cleaned up.
        expect(callOrder).toEqual(['uninstall-1', 'uninstall-2-fail', 'uninstall-3', 'emptyDir']);
        expect(uninstall).toHaveBeenCalledTimes(3);
        expect(emptyDirSpy).toHaveBeenCalledTimes(1);
    });

    test('resolves to true with no uninstall calls and no emptyDir when nothing is installed', async () => {
        getInstalledBrowsers.mockResolvedValue([]);

        const result = await browserUninstallAll({ loglevel: 'info' });

        expect(result).toBe(true);
        expect(uninstall).not.toHaveBeenCalled();
        expect(emptyDirSpy).not.toHaveBeenCalled();
    });
});
