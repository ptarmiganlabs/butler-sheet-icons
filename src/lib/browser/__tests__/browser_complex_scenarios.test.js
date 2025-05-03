import { test, expect, describe } from '@jest/globals';

import { browserInstalled } from '../browser-installed.js';
import { browserInstall } from '../browser-install.js';
import { browserUninstallAll } from '../browser-uninstall.js';

const defaultTestTimeout = process.env.BSI_TEST_TIMEOUT || 1800000; // 20 minute default timeout
console.log(`Jest timeout: ${defaultTestTimeout}`);

const options = {
    loglevel: process.env.BSI_LOG_LEVEL || 'info',
};

describe('complex scenarios', () => {
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
    test(
        'install and uninstall several browsers',
        async () => {
            // Remove all installed browsers
            const uninstallRes1 = await browserUninstallAll(options);
            expect(uninstallRes1).toEqual(true);

            // There should now be zero installed browsers
            const installedBrowsers1 = await browserInstalled(options);
            expect(installedBrowsers1.length).toEqual(0);

            // Install four different browsers

            // Latest Chrome from stable channel
            const browserInstallRes1 = await browserInstall({
                browser: 'chrome',
                browserVersion: 'latest',
            });
            expect(browserInstallRes1).toBeTruthy();

            // From the beta channel
            const browserInstallRes2 = await browserInstall({
                browser: 'chrome',
                browserVersion: '121.0.6167.16',
            });
            expect(browserInstallRes2).toBeTruthy();

            // From the dev channel
            const browserInstallRes3 = await browserInstall({
                browser: 'chrome',
                browserVersion: '123.0.6286.0',
            });
            expect(browserInstallRes3).toBeTruthy();

            const browserInstallRes4 = await browserInstall({
                browser: 'firefox',
                browserVersion: 'latest',
            }); // Same as previous, should not install another browser
            expect(browserInstallRes4).toBeTruthy();

            // There should now be four installed browsers
            const installedBrowsers2 = await browserInstalled(options);
            expect(installedBrowsers2.length).toEqual(4);

            // Remove all installed browsers
            const uninstallRes2 = await browserUninstallAll(options);
            expect(uninstallRes2).toEqual(true);

            // There should now be zero installed browsers
            const installedBrowsers3 = await browserInstalled(options);
            expect(installedBrowsers3.length).toEqual(0);
        },
        defaultTestTimeout
    );
});
