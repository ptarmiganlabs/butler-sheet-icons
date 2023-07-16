/* eslint-disable no-console */
const { test, expect, describe } = require('@jest/globals');

const { browserInstalled } = require('../lib/browser/browser-installed');
const { browserInstall } = require('../lib/browser/browser-install');
const { browserUninstallAll } = require('../lib/browser/browser-uninstall');

const defaultTestTimeout = process.env.BSI_TEST_TIMEOUT || 600000; // 10 minute default timeout

console.log(`Jest timeout: ${defaultTestTimeout}`);

const options = {
    loglevel: process.env.BSI_LOG_LEVEL || 'info',
};

jest.setTimeout(defaultTestTimeout);

describe('test browser list_installed command', () => {
    /**
     * List installed browsers
     * Should return an array of installed browser, zero or more entries
     */
    test('list installed browsers, should be zero or more', async () => {
        const installedBrowsers = await browserInstalled(options);
        expect(installedBrowsers.length).toBeGreaterThanOrEqual(0);
    });
});

describe('complex/combiation scenarios', () => {
    /**
     * Remove all installed browsers
     * Should return true.
     *
     * Install four differenct browsers (3 chrome versions, 1 firefox).
     * There should now be four installed browsers
     *
     * Remove all installed browsers.
     * Should return true.
     *
     * There should then be zero installed browsers.
     */
    test('install and uninstall several browsers', async () => {
        // Remove all installed browsers
        const uninstallRes1 = await browserUninstallAll(options);
        expect(uninstallRes1).toEqual(true);

        // There should now be zero installed browsers
        const installedBrowsers1 = await browserInstalled(options);
        expect(installedBrowsers1.length).toEqual(0);

        // Install four different browsers
        await browserInstall({ browser: 'chrome', browserVersion: 'stable' }); // Same as previous, should not install another browser
        await browserInstall({ browser: 'chrome', browserVersion: 'dev' });
        await browserInstall({ browser: 'chrome', browserVersion: 'canary' });
        await browserInstall({ browser: 'firefox', browserVersion: 'latest' }); // Same as previous, should not install another browser

        // There should now be four installed browsers
        const installedBrowsers2 = await browserInstalled(options);
        expect(installedBrowsers2.length).toEqual(4);

        // Remove all installed browsers
        const uninstallRes2 = await browserUninstallAll(options);
        expect(uninstallRes2).toEqual(true);

        // There should now be zero installed browsers
        const installedBrowsers3 = await browserInstalled(options);
        expect(installedBrowsers3.length).toEqual(0);
    });
});

describe('install/uninstall browser scenarios', () => {
    /**
     * Install a browser that exists
     * Should return true.
     * There should then be one installed browser.
     */
    test('install a browser that exists', async () => {
        // Remove all installed browsers
        const uninstallRes1 = await browserUninstallAll(options);
        expect(uninstallRes1).toEqual(true);

        // There should now be zero installed browsers
        const installedBrowsers1 = await browserInstalled(options);
        expect(installedBrowsers1.length).toEqual(0);

        // Install a browser
        await browserInstall({ browser: 'chrome', browserVersion: 'stable' });

        // There should now be one installed browser
        const installedBrowsers2 = await browserInstalled(options);
        expect(installedBrowsers2.length).toEqual(1);

        // Remove all installed browsers
        const uninstallRes2 = await browserUninstallAll(options);
        expect(uninstallRes2).toEqual(true);

        // There should now be zero installed browsers
        const installedBrowsers3 = await browserInstalled(options);
        expect(installedBrowsers3.length).toEqual(0);
    });

    /**
     * Install a browser that does not exist
     * Should throw an error.
     * There should then be zero installed browsers.
     */
    test('install a browser that does not exist', async () => {
        // Remove all installed browsers
        const uninstallRes1 = await browserUninstallAll(options);
        expect(uninstallRes1).toEqual(true);

        // There should now be zero installed browsers
        const installedBrowsers1 = await browserInstalled(options);
        expect(installedBrowsers1.length).toEqual(0);

        // Install a browser
        await expect(
            browserInstall({ browser: 'chrome', browserVersion: 'non-existent' })
        ).rejects.toThrow();

        // There should now be zero installed browsers
        const installedBrowsers2 = await browserInstalled(options);
        expect(installedBrowsers2.length).toEqual(0);
    });
});
