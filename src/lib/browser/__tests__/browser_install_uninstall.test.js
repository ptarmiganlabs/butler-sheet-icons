const { test, expect, describe } = require('@jest/globals');

const { browserInstalled } = require('../browser-installed.js');
const { browserInstall } = require('../browser-install.js');
const { browserUninstallAll } = require('../browser-uninstall.js');
const defaultTestTimeout = process.env.BSI_TEST_TIMEOUT || 1800000; // 20 minute default timeout

console.log(`Jest timeout: ${defaultTestTimeout}`);

const options = {
    loglevel: process.env.BSI_LOG_LEVEL || 'info',
};

describe('install/uninstall browser scenarios', () => {
    /**
     * Install a stable Chrome version that exists
     * Should return true.
     * There should then be one installed browser.
     */
    test(
        'install latest stable Chrome version that Puppeteer supports',
        async () => {
            // Remove all installed browsers
            const uninstallRes1 = await browserUninstallAll(options);
            expect(uninstallRes1).toEqual(true);

            // There should now be zero installed browsers
            const installedBrowsers1 = await browserInstalled(options);
            expect(installedBrowsers1.length).toEqual(0);

            // Install a browser
            // Returns a browser object
            const browserInstallRes1 = await browserInstall({
                browser: 'chrome',
                browserVersion: 'latest',
            });
            expect(browserInstallRes1).toBeTruthy();

            // There should now be one installed browser
            const installedBrowsers2 = await browserInstalled(options);
            expect(installedBrowsers2.length).toEqual(1);

            // Remove all installed browsers
            const uninstallRes2 = await browserUninstallAll(options);
            expect(uninstallRes2).toEqual(true);

            // There should now be zero installed browsers
            const installedBrowsers3 = await browserInstalled(options);
            expect(installedBrowsers3.length).toEqual(0);
        },
        defaultTestTimeout
    );

    /**
     * Install a browser that does not exist
     * Should throw an error.
     * There should then be zero installed browsers.
     */
    test(
        'install a browser that does not exist',
        async () => {
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
        },
        defaultTestTimeout
    );

    /**
     * Install a browser that exists, then uninstall it
     */
    test(
        'install a browser that exists, then uninstall it',
        async () => {
            // Remove all installed browsers
            const uninstallRes1 = await browserUninstallAll(options);
            expect(uninstallRes1).toEqual(true);

            // There should now be zero installed browsers
            const installedBrowsers1 = await browserInstalled(options);
            expect(installedBrowsers1.length).toEqual(0);

            // Install a browser
            // Returns a browser object
            const browserInstallRes1 = await browserInstall({
                browser: 'chrome',
                browserVersion: '114.0.5735.133',
            });
            expect(browserInstallRes1).toBeTruthy();

            // There should now be one installed browser
            const installedBrowsers2 = await browserInstalled(options);
            expect(installedBrowsers2.length).toEqual(1);

            // Uninstall the browser
            const uninstallRes2 = await browserUninstallAll({
                browser: 'chrome',
                browserVersion: '114.0.5735.133',
            });
            expect(uninstallRes2).toEqual(true);

            // There should now be zero installed browsers
            const installedBrowsers3 = await browserInstalled(options);
            expect(installedBrowsers3.length).toEqual(0);
        },
        defaultTestTimeout
    );
});
