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

const Get = jest.fn();
const QlikSaas = jest.fn(function QlikSaasMock() {
    this.Get = Get;
});
jest.unstable_mockModule('../cloud-repo.js', () => ({ default: QlikSaas }));

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
    appid: ['test-app-id'],
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

    test('hands every app id to the loop when several are named (issue #895)', async () => {
        runOverApps.mockResolvedValue(true);

        await qscloudCreateThumbnails({ ...OPTIONS, appid: ['app-1', 'app-2', 'app-3'] });

        expect(runOverApps.mock.calls[0][0]).toEqual(['app-1', 'app-2', 'app-3']);
    });

    test('never explodes a bare string into one app per character', async () => {
        // A string is iterable, so a plain spread would push eleven
        // single-character app ids. Nothing the CLI produces is a string any
        // more, but a hand-built options bag can still be.
        runOverApps.mockResolvedValue(true);

        await qscloudCreateThumbnails({ ...OPTIONS, appid: 'test-app-id' });

        expect(runOverApps.mock.calls[0][0]).toEqual(['test-app-id']);
    });

    describe('multiple apps via --collectionid', () => {
        /**
         * Points the mocked `Get` at a tenant with one collection holding the given items.
         *
         * @param {Array<object>} items - Items the collection should report.
         *
         * @returns {void}
         */
        const withCollectionItems = (items) => {
            Get.mockImplementation(async (path) => {
                if (path === 'collections') return [{ id: 'collection-1' }];
                if (path === 'collections/collection-1/items') return items;
                return [];
            });
        };

        beforeEach(() => {
            Get.mockReset();
        });

        test('passes every app in the collection to the loop', async () => {
            runOverApps.mockResolvedValue(true);
            withCollectionItems([
                { resourceType: 'app', resourceAttributes: { id: 'app-a', name: 'Alpha' } },
                { resourceType: 'app', resourceAttributes: { id: 'app-b', name: 'Beta' } },
            ]);

            await qscloudCreateThumbnails({
                ...OPTIONS,
                appid: '',
                collectionid: 'collection-1',
            });

            expect(runOverApps.mock.calls[0][0]).toEqual(['app-a', 'app-b']);
        });

        test('unions --appid with --collectionid rather than choosing between them', async () => {
            // The two are additive. Several comments used to claim the collection
            // was only consulted when no app id was given, which the code never did.
            runOverApps.mockResolvedValue(true);
            withCollectionItems([
                { resourceType: 'app', resourceAttributes: { id: 'app-a', name: 'Alpha' } },
                { resourceType: 'app', resourceAttributes: { id: 'app-b', name: 'Beta' } },
            ]);

            await qscloudCreateThumbnails({
                ...OPTIONS,
                appid: ['app-b', 'named-directly'],
                collectionid: 'collection-1',
            });

            // runOverApps dedupes, so app-b - named both ways - is processed once.
            const selected = runOverApps.mock.calls[0][0];
            expect(selected).toEqual(['app-b', 'named-directly', 'app-a', 'app-b']);
            expect([...new Set(selected)]).toEqual(['app-b', 'named-directly', 'app-a']);
        });

        test('skips collection items that are not apps', async () => {
            runOverApps.mockResolvedValue(true);
            withCollectionItems([
                { resourceType: 'app', resourceAttributes: { id: 'app-a', name: 'Alpha' } },
                { id: 'item-ds', resourceType: 'dataset' },
            ]);

            await qscloudCreateThumbnails({
                ...OPTIONS,
                appid: '',
                collectionid: 'collection-1',
            });

            expect(runOverApps.mock.calls[0][0]).toEqual(['app-a']);
        });

        test('returns false when the collection does not exist', async () => {
            runOverApps.mockResolvedValue(true);
            Get.mockResolvedValue([{ id: 'some-other-collection' }]);

            await expect(
                qscloudCreateThumbnails({
                    ...OPTIONS,
                    appid: '',
                    collectionid: 'collection-1',
                })
            ).resolves.toBe(false);

            expect(errorLog()).toContain('collection-1');
        });

        test('reports failure when the collection resolves to no apps at all', async () => {
            runOverApps.mockResolvedValue(false);
            withCollectionItems([]);

            await expect(
                qscloudCreateThumbnails({
                    ...OPTIONS,
                    appid: '',
                    collectionid: 'collection-1',
                })
            ).resolves.toBe(false);

            expect(runOverApps).toHaveBeenCalledWith([], expect.any(Object), expect.any(Function));
        });

        test('an explicitly named --appid still runs when the collection is empty', async () => {
            runOverApps.mockResolvedValue(true);
            withCollectionItems([]);

            await expect(
                qscloudCreateThumbnails({
                    ...OPTIONS,
                    appid: ['test-app-id'],
                    collectionid: 'collection-1',
                })
            ).resolves.toBe(true);

            expect(runOverApps.mock.calls[0][0]).toEqual(['test-app-id']);
        });
    });
});
