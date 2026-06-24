import { jest, test, expect, describe, beforeEach } from '@jest/globals';

jest.unstable_mockModule('@puppeteer/browsers', () => ({
    install: jest.fn(),
    resolveBuildId: jest.fn(),
    detectBrowserPlatform: jest.fn(),
    canDownload: jest.fn(),
}));
const { install, resolveBuildId, detectBrowserPlatform, canDownload } =
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
});
