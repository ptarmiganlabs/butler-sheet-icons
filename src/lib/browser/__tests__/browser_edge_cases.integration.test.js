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
     * Should throw an error.
     */
    test(
        'install an invalid browser name',
        async () => {
            await expect(
                browserInstall({ browser: 'invalid-browser', browserVersion: 'latest' })
            ).rejects.toThrow();
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
                browserInstall({ browser: 'chrome', browserVersion: 'latest' }),
                browserInstall({ browser: 'firefox', browserVersion: 'latest' }),
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
