import { jest, test, expect, describe, beforeEach, afterEach } from '@jest/globals';
import os from 'node:os';
import path from 'node:path';

/**
 * `browser check` - the worker.
 *
 * Two properties are load-bearing beyond the individual assertions.
 *
 * **It must not touch the network.** `browserInstall` and `canDownload` are mocked here purely so
 * that reaching them can be asserted against. A doctor that hangs on a DNS timeout on an
 * air-gapped server is worse than no doctor, and the way that regression would arrive is somebody
 * swapping `detectAvailableBrowser()` for `resolveBrowserExecutablePath()`, which falls through to
 * an install.
 *
 * **The best-effort disclaimer is emitted on both paths.** Nothing breaks if it quietly disappears
 * in a refactor, which is exactly why it needs a test rather than a code comment.
 */

const loggerMock = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
};

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: loggerMock,
    setLoggingLevel: jest.fn(),
    // browser-paths.js gates the standalone cache location on this, and ESM checks named exports
    // when the module graph is linked, so leaving it out is a hard error rather than an undefined.
    isSea: false,
    bsiExecutablePath: '/opt/bsi',
    appVersion: 'test-version',
}));

jest.unstable_mockModule('@puppeteer/browsers', () => ({
    canDownload: jest.fn().mockResolvedValue(true),
    computeExecutablePath: jest.fn(),
    detectBrowserPlatform: jest.fn().mockReturnValue('win64'),
    getInstalledBrowsers: jest.fn().mockResolvedValue([]),
    getVersionComparator: jest.fn(),
    install: jest.fn(),
    resolveBuildId: jest.fn(),
    uninstall: jest.fn(),
}));

jest.unstable_mockModule('../browser-detect.js', () => ({
    detectAvailableBrowser: jest.fn(),
}));

jest.unstable_mockModule('../browser-inventory.js', () => ({
    getBrowserInventory: jest.fn().mockResolvedValue([]),
    hasUsableExecutable: jest.fn().mockReturnValue(true),
    canRunOnHost: jest.fn().mockReturnValue(true),
}));

jest.unstable_mockModule('../browser-install.js', () => ({
    browserInstall: jest.fn(),
}));

const launchMock = jest.fn();
jest.unstable_mockModule('puppeteer-core', () => ({
    default: { launch: launchMock },
}));

const { canDownload } = await import('@puppeteer/browsers');
const { detectAvailableBrowser } = await import('../browser-detect.js');
const { getBrowserInventory, hasUsableExecutable } = await import('../browser-inventory.js');
const { browserInstall } = await import('../browser-install.js');
const { browserCheck } = await import('../browser-check.js');
const { BEST_EFFORT_DISCLAIMER } = await import('../../doctor/render-report.js');

/** A cached build the host can run, with its binary present. */
const CACHED_BUILD = {
    browser: 'chrome',
    buildId: '138.0.7204.94',
    platform: 'win64',
    path: '/cache/chrome/win64-138.0.7204.94',
    executablePath: '/cache/chrome/win64-138.0.7204.94/chrome',
    isCurrentPlatform: true,
    canRunHere: true,
};

/**
 * A browser handle that answers a version query.
 *
 * @param {object} [overrides] - Methods to replace on the default handle.
 *
 * @returns {object} A stand-in for a Puppeteer browser.
 */
const fakeBrowser = (overrides = {}) => ({
    version: jest.fn().mockResolvedValue('Chrome/138.0.7204.94'),
    close: jest.fn().mockResolvedValue(undefined),
    ...overrides,
});

/**
 * Every line the logger was given, at any level, joined.
 *
 * @returns {string} The logged output.
 */
const loggedText = () =>
    [loggerMock.info, loggerMock.warn, loggerMock.error, loggerMock.verbose, loggerMock.debug]
        .flatMap((fn) => fn.mock.calls.map(([line]) => String(line)))
        .join('\n');

/**
 * Options with a cache directory, so no test depends on this machine's real one.
 *
 * @param {object} [extra] - Extra options to merge in.
 *
 * @returns {object} An options bag.
 */
const options = (extra = {}) => ({
    browser: 'chrome',
    browserVersion: 'recommended',
    headless: 'true',
    browserCacheDir: path.join(os.tmpdir(), 'bsi-browser-check-test'),
    ...extra,
});

let savedPuppeteerCacheDir;
let savedPuppeteerExecutablePath;

beforeEach(() => {
    // Both are ambient and behaviour-affecting: a developer shell or a CI image may have them set,
    // and browser-paths.js reads them directly rather than through Commander.
    savedPuppeteerCacheDir = process.env.PUPPETEER_CACHE_DIR;
    savedPuppeteerExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    delete process.env.PUPPETEER_CACHE_DIR;
    delete process.env.PUPPETEER_EXECUTABLE_PATH;

    getBrowserInventory.mockResolvedValue([]);
    hasUsableExecutable.mockReturnValue(true);
    launchMock.mockResolvedValue(fakeBrowser());
});

afterEach(() => {
    if (savedPuppeteerCacheDir === undefined) {
        delete process.env.PUPPETEER_CACHE_DIR;
    } else {
        process.env.PUPPETEER_CACHE_DIR = savedPuppeteerCacheDir;
    }

    if (savedPuppeteerExecutablePath === undefined) {
        delete process.env.PUPPETEER_EXECUTABLE_PATH;
    } else {
        process.env.PUPPETEER_EXECUTABLE_PATH = savedPuppeteerExecutablePath;
    }
});

describe('a machine that can take screenshots', () => {
    test('reports ok when a named executable exists and the browser launches', async () => {
        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/usr/bin/chromium',
            source: 'system',
            browser: 'chrome',
            buildId: 'system-installed',
        });

        const report = await browserCheck(options({ browserExecutablePath: process.execPath }));

        expect(report.ok).toBe(true);
        expect(report.launched).toBe(true);
        expect(report.browserVersion).toBe('Chrome/138.0.7204.94');
        expect(report.wouldDownload).toBe(false);
        expect(report.selection).toEqual({
            source: 'system',
            executablePath: '/usr/bin/chromium',
            browser: 'chrome',
            buildId: 'system-installed',
        });
    });

    test('launches with the production arguments and headless setting', async () => {
        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/usr/bin/chromium',
            source: 'system',
            browser: 'chrome',
            buildId: 'system-installed',
        });

        await browserCheck(options({ headless: 'false' }));

        const [launchOptions] = launchMock.mock.calls[0];

        // Resolving a path proves far less than starting the process, and starting it with
        // different arguments than a real run proves less again.
        expect(launchOptions.executablePath).toBe('/usr/bin/chromium');
        expect(launchOptions.headless).toBe(false);
        expect(launchOptions.args).toContain('--no-sandbox');
        expect(launchOptions.args).toContain('--ignore-certificate-errors');
    });

    test('closes the browser even when the version query fails', async () => {
        const browser = fakeBrowser({
            version: jest.fn().mockRejectedValue(new Error('Session closed')),
        });
        launchMock.mockResolvedValue(browser);
        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/usr/bin/chromium',
            source: 'system',
            browser: 'chrome',
            buildId: 'system-installed',
        });

        const report = await browserCheck(options());

        expect(browser.close).toHaveBeenCalledTimes(1);
        expect(report.ok).toBe(false);
        expect(report.launchError).toContain('Session closed');

        // Issue #878, and the reason the launch is tracked in two phases: this browser started
        // perfectly well. Reporting it as one that "could not be started" led with antivirus
        // advice while the actual fix - a different build - sat underneath it.
        expect(report.findings.map((finding) => finding.id)).toContain('BSI-BROWSER-020');
        expect(report.findings.map((finding) => finding.id)).not.toContain('BSI-BROWSER-015');
    });

    test('a browser that never starts is reported as a start failure, not a driving failure', async () => {
        launchMock.mockRejectedValue(new Error('Failed to launch the browser process!'));
        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/usr/bin/chromium',
            source: 'system',
            browser: 'chrome',
            buildId: 'system-installed',
        });

        const report = await browserCheck(options());

        expect(report.ok).toBe(false);
        expect(report.findings.map((finding) => finding.id)).toContain('BSI-BROWSER-015');
        expect(report.findings.map((finding) => finding.id)).not.toContain('BSI-BROWSER-020');
    });

    test('an error carrying no message still says something', async () => {
        // `err?.message ?? String(err)` kept an empty string, because '' is neither null nor
        // undefined - producing "starting it failed: " and a launchError a JSON consumer reads as
        // absent while ok is false.
        launchMock.mockRejectedValue(new Error(''));
        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/usr/bin/chromium',
            source: 'system',
            browser: 'chrome',
            buildId: 'system-installed',
        });

        const report = await browserCheck(options());

        expect(report.launchError).toBeTruthy();
    });

    test('--skip-launch resolves a browser without starting one', async () => {
        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/usr/bin/chromium',
            source: 'system',
            browser: 'chrome',
            buildId: 'system-installed',
        });

        const report = await browserCheck(options({ skipLaunch: true }));

        expect(launchMock).not.toHaveBeenCalled();
        expect(report.launched).toBe(false);
        // Still a pass: a browser was found, and the administrator asked not to start it.
        expect(report.ok).toBe(true);
    });
});

describe('the four ways this command could wrongly report OK', () => {
    // Every test here is a route by which `browser check` exited 0 on a machine where a real run
    // fails. That is the one thing this command must never do: it is documented as a deployment
    // gate, so a false pass is worse than no command at all.

    test('a --browser-version a real run would reject fails the check', async () => {
        // The catch-all in resolveBuildIdOffline used to treat any unrecognised value as a
        // floating keyword - "accept the newest cached build, emit a warning" - and warnings do
        // not fail the run. Meanwhile resolveBrowserVersion() throws for the same value, so the
        // real thumbnail run died on the very misconfiguration the check was run to catch.
        getBrowserInventory.mockResolvedValue([CACHED_BUILD]);
        detectAvailableBrowser.mockResolvedValue({
            executablePath: CACHED_BUILD.executablePath,
            source: 'cache',
            browser: 'chrome',
            buildId: CACHED_BUILD.buildId,
        });

        const report = await browserCheck(options({ browserVersion: 'garbage' }));

        expect(report.ok).toBe(false);
        expect(report.findings.map((finding) => finding.id)).toContain('BSI-BROWSER-018');
        expect(loggedText()).toContain('garbage');
    });

    test('a milestone pin fails, because a real run cannot resolve it offline', async () => {
        // "151" is an explicit pin that browser install and browser uninstall both accept, so it
        // was first reported as a warning alongside `stable`. That was still a false OK: a failed
        // lookup only degrades to a cached build for keywords, and isVersionKeyword('151') is
        // false - so an air-gapped run throws before it reaches the cache. Its own finding, and an
        // error.
        getBrowserInventory.mockResolvedValue([CACHED_BUILD]);
        detectAvailableBrowser.mockResolvedValue({
            executablePath: CACHED_BUILD.executablePath,
            source: 'cache',
            browser: 'chrome',
            buildId: CACHED_BUILD.buildId,
        });

        const report = await browserCheck(options({ browserVersion: '151' }));

        const pin = report.findings.find((finding) => finding.id === 'BSI-BROWSER-022');

        expect(pin).toBeDefined();
        expect(pin.severity).toBe('error');
        expect(pin.detail).not.toContain('names whichever build is newest');
        expect(pin.detail).toContain('151');
        expect(report.ok).toBe(false);
        // And it is not confused with the floating-keyword warning, which describes a different
        // consequence and would send the reader somewhere else.
        expect(report.findings.map((finding) => finding.id)).not.toContain('BSI-BROWSER-013');
    });

    test('a floating keyword is still only a warning, because a real run degrades', async () => {
        getBrowserInventory.mockResolvedValue([CACHED_BUILD]);
        detectAvailableBrowser.mockResolvedValue({
            executablePath: CACHED_BUILD.executablePath,
            source: 'cache',
            browser: 'chrome',
            buildId: CACHED_BUILD.buildId,
        });

        const report = await browserCheck(options({ browserVersion: 'stable' }));

        expect(report.findings.find((finding) => finding.id === 'BSI-BROWSER-013').severity).toBe(
            'warning'
        );
        expect(report.ok).toBe(true);
    });

    test('an unsupported browser is named as the problem, not the version', async () => {
        // getRecommendedBuildId throws for a browser Butler Sheet Icons cannot drive, and the
        // catch used to overwrite the version form with INVALID while leaving requestedVersion as
        // 'recommended'. The report then said `--browser-version "recommended" is neither a
        // keyword nor a build id` - false, and it sends the administrator to change the one
        // setting that was correct.
        detectAvailableBrowser.mockResolvedValue(null);

        const report = await browserCheck(options({ browser: 'firefox' }));

        expect(report.ok).toBe(false);

        const ids = report.findings.map((finding) => finding.id);

        expect(ids).toContain('BSI-BROWSER-023');
        expect(ids).not.toContain('BSI-BROWSER-018');

        const unsupported = report.findings.find((f) => f.id === 'BSI-BROWSER-023');

        expect(unsupported.detail).toContain('firefox');
        expect(unsupported.detail).not.toContain('neither a keyword nor a build id');
    });

    test('an unreadable browser cache is a finding, and the report still prints', async () => {
        // The cache directory is read with no try/catch, so an EACCES or ENOTDIR killed the whole
        // command: no Environment block, no cache location, not even the disclaimer. That is the
        // LocalSystem case this command exists to diagnose - a cache staged by an administrator
        // and read by a service account.
        const denied = new Error("EACCES: permission denied, scandir '/cache/chrome'");
        denied.code = 'EACCES';
        getBrowserInventory.mockRejectedValue(denied);
        detectAvailableBrowser.mockResolvedValue(null);

        const report = await browserCheck(options());

        expect(report.ok).toBe(false);
        expect(report.findings.map((finding) => finding.id)).toContain('BSI-BROWSER-019');
        // The facts that make the diagnosis, all of which used to be lost.
        expect(loggedText()).toContain('Environment');
        expect(loggedText()).toContain('Running as user');
        expect(loggedText()).toContain(BEST_EFFORT_DISCLAIMER[0]);
        expect(loggedText()).toContain('permission denied');
    });

    test('cached builds of another browser are not counted as usable', async () => {
        // getBrowserInventory returns every browser in the cache directory, but detection filters
        // by the requested type first. Reasoning over the unfiltered list made the check name
        // chrome-headless-shell build ids in its remediation - a command that fails identically -
        // while the cache check reported "Cached browsers match this machine".
        getBrowserInventory.mockResolvedValue([
            { ...CACHED_BUILD, browser: 'chrome-headless-shell' },
        ]);
        detectAvailableBrowser.mockResolvedValue(null);

        const report = await browserCheck(options());

        expect(report.ok).toBe(false);
        expect(report.cachedBrowsers[0]).toEqual(
            expect.objectContaining({
                browser: 'chrome-headless-shell',
                usable: false,
                reason: expect.stringContaining('chrome'),
            })
        );
        // The remediation must not offer a build detection will never look at.
        const steps = report.findings.flatMap((finding) =>
            finding.remediation.map((step) => `${step.text} ${step.command?.bash ?? ''}`)
        );
        expect(steps.join('\n')).not.toContain(CACHED_BUILD.buildId);
    });

    test('detection is given the normalised browser, so it filters by type', async () => {
        // Every other consumer normalises with `options.browser ?? 'chrome'`; detection got the
        // raw bag, and it drops its type filter entirely when `options.browser` is absent. With a
        // cache holding only chrome-headless-shell, `browserCheck({})` selected a build the render
        // path cannot drive and exited 0 - while the same report said the cache held no chrome.
        getBrowserInventory.mockResolvedValue([
            { ...CACHED_BUILD, browser: 'chrome-headless-shell' },
        ]);
        detectAvailableBrowser.mockResolvedValue(null);

        await browserCheck({ browserCacheDir: path.join(os.tmpdir(), 'bsi-browser-check-test') });

        expect(detectAvailableBrowser).toHaveBeenCalledWith(
            expect.objectContaining({ browser: 'chrome' }),
            expect.anything(),
            expect.anything()
        );
    });

    test('the browser cache is read once, so the report cannot contradict the verdict', async () => {
        // gatherContext read the inventory and then detection read it again, independently. The
        // report described snapshot 1 while the verdict came from snapshot 2, so a build removed
        // between them (an antivirus quarantine, a concurrent uninstall) produced a report that
        // listed a build as usable and simultaneously said it was missing.
        getBrowserInventory.mockResolvedValue([CACHED_BUILD]);
        detectAvailableBrowser.mockResolvedValue(null);

        await browserCheck(options());

        expect(getBrowserInventory).toHaveBeenCalledTimes(1);

        // And the single snapshot is what detection was asked to reason about.
        const [, , extra] = detectAvailableBrowser.mock.calls[0];
        expect(extra.inventory).toHaveLength(1);
        expect(extra.inventory[0].buildId).toBe(CACHED_BUILD.buildId);
    });

    test('nothing usable stays an error when no other check explained why', async () => {
        // The selection check used to demote itself to info whenever the cache held any build,
        // predicting that a cache check had already raised the error. That prediction held only
        // while `usable` meant exactly `canRunHere && executableExists`, so a build unusable for
        // any third reason left every check reporting OK and the command exiting 0 on a machine
        // that cannot take a screenshot.
        //
        // An empty cache is the case that reaches BSI-BROWSER-011 with nothing to supersede it:
        // the platform check reports an empty cache as information, so if 011 did not stand as an
        // error, nothing in the report would be one.
        //
        // Asserting `ok === false` alone is not enough, and an earlier version of this test made
        // exactly that mistake - it built a cache whose build was usable, took the
        // BSI-BROWSER-017 branch instead, and still passed when 011 was mutated to `info`. The
        // severity of the specific finding is what has to be pinned.
        getBrowserInventory.mockResolvedValue([]);
        detectAvailableBrowser.mockResolvedValue(null);

        const report = await browserCheck(options());
        const nothingUsable = report.findings.find((finding) => finding.id === 'BSI-BROWSER-011');

        expect(nothingUsable).toBeDefined();
        expect(nothingUsable.severity).toBe('error');
        expect(nothingUsable.remediation.length).toBeGreaterThan(0);
        expect(report.ok).toBe(false);

        // And it is the only thing failing the run, so the assertion above cannot be satisfied by
        // some unrelated error standing in for it.
        expect(
            report.findings.filter((finding) => finding.severity === 'error').map((f) => f.id)
        ).toEqual(['BSI-BROWSER-011']);
    });
});

describe('a machine that cannot', () => {
    test('reports a download would be needed, without reaching the network', async () => {
        detectAvailableBrowser.mockResolvedValue(null);

        const report = await browserCheck(options());

        expect(report.ok).toBe(false);
        expect(report.wouldDownload).toBe(true);
        expect(report.launched).toBe(false);

        // The regression this guards: swapping detectAvailableBrowser() for
        // resolveBrowserExecutablePath() would reach both of these.
        expect(browserInstall).not.toHaveBeenCalled();
        expect(canDownload).not.toHaveBeenCalled();
        expect(launchMock).not.toHaveBeenCalled();
    });

    test('a --browser-executable-path that does not exist is a finding, not a crash', async () => {
        const { BrowserNotFoundError } = await import('../../util/errors.js');

        // Since #1061 detection throws for an explicitly named path that is missing, rather than
        // returning null. Reporting that is arguably the most valuable thing this command does:
        // it means somebody's explicit configuration is wrong.
        detectAvailableBrowser.mockRejectedValue(
            new BrowserNotFoundError(
                '--browser-executable-path is set to "D:\\nope\\chrome.exe" but no such file exists on this machine.'
            )
        );

        const report = await browserCheck(
            options({ browserExecutablePath: 'D:\\nope\\chrome.exe' })
        );

        expect(report.ok).toBe(false);
        expect(report.selection).toBeNull();
        expect(report.executableOverride).toEqual(
            expect.objectContaining({ exists: false, source: 'option' })
        );
        expect(report.findings.map((finding) => finding.id)).toContain('BSI-BROWSER-002');
        expect(loggedText()).toContain('no such file exists on this machine');
    });

    test('lists a wrong-platform cached build as unusable, and says why', async () => {
        getBrowserInventory.mockResolvedValue([
            { ...CACHED_BUILD, platform: 'mac_arm', isCurrentPlatform: false, canRunHere: false },
        ]);
        detectAvailableBrowser.mockResolvedValue(null);

        const report = await browserCheck(options());

        expect(report.cachedBrowsers).toEqual([
            expect.objectContaining({
                browser: 'chrome',
                buildId: '138.0.7204.94',
                platform: 'mac_arm',
                executableExists: true,
                usable: false,
                reason: expect.stringContaining('another platform'),
            }),
        ]);
    });

    test('lists a cached build whose binary is missing as unusable', async () => {
        getBrowserInventory.mockResolvedValue([CACHED_BUILD]);
        hasUsableExecutable.mockReturnValue(false);
        detectAvailableBrowser.mockResolvedValue(null);

        const report = await browserCheck(options());

        expect(report.cachedBrowsers[0]).toEqual(
            expect.objectContaining({
                executableExists: false,
                usable: false,
                reason: expect.stringContaining('executable'),
            })
        );
    });
});

describe('the best-effort disclaimer', () => {
    // §15.7. It is not suppressible, it appears once, and it appears whatever the outcome - an
    // administrator who only ever sees a healthy machine is exactly the one who needs to know the
    // limits of what was checked.
    test('is printed on the success path', async () => {
        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/usr/bin/chromium',
            source: 'system',
            browser: 'chrome',
            buildId: 'system-installed',
        });

        const report = await browserCheck(options());

        expect(report.ok).toBe(true);
        expect(loggedText()).toContain(BEST_EFFORT_DISCLAIMER[0]);
    });

    test('is printed on the failure path', async () => {
        detectAvailableBrowser.mockResolvedValue(null);

        const report = await browserCheck(options());

        expect(report.ok).toBe(false);
        expect(loggedText()).toContain(BEST_EFFORT_DISCLAIMER[0]);
    });

    test('is carried in the returned data as well as printed', async () => {
        detectAvailableBrowser.mockResolvedValue(null);

        const report = await browserCheck(options());

        expect(report.disclaimer).toEqual(BEST_EFFORT_DISCLAIMER);
    });

    test('appears exactly once', async () => {
        detectAvailableBrowser.mockResolvedValue(null);

        await browserCheck(options());

        const occurrences = loggedText()
            .split('\n')
            .filter((line) => line.includes(BEST_EFFORT_DISCLAIMER[0])).length;

        expect(occurrences).toBe(1);
    });
});

describe('the machine facts', () => {
    test('are reported so the LocalSystem trap is a one-glance diagnosis', async () => {
        detectAvailableBrowser.mockResolvedValue(null);

        const report = await browserCheck(options());

        expect(report.nodePlatform).toBe(process.platform);
        expect(report.arch).toBe(process.arch);
        expect(report.hostPlatform).toBe('win64');
        expect(report.homeDir).toBe(os.homedir());
        expect(report.cwd).toBe(process.cwd());
        expect(report.isSea).toBe(false);
        expect(typeof report.user).toBe('string');
    });

    test('name the cache directory that was actually searched', async () => {
        detectAvailableBrowser.mockResolvedValue(null);

        const cacheDir = path.join(os.tmpdir(), 'bsi-browser-check-test');
        const report = await browserCheck(options({ browserCacheDir: cacheDir }));

        // Compared through path.resolve on both sides: a POSIX literal would pass on macOS and
        // Linux and fail only on the Windows runner.
        expect(report.cacheDir).toBe(path.resolve(cacheDir));
        expect(report.cacheDirSource).toBe('option');
    });

    test('say that the cache is not consulted when an executable is named', async () => {
        detectAvailableBrowser.mockResolvedValue({
            executablePath: process.execPath,
            source: 'system',
            browser: 'chrome',
            buildId: 'system-installed',
        });

        const report = await browserCheck(options({ browserExecutablePath: process.execPath }));

        // Without this line administrators file bugs about a cache directory that "does nothing".
        expect(report.cacheDirUsed).toBe(false);
        expect(loggedText()).toContain('an executable path is configured');
    });
});
