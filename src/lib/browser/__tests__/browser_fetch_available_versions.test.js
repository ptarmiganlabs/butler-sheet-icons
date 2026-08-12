import { jest, describe, test, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('axios', () => ({ default: jest.fn() }));
const axios = (await import('axios')).default;

jest.unstable_mockModule('@puppeteer/browsers', () => ({
    detectBrowserPlatform: jest.fn().mockResolvedValue('mac_arm'),
    canDownload: jest.fn().mockResolvedValue(true),
}));
const { canDownload } = await import('@puppeteer/browsers');

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    },
    setLoggingLevel: jest.fn(),
    bsiExecutablePath: '/test/path',
    isSea: false,
}));
const { logger } = await import('../../../globals.js');

const { fetchAvailableVersions, browserListAvailable } =
    await import('../browser-list-available.js');

const CHROME_RESPONSE = {
    data: {
        versions: [
            {
                version: '151.0.7922.77',
                name: 'chrome/platforms/mac/channels/stable/versions/151.0.7922.77',
            },
            {
                version: '150.0.7811.12',
                name: 'chrome/platforms/mac/channels/stable/versions/150.0.7811.12',
            },
        ],
    },
};

beforeEach(() => {
    jest.clearAllMocks();
    axios.mockResolvedValue(CHROME_RESPONSE);
});

describe('fetchAvailableVersions', () => {
    test('returns the published versions, in the order the API gives them', async () => {
        const versions = await fetchAvailableVersions({ browser: 'chrome', channel: 'stable' });

        expect(versions.map((v) => v.version)).toEqual(['151.0.7922.77', '150.0.7811.12']);
    });

    test('checks no availability at all', async () => {
        // The reason this function exists. browserListAvailable runs one HTTP
        // request per version, strictly serially, purely to decide the log
        // level of each printed line - hundreds of round trips a caller that
        // only wants the list has no use for.
        await fetchAvailableVersions({ browser: 'chrome', channel: 'stable' });

        expect(canDownload).not.toHaveBeenCalled();
    });

    test('makes exactly one request, to the channel asked for', async () => {
        await fetchAvailableVersions({ browser: 'chrome', channel: 'beta' });

        expect(axios).toHaveBeenCalledTimes(1);
        expect(axios).toHaveBeenCalledWith(
            expect.objectContaining({
                url: expect.stringContaining('/channels/beta/versions'),
            })
        );
    });

    test('asks for the platform this machine actually runs', async () => {
        await fetchAvailableVersions({ browser: 'chrome', channel: 'stable' });

        expect(axios).toHaveBeenCalledWith(
            expect.objectContaining({ url: expect.stringContaining('/platforms/mac/') })
        );
    });

    describe('failures', () => {
        test('explains an unreachable host before rethrowing', async () => {
            axios.mockRejectedValue(Object.assign(new Error('getaddrinfo ENOTFOUND'), {}));

            await expect(
                fetchAvailableVersions({ browser: 'chrome', channel: 'stable' })
            ).rejects.toThrow();

            const errors = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
            expect(errors).toContain('Could not reach versionhistory.googleapis.com');
        });

        test('rejects a response body that is not a version list', async () => {
            // A captive portal answers 200 with a login page, which would
            // otherwise surface as a confusing property access failure.
            axios.mockResolvedValue({ data: '<html>Sign in to the guest network</html>' });

            await expect(
                fetchAvailableVersions({ browser: 'chrome', channel: 'stable' })
            ).rejects.toThrow();
        });
    });

    test('prefixes its debug lines when asked, so callers keep their own voice', async () => {
        await fetchAvailableVersions({
            browser: 'chrome',
            channel: 'stable',
            logPrefix: 'Get most recent usable Chrome build ID: ',
        });

        const debug = logger.debug.mock.calls.map((call) => String(call[0])).join('\n');
        expect(debug).toContain(
            'Get most recent usable Chrome build ID: Detected browser platform'
        );
    });
});

describe('browserListAvailable still behaves as before', () => {
    test('returns the same versions the fetch does', async () => {
        const listed = await browserListAvailable({
            browser: 'chrome',
            channel: 'stable',
            loglevel: 'info',
        });

        expect(listed.map((v) => v.version)).toEqual(['151.0.7922.77', '150.0.7811.12']);
    });

    test('still checks availability once per version, to pick each line log level', async () => {
        // The extraction must not change what the command does. Bounded
        // concurrency here would change log line *order*, so it is deliberately
        // left for a separate change.
        await browserListAvailable({ browser: 'chrome', channel: 'stable', loglevel: 'info' });

        expect(canDownload).toHaveBeenCalledTimes(2);
    });

    test('prints downloadable versions at info level', async () => {
        await browserListAvailable({ browser: 'chrome', channel: 'stable', loglevel: 'info' });

        const info = logger.info.mock.calls.map((call) => String(call[0])).join('\n');
        expect(info).toContain('151.0.7922.77');
        expect(info).toContain('Chrome versions from "stable" channel:');
    });

    test('demotes versions that cannot be downloaded to verbose', async () => {
        canDownload.mockResolvedValue(false);

        await browserListAvailable({ browser: 'chrome', channel: 'stable', loglevel: 'info' });

        const info = logger.info.mock.calls.map((call) => String(call[0])).join('\n');
        const verbose = logger.verbose.mock.calls.map((call) => String(call[0])).join('\n');

        expect(info).not.toContain('151.0.7922.77');
        expect(verbose).toContain('(not available)');
    });

    test('rejects an invalid channel before making any request', async () => {
        await expect(
            browserListAvailable({ browser: 'chrome', channel: 'nightly', loglevel: 'info' })
        ).rejects.toThrow('Invalid release channel');

        expect(axios).not.toHaveBeenCalled();
    });

    // Rejected before any request, so an unknown browser is reported as an unknown browser
    // rather than as a version lookup that returned nothing.
    test.each(['safari', 'edge'])('rejects the unknown browser "%s"', async (browser) => {
        await expect(
            browserListAvailable({ browser, channel: 'stable', loglevel: 'info' })
        ).rejects.toThrow('Invalid browser');

        expect(axios).not.toHaveBeenCalled();
    });
});
