import { jest, test, expect, describe } from '@jest/globals';

// Mock the browser-install module
const browserInstallMock = jest.fn();
jest.unstable_mockModule('../browser-install', () => ({
    browserInstall: browserInstallMock,
}));

// Also mock the browser-installed module
const browserInstalledMock = jest.fn();
jest.unstable_mockModule('../browser-installed', () => ({
    browserInstalled: browserInstalledMock,
}));

// Import the function under test
import { browserInstalled } from '../browser-installed.js';

const defaultTestTimeout = process.env.BSI_TEST_TIMEOUT || 1800000; // 20 minute default timeout

console.log(`Jest timeout: ${defaultTestTimeout}`);

const options = {
    loglevel: process.env.BSI_LOG_LEVEL || 'info',
};

describe('test browser list_installed command', () => {
    /**
     * List installed browsers
     * Should return an array of installed browser, zero or more entries
     */
    test(
        'list installed browsers, should be zero or more',
        async () => {
            const installedBrowsers = await browserInstalled(options);
            expect(installedBrowsers.length).toBeGreaterThanOrEqual(0);
        },
        defaultTestTimeout
    );
});
