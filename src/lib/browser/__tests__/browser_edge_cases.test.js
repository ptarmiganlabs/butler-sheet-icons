const { test, expect, describe } = require('@jest/globals');

// Mock the browser-install module
// jest.mock('../browser-install', () => ({
//     browserInstall: jest.fn(),
// }));

// Also mock the browser-installed module
// jest.mock('../browser-installed', () => ({
//     browserInstalled: jest.fn().mockResolvedValue([]),
// }));

const { browserInstalled } = require('../browser-installed.js');
const { browserInstall } = require('../browser-install.js');
const { browserUninstallAll } = require('../browser-uninstall.js');
const defaultTestTimeout = process.env.BSI_TEST_TIMEOUT || 1800000; // 20 minute default timeout

console.log(`Jest timeout: ${defaultTestTimeout}`);

const options = {
    loglevel: process.env.BSI_LOG_LEVEL || 'info',
};

describe('edge cases and error handling', () => {
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
