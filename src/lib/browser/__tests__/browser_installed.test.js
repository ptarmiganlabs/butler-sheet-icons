import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import path from 'path';

const getInstalledBrowsers = jest.fn();

jest.unstable_mockModule('@puppeteer/browsers', () => ({ getInstalledBrowsers }));

jest.unstable_mockModule('os', () => ({
    default: { homedir: () => '/home/tester' },
    homedir: () => '/home/tester',
}));

jest.unstable_mockModule('../../util/redact-secrets.js', () => ({
    redactOptions: jest.fn((options) => options),
}));

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
    },
    setLoggingLevel: jest.fn(),
    bsiExecutablePath: '/opt/bsi',
    isSea: false,
}));

const { logger, setLoggingLevel } = await import('../../../globals.js');
const { browserInstalled } = await import('../browser-installed.js');

const INSTALLED = [
    {
        browser: 'chrome',
        buildId: '121.0.6167.85',
        platform: 'mac_arm',
        path: '/home/tester/.cache/puppeteer/chrome/mac_arm-121.0.6167.85/chrome',
    },
];

beforeEach(() => {
    jest.clearAllMocks();
    getInstalledBrowsers.mockResolvedValue(INSTALLED);
});

describe('browserInstalled', () => {
    test('returns the list of installed browsers', async () => {
        await expect(browserInstalled({ loglevel: 'info' })).resolves.toEqual(INSTALLED);
    });

    test('returns an empty list when nothing is installed', async () => {
        getInstalledBrowsers.mockResolvedValue([]);

        await expect(browserInstalled({ loglevel: 'info' })).resolves.toEqual([]);
    });

    test('looks in the puppeteer cache under the user home directory', async () => {
        await browserInstalled({ loglevel: 'info' });

        expect(getInstalledBrowsers).toHaveBeenCalledWith({
            cacheDir: path.join('/home/tester', '.cache/puppeteer'),
        });
    });

    test('reports each installed browser to the operator', async () => {
        await browserInstalled({ loglevel: 'info' });

        const info = logger.info.mock.calls.map((call) => String(call[0])).join('\n');

        expect(info).toContain('chrome');
        expect(info).toContain('121.0.6167.85');
        expect(info).toContain('mac_arm');
    });

    test('says so plainly when no browsers are installed', async () => {
        getInstalledBrowsers.mockResolvedValue([]);

        await browserInstalled({ loglevel: 'info' });

        const info = logger.info.mock.calls.map((call) => String(call[0])).join('\n');

        expect(info).toContain('No browsers installed');
    });

    test('applies the requested log level', async () => {
        await browserInstalled({ loglevel: 'debug' });

        expect(setLoggingLevel).toHaveBeenCalledWith('debug');
    });

    test('accepts the camelCase logLevel spelling commander produces', async () => {
        await browserInstalled({ logLevel: 'verbose' });

        expect(setLoggingLevel).toHaveBeenCalledWith('verbose');
    });

    test('rethrows when the browser cache cannot be read', async () => {
        getInstalledBrowsers.mockRejectedValue(new Error('EACCES: permission denied'));

        await expect(browserInstalled({ loglevel: 'info' })).rejects.toThrow(
            'EACCES: permission denied'
        );
    });

    test('logs before rethrowing', async () => {
        getInstalledBrowsers.mockRejectedValue(new Error('EACCES: permission denied'));

        await expect(browserInstalled({ loglevel: 'info' })).rejects.toThrow();

        expect(logger.error).toHaveBeenCalled();
    });

    test('rejects rather than crashing when called with no options', async () => {
        await expect(browserInstalled(undefined)).rejects.toThrow();
    });
});
