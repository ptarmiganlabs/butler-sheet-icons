import { jest, describe, test, expect, beforeEach } from '@jest/globals';

const enigmaCreate = jest.fn();

jest.unstable_mockModule('enigma.js', () => ({
    default: { create: enigmaCreate },
}));

jest.unstable_mockModule('../cloud-enigma.js', () => ({
    setupEnigmaConnection: jest.fn().mockReturnValue({ url: 'wss://tenant.eu.qlikcloud.com' }),
}));

const Get = jest.fn();
const Delete = jest.fn().mockResolvedValue({ statusCode: 204 });
const QlikSaas = jest.fn(function QlikSaasMock() {
    this.Get = Get;
    this.Delete = Delete;
});

jest.unstable_mockModule('../cloud-repo.js', () => ({ default: QlikSaas }));

const qscloudTestConnection = jest.fn().mockResolvedValue(true);

jest.unstable_mockModule('../cloud-test-connection.js', () => ({ qscloudTestConnection }));

jest.unstable_mockModule('../../util/redact-secrets.js', () => ({
    redactOptions: jest.fn((options) => options),
}));

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
    },
    setLoggingLevel: jest.fn(),
    bsiExecutablePath: '/opt/bsi',
    isSea: false,
}));

const { logger } = await import('../../../globals.js');
const { qscloudRemoveSheetIcons } = await import('../cloud-remove-sheet-icons.js');

const BASE_OPTIONS = {
    tenanturl: 'tenant.eu.qlikcloud.com',
    apikey: 'api-key',
    appid: 'test-app-id',
    loglevel: 'info',
};

/**
 * Builds a sheet list item plus the engine object that serves its properties.
 *
 * @param {string} qId - Engine object id.
 * @param {number} rank - Sort rank.
 *
 * @returns {{item: object, obj: object, props: object}} The list item, its engine object,
 *   and the properties object the engine object hands out.
 */
const makeSheet = (qId, rank) => {
    const props = { thumbnail: { qStaticContentUrlDef: { qUrl: '/old/thumbnail.png' } } };
    const obj = {
        getProperties: jest.fn().mockResolvedValue(props),
        setProperties: jest.fn().mockResolvedValue({ ok: true }),
    };

    return {
        item: {
            qInfo: { qId },
            qMeta: { title: `Sheet ${qId}`, description: '' },
            qData: { rank },
        },
        obj,
        props,
    };
};

/**
 * Wires the enigma mock chain so the module can walk an app's sheets.
 *
 * @param {Array<{item: object, obj: object}>} sheets - Sheets the app should report.
 *
 * @returns {{app: object, session: object}} The mock app and session objects.
 */
const wireEnigma = (sheets) => {
    const byId = new Map(sheets.map((sheet) => [sheet.item.qInfo.qId, sheet.obj]));

    const app = {
        createSessionObject: jest.fn().mockResolvedValue({
            getLayout: jest.fn().mockResolvedValue({
                qAppObjectList: { qItems: sheets.map((sheet) => sheet.item) },
            }),
        }),
        getObject: jest.fn(async (qId) => byId.get(qId)),
        doSave: jest.fn().mockResolvedValue(true),
    };

    const session = {
        open: jest.fn().mockResolvedValue({
            engineVersion: jest.fn().mockResolvedValue({ qComponentVersion: '12.0.0' }),
            openDoc: jest.fn().mockResolvedValue(app),
        }),
        close: jest.fn().mockResolvedValue(true),
        on: jest.fn(),
    };

    enigmaCreate.mockResolvedValue(session);

    return { app, session };
};

/**
 * Points the mocked `Get` at the standard media-library shape: no thumbnails folder.
 *
 * @returns {void}
 */
const withNoThumbnailFolder = () => {
    Get.mockImplementation(async (path) => {
        if (path.endsWith('/media/list')) return [{ type: 'directory', name: 'other' }];
        // Deliberately non-empty: if the code wrongly walks into the thumbnails branch
        // it finds something to delete, so `expect(Delete).not.toHaveBeenCalled()` can fail.
        if (path.endsWith('/media/list/thumbnails')) {
            return [{ type: 'image', name: 'should-not-be-touched.png' }];
        }
        return [];
    });
};

beforeEach(() => {
    jest.clearAllMocks();
    qscloudTestConnection.mockResolvedValue(true);
    Delete.mockResolvedValue({ statusCode: 204 });
    withNoThumbnailFolder();
    // enigmaCreate carries no default, so a rejection set by one test would otherwise
    // persist for the rest of the file.
    enigmaCreate.mockReset();
});

describe('qscloudRemoveSheetIcons', () => {
    describe('connection test', () => {
        test('returns false when the tenant cannot be reached', async () => {
            qscloudTestConnection.mockRejectedValue(new Error('401 Unauthorized'));

            await expect(qscloudRemoveSheetIcons({ ...BASE_OPTIONS })).resolves.toBe(false);
        });

        test('never opens an engine session when the tenant cannot be reached', async () => {
            qscloudTestConnection.mockRejectedValue(new Error('401 Unauthorized'));

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS });

            expect(enigmaCreate).not.toHaveBeenCalled();
        });
    });

    describe('single app via --appid', () => {
        test('returns true after processing the app', async () => {
            wireEnigma([makeSheet('sheet-1', 1)]);

            await expect(qscloudRemoveSheetIcons({ ...BASE_OPTIONS })).resolves.toBe(true);
        });

        test('clears the thumbnail URL on every sheet', async () => {
            const sheets = [makeSheet('sheet-1', 1), makeSheet('sheet-2', 2)];
            wireEnigma(sheets);

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS });

            sheets.forEach((sheet) => {
                expect(sheet.props.thumbnail.qStaticContentUrlDef.qUrl).toBe('');
                expect(sheet.obj.setProperties).toHaveBeenCalledTimes(1);
            });
        });

        test('saves the app once per sheet', async () => {
            const { app } = wireEnigma([makeSheet('sheet-1', 1), makeSheet('sheet-2', 2)]);

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS });

            expect(app.doSave).toHaveBeenCalledTimes(2);
        });

        test('processes sheets in rank order', async () => {
            const { app } = wireEnigma([
                makeSheet('sheet-c', 3),
                makeSheet('sheet-a', 1),
                makeSheet('sheet-b', 2),
            ]);

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS });

            expect(app.getObject.mock.calls.map((call) => call[0])).toEqual([
                'sheet-a',
                'sheet-b',
                'sheet-c',
            ]);
        });

        test('still processes the well-formed sheets when one sheet has no qData', async () => {
            // Sorting runs before the per-sheet try/catch blocks, so an unguarded read of
            // sheet.qData.rank in the comparator aborted the whole app before a single
            // icon was touched. The rank-less sheet now sorts last.
            const broken = makeSheet('broken', 1);
            delete broken.item.qData;
            const { app } = wireEnigma([makeSheet('sheet-b', 2), broken, makeSheet('sheet-a', 1)]);

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS });

            expect(app.getObject.mock.calls.map((call) => call[0])).toEqual([
                'sheet-a',
                'sheet-b',
                'broken',
            ]);
        });

        test('closes the engine session when done', async () => {
            const { session } = wireEnigma([makeSheet('sheet-1', 1)]);

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS });

            expect(session.close).toHaveBeenCalledTimes(1);
        });

        test('handles an app with no sheets', async () => {
            wireEnigma([]);

            await expect(qscloudRemoveSheetIcons({ ...BASE_OPTIONS })).resolves.toBe(true);
        });

        test('closes the session even when the app has no sheets', async () => {
            // session.close() used to sit inside the `qItems.length > 0` guard, so an
            // empty app returned true while leaking its engine websocket.
            const { session } = wireEnigma([]);

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS });

            expect(session.close).toHaveBeenCalledTimes(1);
        });
    });

    describe('existing thumbnail images in the media library', () => {
        test('deletes every image in the thumbnails folder', async () => {
            wireEnigma([makeSheet('sheet-1', 1)]);
            Get.mockImplementation(async (path) => {
                if (path.endsWith('/media/list')) {
                    return [{ type: 'directory', name: 'thumbnails' }];
                }
                if (path.endsWith('/media/list/thumbnails')) {
                    return [
                        { type: 'image', name: 'thumbnail-1.png' },
                        { type: 'image', name: 'thumbnail-2.png' },
                    ];
                }
                return [];
            });

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS });

            expect(Delete).toHaveBeenCalledTimes(2);
            expect(Delete).toHaveBeenCalledWith(
                'apps/test-app-id/media/files/thumbnails/thumbnail-1.png'
            );
        });

        test('leaves non-image entries alone', async () => {
            wireEnigma([makeSheet('sheet-1', 1)]);
            Get.mockImplementation(async (path) => {
                if (path.endsWith('/media/list')) {
                    return [{ type: 'directory', name: 'thumbnails' }];
                }
                if (path.endsWith('/media/list/thumbnails')) {
                    return [
                        { type: 'image', name: 'thumbnail-1.png' },
                        { type: 'directory', name: 'archive' },
                    ];
                }
                return [];
            });

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS });

            expect(Delete).toHaveBeenCalledTimes(1);
        });

        test('deletes nothing when the app has no thumbnails folder', async () => {
            wireEnigma([makeSheet('sheet-1', 1)]);

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS });

            expect(Delete).not.toHaveBeenCalled();
        });
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
                if (path.endsWith('/media/list')) return [];
                return [];
            });
        };

        test('processes every app in the collection', async () => {
            wireEnigma([makeSheet('sheet-1', 1)]);
            withCollectionItems([
                { resourceType: 'app', resourceAttributes: { id: 'app-a' } },
                { resourceType: 'app', resourceAttributes: { id: 'app-b' } },
            ]);

            await qscloudRemoveSheetIcons({
                ...BASE_OPTIONS,
                appid: '',
                collectionid: 'collection-1',
            });

            // Assert WHICH apps, not just how many: setupEnigmaConnection is mocked to a
            // constant, so a call count alone cannot tell two apps from the same app twice.
            expect(Get.mock.calls.map((call) => call[0])).toEqual(
                expect.arrayContaining(['apps/app-a/media/list', 'apps/app-b/media/list'])
            );
            expect(enigmaCreate).toHaveBeenCalledTimes(2);
        });

        test('skips collection items that are not apps', async () => {
            wireEnigma([makeSheet('sheet-1', 1)]);
            withCollectionItems([
                { resourceType: 'app', resourceAttributes: { id: 'app-a' } },
                { id: 'item-2', resourceType: 'dataset' },
            ]);

            await qscloudRemoveSheetIcons({
                ...BASE_OPTIONS,
                appid: '',
                collectionid: 'collection-1',
            });

            expect(enigmaCreate).toHaveBeenCalledTimes(1);
        });

        test('processes an app named by both --appid and the collection only once', async () => {
            wireEnigma([makeSheet('sheet-1', 1)]);
            withCollectionItems([
                { resourceType: 'app', resourceAttributes: { id: 'test-app-id' } },
                { resourceType: 'app', resourceAttributes: { id: 'app-b' } },
            ]);

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS, collectionid: 'collection-1' });

            expect(enigmaCreate).toHaveBeenCalledTimes(2);
        });

        test('returns false when the collection does not exist', async () => {
            Get.mockImplementation(async (path) => {
                if (path === 'collections') return [{ id: 'a-different-collection' }];
                return [];
            });

            await expect(
                qscloudRemoveSheetIcons({
                    ...BASE_OPTIONS,
                    appid: '',
                    collectionid: 'collection-1',
                })
            ).resolves.toBe(false);
        });

        test('says which collection was missing', async () => {
            Get.mockImplementation(async (path) => {
                if (path === 'collections') return [{ id: 'a-different-collection' }];
                return [];
            });

            await qscloudRemoveSheetIcons({
                ...BASE_OPTIONS,
                appid: '',
                collectionid: 'collection-1',
            });

            const errors = logger.error.mock.calls.map((call) => String(call[0])).join('\n');

            expect(errors).toContain('collection-1');
        });

        test('treats an empty collection id as no collection at all', async () => {
            wireEnigma([makeSheet('sheet-1', 1)]);

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS, collectionid: '' });

            expect(enigmaCreate).toHaveBeenCalledTimes(1);
        });
    });

    describe('error handling', () => {
        test('a failing app does not abort the run', async () => {
            wireEnigma([makeSheet('sheet-1', 1)]);
            enigmaCreate.mockRejectedValueOnce(new Error('engine unreachable'));
            Get.mockImplementation(async (path) => {
                if (path === 'collections') return [{ id: 'collection-1' }];
                if (path === 'collections/collection-1/items') {
                    return [
                        { resourceType: 'app', resourceAttributes: { id: 'app-a' } },
                        { resourceType: 'app', resourceAttributes: { id: 'app-b' } },
                    ];
                }
                return [];
            });

            await expect(
                qscloudRemoveSheetIcons({
                    ...BASE_OPTIONS,
                    appid: '',
                    collectionid: 'collection-1',
                })
            ).resolves.toBe(true);

            expect(enigmaCreate).toHaveBeenCalledTimes(2);
        });

        test('logs an engine failure instead of rejecting', async () => {
            enigmaCreate.mockRejectedValue(new Error('engine unreachable'));

            await expect(qscloudRemoveSheetIcons({ ...BASE_OPTIONS })).resolves.toBe(true);

            expect(logger.error).toHaveBeenCalled();
        });

        test('logs a per-sheet failure instead of rejecting', async () => {
            const sheet = makeSheet('sheet-1', 1);
            sheet.obj.setProperties.mockRejectedValue(new Error('sheet is read-only'));
            wireEnigma([sheet]);

            await expect(qscloudRemoveSheetIcons({ ...BASE_OPTIONS })).resolves.toBe(true);

            expect(logger.error).toHaveBeenCalled();
        });

        test('a failing sheet does not stop the sheets after it', async () => {
            // A one-sheet fixture cannot tell isolation from abort: the outer catch
            // satisfies resolves.toBe(true) either way.
            const sheets = [
                makeSheet('sheet-1', 1),
                makeSheet('sheet-2', 2),
                makeSheet('sheet-3', 3),
            ];
            sheets[0].obj.setProperties.mockRejectedValue(new Error('sheet is read-only'));
            wireEnigma(sheets);

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS });

            expect(sheets[1].obj.setProperties).toHaveBeenCalledTimes(1);
            expect(sheets[2].obj.setProperties).toHaveBeenCalledTimes(1);
        });

        test('still closes the session when a sheet fails', async () => {
            const sheet = makeSheet('sheet-1', 1);
            sheet.obj.setProperties.mockRejectedValue(new Error('sheet is read-only'));
            const { session } = wireEnigma([sheet]);

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS });

            expect(session.close).toHaveBeenCalledTimes(1);
        });

        test('returns false when the SaaS client cannot be built', async () => {
            QlikSaas.mockImplementationOnce(() => {
                throw new Error('API token parameter is required');
            });

            await expect(qscloudRemoveSheetIcons({ ...BASE_OPTIONS })).resolves.toBe(false);
        });
    });
});
