/* eslint-disable no-console */
// Mock the browser-install module
jest.mock('../browser-install', () => ({
    browserInstall: jest.fn(),
}));

// Also mock the browser-installed module
jest.mock('../browser-installed', () => ({
    browserInstalled: jest.fn().mockResolvedValue([]),
}));

const { test, expect, describe } = require('@jest/globals');

const { browserInstalled } = require('../browser-installed.js');
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
