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
    resolveLocalBrowserBuildId,
    getRecommendedBuildId,
    resetVersionWarningsForTesting,
    isVersionKeyword,
    isVersionLookupFailure,
    parseBrowserVersionValue,
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

describe('release channels', () => {
    // These worked before the recommended/stable vocabulary existed - every value was handed to
    // resolveBuildId verbatim, which recognises channel tags - so administrators have them in
    // scheduled jobs. The first cut of the vocabulary rejected them (issue #878 review).
    test.each([
        ['chrome', 'beta'],
        ['chrome', 'dev'],
        ['chrome', 'canary'],
        ['firefox', 'beta'],
        ['firefox', 'nightly'],
        ['firefox', 'devedition'],
        ['firefox', 'esr'],
    ])('resolves %s %s through the vendor', async (browser, channel) => {
        resolveBuildId.mockResolvedValue('resolved-build');

        const result = await resolveBrowserVersion(browser, channel);

        expect(resolveBuildId).toHaveBeenCalledWith(browser, 'mac_arm', channel);
        expect(result.buildId).toBe('resolved-build');
        expect(result.source).toBe('channel');
        expect(result.usedNetwork).toBe(true);
    });

    // The vendors' channels differ; a channel the browser does not have must be rejected up
    // front, not passed to a lookup that would throw a less helpful error.
    test.each([
        ['chrome', 'nightly'],
        ['chrome', 'devedition'],
        ['chrome', 'esr'],
        ['firefox', 'dev'],
        ['firefox', 'canary'],
    ])('rejects %s "%s", a channel that browser does not have', async (browser, channel) => {
        await expect(resolveBrowserVersion(browser, channel)).rejects.toThrow(
            /invalid --browser-version/i
        );

        expect(resolveBuildId).not.toHaveBeenCalled();
    });
});

describe('lookup-failure marking', () => {
    // The launch path decides whether falling back to a cached build is acceptable based on
    // this marker: only an error from the lookup itself - an environment problem - qualifies.
    test('marks a connectivity failure raised by the lookup', async () => {
        resolveBuildId.mockRejectedValue(
            Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
        );

        const err = await resolveBrowserVersion('chrome', VERSION_STABLE).catch((e) => e);

        expect(isVersionLookupFailure(err)).toBe(true);
    });

    test('marks a non-connectivity lookup failure too', async () => {
        // A 503 or a captive-portal parse error is still the environment, not the input.
        resolveBuildId.mockRejectedValue(new Error('Got status code 503'));

        const err = await resolveBrowserVersion('chrome', VERSION_STABLE).catch((e) => e);

        expect(isVersionLookupFailure(err)).toBe(true);
    });

    test('does not mark a validation failure', async () => {
        const err = await resolveBrowserVersion('chrome', 'garbage').catch((e) => e);

        expect(isVersionLookupFailure(err)).toBe(false);
    });

    test('does not mark an unsupported-browser failure', async () => {
        const err = await resolveBrowserVersion('opera', VERSION_STABLE).catch((e) => e);

        expect(isVersionLookupFailure(err)).toBe(false);
    });

    test('does not mark a lookup that answered with no build', async () => {
        // A well-formed milestone that does not exist is the input being wrong, not the
        // environment failing - it must not qualify for the cache fallback.
        resolveBuildId.mockResolvedValue(undefined);

        const err = await resolveBrowserVersion('chrome', '9999').catch((e) => e);

        expect(err.message).toMatch(/could not resolve --browser-version "9999"/i);
        expect(isVersionLookupFailure(err)).toBe(false);
    });
});

describe('isVersionKeyword', () => {
    test.each([
        'recommended',
        'stable',
        'latest',
        'beta',
        'dev',
        'canary',
        'nightly',
        'devedition',
        'esr',
    ])('recognises the floating "%s"', (value) => {
        expect(isVersionKeyword(value)).toBe(true);
    });

    test.each(['151.0.7922.77', '151', 'stable_153.0.3', 'garbage', '', undefined])(
        'does not treat %s as a keyword',
        (value) => {
            expect(isVersionKeyword(value)).toBe(false);
        }
    );
});

describe('parseBrowserVersionValue', () => {
    // Commander lets a set-but-empty env var beat .default(), so a bare
    // `BSI_..._BROWSER_VERSION=` line in a unit file used to reach the resolver as ''.
    test('maps a set-but-empty value onto the default keyword', () => {
        expect(parseBrowserVersionValue('')).toBe(VERSION_RECOMMENDED);
    });

    test.each(['stable', 'latest', '151', '151.0.7922.77', 'garbage'])(
        'passes "%s" through untouched',
        (value) => {
            expect(parseBrowserVersionValue(value)).toBe(value);
        }
    );
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

describe('resolveLocalBrowserBuildId (uninstall)', () => {
    test('resolves "recommended" from the pin, with no platform detection or lookup', () => {
        expect(resolveLocalBrowserBuildId('chrome', VERSION_RECOMMENDED)).toBe('150.0.7871.24');

        expect(resolveBuildId).not.toHaveBeenCalled();
        expect(detectBrowserPlatform).not.toHaveBeenCalled();
    });

    // A floating keyword resolves to whatever the vendor currently publishes - almost never a
    // build in the local cache - so for a destructive, offline-capable command it is refused
    // with guidance instead of resolved over the network.
    test.each(['stable', 'latest', 'beta', 'esr'])(
        'refuses the floating "%s" and points at list-installed',
        (value) => {
            expect(resolveLocalBrowserBuildId('chrome', value)).toBeNull();

            const advice = logger.error.mock.calls.map(([msg]) => msg).join('\n');
            expect(advice).toContain('list-installed');
            expect(resolveBuildId).not.toHaveBeenCalled();
        }
    );

    test('passes an exact build id through unchanged', () => {
        expect(resolveLocalBrowserBuildId('chrome', '151.0.7922.77')).toBe('151.0.7922.77');
        expect(resolveLocalBrowserBuildId('firefox', 'stable_153.0.3')).toBe('stable_153.0.3');
    });

    test('refuses an empty value', () => {
        expect(resolveLocalBrowserBuildId('chrome', '')).toBeNull();
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
