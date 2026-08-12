import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

jest.unstable_mockModule('puppeteer-core', () => ({
    default: { launch: jest.fn() },
}));
const puppeteer = (await import('puppeteer-core')).default;

jest.unstable_mockModule('@puppeteer/browsers', () => ({
    computeExecutablePath: jest.fn().mockReturnValue('/downloaded/chrome'),
}));
const { computeExecutablePath } = await import('@puppeteer/browsers');

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    },
    // browser-paths.js gates the standalone cache location on this, and ESM checks
    // named exports when the module graph is linked, so leaving it out is a hard error
    // rather than an undefined.
    isSea: false,
}));
const { logger } = await import('../../../globals.js');

jest.unstable_mockModule('../browser-detect.js', () => ({
    detectAvailableBrowser: jest.fn(),
}));
const { detectAvailableBrowser } = await import('../browser-detect.js');

jest.unstable_mockModule('../browser-install.js', () => ({
    browserInstall: jest.fn(),
}));
const { browserInstall } = await import('../browser-install.js');

// Version resolution has its own suite. Stubbed here so these tests exercise the launch path
// rather than a version service. isVersionKeyword mirrors the real module's semantics - a mock
// with different semantics would let the keyword/pin distinction in the fallback logic rot
// unnoticed. isVersionLookupFailure is a plain mock because the marker lives on errors the
// tests construct themselves.
jest.unstable_mockModule('../browser-version.js', () => ({
    resolveBrowserVersion: jest.fn(async (browser, browserVersion) => ({
        buildId: '150.0.7871.24',
        source: 'recommended',
        requested: browserVersion,
        usedNetwork: false,
    })),
    isVersionKeyword: jest.fn((v) =>
        [
            'recommended',
            'stable',
            'latest',
            'beta',
            'dev',
            'canary',
            'nightly',
            'devedition',
            'esr',
        ].includes(v)
    ),
    isVersionLookupFailure: jest.fn(() => false),
    VERSION_RECOMMENDED: 'recommended',
}));
const { resolveBrowserVersion, isVersionLookupFailure } = await import('../browser-version.js');

// Docker detection imports fs dynamically; existsSync drives which branch is taken.
jest.unstable_mockModule('node:fs', () => ({
    default: { existsSync: jest.fn() },
    existsSync: jest.fn().mockReturnValue(false),
}));
const fs = await import('node:fs');

const {
    launchBrowserForApp,
    buildBrowserArgs,
    resolveBrowserExecutablePath,
    closeBrowserQuietly,
    BROWSER_LAUNCH_TIMEOUT_MS,
    BROWSER_PROTOCOL_TIMEOUT_MS,
} = await import('../browser-launch.js');

/** Stand-in typed error, matching the (message, { cause }) shape of the real ones. */
class TestError extends Error {
    /**
     * Construct a test error carrying an optional cause.
     *
     * @param {string} message - Error message.
     * @param {object} [options] - Error options, including `cause`.
     */
    constructor(message, options) {
        super(message, options);
        this.name = 'TestError';
    }
}

const CONTEXT = {
    appId: 'test-app-id',
    logPrefix: 'TEST',
    appLabel: 'test app',
    ErrorClass: TestError,
};

const OPTIONS = { browser: 'chrome', browserVersion: 'recommended', headless: true };

/**
 * Builds a stand-in Puppeteer browser handle.
 *
 * `version()` and `on()` are part of the contract `launchBrowserForApp` now relies on: it health
 * checks the browser immediately after launch, and listens for an unexpected disconnect.
 *
 * @param {object} [overrides] - Properties to replace on the fake, e.g. a rejecting `version`.
 *
 * @returns {object} A browser-shaped object.
 */
function fakeBrowser(overrides = {}) {
    return {
        id: 'browser',
        version: jest.fn().mockResolvedValue('Chrome/150.0.7871.24'),
        on: jest.fn(),
        close: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

/**
 * Concatenates everything logged at error level.
 *
 * @returns {string} Combined error output.
 */
function errorOutput() {
    return logger.error.mock.calls.map((call) => String(call[0])).join('\n');
}

beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    resolveBrowserVersion.mockResolvedValue({
        buildId: '150.0.7871.24',
        source: 'recommended',
        requested: 'recommended',
        usedNetwork: false,
    });
    // clearMocks resets call history but not implementations, so a test that flips this to
    // true would otherwise leak into its neighbours.
    isVersionLookupFailure.mockImplementation(() => false);
});

describe('buildBrowserArgs', () => {
    test('includes the shared Chromium flags', async () => {
        const args = await buildBrowserArgs();

        expect(args).toEqual(expect.arrayContaining(['--no-sandbox', '--disable-gpu']));
    });

    test('adds --single-process on non-Windows hosts outside Docker', async () => {
        expect(await buildBrowserArgs({ platform: 'linux' })).toContain('--single-process');
    });

    test('omits --single-process on Windows, where it broke QS Cloud (issue #742)', async () => {
        expect(await buildBrowserArgs({ platform: 'win32' })).not.toContain('--single-process');
    });

    test('omits --single-process in Docker, where it crashes Chromium', async () => {
        fs.existsSync.mockImplementation((p) => p === '/.dockerenv');

        // A non-Windows platform, so the Docker check is what omits the flag rather than the
        // Windows check short-circuiting ahead of it.
        expect(await buildBrowserArgs({ platform: 'linux' })).not.toContain('--single-process');
    });
});

describe('resolveBrowserExecutablePath', () => {
    test('uses a detected browser without installing', async () => {
        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/cached/chrome',
            source: 'cache',
            browser: 'chrome',
            buildId: '138.0.0.1',
        });

        const result = await resolveBrowserExecutablePath(OPTIONS);

        expect(result.executablePath).toBe('/cached/chrome');
        expect(browserInstall).not.toHaveBeenCalled();
    });

    // The build id has to travel back with the path: without it, a browser that cannot be driven
    // is reported with nothing tying the failure to --browser-version (issue #878).
    test('reports which build was selected, and where it came from', async () => {
        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/cached/chrome',
            source: 'cache',
            browser: 'chrome',
            buildId: '138.0.0.1',
        });

        expect(await resolveBrowserExecutablePath(OPTIONS)).toEqual({
            executablePath: '/cached/chrome',
            browser: 'chrome',
            buildId: '138.0.0.1',
            source: 'cache',
        });
    });

    test('searches the cache for the resolved build id', async () => {
        detectAvailableBrowser.mockResolvedValue(null);
        browserInstall.mockResolvedValue({ browser: 'chrome', buildId: '150.0.7871.24' });

        await resolveBrowserExecutablePath(OPTIONS);

        expect(detectAvailableBrowser).toHaveBeenCalledWith(OPTIONS, '150.0.7871.24');
    });

    test('installs when no browser is available', async () => {
        detectAvailableBrowser.mockResolvedValue(null);
        browserInstall.mockResolvedValue({ browser: 'chrome', buildId: '138.0.0.1' });

        const result = await resolveBrowserExecutablePath(OPTIONS);

        expect(result.executablePath).toBe('/downloaded/chrome');
        expect(browserInstall).toHaveBeenCalledTimes(1);
        expect(computeExecutablePath).toHaveBeenCalledWith(
            expect.objectContaining({ browser: 'chrome', buildId: '138.0.0.1' })
        );
    });

    // Installing a different build than the cache was searched for would defeat the whole point
    // of resolving once: the run could download a build, then not recognise it next time.
    test('installs the same build id the cache was searched for', async () => {
        detectAvailableBrowser.mockResolvedValue(null);
        browserInstall.mockResolvedValue({ browser: 'chrome', buildId: '150.0.7871.24' });

        await resolveBrowserExecutablePath(OPTIONS);

        expect(browserInstall).toHaveBeenCalledWith(OPTIONS, undefined, '150.0.7871.24');
    });
});

describe('resolveBrowserExecutablePath — keyword lookup failure', () => {
    // A machine that cannot reach the version service used to work fine against whatever was in
    // the cache. For floating keywords it must keep working, or moving to resolved build ids
    // would strand offline installations.
    test('falls back to any cached build when a keyword cannot be looked up', async () => {
        resolveBrowserVersion.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
        isVersionLookupFailure.mockImplementation(() => true);
        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/cached/chrome',
            source: 'cache',
            browser: 'chrome',
            buildId: '151.0.7922.77',
        });

        const result = await resolveBrowserExecutablePath(OPTIONS);

        expect(result.buildId).toBe('151.0.7922.77');
        // No build id passed, which is what tells detection to accept the newest cached build.
        expect(detectAvailableBrowser).toHaveBeenCalledWith(OPTIONS, undefined);
    });

    // With nothing cached there is no way forward, and the resolution failure is the honest
    // thing to report - an install error would send the reader after the wrong problem.
    test('reports the lookup failure when the cache cannot help either', async () => {
        const cause = new Error('getaddrinfo ENOTFOUND');
        resolveBrowserVersion.mockRejectedValue(cause);
        isVersionLookupFailure.mockImplementation(() => true);
        detectAvailableBrowser.mockResolvedValue(null);

        await expect(resolveBrowserExecutablePath(OPTIONS)).rejects.toBe(cause);
        expect(browserInstall).not.toHaveBeenCalled();
    });
});

describe('resolveBrowserExecutablePath — invalid version input (issue #878 review)', () => {
    // The regression the review caught: the fallback used to swallow EVERY resolution error, so
    // `--browser-version garbage` printed three errors saying the value was invalid and then
    // completed successfully on whatever build happened to be cached - the exact
    // build-nobody-chose failure mode this branch exists to remove.
    test('a validation failure fails the run instead of using the cache', async () => {
        const cause = new Error('Invalid --browser-version "garbage" for browser "chrome"');
        resolveBrowserVersion.mockRejectedValue(cause);
        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/cached/chrome',
            source: 'cache',
            browser: 'chrome',
            buildId: '151.0.7922.77',
        });

        await expect(
            resolveBrowserExecutablePath({ ...OPTIONS, browserVersion: 'garbage' })
        ).rejects.toBe(cause);

        expect(detectAvailableBrowser).not.toHaveBeenCalled();
        expect(browserInstall).not.toHaveBeenCalled();
    });

    // A pin is a promise: the user named a specific target, so substituting a cached build when
    // the lookup fails would run something they explicitly did not choose. Only floating
    // keywords may degrade.
    test('a lookup failure on an explicit pin fails the run', async () => {
        const cause = new Error('getaddrinfo ENOTFOUND');
        resolveBrowserVersion.mockRejectedValue(cause);
        isVersionLookupFailure.mockImplementation(() => true);
        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/cached/chrome',
            source: 'cache',
            browser: 'chrome',
            buildId: '150.0.7871.24',
        });

        await expect(
            resolveBrowserExecutablePath({ ...OPTIONS, browserVersion: '151' })
        ).rejects.toBe(cause);

        expect(detectAvailableBrowser).not.toHaveBeenCalled();
    });
});

describe('launchBrowserForApp', () => {
    test('asks Puppeteer to accept insecure certificates, under the name v25 understands', async () => {
        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/cached/chrome',
            source: 'cache',
            browser: 'chrome',
            buildId: '138.0.0.1',
        });
        const launched = fakeBrowser();
        puppeteer.launch.mockResolvedValue(launched);

        const browser = await launchBrowserForApp(OPTIONS, CONTEXT);

        expect(browser).toBe(launched);
        expect(puppeteer.launch).toHaveBeenCalledWith(
            expect.objectContaining({
                executablePath: '/cached/chrome',
                headless: true,
                acceptInsecureCerts: true,
            })
        );

        // The old name is a no-op in puppeteer-core v25 - it was removed in v23 and unknown options
        // are ignored without complaint, so passing it looked like certificate tolerance while
        // providing none. Asserting its absence is what stops it being reinstated by a future edit
        // that pattern-matches on older Puppeteer examples.
        expect(puppeteer.launch).not.toHaveBeenCalledWith(
            expect.objectContaining({ ignoreHTTPSErrors: expect.anything() })
        );
    });

    test('wraps an install failure in the caller-supplied error, with app context', async () => {
        detectAvailableBrowser.mockResolvedValue(null);
        const cause = new Error('network unreachable');
        browserInstall.mockRejectedValue(cause);

        await expect(launchBrowserForApp(OPTIONS, CONTEXT)).rejects.toThrow(TestError);
        await expect(launchBrowserForApp(OPTIONS, CONTEXT)).rejects.toThrow(
            'Failed to install a browser for test app test-app-id'
        );
        expect(puppeteer.launch).not.toHaveBeenCalled();
    });

    test('wraps a launch failure, preserving the original as cause', async () => {
        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/cached/chrome',
            source: 'cache',
            browser: 'chrome',
            buildId: '138.0.0.1',
        });
        const cause = new Error('no display');
        puppeteer.launch.mockRejectedValue(cause);

        const err = await launchBrowserForApp(OPTIONS, CONTEXT).catch((e) => e);

        expect(err).toBeInstanceOf(TestError);
        expect(err.message).toBe('Failed to launch virtual browser for test app test-app-id');
        expect(err.cause).toBe(cause);
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('TEST:'));
    });

    test('logs the thrown value itself when it is not an Error', async () => {
        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/cached/chrome',
            source: 'cache',
            browser: 'chrome',
            buildId: '138.0.0.1',
        });
        // A bare string has neither .stack nor .message; without a final fallback the log
        // line would read "... : undefined" and lose the only diagnostic available.
        puppeteer.launch.mockRejectedValue('no display available');

        await launchBrowserForApp(OPTIONS, CONTEXT).catch(() => undefined);

        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('no display available'));
    });
});

describe('launchBrowserForApp — unusable browser build (issue #878)', () => {
    beforeEach(() => {
        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/cached/chrome',
            source: 'cache',
            browser: 'chrome',
            buildId: '151.0.7922.109',
        });
    });

    // The failure this whole change exists for. Chrome starts, launch() resolves, and the browser
    // then dies on the first command. The old code had no check here at all, so the error
    // surfaced much later as a bare protocol error in a catch that knew nothing about browsers.
    test('fails at the browser layer when the build does not respond', async () => {
        puppeteer.launch.mockResolvedValue(
            fakeBrowser({
                version: jest
                    .fn()
                    .mockRejectedValue(
                        new Error('Protocol error (Browser.getVersion): Target closed')
                    ),
            })
        );

        await expect(launchBrowserForApp(OPTIONS, CONTEXT)).rejects.toThrow(TestError);
    });

    test('names the build that failed and the option that fixes it', async () => {
        puppeteer.launch.mockResolvedValue(
            fakeBrowser({
                version: jest.fn().mockRejectedValue(new Error('Target closed')),
            })
        );

        await launchBrowserForApp(OPTIONS, CONTEXT).catch(() => undefined);

        const out = errorOutput();
        expect(out).toContain('151.0.7922.109');
        expect(out).toContain('--browser-version recommended');
        expect(out).toContain('BSI_*_BROWSER_VERSION');
    });

    test('does not strand the dead browser process', async () => {
        const launched = fakeBrowser({
            version: jest.fn().mockRejectedValue(new Error('Target closed')),
        });
        puppeteer.launch.mockResolvedValue(launched);

        await launchBrowserForApp(OPTIONS, CONTEXT).catch(() => undefined);

        expect(launched.close).toHaveBeenCalled();
    });

    test('a healthy browser is returned without complaint', async () => {
        const launched = fakeBrowser();
        puppeteer.launch.mockResolvedValue(launched);

        await expect(launchBrowserForApp(OPTIONS, CONTEXT)).resolves.toBe(launched);
        expect(logger.error).not.toHaveBeenCalled();
    });
});

describe('unexpected disconnect', () => {
    /**
     * Launches a browser and hands back the `disconnected` handler that was registered.
     *
     * @param {object} launched - Fake browser to launch.
     *
     * @returns {Promise<Function>} The registered handler.
     */
    async function launchAndGetDisconnectHandler(launched) {
        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/cached/chrome',
            source: 'cache',
            browser: 'chrome',
            buildId: '151.0.7922.109',
        });
        puppeteer.launch.mockResolvedValue(launched);

        await launchBrowserForApp(OPTIONS, CONTEXT);

        const [, handler] = launched.on.mock.calls.find(([event]) => event === 'disconnected');
        return handler;
    }

    // The health check only covers a build that is dead on the first command. Reports of this
    // failure also name Target.createTarget and Emulation.setTouchEmulationEnabled, i.e. a
    // browser that survives the check and dies on the next call.
    test('explains a browser that dies after passing the health check', async () => {
        const launched = fakeBrowser();
        const handler = await launchAndGetDisconnectHandler(launched);

        handler();

        expect(errorOutput()).toContain('151.0.7922.109');
    });

    // Every successful run ends in a disconnect. Reporting those as "the build cannot be driven"
    // would make the advice worthless.
    test('stays quiet when Butler Sheet Icons closed the browser itself', async () => {
        const launched = fakeBrowser();
        const handler = await launchAndGetDisconnectHandler(launched);

        await closeBrowserQuietly(launched, 'TEST');
        handler();

        expect(logger.error).not.toHaveBeenCalled();
    });
});

describe('closeBrowserQuietly', () => {
    test('closes the browser', async () => {
        const browser = { close: jest.fn().mockResolvedValue(undefined) };

        await closeBrowserQuietly(browser, 'QSEOW');

        expect(browser.close).toHaveBeenCalledTimes(1);
    });

    test('swallows a close failure rather than throwing', async () => {
        // This runs from a finally that may already be unwinding a real failure. Throwing here
        // would replace the cause the operator needs to see.
        const browser = { close: jest.fn().mockRejectedValue(new Error('browser is wedged')) };

        await expect(closeBrowserQuietly(browser, 'QSEOW')).resolves.toBeUndefined();
    });

    test('logs the failure with the caller prefix, so it is not lost silently', async () => {
        const browser = { close: jest.fn().mockRejectedValue(new Error('browser is wedged')) };

        await closeBrowserQuietly(browser, 'CLOUD APP');

        const logged = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
        expect(logged).toContain('CLOUD APP');
        expect(logged).toContain('browser is wedged');
    });

    test.each([
        ['undefined', undefined],
        ['null', null],
    ])('ignores a %s browser, so a failed launch can share the finally', async (_l, browser) => {
        await expect(closeBrowserQuietly(browser, 'QSEOW')).resolves.toBeUndefined();
        expect(logger.error).not.toHaveBeenCalled();
    });
});

describe('log prefix shape', () => {
    test('adds the colon itself, so both platforms render the same shape', async () => {
        // QSEoW passed 'QSEOW' and Cloud passed 'CLOUD APP:', against a template with no colon.
        // QSEoW therefore logged "QSEOW Could not launch ..." while Cloud logged
        // "CLOUD APP: Could not launch ...". The colon belongs in one place.
        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/cached/chrome',
            source: 'cache',
            browser: 'chrome',
            buildId: '150.0.7871.24',
        });
        puppeteer.launch.mockRejectedValue(new Error('no browser here'));

        await expect(launchBrowserForApp(OPTIONS, CONTEXT)).rejects.toThrow();

        const logged = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
        expect(logged).toContain('TEST: Could not launch virtual browser');
        expect(logged).not.toContain('TEST Could not launch');
        expect(logged).not.toContain('TEST:: Could not launch');
    });
});

describe('launchBrowserForApp — slow launch reporting (issue #870)', () => {
    /** Value returned by the stubbed clock, advanced by the launch mock itself. */
    let now;
    let nowSpy;

    /**
     * Concatenates everything logged at warn level.
     *
     * @returns {string} Combined warning output.
     */
    function warnOutput() {
        return logger.warn.mock.calls.map((call) => String(call[0])).join('\n');
    }

    /**
     * Builds a Puppeteer `TimeoutError`, as thrown when a launch exceeds its budget.
     *
     * The real one is a class in puppeteer-core that sets `name` from its constructor; only the
     * name is load-bearing here, so a plain Error carrying it is enough.
     *
     * @returns {Error} An error the launch path will recognise as a timeout.
     */
    function timeoutError() {
        const err = new Error('Timed out after 30000 ms while trying to connect to the browser');
        err.name = 'TimeoutError';
        return err;
    }

    /**
     * Makes `puppeteer.launch` consume a given amount of time on the monotonic clock.
     *
     * The clock is advanced from inside the launch mock rather than by queueing return values,
     * so the elapsed time is tied to the launch itself and cannot drift if some other caller
     * reads the clock in between.
     *
     * @param {number} elapsedMs - Time the launch should appear to take.
     * @param {object} outcome - `{ resolve }` or `{ reject }`, the launch result.
     *
     * @returns {void}
     */
    function launchTaking(elapsedMs, outcome) {
        puppeteer.launch.mockImplementation(async () => {
            now += elapsedMs;
            if (outcome.reject) {
                throw outcome.reject;
            }
            return outcome.resolve;
        });
    }

    beforeEach(() => {
        now = 0;
        // performance.now, not Date.now: the code deliberately measures on a monotonic clock so
        // that an NTP step on a virtualised runner cannot invent or hide a stall.
        nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => now);
        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/cached/chrome',
            source: 'cache',
            browser: 'chrome',
            buildId: '150.0.7871.24',
        });
    });

    afterEach(() => {
        nowSpy.mockRestore();
        // clearAllMocks leaves implementations in place, so the clock-advancing launch stub would
        // otherwise outlive this block.
        puppeteer.launch.mockReset();
    });

    test('states both Puppeteer timeouts rather than inheriting them', async () => {
        // Pinned so a dependency bump cannot change the launch budget without a diff here.
        launchTaking(1_000, { resolve: fakeBrowser() });

        await launchBrowserForApp(OPTIONS, CONTEXT);

        expect(puppeteer.launch).toHaveBeenCalledWith(
            expect.objectContaining({
                timeout: BROWSER_LAUNCH_TIMEOUT_MS,
                protocolTimeout: BROWSER_PROTOCOL_TIMEOUT_MS,
            })
        );
    });

    test('warns when a launch that succeeded took longer than the timeout allows for', async () => {
        // The case no timeout catches, and the one the CI hang actually was: process startup is
        // stalled outside the timed region, the stall clears, and the launch then succeeds.
        launchTaking(25 * 60 * 1000, { resolve: fakeBrowser() });

        await launchBrowserForApp(OPTIONS, CONTEXT);

        expect(warnOutput()).toContain('TEST: Browser launch took 1500s');
        expect(warnOutput()).toContain('no timeout covers');
        expect(warnOutput()).toContain('antivirus');
    });

    test('stays quiet about a launch that finished inside the budget', async () => {
        launchTaking(BROWSER_LAUNCH_TIMEOUT_MS, { resolve: fakeBrowser() });

        await launchBrowserForApp(OPTIONS, CONTEXT);

        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.verbose).toHaveBeenCalledWith(
            expect.stringContaining(`Browser launch took ${BROWSER_LAUNCH_TIMEOUT_MS} ms`)
        );
    });

    test('explains a launch timeout instead of leaving it to read as a generic failure', async () => {
        launchTaking(BROWSER_LAUNCH_TIMEOUT_MS + 1, { reject: timeoutError() });

        await expect(launchBrowserForApp(OPTIONS, CONTEXT)).rejects.toThrow(TestError);

        expect(errorOutput()).toContain('did not become ready within 30s');
        expect(errorOutput()).toContain('never reported a debugging endpoint');
    });

    test('does not blame a stall for an ordinary launch timeout', async () => {
        // The measurement starts before puppeteer.launch() and Puppeteer's own clock starts later
        // still, so a timeout always elapses slightly over the budget. Treating that as
        // unexplained time would tell an administrator to go reconfigure endpoint protection for
        // what is really a browser build that cannot run - advice that is worse than silence.
        launchTaking(BROWSER_LAUNCH_TIMEOUT_MS + 47, { reject: timeoutError() });

        await expect(launchBrowserForApp(OPTIONS, CONTEXT)).rejects.toThrow(TestError);

        expect(logger.warn).not.toHaveBeenCalled();
    });

    test('does blame a stall when a timeout arrives long after the budget', async () => {
        // Held at startup for 25 minutes and then failing to report a debugging endpoint. The
        // budget accounts for 30s of that; the rest is the stall, and worth naming.
        launchTaking(25 * 60 * 1000 + BROWSER_LAUNCH_TIMEOUT_MS, { reject: timeoutError() });

        await expect(launchBrowserForApp(OPTIONS, CONTEXT)).rejects.toThrow(TestError);

        expect(warnOutput()).toContain('Browser launch took 1530s');
        expect(warnOutput()).toContain('antivirus');
    });

    test('does not offer the timeout explanation for an ordinary launch failure', async () => {
        launchTaking(500, { reject: new Error('no display') });

        await expect(launchBrowserForApp(OPTIONS, CONTEXT)).rejects.toThrow(TestError);

        expect(errorOutput()).toContain('Could not launch virtual browser');
        expect(errorOutput()).not.toContain('did not become ready within');
        expect(logger.warn).not.toHaveBeenCalled();
    });
});
