import { jest, test, expect, describe, beforeAll } from '@jest/globals';
import 'dotenv/config';

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
import { assertEnv, getTestTimeout } from '../../util/env-check.js';

const defaultTestTimeout = getTestTimeout(process.env, 1800000);

const options = {
    loglevel: process.env.BSI_LOG_LEVEL || 'info',
};

describe('test browser list_installed command', () => {
    beforeAll(() => {
        assertEnv(process.env, { informational: ['BSI_LOG_LEVEL', 'BSI_TEST_TIMEOUT'] });
    });

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
