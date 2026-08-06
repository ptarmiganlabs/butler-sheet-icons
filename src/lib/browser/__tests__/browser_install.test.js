import { jest, test, expect, describe, beforeEach } from '@jest/globals';

jest.unstable_mockModule('@puppeteer/browsers', () => ({
    install: jest.fn(),
    resolveBuildId: jest.fn(),
    detectBrowserPlatform: jest.fn(),
    canDownload: jest.fn(),
    uninstall: jest.fn(),
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
}));
const { logger } = await import('../../../globals.js');

jest.unstable_mockModule('../browser-list-available.js', () => ({
    getMostRecentUsableChromeBuildId: jest.fn(),
}));
const { getMostRecentUsableChromeBuildId } = await import('../browser-list-available.js');

// Stub the cli-progress SingleBar so the test does not write to a real TTY.
/**
 * Inert test double for the cli-progress SingleBar constructor. All methods
 * are no-ops so the install code can call start/update/stop freely.
 */
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
    SingleBar: FakeSingleBar,
    Presets: { shades_classic: {} },
}));

const { browserInstall } = await import('../browser-install.js');

describe('browserInstall — retry logic', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        detectBrowserPlatform.mockResolvedValue('mac_arm');
        canDownload.mockResolvedValue(true);
        resolveBuildId.mockResolvedValue('123.0.0.0');
        getMostRecentUsableChromeBuildId.mockResolvedValue('123.0.0.0');
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
            cacheDir: expect.stringContaining('.cache/puppeteer'),
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
