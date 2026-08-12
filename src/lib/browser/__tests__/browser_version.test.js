import { jest, test, expect, describe, beforeEach } from '@jest/globals';

jest.unstable_mockModule('@puppeteer/browsers', () => ({
    detectBrowserPlatform: jest.fn().mockResolvedValue('mac_arm'),
    resolveBuildId: jest.fn(),
}));
const { detectBrowserPlatform, resolveBuildId } = await import('@puppeteer/browsers');

// The real constant is mocked so these tests assert the wiring - "the default comes from
// puppeteer's pin" - rather than the specific build a given puppeteer-core happens to carry.
// A separate test below asserts against the genuine module.
//
// The firefox entry mirrors the real constant, which pins every browser puppeteer supports
// rather than every browser Butler Sheet Icons drives. It is here to be *refused*: without it,
// the guard on getRecommendedBuildId would appear to work simply because no pin existed.
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
    test("resolves chrome to puppeteer's pinned build", async () => {
        const result = await resolveBrowserVersion('chrome', VERSION_RECOMMENDED);

        expect(result).toEqual({
            buildId: '150.0.7871.24',
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

    // PUPPETEER_REVISIONS pins every browser *puppeteer* supports, which is a wider set than the
    // one Butler Sheet Icons can drive - it still carries a firefox pin, for instance. Reading it
    // without checking the browser first meant this function answered for names that
    // resolveBrowserVersion rejects, so the two disagreed about which browsers exist.
    // browser_version_no_pin.test.js covers the other failure: a supported browser with no pin.
    test.each(['opera', 'firefox'])(
        'refuses "%s", which puppeteer may pin but Butler Sheet Icons cannot drive',
        (browser) => {
            expect(() => getRecommendedBuildId(browser)).toThrow(
                new RegExp(`unsupported browser "${browser}"`, 'i')
            );
        }
    );
});

describe('the stable keyword', () => {
    test('resolves chrome via the browser vendor stable channel', async () => {
        resolveBuildId.mockResolvedValue('151.0.7922.77');

        const result = await resolveBrowserVersion('chrome', VERSION_STABLE);

        expect(resolveBuildId).toHaveBeenCalledWith('chrome', 'mac_arm', 'stable');
        expect(result).toEqual({
            buildId: '151.0.7922.77',
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

        // Guards the actual regression: 'latest' previously resolved from the consumer Chrome
        // channel and returned the newest *published* stable build (151.0.7922.109), not the
        // vendor's last-known-good stable. The function that did so has since been removed.
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
    test.each(['beta', 'dev', 'canary'])(
        'resolves chrome %s through the vendor',
        async (channel) => {
            resolveBuildId.mockResolvedValue('resolved-build');

            const result = await resolveBrowserVersion('chrome', channel);

            expect(resolveBuildId).toHaveBeenCalledWith('chrome', 'mac_arm', channel);
            expect(result.buildId).toBe('resolved-build');
            expect(result.source).toBe('channel');
            expect(result.usedNetwork).toBe(true);
        }
    );

    // A channel name Chrome does not have must be rejected up front, not passed to a lookup
    // that would throw a less helpful error. These are other vendors' channel names, which is
    // what a reader reaching for a channel is most likely to guess wrong with.
    test.each(['nightly', 'devedition', 'esr'])(
        'rejects "%s", which Chrome does not have',
        async (channel) => {
            await expect(resolveBrowserVersion('chrome', channel)).rejects.toThrow(
                /invalid --browser-version/i
            );

            expect(resolveBuildId).not.toHaveBeenCalled();
        }
    );
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
    test.each(['recommended', 'stable', 'latest', 'beta', 'dev', 'canary'])(
        'recognises the floating "%s"',
        (value) => {
            expect(isVersionKeyword(value)).toBe(true);
        }
    );

    // A keyword is allowed to degrade to a cached build when a lookup fails, so anything that
    // cannot name a build must not be treated as floating - including other vendors' channel
    // names, which look like keywords but resolve to nothing here.
    test.each([
        '151.0.7922.77',
        '151',
        'stable_153.0.3',
        'nightly',
        'devedition',
        'esr',
        'garbage',
        '',
        undefined,
    ])('does not treat %s as a keyword', (value) => {
        expect(isVersionKeyword(value)).toBe(false);
    });
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
        ['151', 'milestone'],
        ['151.0.7922', 'build prefix'],
        ['151.0.7922.77', 'full build id'],
    ])('accepts chrome %s (%s)', async (version) => {
        resolveBuildId.mockResolvedValue('resolved-build');

        const result = await resolveBrowserVersion('chrome', version);

        expect(resolveBuildId).toHaveBeenCalledWith('chrome', 'mac_arm', version);
        expect(result.source).toBe('explicit');
        expect(result.requested).toBe(version);
    });

    // resolveBuildId returns unrecognised input verbatim rather than failing, so without this
    // check a typo travelled all the way to canDownload and surfaced as "cannot be downloaded"
    // - which reads like a network problem.
    test.each(['garbage', '151.0', 'v151.0.7922.77', 'stable_153.0.3', 'esr_128.4.0'])(
        'rejects chrome "%s" before any network call',
        async (version) => {
            await expect(resolveBrowserVersion('chrome', version)).rejects.toThrow(
                /invalid --browser-version/i
            );

            expect(resolveBuildId).not.toHaveBeenCalled();
        }
    );

    test('tells the user what a valid chrome version looks like', async () => {
        await expect(resolveBrowserVersion('chrome', 'garbage')).rejects.toThrow();

        const advice = logger.error.mock.calls.map(([msg]) => msg).join('\n');
        expect(advice).toContain(VERSION_RECOMMENDED);
        expect(advice).toContain(VERSION_STABLE);
        expect(advice).toContain('151.0.7922.77');
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

    // Commander's .choices() already refuses an unknown browser on the command line, but the
    // workers are called directly too - by the integration tests and by the interactive path -
    // so the refusal has to live here as well.
    test('is refused before any version work happens', async () => {
        await expect(resolveBrowserVersion('safari', VERSION_RECOMMENDED)).rejects.toThrow(
            /unsupported browser "safari"/i
        );

        expect(resolveBuildId).not.toHaveBeenCalled();
    });

    test('lists what is supported', async () => {
        const err = await resolveBrowserVersion('opera', VERSION_STABLE).catch((e) => e);

        expect(err.message).toContain('chrome');
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
    test.each(['stable', 'latest', 'beta', 'dev', 'canary'])(
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
    });

    // Anything that is not a Chrome keyword is passed through unvalidated: it simply will not
    // match a cache entry, and "not found in cache" is the honest outcome for it.
    test('passes an unrecognised value through to fail the cache lookup', () => {
        expect(resolveLocalBrowserBuildId('chrome', 'esr')).toBe('esr');
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
