import { jest, test, expect, describe, beforeEach } from '@jest/globals';
import fs from 'fs-extra';

jest.unstable_mockModule('@puppeteer/browsers', () => ({
    getInstalledBrowsers: jest.fn(),
    uninstall: jest.fn(),
}));
const { getInstalledBrowsers, uninstall } = await import('@puppeteer/browsers');

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
await import('../../../globals.js');

const { browserUninstallAll } = await import('../browser-uninstall.js');

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
