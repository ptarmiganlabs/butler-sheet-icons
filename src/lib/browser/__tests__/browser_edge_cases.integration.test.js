import { test, expect, describe, beforeAll, afterAll } from '@jest/globals';
import 'dotenv/config';

import { browserInstalled } from '../browser-installed.js';
import { browserInstall } from '../browser-install.js';
import { browserUninstallAll } from '../browser-uninstall.js';
import { assertEnv, getTestTimeout } from '../../util/env-check.js';
import { makeIsolatedCacheDir, removeIsolatedCacheDir } from '../test-helpers/isolated-cache.js';

const defaultTestTimeout = getTestTimeout(process.env, 1800000);

// The concurrency test installs two browsers and then cleans up with `browserUninstallAll`,
// which empties the whole cache directory rather than removing just those two.
const browserCacheDir = makeIsolatedCacheDir();

const options = {
    loglevel: process.env.BSI_LOG_LEVEL || 'info',
    browserCacheDir,
};

describe('edge cases and error handling', () => {
    // Note: this describe has a test that explicitly `delete`s BSI_TEST_TIMEOUT
    // and BSI_LOG_LEVEL (it tests library behavior under missing env vars).
    // Run the assertEnv here so its dump is logged before the test deletes
    // the vars. We pass only informational entries, so missing values do
    // not cause a hard failure here.
    beforeAll(() => {
        assertEnv(process.env, { informational: ['BSI_LOG_LEVEL', 'BSI_TEST_TIMEOUT'] });
    });

    afterAll(() => {
        removeIsolatedCacheDir(browserCacheDir);
    });

    /**
     * Test invalid browser input
     * Should throw an error naming the browser, not the version.
     */
    test(
        'install an invalid browser name',
        async () => {
            // The message matters as much as the rejection here: an unsupported browser used to
            // be reported as a version that could not be resolved, which sends the reader after
            // the wrong option entirely.
            await expect(
                browserInstall({
                    browser: 'invalid-browser',
                    browserVersion: 'recommended',
                    browserCacheDir,
                })
            ).rejects.toThrow(/unsupported browser "invalid-browser"/i);
        },
        defaultTestTimeout
    );

    /**
     * `latest` was the default before 3.12.0, so it is still in existing scripts and scheduled
     * jobs. It now means the newest stable release. Covered here as well as in the unit suite
     * because the alias is only useful if it survives a real lookup against the vendor's
     * version service.
     */
    test(
        'the legacy "latest" value still installs, and matches "stable"',
        async () => {
            const viaLatest = await browserInstall({
                browser: 'chrome',
                browserVersion: 'latest',
                browserCacheDir,
            });
            const viaStable = await browserInstall({
                browser: 'chrome',
                browserVersion: 'stable',
                browserCacheDir,
            });

            expect(viaLatest.buildId).toEqual(viaStable.buildId);
        },
        defaultTestTimeout
    );

    /**
     * Test missing environment variables
     * Should use default values.
     */
    test(
        'missing environment variables',
        async () => {
            delete process.env.BSI_TEST_TIMEOUT;
            delete process.env.BSI_LOG_LEVEL;

            // No loglevel, which is what this test is about. The cache directory is not an
            // environment variable and has to stay set, or the read falls back to the
            // developer's own cache.
            const installedBrowsers = await browserInstalled({ browserCacheDir });
            expect(installedBrowsers).toBeDefined();
        },
        defaultTestTimeout
    );

    /**
     * Test concurrent browser installations
     * Should handle concurrency correctly.
     */
    test(
        'concurrent browser installations',
        async () => {
            // Two different Chrome builds. Chrome is the only browser there is, and two
            // builds exercise the same concurrent-download path. The archive path under
            // `<cacheDir>/chrome/` is prefixed with the build id, so these do not collide.
            const installPromises = [
                browserInstall({
                    browser: 'chrome',
                    browserVersion: 'recommended',
                    browserCacheDir,
                }),
                browserInstall({
                    browser: 'chrome',
                    browserVersion: '121.0.6167.16',
                    browserCacheDir,
                }),
            ];

            const results = await Promise.all(installPromises);
            results.forEach((result) => expect(result).toBeTruthy());

            const installedBrowsers = await browserInstalled(options);
            expect(installedBrowsers.length).toBeGreaterThanOrEqual(2);

            // Cleanup
            await browserUninstallAll(options);
        },
        defaultTestTimeout
    );
});
