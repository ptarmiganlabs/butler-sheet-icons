import { test, expect, describe, beforeAll, afterAll } from '@jest/globals';
import 'dotenv/config';

import { browserInstalled } from '../browser-installed.js';
import { browserInstall } from '../browser-install.js';
import { browserUninstallAll } from '../browser-uninstall.js';
import { assertEnv, getTestTimeout } from '../../util/env-check.js';
import { makeIsolatedCacheDir, removeIsolatedCacheDir } from '../test-helpers/isolated-cache.js';

const defaultTestTimeout = getTestTimeout(process.env, 1800000);

// Everything below installs and uninstalls real browsers, and ends by emptying the cache
// directory. Without this the target is the developer's own ~/.cache/puppeteer.
const browserCacheDir = makeIsolatedCacheDir();

const options = {
    loglevel: process.env.BSI_LOG_LEVEL || 'info',
    browserCacheDir,
};

describe('complex scenarios', () => {
    // Run once for the whole describe block so the env dump appears in the
    // test log even though no per-test failures depend on it.
    beforeAll(() => {
        assertEnv(process.env, { informational: ['BSI_LOG_LEVEL', 'BSI_TEST_TIMEOUT'] });
    });

    afterAll(() => {
        removeIsolatedCacheDir(browserCacheDir);
    });

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

            // The Chrome build this Butler Sheet Icons release is tested with
            const browserInstallRes1 = await browserInstall({
                browser: 'chrome',
                browserVersion: 'recommended',
                browserCacheDir,
            });
            expect(browserInstallRes1).toBeTruthy();

            // From the beta channel
            const browserInstallRes2 = await browserInstall({
                browser: 'chrome',
                browserVersion: '121.0.6167.16',
                browserCacheDir,
            });
            expect(browserInstallRes2).toBeTruthy();

            // From the dev channel
            const browserInstallRes3 = await browserInstall({
                browser: 'chrome',
                browserVersion: '123.0.6286.0',
                browserCacheDir,
            });
            expect(browserInstallRes3).toBeTruthy();

            const browserInstallRes4 = await browserInstall({
                browser: 'firefox',
                browserVersion: 'recommended',
                browserCacheDir,
            });
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
