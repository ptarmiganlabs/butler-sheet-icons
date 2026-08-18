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
    appVersion: '9.9.9-test',
    getLoggingLevel: jest.fn(() => 'info'),
    bsiExecutablePath: '/opt/bsi',
    isSea: false,
}));

const { logger } = await import('../../../globals.js');
const { qscloudRemoveSheetIcons } = await import('../cloud-remove-sheet-icons.js');

const BASE_OPTIONS = {
    tenanturl: 'tenant.eu.qlikcloud.com',
    apikey: 'api-key',
    appid: ['test-app-id'],
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
            // qData carries `thumbnail` because SHEET_LIST_FIELDS_EXTENDED
            // projects /thumbnail and a real engine answers it. A fixture that
            // omitted it made every planner test take a fallback branch that
            // production never reaches, so the tests passed for a reason that
            // did not hold against a real tenant.
            qData: { rank, thumbnail: { qStaticContentUrlDef: { qUrl: '/old/thumbnail.png' } } },
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

    describe('no app selection', () => {
        test('returns false when neither --appid nor --collectionid is provided', async () => {
            await expect(
                qscloudRemoveSheetIcons({
                    ...BASE_OPTIONS,
                    appid: '',
                    collectionid: '',
                })
            ).resolves.toBe(false);

            const errors = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
            expect(errors).toContain('No apps to process');
            expect(errors).toContain('Check the --appid and --collectionid options');
        });

        test('never connects to the engine when no apps are specified', async () => {
            await qscloudRemoveSheetIcons({
                ...BASE_OPTIONS,
                appid: '',
                collectionid: '',
            });

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

        test('saves the app once, not once per sheet', async () => {
            // Saving inside the loop wrote the app N times for N sheets and produced N
            // app versions.
            const { app } = wireEnigma([makeSheet('sheet-1', 1), makeSheet('sheet-2', 2)]);

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS });

            expect(app.doSave).toHaveBeenCalledTimes(1);
        });

        test('does not save an app whose sheets were all left alone', async () => {
            // An app with no sheets changed nothing, so it must not get a new version.
            const { app } = wireEnigma([]);

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS });

            expect(app.doSave).not.toHaveBeenCalled();
        });

        test('releases the engine session even when the save fails', async () => {
            // Without a finally around save-and-close the websocket leaked once per app
            // whose save was refused - a published app, or one the account cannot write.
            const { app, session } = wireEnigma([makeSheet('sheet-1', 1)]);
            app.doSave.mockRejectedValue(new Error('app is published and cannot be saved'));

            // The command reports failure rather than rejecting - runOverApps catches the
            // per-app error. What matters here is that the session was still released.
            await expect(qscloudRemoveSheetIcons({ ...BASE_OPTIONS })).resolves.toBe(false);

            expect(session.close).toHaveBeenCalledTimes(1);
        });

        test('names the removal command in the per-app failure line', async () => {
            // The app loop was told 'CLOUD PROCESS APP 2' and 'QSEOW PROCESS APP: Remove sheet
            // icons' respectively - a stray counter on one, a double colon on the other, and
            // neither naming the command actually running.
            const { app } = wireEnigma([makeSheet('sheet-1', 1)]);
            app.doSave.mockRejectedValue(new Error('app is published and cannot be saved'));

            await expect(qscloudRemoveSheetIcons({ ...BASE_OPTIONS })).resolves.toBe(false);

            const errors = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
            expect(errors).toContain('CLOUD REMOVE SHEET ICONS: Failed to process app');
            expect(errors).not.toContain('CLOUD PROCESS APP 2');
        });

        test('saves before closing the engine session', async () => {
            const { app, session } = wireEnigma([makeSheet('sheet-1', 1)]);
            const order = [];
            app.doSave.mockImplementation(async () => order.push('save'));
            session.close.mockImplementation(async () => order.push('close'));

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS });

            expect(order).toEqual(['save', 'close']);
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

    describe('the app-name lookup for the report', () => {
        test('a failing apps/{id} read never fails the app - the name is decorative', async () => {
            wireEnigma([makeSheet('sheet-1', 1)]);
            const mediaOnly = Get.getMockImplementation();
            Get.mockImplementation(async (path) => {
                // Only the metadata endpoint itself - the media-list reads
                // under apps/{id}/media/... must keep working, or this test
                // would fail the app through the media path instead.
                if (path === 'apps/test-app-id') {
                    throw new Error('429 Too Many Requests');
                }

                return mediaOnly(path);
            });

            await expect(qscloudRemoveSheetIcons({ ...BASE_OPTIONS })).resolves.toBe(true);
        });

        test('the fetched app name reaches the board row', async () => {
            wireEnigma([makeSheet('sheet-1', 1)]);
            const mediaOnly = Get.getMockImplementation();
            Get.mockImplementation(async (path) => {
                if (path === 'apps/test-app-id') {
                    return { attributes: { name: 'My Cloud App' } };
                }

                return mediaOnly(path);
            });

            const writes = [];
            const spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
                writes.push(String(chunk));

                return true;
            });
            const savedOutput = process.env.BSI_OUTPUT;
            process.env.BSI_OUTPUT = 'board';
            try {
                await expect(qscloudRemoveSheetIcons({ ...BASE_OPTIONS })).resolves.toBe(true);
            } finally {
                spy.mockRestore();
                if (savedOutput === undefined) {
                    delete process.env.BSI_OUTPUT;
                } else {
                    process.env.BSI_OUTPUT = savedOutput;
                }
            }

            expect(writes.join('')).toContain('My Cloud App');
        });
    });

    describe('ordering of the media-library cleanup', () => {
        test('deletes the image files only after the app has been saved', async () => {
            // Deleting first meant a failed save left every sheet pointing at images that
            // no longer existed - broken icons on every sheet rather than none.
            const { app } = wireEnigma([makeSheet('sheet-1', 1)]);
            Get.mockImplementation(async (path) => {
                if (path.endsWith('/media/list'))
                    return [{ type: 'directory', name: 'thumbnails' }];
                if (path.endsWith('/media/list/thumbnails')) {
                    return [{ type: 'image', name: 'thumbnail-1.png' }];
                }
                return [];
            });

            const order = [];
            app.doSave.mockImplementation(async () => order.push('save'));
            Delete.mockImplementation(async () => {
                order.push('delete');
                return { statusCode: 204 };
            });

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS });

            expect(order).toEqual(['save', 'delete']);
        });

        test('does not delete the image files when the save failed', async () => {
            const { app } = wireEnigma([makeSheet('sheet-1', 1)]);
            Get.mockImplementation(async (path) => {
                if (path.endsWith('/media/list'))
                    return [{ type: 'directory', name: 'thumbnails' }];
                if (path.endsWith('/media/list/thumbnails')) {
                    return [{ type: 'image', name: 'thumbnail-1.png' }];
                }
                return [];
            });
            app.doSave.mockRejectedValue(new Error('app is published and cannot be saved'));

            await expect(qscloudRemoveSheetIcons({ ...BASE_OPTIONS })).resolves.toBe(false);

            expect(Delete).not.toHaveBeenCalled();
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

        test('reports failure when the collection resolves to no apps at all', async () => {
            // An unresolvable collection is not the same as "nothing to do". This used to
            // return true, so a --collectionid typo looked like a clean run.
            Get.mockImplementation(async (path) => {
                if (path === 'collections') return [{ id: 'collection-1' }];
                if (path === 'collections/collection-1/items') return [];
                return [];
            });

            await expect(
                qscloudRemoveSheetIcons({
                    ...BASE_OPTIONS,
                    appid: '',
                    collectionid: 'collection-1',
                })
            ).resolves.toBe(false);

            const errors = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
            expect(errors).toContain('No apps to process');
        });

        test('a collection with only non-app items counts as no apps', async () => {
            Get.mockImplementation(async (path) => {
                if (path === 'collections') return [{ id: 'collection-1' }];
                if (path === 'collections/collection-1/items') {
                    return [{ resourceType: 'dataset', id: 'ds-1' }];
                }
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

        test('an explicitly named --appid still runs when the collection is empty', async () => {
            // An earlier attempt at the empty check threw from inside the collection
            // resolver, which discarded an --appid that had already been queued.
            wireEnigma([makeSheet('sheet-1', 1)]);
            Get.mockImplementation(async (path) => {
                if (path === 'collections') return [{ id: 'collection-1' }];
                if (path === 'collections/collection-1/items') return [];
                if (path.endsWith('/media/list')) return [];
                return [];
            });

            await expect(
                qscloudRemoveSheetIcons({
                    ...BASE_OPTIONS,
                    appid: ['test-app-id'],
                    collectionid: 'collection-1',
                })
            ).resolves.toBe(true);

            expect(enigmaCreate).toHaveBeenCalledTimes(1);
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

            // The other app is still attempted - but the run as a whole is a failure now,
            // not a success with error text buried in the log.
            await expect(
                qscloudRemoveSheetIcons({
                    ...BASE_OPTIONS,
                    appid: '',
                    collectionid: 'collection-1',
                })
            ).resolves.toBe(false);

            expect(enigmaCreate).toHaveBeenCalledTimes(2);

            const errors = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
            expect(errors).toContain('Failed to process 1 of 2 app(s)');
        });

        test('reports failure instead of rejecting when the engine is unreachable', async () => {
            enigmaCreate.mockRejectedValue(new Error('engine unreachable'));

            // Reports false rather than throwing: the caller sets the exit code from it.
            await expect(qscloudRemoveSheetIcons({ ...BASE_OPTIONS })).resolves.toBe(false);

            expect(logger.error).toHaveBeenCalled();
        });

        test('reports failure when a sheet could not be updated, without rejecting', async () => {
            // Isolation is not the same as success. This used to resolve true, so an app in
            // which no icon at all was removed looked identical to a clean run and the
            // process exited 0.
            const sheet = makeSheet('sheet-1', 1);
            sheet.obj.setProperties.mockRejectedValue(new Error('sheet is read-only'));
            wireEnigma([sheet]);

            await expect(qscloudRemoveSheetIcons({ ...BASE_OPTIONS })).resolves.toBe(false);

            expect(logger.error).toHaveBeenCalled();
        });

        test('says how many sheets failed', async () => {
            const sheets = [
                makeSheet('sheet-1', 1),
                makeSheet('sheet-2', 2),
                makeSheet('sheet-3', 3),
            ];
            sheets[0].obj.setProperties.mockRejectedValue(new Error('sheet is read-only'));
            wireEnigma(sheets);

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS });

            const errors = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
            expect(errors).toContain('Failed to remove icons for 1 of 3 sheet(s)');
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

        test('names the tenant when reporting the closed session, not an undefined host', async () => {
            // Twin of the cloud_updatesheets assertion. This line interpolated options.host,
            // which Qlik Sense Cloud has no such option for, so it logged "on host undefined".
            wireEnigma([makeSheet('sheet-1', 1)]);

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS });

            const logged = logger.verbose.mock.calls.map((call) => String(call[0])).join('\n');
            expect(logged).toContain(`on tenant ${BASE_OPTIONS.tenanturl}`);
            expect(logged).not.toContain('on host undefined');
        });

        test('says it removed icons, not that it updated or generated them', async () => {
            // This command clears sheet icons. The two twins previously claimed "updating" and
            // "generating" respectively - neither of which it does, and they disagreed with
            // each other about which wrong verb to use.
            wireEnigma([makeSheet('sheet-1', 1)]);

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS });

            const logged = [...logger.info.mock.calls, ...logger.verbose.mock.calls]
                .map((call) => String(call[0]))
                .join('\n');
            expect(logged).toContain('Closed session after removing sheet icons in QS Cloud app');
            expect(logged).not.toContain('after updating sheet thumbnail');
            expect(logged).not.toContain('after generating sheet thumbnail');
        });

        test('reports the created session at info, like the other top-level commands', async () => {
            // A command working on an app the operator named. Its own "Opened app" line is
            // already info and the default log level is info, so the session line belongs there
            // too - only the update step, which re-opens an already-reported app, stays verbose.
            wireEnigma([makeSheet('sheet-1', 1)]);

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS });

            const atInfo = logger.info.mock.calls.map((call) => String(call[0])).join('\n');
            expect(atInfo).toContain('Created session to');
        });

        test('returns false when the SaaS client cannot be built', async () => {
            QlikSaas.mockImplementationOnce(() => {
                throw new Error('API token parameter is required');
            });

            await expect(qscloudRemoveSheetIcons({ ...BASE_OPTIONS })).resolves.toBe(false);
        });
    });

    describe('--dry-run (#993): the writes-nothing proof', () => {
        // These are the assertions that actually guard the feature: the real
        // worker with dryRun set must reach the planner and never touch a
        // write. Everything below drives the REAL qscloudRemoveSheetIcons -
        // no planner mock, no runOverApps mock - so a routing regression that
        // swapped the ternary would fail here with icons "cleared".
        const withAppAndThumbnails = () => {
            Get.mockImplementation(async (path) => {
                if (path === 'apps/test-app-id') {
                    return { attributes: { name: 'Finance operations' } };
                }
                if (path.endsWith('/media/list')) {
                    return [{ type: 'directory', name: 'thumbnails' }];
                }
                if (path.endsWith('/media/list/thumbnails')) {
                    return [
                        { type: 'image', name: 'thumb-1.png' },
                        { type: 'image', name: 'thumb-2.png' },
                        { type: 'directory', name: 'nested' },
                    ];
                }
                return [];
            });
        };

        test('a dry run performs every read and no write', async () => {
            withAppAndThumbnails();
            const sheets = [makeSheet('s1', 1), makeSheet('s2', 2)];
            const { app } = wireEnigma(sheets);

            await expect(qscloudRemoveSheetIcons({ ...BASE_OPTIONS, dryRun: true })).resolves.toBe(
                true
            );

            // Reads happened: the engine session was opened and properties read.
            expect(enigmaCreate).toHaveBeenCalled();

            // Writes did not - this is the feature's core promise.
            for (const sheet of sheets) {
                expect(sheet.obj.setProperties).not.toHaveBeenCalled();
            }
            expect(app.doSave).not.toHaveBeenCalled();
            expect(Delete).not.toHaveBeenCalled();
        });

        test('reads each sheet through the same engine calls the real run uses', async () => {
            // Not from the projected qData.thumbnail: that read answers the
            // icon question correctly and still plans a clean clear for a
            // sheet the real run cannot open at all.
            withAppAndThumbnails();
            const sheets = [makeSheet('s1', 1), makeSheet('s2', 2)];
            const { app } = wireEnigma(sheets);

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS, dryRun: true });

            expect(app.getObject.mock.calls.map((call) => call[0])).toEqual(['s1', 's2']);
            for (const sheet of sheets) {
                expect(sheet.obj.getProperties).toHaveBeenCalledTimes(1);
            }
        });

        test('a sheet the engine cannot open fails the plan, as it would fail the run', async () => {
            // The real run on this input clears s1, saves the app, then fails
            // on s2. A plan that reported "2 icon(s) would be cleared" would
            // promise a clean sweep for a run that half-writes and fails.
            withAppAndThumbnails();
            const good = makeSheet('s1', 1);
            const unreadable = makeSheet('s2', 2);
            const { app } = wireEnigma([good, unreadable]);
            app.getObject.mockImplementation(async (qId) => {
                if (qId === 's2') {
                    throw new Error('Object not found');
                }

                return good.obj;
            });

            await expect(qscloudRemoveSheetIcons({ ...BASE_OPTIONS, dryRun: true })).resolves.toBe(
                false
            );

            const info = logger.info.mock.calls.map((call) => String(call[0])).join('\n');
            expect(info).toContain('this plan is incomplete');
        });

        test('a sheet with no qMeta is still cleared - the log line must not fail it', async () => {
            // The real run named sheet.qMeta.title unguarded in its progress
            // log while the planner read it optionally, so a sheet the engine
            // returned without qMeta was planned as a clean clear and then
            // threw in the real run - failing that sheet, and the app with it,
            // after the sheets around it had already been cleared and saved.
            withNoThumbnailFolder();
            const bare = makeSheet('s1', 1);
            delete bare.item.qMeta;
            const fine = makeSheet('s2', 2);
            const { app } = wireEnigma([bare, fine]);

            await expect(qscloudRemoveSheetIcons({ ...BASE_OPTIONS })).resolves.toBe(true);

            expect(bare.obj.setProperties).toHaveBeenCalledTimes(1);
            expect(fine.obj.setProperties).toHaveBeenCalledTimes(1);
            expect(app.doSave).toHaveBeenCalledTimes(1);
        });

        test('the report names the app, the icons, and the media files', async () => {
            withAppAndThumbnails();
            wireEnigma([makeSheet('s1', 1), makeSheet('s2', 2)]);

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS, dryRun: true });

            const info = logger.info.mock.calls.map((call) => String(call[0])).join('\n');
            expect(info).toContain('DRY RUN of qscloud remove-sheet-icons');
            expect(info).toContain('"Finance operations"');
            expect(info).toContain('clear icon');
            expect(info).toContain(
                '2 thumbnail media file(s) would also be deleted from the app media library'
            );
            expect(info).toContain('2 icon(s) would be cleared, 0 skipped.');
            expect(info).toContain('Nothing was changed. Re-run without --dry-run to apply.');
        });

        test('a sheet without an icon is reported, not skipped', async () => {
            withAppAndThumbnails();
            const bare = makeSheet('s1', 1);
            bare.props.thumbnail.qStaticContentUrlDef.qUrl = '';
            wireEnigma([bare]);

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS, dryRun: true });

            const info = logger.info.mock.calls.map((call) => String(call[0])).join('\n');
            expect(info).toContain('(no icon currently set)');
        });

        test('the real run still writes when dryRun is absent - the control case', async () => {
            withAppAndThumbnails();
            const sheets = [makeSheet('s1', 1)];
            wireEnigma(sheets);

            await qscloudRemoveSheetIcons({ ...BASE_OPTIONS });

            expect(sheets[0].obj.setProperties).toHaveBeenCalled();
        });

        test('the real run skips, not fails, a sheet without a thumbnail structure', async () => {
            // The guard added with the dry-run work: clearing a sheet that has
            // no thumbnail object used to throw and fail the whole app.
            withAppAndThumbnails();
            const broken = makeSheet('s1', 1);
            broken.obj.getProperties.mockResolvedValue({});
            const fine = makeSheet('s2', 2);
            const { app } = wireEnigma([broken, fine]);

            await expect(qscloudRemoveSheetIcons({ ...BASE_OPTIONS })).resolves.toBe(true);

            expect(broken.obj.setProperties).not.toHaveBeenCalled();
            expect(fine.obj.setProperties).toHaveBeenCalled();
            expect(app.doSave).toHaveBeenCalled();
        });
    });
});
