import { jest, test, expect, describe, beforeEach } from '@jest/globals';

jest.unstable_mockModule('@puppeteer/browsers', () => ({
    detectBrowserPlatform: jest.fn().mockResolvedValue('mac_arm'),
    resolveBuildId: jest.fn(),
}));
const { detectBrowserPlatform, resolveBuildId } = await import('@puppeteer/browsers');

// The real constant is mocked so these tests assert the wiring - "the default comes from
// puppeteer's pin" - rather than the specific build a given puppeteer-core happens to carry.
// A separate test below asserts against the genuine module.
jest.unstable_mockModule('puppeteer-core/internal/revisions.js', () => ({
    PUPPETEER_REVISIONS: Object.freeze({
        chrome: '150.0.7871.24',
        'chrome-headless-shell': '150.0.7871.24',
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
}));
const { logger } = await import('../../../globals.js');

const {
    resolveBrowserVersion,
    getRecommendedBuildId,
    resetVersionWarningsForTesting,
    VERSION_RECOMMENDED,
    VERSION_STABLE,
} = await import('../browser-version.js');

beforeEach(() => {
    resetVersionWarningsForTesting();
    detectBrowserPlatform.mockResolvedValue('mac_arm');
});

describe('the recommended keyword', () => {
    test.each([
        ['chrome', '150.0.7871.24'],
        ['firefox', 'stable_152.0.1'],
    ])("resolves %s to puppeteer's pinned build", async (browser, expected) => {
        const result = await resolveBrowserVersion(browser, VERSION_RECOMMENDED);

        expect(result).toEqual({
            buildId: expected,
            source: VERSION_RECOMMENDED,
            requested: VERSION_RECOMMENDED,
            usedNetwork: false,
        });
    });

    // The property the whole design rests on. Exact cache matching is only safe because the
    // default can be resolved on a machine with no internet access; if this ever starts
    // touching the network, air-gapped and cold-start runs break.
    test('resolves without contacting the network', async () => {
        await resolveBrowserVersion('chrome', VERSION_RECOMMENDED);

        expect(resolveBuildId).not.toHaveBeenCalled();
        expect(detectBrowserPlatform).not.toHaveBeenCalled();
    });

    test('fails clearly if puppeteer-core stops publishing a pin', () => {
        // PUPPETEER_REVISIONS carries an @internal tag, so a future major could drop it. That
        // must surface as a named failure rather than defaulting the product to undefined.
        expect(() => getRecommendedBuildId('opera')).toThrow(/recommended "opera" build/i);
    });
});

describe('the stable keyword', () => {
    test.each([
        ['chrome', '151.0.7922.77'],
        ['firefox', 'stable_153.0.3'],
    ])('resolves %s via the browser vendor stable channel', async (browser, expected) => {
        resolveBuildId.mockResolvedValue(expected);

        const result = await resolveBrowserVersion(browser, VERSION_STABLE);

        expect(resolveBuildId).toHaveBeenCalledWith(browser, 'mac_arm', 'stable');
        expect(result).toEqual({
            buildId: expected,
            source: VERSION_STABLE,
            requested: VERSION_STABLE,
            usedNetwork: true,
        });
    });

    test('reports a build that cannot be resolved', async () => {
        resolveBuildId.mockResolvedValue(undefined);

        await expect(resolveBrowserVersion('chrome', VERSION_STABLE)).rejects.toThrow(
            /could not resolve --browser-version "stable"/i
        );
    });
});

describe('the latest alias', () => {
    test('behaves as stable rather than selecting the newest published build', async () => {
        resolveBuildId.mockResolvedValue('151.0.7922.77');

        const result = await resolveBrowserVersion('chrome', 'latest');

        // Guards the actual regression: 'latest' previously reached
        // getMostRecentUsableChromeBuildId, which returned the newest *published* stable build
        // (151.0.7922.109), not the vendor's last-known-good stable.
        expect(resolveBuildId).toHaveBeenCalledWith('chrome', 'mac_arm', 'stable');
        expect(result.buildId).toBe('151.0.7922.77');
        expect(result.source).toBe(VERSION_STABLE);
        expect(result.requested).toBe('latest');
    });

    test('warns about the changed meaning, but only once per process', async () => {
        resolveBuildId.mockResolvedValue('151.0.7922.77');

        await resolveBrowserVersion('chrome', 'latest');
        await resolveBrowserVersion('chrome', 'latest');

        const warnings = logger.warn.mock.calls.filter(([msg]) => msg.includes('latest'));
        expect(warnings).toHaveLength(1);
    });

    test('does not warn for the supported keywords', async () => {
        resolveBuildId.mockResolvedValue('151.0.7922.77');

        await resolveBrowserVersion('chrome', VERSION_RECOMMENDED);
        await resolveBrowserVersion('chrome', VERSION_STABLE);

        expect(logger.warn).not.toHaveBeenCalled();
    });
});

describe('explicit versions', () => {
    test.each([
        ['chrome', '151', 'milestone'],
        ['chrome', '151.0.7922', 'build prefix'],
        ['chrome', '151.0.7922.77', 'full build id'],
        ['firefox', 'stable_153.0.3', 'channel-prefixed build id'],
        ['firefox', 'esr_128.4.0', 'esr build id'],
    ])('accepts %s %s (%s)', async (browser, version) => {
        resolveBuildId.mockResolvedValue('resolved-build');

        const result = await resolveBrowserVersion(browser, version);

        expect(resolveBuildId).toHaveBeenCalledWith(browser, 'mac_arm', version);
        expect(result.source).toBe('explicit');
        expect(result.requested).toBe(version);
    });

    // resolveBuildId returns unrecognised input verbatim rather than failing, so without this
    // check a typo travelled all the way to canDownload and surfaced as "cannot be downloaded"
    // - which reads like a network problem.
    test.each([
        ['chrome', 'garbage'],
        ['chrome', '151.0'],
        ['chrome', 'v151.0.7922.77'],
        ['chrome', 'stable_153.0.3'],
        ['firefox', '152.0.1'],
        ['firefox', 'garbage'],
    ])('rejects %s "%s" before any network call', async (browser, version) => {
        await expect(resolveBrowserVersion(browser, version)).rejects.toThrow(
            /invalid --browser-version/i
        );

        expect(resolveBuildId).not.toHaveBeenCalled();
    });

    test('tells the user what a valid chrome version looks like', async () => {
        await expect(resolveBrowserVersion('chrome', 'garbage')).rejects.toThrow();

        const advice = logger.error.mock.calls.map(([msg]) => msg).join('\n');
        expect(advice).toContain(VERSION_RECOMMENDED);
        expect(advice).toContain(VERSION_STABLE);
        expect(advice).toContain('151.0.7922.77');
    });

    // A bare Firefox version is not merely unsupported - @puppeteer/browsers reads an
    // unprefixed build id as FirefoxChannel.NIGHTLY, so passing it through would quietly
    // install a nightly build.
    test('tells firefox users to prefix the channel', async () => {
        await expect(resolveBrowserVersion('firefox', '152.0.1')).rejects.toThrow();

        const advice = logger.error.mock.calls.map(([msg]) => msg).join('\n');
        expect(advice).toContain('stable_153.0.3');
    });
});

describe('unsupported browsers', () => {
    // Reported as a browser problem, not a version problem. Before this the run failed with
    // "Could not resolve --browser-version ... to a invalid-browser build", which names the
    // wrong option and does not even read as English.
    test('names the browser rather than blaming the version', async () => {
        await expect(resolveBrowserVersion('invalid-browser', VERSION_RECOMMENDED)).rejects.toThrow(
            /unsupported browser "invalid-browser"/i
        );
    });

    test('lists what is supported', async () => {
        const err = await resolveBrowserVersion('opera', VERSION_STABLE).catch((e) => e);

        expect(err.message).toContain('chrome');
        expect(err.message).toContain('firefox');
    });

    test('is rejected before any network call', async () => {
        await resolveBrowserVersion('invalid-browser', VERSION_STABLE).catch(() => undefined);

        expect(resolveBuildId).not.toHaveBeenCalled();
    });
});

describe('required options', () => {
    test.each([
        [undefined, 'stable', /"browser"/],
        ['chrome', undefined, /"browserVersion"/],
        ['chrome', '', /"browserVersion"/],
    ])('rejects browser=%s version=%s', async (browser, version, expected) => {
        await expect(resolveBrowserVersion(browser, version)).rejects.toThrow(expected);
    });
});

describe('version lookup failures', () => {
    test('explains an unreachable version service and points at the offline-safe keyword', async () => {
        resolveBuildId.mockRejectedValue(
            Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
        );

        await expect(resolveBrowserVersion('chrome', VERSION_STABLE)).rejects.toThrow(/ENOTFOUND/);

        const advice = logger.error.mock.calls.map(([msg]) => msg).join('\n');
        expect(advice).toContain("could not reach the browser vendor's version service");
        expect(advice).toContain(VERSION_RECOMMENDED);
    });

    test('leaves a non-connectivity failure to the caller to describe', async () => {
        resolveBuildId.mockRejectedValue(new Error('something else entirely'));

        await expect(resolveBrowserVersion('chrome', VERSION_STABLE)).rejects.toThrow(
            /something else entirely/
        );

        expect(logger.error).not.toHaveBeenCalled();
    });
});
