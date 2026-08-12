import { jest, test, expect, describe } from '@jest/globals';

// Its own file because the failure it covers is a *shape* of `PUPPETEER_REVISIONS`, and a module
// mock is per-file: the sibling browser_version.test.js needs a constant that carries a chrome
// pin, and this one needs a constant that does not. Same reason browser_install_offline.test.js
// is separate.
jest.unstable_mockModule('puppeteer-core/internal/revisions.js', () => ({
    PUPPETEER_REVISIONS: Object.freeze({}),
}));

jest.unstable_mockModule('@puppeteer/browsers', () => ({
    detectBrowserPlatform: jest.fn().mockResolvedValue('mac_arm'),
    resolveBuildId: jest.fn(),
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

const { getRecommendedBuildId, resolveLocalBrowserBuildId, VERSION_RECOMMENDED } =
    await import('../browser-version.js');

describe('a supported browser that puppeteer-core no longer pins', () => {
    // PUPPETEER_REVISIONS carries an `@internal` tag, so a future major could drop or rename it.
    // That must surface as a named failure rather than defaulting the whole product to
    // `undefined` - which is what would reach the cache lookup and the installer.
    //
    // browser_version_pin.test.js is the other half: it asserts against the *real* puppeteer-core
    // that the pin is still there, so a dependency bump fails in CI rather than in the field.
    // This half asserts what happens on the day that canary goes off.
    test('fails by name rather than resolving to undefined', () => {
        expect(() => getRecommendedBuildId('chrome')).toThrow(/recommended "chrome" build/i);
    });

    test('names a way forward, since the default is the thing that broke', () => {
        expect(() => getRecommendedBuildId('chrome')).toThrow(/--browser-version/);
    });

    // The uninstall path reaches the same constant through resolveLocalBrowserBuildId, and must
    // not turn a missing pin into a silent "no cache entry matched".
    test('propagates through the offline uninstall path', () => {
        expect(() => resolveLocalBrowserBuildId('chrome', VERSION_RECOMMENDED)).toThrow(
            /recommended "chrome" build/i
        );
    });
});
