import { test, expect, describe, beforeAll } from '@jest/globals';
import 'dotenv/config';

import { browserInstalled } from '../browser-installed.js';
import { browserInstall } from '../browser-install.js';
import { browserUninstallAll } from '../browser-uninstall.js';
import { assertEnv, getTestTimeout } from '../../util/env-check.js';

const defaultTestTimeout = getTestTimeout(process.env, 1800000);

const options = {
    loglevel: process.env.BSI_LOG_LEVEL || 'info',
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
                browserInstall({ browser: 'invalid-browser', browserVersion: 'recommended' })
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
            const viaLatest = await browserInstall({ browser: 'chrome', browserVersion: 'latest' });
            const viaStable = await browserInstall({ browser: 'chrome', browserVersion: 'stable' });

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

            const installedBrowsers = await browserInstalled({});
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
            const installPromises = [
                browserInstall({ browser: 'chrome', browserVersion: 'recommended' }),
                browserInstall({ browser: 'firefox', browserVersion: 'recommended' }),
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
