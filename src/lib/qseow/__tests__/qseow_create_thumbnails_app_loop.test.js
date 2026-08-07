import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// QSEoW twin of cloud_create_thumbnails_app_loop.test.js. Covers the hand-off from
// qseowCreateThumbnails to runOverApps. The sibling validation suite mocks the certificate
// check to throw, so it never reaches this point - which left the app-loop call site with
// no unit coverage at all.

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

jest.unstable_mockModule('../qseow-certificates.js', () => ({
    qseowVerifyCertificatesExist: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule('../qseow-contentlibrary.js', () => ({
    qseowVerifyContentLibraryExists: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule('../qseow-qrs.js', () => ({
    setupQseowQrsConnection: jest.fn().mockReturnValue({ hostname: 'sense.example.com' }),
}));

jest.unstable_mockModule('qrs-interact', () => ({ default: jest.fn() }));

jest.unstable_mockModule('../qseow-process-app.js', () => ({
    qseowProcessApp: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule('../../util/redact-secrets.js', () => ({
    redactOptions: jest.fn((o) => o),
}));

const runOverApps = jest.fn();
jest.unstable_mockModule('../../util/run-over-apps.js', () => ({ runOverApps }));

const { logger } = await import('../../../globals.js');
const { qseowCreateThumbnails } = await import('../qseow-create-thumbnails.js');

const OPTIONS = {
    host: 'sense.example.com',
    contentlibrary: 'test-library',
    appid: 'test-app-id',
    includesheetpart: '1',
    loglevel: 'info',
};

/**
 * Joins everything logged at error level, for substring assertions.
 *
 * @returns {string} All error lines, newline separated.
 */
const errorLog = () => logger.error.mock.calls.map((call) => String(call[0])).join('\n');

beforeEach(() => {
    jest.clearAllMocks();
});

describe('qseowCreateThumbnails app loop', () => {
    test('passes the verdict from runOverApps straight through', async () => {
        runOverApps.mockResolvedValue(true);

        await expect(qseowCreateThumbnails({ ...OPTIONS })).resolves.toBe(true);
    });

    test('reports failure when runOverApps says some apps failed', async () => {
        runOverApps.mockResolvedValue(false);

        await expect(qseowCreateThumbnails({ ...OPTIONS })).resolves.toBe(false);
    });

    test('hands the selected app ids to the loop', async () => {
        runOverApps.mockResolvedValue(true);

        await qseowCreateThumbnails({ ...OPTIONS });

        expect(runOverApps).toHaveBeenCalledTimes(1);
        expect(runOverApps.mock.calls[0][0]).toEqual(['test-app-id']);
    });

    test('names the QSEoW options in the empty-selection hint, not the Cloud ones', async () => {
        // The twin asserts the mirror image. Swapping these two hints is the exact
        // cross-platform copy-paste this repo keeps producing, and the text is promised
        // to operators in the published docs.
        runOverApps.mockResolvedValue(true);

        await qseowCreateThumbnails({ ...OPTIONS });

        expect(runOverApps.mock.calls[0][1].emptySelectionHint).toContain('--qliksensetag');
        expect(runOverApps.mock.calls[0][1].emptySelectionHint).not.toContain('--collectionid');
    });

    test('catches a rejection from the loop rather than letting it escape', async () => {
        // The call site must be `return await runOverApps(...)`. A bare `return` hands the
        // promise back before it settles, so a rejection skips the catch below it - this
        // function would reject instead of resolving false, and log nothing.
        runOverApps.mockRejectedValue(new Error('loop blew up'));

        await expect(qseowCreateThumbnails({ ...OPTIONS })).resolves.toBe(false);

        expect(errorLog()).toContain('QSEOW CREATE THUMBNAILS 2');
    });
});
