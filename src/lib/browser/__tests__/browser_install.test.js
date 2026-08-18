import { jest, test, expect, describe, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import { homedir, tmpdir } from 'node:os';

jest.unstable_mockModule('@puppeteer/browsers', () => ({
    install: jest.fn(),
    resolveBuildId: jest.fn(),
    detectBrowserPlatform: jest.fn(),
    canDownload: jest.fn(),
    uninstall: jest.fn(),
    // Reached through getBrowserInventory(), which browser-install.js consults for an
    // already-staged build before touching the network. ESM checks named exports when the
    // module graph is linked, so omitting it fails the whole suite rather than one test.
    getInstalledBrowsers: jest.fn().mockResolvedValue([]),
}));
const { install, resolveBuildId, detectBrowserPlatform, canDownload, uninstall } =
    await import('@puppeteer/browsers');

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
    // Mocked so the retry tests do not really wait out 3 x 2s of backoff. This suite was
    // 16.1s of the unit suite's 27s, and 16.0s of that was real sleeping.
    sleep: jest.fn().mockResolvedValue(undefined),
}));
const { logger, sleep } = await import('../../../globals.js');

// Stub the cli-progress SingleBar so the test does not write to a real TTY.
/**
 * Constructed FakeSingleBar count, for the live-view mutual exclusion tests:
 * with a live view active the real code must never construct a bar at all.
 */
let singleBarInstances = 0;

/**
 * Inert test double for the cli-progress SingleBar constructor. All methods
 * are no-ops so the install code can call start/update/stop freely.
 */
class FakeSingleBar {
    /**
     * Record the construction - see {@link singleBarInstances}.
     */
    constructor() {
        singleBarInstances += 1;
    }

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
    SingleBar: FakeSingleBar,
    Presets: { shades_classic: {} },
}));

const { browserInstall } = await import('../browser-install.js');
// The real registry, not a mock: browser-install reads the active view
// through it, and the mutual exclusion below is only proven if the very
// same lookup path the product uses is exercised.
const { activateLiveView, restoreLiveTerminal } = await import('../../util/run-live.js');

// Ambient, and behaviour-affecting since the cache directory became configurable. Without
// this, the retry assertion below fails on any machine whose shell happens to have
// PUPPETEER_CACHE_DIR set - and that assertion is the proof that the default has not moved.
const SAVED_ENV = {
    BSI_BROWSER_CACHE_DIR: process.env.BSI_BROWSER_CACHE_DIR,
    PUPPETEER_CACHE_DIR: process.env.PUPPETEER_CACHE_DIR,
};

afterEach(() => {
    for (const [name, value] of Object.entries(SAVED_ENV)) {
        if (value === undefined) {
            delete process.env[name];
        } else {
            process.env[name] = value;
        }
    }
});

describe('browserInstall — retry logic', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.BSI_BROWSER_CACHE_DIR;
        delete process.env.PUPPETEER_CACHE_DIR;
        detectBrowserPlatform.mockResolvedValue('mac_arm');
        canDownload.mockResolvedValue(true);
        resolveBuildId.mockResolvedValue('123.0.0.0');
    });

    test('returns the installed browser on first-attempt success (no retry, no warning)', async () => {
        const installed = { browser: 'chrome', buildId: '123.0.0.0', executablePath: '/p/chrome' };
        install.mockResolvedValue(installed);

        const result = await browserInstall({
            browser: 'chrome',
            browserVersion: '123.0.0.0',
            loglevel: 'error',
        });

        expect(result).toBe(installed);
        expect(install).toHaveBeenCalledTimes(1);
        expect(logger.warn).not.toHaveBeenCalled();
    });

    test('retries on extraction failure and eventually succeeds', async () => {
        const installed = { browser: 'chrome', buildId: '123.0.0.0', executablePath: '/p/chrome' };
        install
            .mockImplementationOnce(() => {
                throw new Error(
                    'All providers failed: DefaultProvider: Extraction failed: bad zip'
                );
            })
            .mockImplementationOnce(() => {
                throw new Error(
                    'All providers failed: DefaultProvider: Extraction failed: bad zip'
                );
            })
            .mockResolvedValueOnce(installed);

        const result = await browserInstall({
            browser: 'chrome',
            browserVersion: '123.0.0.0',
            loglevel: 'error',
        });

        expect(result).toBe(installed);
        expect(install).toHaveBeenCalledTimes(3);
        // Two retry warnings were logged (one per failed attempt).
        expect(logger.warn).toHaveBeenCalledTimes(2);
        expect(logger.warn.mock.calls[0][0]).toMatch(/Install attempt 1\/3 failed/);
        expect(logger.warn.mock.calls[1][0]).toMatch(/Install attempt 2\/3 failed/);
    });

    test('backs off between retries rather than hammering the download', async () => {
        // The delay is mocked so this suite runs fast; without this assertion the mock
        // would also hide the backoff being dropped altogether.
        install
            .mockImplementationOnce(() => {
                throw new Error('Extraction failed: bad zip');
            })
            .mockResolvedValueOnce({ browser: 'chrome', buildId: '1', executablePath: '/p' });

        await browserInstall({ browser: 'chrome', browserVersion: '1', loglevel: 'error' });

        expect(sleep).toHaveBeenCalledTimes(1);
        expect(sleep).toHaveBeenCalledWith(2000);
    });

    test('throws the last error after all three attempts fail', async () => {
        const lastError = new Error(
            'All providers failed: DefaultProvider: Extraction failed: bad zip'
        );
        install
            .mockImplementationOnce(() => {
                throw new Error('attempt 1');
            })
            .mockImplementationOnce(() => {
                throw new Error('attempt 2');
            })
            .mockImplementationOnce(() => {
                throw lastError;
            });

        await expect(
            browserInstall({ browser: 'chrome', browserVersion: '123.0.0.0', loglevel: 'error' })
        ).rejects.toBe(lastError);

        expect(install).toHaveBeenCalledTimes(3);
        expect(logger.warn).toHaveBeenCalledTimes(2);
    });

    test('clears the partial install directory before retrying', async () => {
        const installed = { browser: 'chrome', buildId: '123.0.0.0', executablePath: '/p/chrome' };
        install
            .mockImplementationOnce(() => {
                throw new Error(
                    'All providers failed: DefaultProvider: Extraction failed: bad zip'
                );
            })
            .mockResolvedValueOnce(installed);

        await browserInstall({ browser: 'chrome', browserVersion: '123.0.0.0', loglevel: 'error' });

        expect(uninstall).toHaveBeenCalledTimes(1);
        expect(uninstall).toHaveBeenCalledWith({
            browser: 'chrome',
            buildId: '123.0.0.0',
            // Built with path.join, so the separator is platform-specific - a literal
            // '.cache/puppeteer' never matches on Windows. Assert the whole path instead.
            cacheDir: path.join(homedir(), '.cache', 'puppeteer'),
        });
    });

    // The regression this guards against: `install()` treats an existing install directory as an
    // already-installed browser, so it skips the download and fails validation instead. A retry
    // that does not first clear the partial directory left by a failed extraction can therefore
    // never recover, and the misleading validation error replaces the real extraction failure as
    // the error the caller finally sees. The directory is modelled here the way
    // `@puppeteer/browsers` treats it - the mocks in the test above always succeed on retry
    // regardless of cache state, which is why they did not catch this.
    test('recovers from an extraction failure that left a partial install directory', async () => {
        const installed = { browser: 'chrome', buildId: '123.0.0.0', executablePath: '/p/chrome' };
        let partialDirExists = false;

        install
            .mockImplementationOnce(() => {
                // Download succeeds, extraction fails part-way through.
                partialDirExists = true;
                throw new Error(
                    'All providers failed: DefaultProvider: Extraction failed: bad zip'
                );
            })
            .mockImplementationOnce(() => {
                if (partialDirExists) {
                    throw new Error(
                        'All providers failed for chrome 123.0.0.0:\n  - DefaultProvider: The browser folder exists but the executable is missing'
                    );
                }
                return installed;
            });
        uninstall.mockImplementationOnce(() => {
            partialDirExists = false;
        });

        const result = await browserInstall({
            browser: 'chrome',
            browserVersion: '123.0.0.0',
            loglevel: 'error',
        });

        expect(result).toBe(installed);
        expect(install).toHaveBeenCalledTimes(2);
    });

    // Under the real temp directory, not a made-up absolute path: an install now refuses a
    // cache directory it cannot write to, and /qlik/browsers is exactly that on a developer
    // machine. That refusal has its own tests in browser_paths.test.js.
    const WRITABLE_CACHE = path.join(tmpdir(), 'bsi-install-test-cache');

    test('installs into the directory named by --browser-cache-dir', async () => {
        const installed = { browser: 'chrome', buildId: '123.0.0.0', executablePath: '/p/chrome' };
        install.mockResolvedValue(installed);

        await browserInstall({
            browser: 'chrome',
            browserVersion: '123.0.0.0',
            browserCacheDir: WRITABLE_CACHE,
            loglevel: 'error',
        });

        expect(canDownload).toHaveBeenCalledWith(
            expect.objectContaining({ cacheDir: WRITABLE_CACHE })
        );
        expect(install).toHaveBeenCalledWith(expect.objectContaining({ cacheDir: WRITABLE_CACHE }));
    });

    test('installs into PUPPETEER_CACHE_DIR when no directory was named', async () => {
        process.env.PUPPETEER_CACHE_DIR = WRITABLE_CACHE;
        install.mockResolvedValue({ browser: 'chrome', buildId: '1', executablePath: '/p' });

        await browserInstall({ browser: 'chrome', browserVersion: '1', loglevel: 'error' });

        expect(install).toHaveBeenCalledWith(expect.objectContaining({ cacheDir: WRITABLE_CACHE }));
    });

    test('does not blame the cache directory for a blocked network connection', async () => {
        // Windows firewalls and endpoint protection fail an outbound connection with EPERM.
        // Reported as "Cannot write to the browser cache directory ...", that sends an
        // administrator to fix permissions on a directory that is perfectly writable - on
        // exactly the locked-down servers this option exists for.
        const blocked = Object.assign(new Error('connect EPERM 142.250.74.14:443'), {
            code: 'EPERM',
            syscall: 'connect',
            address: '142.250.74.14',
            port: 443,
        });
        install.mockImplementation(() => {
            throw blocked;
        });

        await expect(
            browserInstall({ browser: 'chrome', browserVersion: '123.0.0.0', loglevel: 'error' })
        ).rejects.toBe(blocked);

        const reported = logger.error.mock.calls.map(([line]) => line).join('\n');
        expect(reported).not.toContain('Cannot write to the browser cache directory');
        expect(reported).toContain('connect EPERM');
    });

    test('a failing cleanup does not mask the install error', async () => {
        const lastError = new Error(
            'All providers failed: DefaultProvider: Extraction failed: bad zip'
        );
        install
            .mockImplementationOnce(() => {
                throw new Error('attempt 1');
            })
            .mockImplementationOnce(() => {
                throw new Error('attempt 2');
            })
            .mockImplementationOnce(() => {
                throw lastError;
            });
        uninstall
            .mockRejectedValueOnce(new Error('ENOENT: no such file or directory'))
            .mockRejectedValueOnce(new Error('ENOENT: no such file or directory'));

        await expect(
            browserInstall({ browser: 'chrome', browserVersion: '123.0.0.0', loglevel: 'error' })
        ).rejects.toBe(lastError);

        // Cleanup runs before each retry, never after the final attempt.
        expect(uninstall).toHaveBeenCalledTimes(2);
    });
});

describe('browserInstall — live view mutual exclusion (issue #1075)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        singleBarInstances = 0;
        delete process.env.BSI_BROWSER_CACHE_DIR;
        delete process.env.PUPPETEER_CACHE_DIR;
        detectBrowserPlatform.mockResolvedValue('mac_arm');
        canDownload.mockResolvedValue(true);
        resolveBuildId.mockResolvedValue('123.0.0.0');
    });

    afterEach(() => {
        restoreLiveTerminal();
    });

    test('with a live view active, no cli-progress bar is ever constructed and progress routes into the view', async () => {
        const view = { downloadProgress: jest.fn(), stop: jest.fn() };
        activateLiveView(view);

        install.mockImplementation((opts) => {
            // The download reports progress mid-install, exactly where the
            // two writers would have collided.
            opts.downloadProgressCallback(50, 100);

            return { browser: 'chrome', buildId: '123.0.0.0', executablePath: '/p/chrome' };
        });

        await browserInstall({ browser: 'chrome', browserVersion: '123.0.0.0', loglevel: 'error' });

        expect(singleBarInstances).toBe(0);
        // start (0), the 50% update, the install code's final update(100),
        // stop (null): the whole bar lifecycle went through the view instead.
        expect(view.downloadProgress.mock.calls).toEqual([[0], [50], [100], [null]]);
    });

    test('without a live view the cli-progress bar is used, exactly as before', async () => {
        install.mockResolvedValue({
            browser: 'chrome',
            buildId: '123.0.0.0',
            executablePath: '/p/chrome',
        });

        await browserInstall({ browser: 'chrome', browserVersion: '123.0.0.0', loglevel: 'error' });

        expect(singleBarInstances).toBe(1);
    });
});
