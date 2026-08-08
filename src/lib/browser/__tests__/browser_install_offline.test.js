import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Any version form other than `recommended` or an exact build id has to ask the browser vendor
// which build it means, so an offline install fails during version resolution. These tests cover
// the install side of issue #785: the operator must get an explanation and a way forward, not a
// bare network error repeated with a stack trace.

jest.unstable_mockModule('@puppeteer/browsers', () => ({
    detectBrowserPlatform: jest.fn().mockResolvedValue('mac_arm'),
    canDownload: jest.fn().mockResolvedValue(true),
    install: jest.fn(),
    resolveBuildId: jest.fn(),
    uninstall: jest.fn(),
}));
const { resolveBuildId } = await import('@puppeteer/browsers');

jest.unstable_mockModule('puppeteer-core/internal/revisions.js', () => ({
    PUPPETEER_REVISIONS: Object.freeze({
        chrome: '150.0.7871.24',
        firefox: 'stable_152.0.1',
    }),
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
    test('explains a failed version lookup instead of repeating it with a stack', async () => {
        // The first version of the #785 fix kept the already-reported marker private, so
        // browserInstall logged the raw message and a full stack trace on top of the
        // explanation - reproducing the very symptom the issue reports.
        resolveBuildId.mockRejectedValue(
            Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
        );

        await browserInstall({ browser: 'chrome', browserVersion: 'stable' }).catch(
            () => undefined
        );

        const out = errorOutput();
        expect(out).toContain("could not reach the browser vendor's version service");
        expect(out).toContain('--browser-version recommended');
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
        resolveBuildId.mockRejectedValue('a bare string, not an Error');

        const rejection = await browserInstall({
            browser: 'chrome',
            browserVersion: 'stable',
        }).catch((err) => err);

        expect(rejection).toBe('a bare string, not an Error');
        expect(String(rejection)).not.toContain('Cannot read properties');
    });

    test('still reports an install failure that nothing else has explained', async () => {
        // Missing options fail before any network call, so no other layer has described this.
        await browserInstall({}).catch(() => undefined);

        expect(errorOutput()).toContain('Error installing browser');
    });

    // Command handlers pass their options straight through, so a nullish object reaches here.
    // It has to produce the intended message rather than a TypeError about reading a property
    // of null, which would say nothing about what the operator got wrong.
    test.each([
        ['null', null],
        ['undefined', undefined],
    ])('names the missing options for a %s options object', async (_label, options) => {
        const rejection = await browserInstall(options).catch((err) => err);

        expect(rejection.message).toBe('Missing required options: "browser" and "browserVersion"');
    });

    // The property that makes the default usable on an air-gapped machine: resolving
    // `recommended` reads a constant, so an install of an already-cached build never has to
    // reach a version service at all.
    test('the recommended build needs no version lookup', async () => {
        await browserInstall({ browser: 'chrome', browserVersion: 'recommended' }).catch(
            () => undefined
        );

        expect(resolveBuildId).not.toHaveBeenCalled();
    });
});
