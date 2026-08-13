import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// `browser install` for a build that is already in the cache. The point of these tests is that
// the whole path is reachable with no network at all: an administrator who has staged a browser
// onto an air-gapped machine runs `browser install` to confirm it worked, and until now was told
// the browser "cannot be downloaded" - about a browser sitting right there on disk.

jest.unstable_mockModule('@puppeteer/browsers', () => ({
    install: jest.fn(),
    resolveBuildId: jest.fn(),
    detectBrowserPlatform: jest.fn().mockReturnValue('mac_arm'),
    canDownload: jest.fn().mockResolvedValue(true),
    uninstall: jest.fn(),
    getInstalledBrowsers: jest.fn(),
}));
const { install, canDownload, getInstalledBrowsers, detectBrowserPlatform, uninstall } =
    await import('@puppeteer/browsers');

// Stubbed so the reading and writing resolvers can be told apart. They differ in production only
// for a standalone build whose primary cache is empty while the previous default location is
// not - exactly the case where reading from the wrong one costs a 150 MB re-download.
jest.unstable_mockModule('../browser-paths.js', () => ({
    resolveBrowserCacheDir: jest.fn(() => '/read-here'),
    resolveBrowserCacheDirForWriting: jest.fn(() => '/write-here'),
    assertCacheDirWritable: jest.fn(),
    isPermissionDenied: jest.fn(() => false),
    unwritableCacheDirMessage: jest.fn((dir) => `cannot write to ${dir}`),
}));
const { assertCacheDirWritable } = await import('../browser-paths.js');

jest.unstable_mockModule('puppeteer-core/internal/revisions.js', () => ({
    PUPPETEER_REVISIONS: Object.freeze({ chrome: '150.0.7871.24' }),
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
    sleep: jest.fn().mockResolvedValue(undefined),
}));
const { logger } = await import('../../../globals.js');

jest.unstable_mockModule('fs', () => ({
    default: { existsSync: jest.fn() },
    existsSync: jest.fn(),
}));
const fs = (await import('fs')).default;

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

const RECOMMENDED = '150.0.7871.24';

/**
 * Builds a cache entry as `@puppeteer/browsers` reports it.
 *
 * @param {object} [overrides] - Fields to override.
 *
 * @returns {object} An installed-browser-shaped entry.
 */
const cached = (overrides = {}) => ({
    browser: 'chrome',
    buildId: RECOMMENDED,
    platform: 'mac_arm',
    path: `/read-here/chrome/mac_arm-${RECOMMENDED}`,
    executablePath: `/read-here/chrome/mac_arm-${RECOMMENDED}/chrome`,
    ...overrides,
});

beforeEach(() => {
    jest.clearAllMocks();
    detectBrowserPlatform.mockReturnValue('mac_arm');
    canDownload.mockResolvedValue(true);
    fs.existsSync.mockImplementation((candidate) => String(candidate).startsWith('/read-here/'));
    getInstalledBrowsers.mockResolvedValue([]);
    // `clearMocks` keeps implementations, so the rejection one test installs would otherwise
    // make every later cleanup fail.
    uninstall.mockResolvedValue(undefined);
    install.mockResolvedValue({
        browser: 'chrome',
        buildId: RECOMMENDED,
        executablePath: `/write-here/chrome/mac_arm-${RECOMMENDED}/chrome`,
    });
});

const OPTIONS = { browser: 'chrome', browserVersion: 'recommended' };

describe('browserInstall — a build already staged in the cache', () => {
    test('returns the staged build without reaching the network', async () => {
        // The assertion that matters is `canDownload` never being called. Checking only the log
        // line would pass with the network request still happening, which is the entire defect.
        getInstalledBrowsers.mockResolvedValue([cached()]);

        const result = await browserInstall(OPTIONS);

        expect(canDownload).not.toHaveBeenCalled();
        expect(install).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            browser: 'chrome',
            buildId: RECOMMENDED,
            executablePath: `/read-here/chrome/mac_arm-${RECOMMENDED}/chrome`,
        });
    });

    test('says what it found and how to replace it', async () => {
        // Quoted verbatim by the documentation, and the only place the operator is told that
        // installing is now a no-op - so it has to name the way back to a reinstall.
        getInstalledBrowsers.mockResolvedValue([cached()]);

        await browserInstall(OPTIONS);

        const info = logger.info.mock.calls.map(([msg]) => msg).join('\n');
        expect(info).toContain(`chrome ${RECOMMENDED} is already installed at`);
        expect(info).toContain('Nothing to download.');
        expect(info).toContain('browser uninstall --browser-version');
    });

    test('falls through when the host platform cannot be detected', async () => {
        // The inventory reports every build as `isCurrentPlatform` when there is no host
        // platform to compare against, which is right for running a browser and wrong here:
        // install() would throw "Unable to detect browser platform" rather than accept a foreign
        // build, and that honest failure must not be replaced by a false "already installed".
        detectBrowserPlatform.mockReturnValue(undefined);
        getInstalledBrowsers.mockResolvedValue([cached({ platform: 'win64' })]);

        await browserInstall(OPTIONS);

        expect(install).toHaveBeenCalled();
    });

    test('looks in the reading cache directory, not the one it would install into', async () => {
        // A standalone build whose primary cache is empty reads from the previous default
        // location. Looking for a staged build in the write target instead would miss it and
        // re-download ~150 MB that detection is happily using.
        getInstalledBrowsers.mockResolvedValue([cached()]);

        await browserInstall(OPTIONS);

        expect(getInstalledBrowsers).toHaveBeenCalledWith({ cacheDir: '/read-here' });
    });

    test('does not require the cache directory to be writable', async () => {
        // A browser staged onto a read-only share, or unzipped under C:\Program Files, needs no
        // write at all when the build is already there.
        getInstalledBrowsers.mockResolvedValue([cached()]);

        await browserInstall(OPTIONS);

        expect(assertCacheDirWritable).not.toHaveBeenCalled();
    });

    test('still installs into the writing directory when nothing is staged', async () => {
        await browserInstall(OPTIONS);

        expect(assertCacheDirWritable).toHaveBeenCalledWith('/write-here');
        expect(install).toHaveBeenCalledWith(
            expect.objectContaining({ cacheDir: '/write-here', buildId: RECOMMENDED })
        );
    });

    test('ignores a staged build made for another platform', async () => {
        // Unlike detection, which asks only whether a build will start, install asks whether the
        // build it would download is already here - and it would download this platform's build.
        getInstalledBrowsers.mockResolvedValue([cached({ platform: 'win64' })]);

        await browserInstall(OPTIONS);

        expect(install).toHaveBeenCalled();
    });

    test('ignores a staged build whose executable is missing, and says so', async () => {
        // Reporting "already installed" for a folder with no browser in it would reintroduce
        // exactly the false success that cached-browser detection just stopped producing.
        getInstalledBrowsers.mockResolvedValue([cached()]);
        fs.existsSync.mockReturnValue(false);

        await browserInstall(OPTIONS);

        expect(install).toHaveBeenCalled();
        const warned = logger.warn.mock.calls.map(([msg]) => msg).join('\n');
        expect(warned).toContain(RECOMMENDED);
        expect(warned).toContain('executable');
    });

    test('clears the incomplete directory it is about to install over', async () => {
        // install() treats a surviving install directory as an already-installed browser, skips
        // the download and fails validation with "The browser folder exists but the executable
        // is missing". The retry loop recovers, but only after an alarming failed attempt - and
        // the warning above promises a reinstall, so it has to actually happen.
        getInstalledBrowsers.mockResolvedValue([cached()]);
        fs.existsSync.mockReturnValue(false);

        await browserInstall(OPTIONS);

        expect(uninstall).toHaveBeenCalledWith({
            browser: 'chrome',
            buildId: RECOMMENDED,
            cacheDir: '/read-here',
            platform: 'mac_arm',
        });
    });

    test('installs anyway when the incomplete directory cannot be cleared', async () => {
        // Cleanup is best effort. Letting its failure escape would replace a recoverable install
        // with an error about a directory the operator never asked about.
        getInstalledBrowsers.mockResolvedValue([cached()]);
        fs.existsSync.mockReturnValue(false);
        uninstall.mockRejectedValue(new Error('EPERM: operation not permitted'));

        await expect(browserInstall(OPTIONS)).resolves.toMatchObject({ buildId: RECOMMENDED });
    });

    test('explains a staged build that is for the wrong platform', async () => {
        getInstalledBrowsers.mockResolvedValue([cached({ platform: 'win64' })]);

        await browserInstall(OPTIONS);

        const verbose = logger.verbose.mock.calls.map(([msg]) => msg).join('\n');
        expect(verbose).toContain('win64');
        expect(verbose).toContain('mac_arm');
    });

    test('ignores a different build of the same browser', async () => {
        getInstalledBrowsers.mockResolvedValue([cached({ buildId: '131.0.6778.204' })]);

        await browserInstall(OPTIONS);

        expect(install).toHaveBeenCalled();
    });

    test('does not fail the install when the cache cannot be read', async () => {
        // The short-circuit is an optimisation over the install path, not a precondition for it.
        // An unreadable cache must fall through to the normal install rather than abort it.
        getInstalledBrowsers.mockRejectedValue(new Error('EACCES: permission denied'));

        await expect(browserInstall(OPTIONS)).resolves.toMatchObject({ buildId: RECOMMENDED });
        expect(install).toHaveBeenCalled();
    });
});
