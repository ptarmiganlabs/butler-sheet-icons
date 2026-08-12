import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'path';

const getInstalledBrowsers = jest.fn();
const detectBrowserPlatform = jest.fn(() => 'mac_arm');

jest.unstable_mockModule('@puppeteer/browsers', () => ({
    getInstalledBrowsers,
    detectBrowserPlatform,
}));

jest.unstable_mockModule('os', () => ({
    default: { homedir: () => '/home/tester' },
    homedir: () => '/home/tester',
}));

// redact-secrets is deliberately NOT mocked. One of the two problems issue #887
// set out to fix is that redaction mangled this function's result, and a stub
// that returns its input unchanged cannot show whether that is still true.

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
const { redactValue } = await import('../../util/redact-secrets.js');
const { browserInstalled } = await import('../browser-installed.js');

const INSTALLED = [
    {
        browser: 'chrome',
        buildId: '121.0.6167.85',
        platform: 'mac_arm',
        path: '/home/tester/.cache/puppeteer/chrome/mac_arm-121.0.6167.85',
        executablePath:
            '/home/tester/.cache/puppeteer/chrome/mac_arm-121.0.6167.85/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    },
];

// Ambient, and behaviour-affecting since the cache directory became configurable: a
// developer shell or a CI image may have either set.
const SAVED_ENV = {
    BSI_BROWSER_CACHE_DIR: process.env.BSI_BROWSER_CACHE_DIR,
    PUPPETEER_CACHE_DIR: process.env.PUPPETEER_CACHE_DIR,
};

beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.BSI_BROWSER_CACHE_DIR;
    delete process.env.PUPPETEER_CACHE_DIR;
    detectBrowserPlatform.mockReturnValue('mac_arm');
    getInstalledBrowsers.mockResolvedValue(INSTALLED);
});

afterEach(() => {
    for (const [name, value] of Object.entries(SAVED_ENV)) {
        if (value === undefined) {
            delete process.env[name];
        } else {
            process.env[name] = value;
        }
    }
});

describe('browserInstalled', () => {
    test('returns the installed builds as plain data', async () => {
        await expect(browserInstalled({ loglevel: 'info' })).resolves.toEqual([
            { ...INSTALLED[0], isCurrentPlatform: true },
        ]);
    });

    test('the result survives redaction, which the class instances did not', async () => {
        // redactValue() collapses any object whose prototype is not
        // Object.prototype to '***redacted***', so passing the previous
        // InstalledBrowser instances through redactOptions() turned real
        // diagnostic data into redaction markers. This is issue #887's first
        // problem, asserted against the real redactor rather than the stub.
        const result = await browserInstalled({ loglevel: 'info' });

        expect(redactValue(result)).toEqual(result);
        expect(JSON.stringify(result)).toContain('121.0.6167.85');
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

    test('looks in the directory named by --browser-cache-dir instead', async () => {
        await browserInstalled({ loglevel: 'info', browserCacheDir: '/qlik/browsers' });

        expect(getInstalledBrowsers).toHaveBeenCalledWith({
            cacheDir: path.resolve('/qlik/browsers'),
        });
    });

    test('looks in PUPPETEER_CACHE_DIR when no directory was named', async () => {
        process.env.PUPPETEER_CACHE_DIR = '/qlik/puppeteer';

        await browserInstalled({ loglevel: 'info' });

        expect(getInstalledBrowsers).toHaveBeenCalledWith({
            cacheDir: path.resolve('/qlik/puppeteer'),
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

    test('reads loglevel, the name commander now stores the option under', async () => {
        // The option is declared `--log-level, --loglevel <level>`, and Commander takes the
        // *second* long form as the attribute name, so it stores `loglevel` directly. Twelve
        // handlers used to carry an alias shim mapping `logLevel` onto `loglevel`; the
        // declaration order makes that unnecessary. See the binding test in commands.test.js.
        await browserInstalled({ loglevel: 'verbose' });

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

describe('platform awareness', () => {
    // getInstalledBrowsers() does not filter by platform, so a cache copied
    // between machines or mounted into a container genuinely can hold builds
    // that cannot run here. Nothing in the data said so before.
    test('marks a build downloaded for another platform as unusable here', async () => {
        detectBrowserPlatform.mockReturnValue('mac_arm');
        getInstalledBrowsers.mockResolvedValue([
            { ...INSTALLED[0], platform: 'win64' },
            INSTALLED[0],
        ]);

        const result = await browserInstalled({ loglevel: 'info' });

        expect(result.map((b) => [b.platform, b.isCurrentPlatform])).toEqual([
            ['win64', false],
            ['mac_arm', true],
        ]);
    });

    test('reports every build as usable when the host platform cannot be detected', async () => {
        // Absence of evidence, not evidence of absence. Reporting false here
        // would label every cached build "cannot run here" on a platform
        // @puppeteer/browsers simply does not recognise.
        detectBrowserPlatform.mockReturnValue(undefined);

        const result = await browserInstalled({ loglevel: 'info' });

        expect(result[0].isCurrentPlatform).toBe(true);
    });
});
