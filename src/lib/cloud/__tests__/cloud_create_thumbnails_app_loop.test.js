import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Covers the hand-off from qscloudCreateThumbnails to runOverApps. The sibling
// validation suite mocks the connection test to throw, so it never reaches this point -
// which left the app-loop call site with no unit coverage at all.

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

jest.unstable_mockModule('../cloud-test-connection.js', () => ({
    qscloudTestConnection: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule('../cloud-repo.js', () => ({ default: jest.fn() }));

jest.unstable_mockModule('../process-cloud-app.js', () => ({
    processCloudApp: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule('../../util/redact-secrets.js', () => ({
    redactOptions: jest.fn((o) => o),
}));

const runOverApps = jest.fn();
jest.unstable_mockModule('../../util/run-over-apps.js', () => ({ runOverApps }));

const { logger } = await import('../../../globals.js');
const { qscloudCreateThumbnails } = await import('../cloud-create-thumbnails.js');

const OPTIONS = {
    tenanturl: 'tenant.eu.qlikcloud.com',
    apikey: 'api-key',
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

describe('qscloudCreateThumbnails app loop', () => {
    test('passes the verdict from runOverApps straight through', async () => {
        runOverApps.mockResolvedValue(true);

        await expect(qscloudCreateThumbnails({ ...OPTIONS })).resolves.toBe(true);
    });

    test('reports failure when runOverApps says some apps failed', async () => {
        runOverApps.mockResolvedValue(false);

        await expect(qscloudCreateThumbnails({ ...OPTIONS })).resolves.toBe(false);
    });

    test('hands the selected app ids to the loop', async () => {
        runOverApps.mockResolvedValue(true);

        await qscloudCreateThumbnails({ ...OPTIONS });

        expect(runOverApps).toHaveBeenCalledTimes(1);
        expect(runOverApps.mock.calls[0][0]).toEqual(['test-app-id']);
    });

    test('names the Cloud options in the empty-selection hint, not the QSEoW ones', async () => {
        // Cross-platform copy-paste is this repo's dominant defect class, and the hint
        // text is promised to operators in the published docs.
        runOverApps.mockResolvedValue(true);

        await qscloudCreateThumbnails({ ...OPTIONS });

        expect(runOverApps.mock.calls[0][1].emptySelectionHint).toContain('--collectionid');
        expect(runOverApps.mock.calls[0][1].emptySelectionHint).not.toContain('--qliksensetag');
    });

    test('catches a rejection from the loop rather than letting it escape', async () => {
        // The call site must be `return await runOverApps(...)`. A bare `return` hands the
        // promise back before it settles, so a rejection skips the catch below it - this
        // function would reject instead of resolving false, and log nothing.
        runOverApps.mockRejectedValue(new Error('loop blew up'));

        await expect(qscloudCreateThumbnails({ ...OPTIONS })).resolves.toBe(false);

        expect(errorLog()).toContain('CLOUD CREATE THUMBNAILS 2');
    });
});
