import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// `browser install --browser-version latest` resolves the build id through
// getMostRecentUsableChromeBuildId, so an offline install fails on the same code path as
// `browser list-available`. These tests cover the install side of issue #785.

jest.unstable_mockModule('axios', () => ({ default: jest.fn() }));
const axios = (await import('axios')).default;

jest.unstable_mockModule('@puppeteer/browsers', () => ({
    detectBrowserPlatform: jest.fn().mockResolvedValue('mac_arm'),
    canDownload: jest.fn().mockResolvedValue(true),
    install: jest.fn(),
    resolveBuildId: jest.fn(),
    uninstall: jest.fn(),
}));

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
    // browser-install.js awaits this between retry attempts; mocked so the offline
    // retry paths do not really wait out the backoff.
    sleep: jest.fn().mockResolvedValue(undefined),
}));
const { logger } = await import('../../../globals.js');

/** Inert progress bar so the install path does not write to a TTY. */
class FakeSingleBar {
    /**
     * No-op stub for cli-progress SingleBar.start.
     *
     * @returns {void}
     */
    start() {}

    /**
     * No-op stub for cli-progress SingleBar.update.
     *
     * @returns {void}
     */
    update() {}

    /**
     * No-op stub for cli-progress SingleBar.stop.
     *
     * @returns {void}
     */
    stop() {}
}

jest.unstable_mockModule('cli-progress', () => ({
    default: { SingleBar: FakeSingleBar, Presets: { shades_classic: {} } },
}));

const { browserInstall } = await import('../browser-install.js');

/**
 * Collects everything logged at error level during a run.
 *
 * @returns {string} Concatenated error-level output.
 */
function errorOutput() {
    return logger.error.mock.calls.map((call) => String(call[0])).join('\n');
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('browserInstall — offline (issue #785)', () => {
    test('does not repeat the failure or print a stack at error level', async () => {
        // The first version of this fix kept the already-reported marker private to
        // browser-list-available.js, so browserInstall logged the raw message and a full stack
        // trace on top of the explanation - reproducing the very symptom #785 reports.
        axios.mockRejectedValue(
            Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
        );

        await browserInstall({ browser: 'chrome', browserVersion: 'latest' }).catch(
            () => undefined
        );

        const out = errorOutput();
        expect(out).toContain('Could not reach versionhistory.googleapis.com');
        expect(out).not.toContain('Error installing browser');
        expect(out).not.toContain('at ');
    });

    test('propagates a non-Error throw unchanged instead of masking it', async () => {
        // `err.message.includes(...)` was unguarded, so a non-Error throw raised a second
        // TypeError from inside the handler, replacing the original cause with a confusing
        // message about `includes`.
        //
        // Asserting the identity of the rejected value, not merely that it rejects: on the old
        // code it still rejected, just with the wrong error. A `toBeDefined()` assertion passed
        // either way and would have proved nothing.
        axios.mockRejectedValue('a bare string, not an Error');

        const rejection = await browserInstall({
            browser: 'chrome',
            browserVersion: 'latest',
        }).catch((err) => err);

        expect(rejection).toBe('a bare string, not an Error');
        expect(String(rejection)).not.toContain('Cannot read properties');
    });

    test('still reports an install failure that nothing else has explained', async () => {
        // Missing options fail before any network call, so no other layer has described this.
        await browserInstall({}).catch(() => undefined);

        expect(errorOutput()).toContain('Error installing browser');
    });
});
