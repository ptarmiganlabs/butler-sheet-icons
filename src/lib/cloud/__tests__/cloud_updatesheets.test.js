import { jest, describe, test, expect, beforeEach } from '@jest/globals';

const enigmaCreate = jest.fn();

jest.unstable_mockModule('enigma.js', () => ({
    default: { create: enigmaCreate },
}));

jest.unstable_mockModule('../cloud-enigma.js', () => ({
    setupEnigmaConnection: jest.fn().mockReturnValue({ url: 'wss://tenant.eu.qlikcloud.com' }),
}));

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
    },
}));

const { logger } = await import('../../../globals.js');
const { qscloudUpdateSheetThumbnails } = await import('../cloud-updatesheets.js');
const { CloudError } = await import('../../util/errors.js');

const APP_ID = 'test-app-id';

const BASE_OPTIONS = {
    tenanturl: 'tenant.eu.qlikcloud.com',
    apikey: 'api-key',
    loglevel: 'info',
};

/**
 * Builds a sheet list item plus the engine object that serves its properties.
 *
 * @param {object} [overrides] - Fields to override.
 * @param {string} [overrides.qId] - Engine object id. Defaults to `'engine-sheet-1'`.
 * @param {number} [overrides.rank] - Sort rank. Defaults to `1`.
 * @param {string} [overrides.title] - Sheet title. Defaults to `'Sheet 1'`.
 * @param {boolean} [overrides.approved] - Value for `qMeta.approved`. Defaults to `false`.
 * @param {boolean} [overrides.published] - Value for `qMeta.published`. Defaults to `false`.
 *
 * @returns {{item: object, obj: object, props: object}} The list item, its engine object,
 *   and the properties object the engine object hands out.
 */
const makeSheet = ({
    qId = 'engine-sheet-1',
    rank = 1,
    title = 'Sheet 1',
    approved = false,
    published = false,
} = {}) => {
    const props = { thumbnail: { qStaticContentUrlDef: { qUrl: '' } } };
    const obj = {
        getProperties: jest.fn().mockResolvedValue(props),
        setProperties: jest.fn().mockResolvedValue({ ok: true }),
    };

    return {
        item: {
            qInfo: { qId },
            qMeta: { title, description: '', approved, published },
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
 * Reads back the thumbnail URL a sheet ended up with.
 *
 * @param {{props: object}} sheet - Sheet produced by `makeSheet`.
 *
 * @returns {string} The thumbnail URL now set on the sheet properties.
 */
const thumbnailUrlOf = (sheet) => sheet.props.thumbnail.qStaticContentUrlDef.qUrl;

const CREATED_FILES = [{ sheetPos: 1, fileNameShort: 'thumbnail-1.png' }];

beforeEach(() => {
    jest.clearAllMocks();
});

describe('qscloudUpdateSheetThumbnails', () => {
    test('points the sheet at its uploaded thumbnail', async () => {
        const sheet = makeSheet();
        wireEnigma([sheet]);

        await qscloudUpdateSheetThumbnails(CREATED_FILES, APP_ID, BASE_OPTIONS);

        expect(thumbnailUrlOf(sheet)).toBe(
            '/api/v1/apps/test-app-id/media/files/thumbnails/thumbnail-1.png'
        );
    });

    test('saves the app after setting each thumbnail', async () => {
        const sheet = makeSheet();
        const { app } = wireEnigma([sheet]);

        await qscloudUpdateSheetThumbnails(CREATED_FILES, APP_ID, BASE_OPTIONS);

        expect(sheet.obj.setProperties).toHaveBeenCalledTimes(1);
        expect(app.doSave).toHaveBeenCalledTimes(1);
    });

    test('closes the engine session when done', async () => {
        const { session } = wireEnigma([makeSheet()]);

        await qscloudUpdateSheetThumbnails(CREATED_FILES, APP_ID, BASE_OPTIONS);

        expect(session.close).toHaveBeenCalledTimes(1);
    });

    test('processes sheets in rank order', async () => {
        const sheets = [
            makeSheet({ qId: 'sheet-c', rank: 3 }),
            makeSheet({ qId: 'sheet-a', rank: 1 }),
            makeSheet({ qId: 'sheet-b', rank: 2 }),
        ];
        const { app } = wireEnigma(sheets);

        await qscloudUpdateSheetThumbnails(
            [
                { sheetPos: 1, fileNameShort: 'thumbnail-1.png' },
                { sheetPos: 2, fileNameShort: 'thumbnail-2.png' },
                { sheetPos: 3, fileNameShort: 'thumbnail-3.png' },
            ],
            APP_ID,
            BASE_OPTIONS
        );

        expect(app.getObject.mock.calls.map((call) => call[0])).toEqual([
            'sheet-a',
            'sheet-b',
            'sheet-c',
        ]);
    });

    test('still processes the well-formed sheets when one sheet has no qData', async () => {
        // Sorting runs before any per-sheet handling, so an unguarded read of
        // sheet.qData.rank in the comparator discarded every update for the app.
        // The rank-less sheet now sorts last.
        const broken = makeSheet({ qId: 'broken', rank: 1 });
        delete broken.item.qData;
        const { app } = wireEnigma([
            makeSheet({ qId: 'sheet-b', rank: 2 }),
            broken,
            makeSheet({ qId: 'sheet-a', rank: 1 }),
        ]);

        await qscloudUpdateSheetThumbnails(
            [
                { sheetPos: 1, fileNameShort: 'thumbnail-1.png' },
                { sheetPos: 2, fileNameShort: 'thumbnail-2.png' },
                { sheetPos: 3, fileNameShort: 'thumbnail-3.png' },
            ],
            APP_ID,
            BASE_OPTIONS
        );

        expect(app.getObject.mock.calls.map((call) => call[0])).toEqual([
            'sheet-a',
            'sheet-b',
            'broken',
        ]);
    });

    test('skips a sheet that has no created file', async () => {
        const sheets = [
            makeSheet({ qId: 'sheet-a', rank: 1 }),
            makeSheet({ qId: 'sheet-b', rank: 2 }),
        ];
        wireEnigma(sheets);

        await qscloudUpdateSheetThumbnails(CREATED_FILES, APP_ID, BASE_OPTIONS);

        expect(sheets[0].obj.setProperties).toHaveBeenCalledTimes(1);
        expect(sheets[1].obj.setProperties).not.toHaveBeenCalled();
    });

    test('handles an app with no sheets', async () => {
        const { session } = wireEnigma([]);

        await expect(
            qscloudUpdateSheetThumbnails(CREATED_FILES, APP_ID, BASE_OPTIONS)
        ).resolves.toBeUndefined();

        expect(session.close).toHaveBeenCalledTimes(1);
    });

    describe('blurring', () => {
        const BLURRED_FILES = [
            {
                sheetPos: 1,
                fileNameShort: 'thumbnail-1.png',
                fileNameShortBlurred: 'thumbnail-1-blurred.png',
            },
        ];

        const BLURRED_URL =
            '/api/v1/apps/test-app-id/media/files/thumbnails/thumbnail-1-blurred.png';
        const REGULAR_URL = '/api/v1/apps/test-app-id/media/files/thumbnails/thumbnail-1.png';

        test('blurs a public sheet when "public" is listed', async () => {
            const sheet = makeSheet({ approved: true, published: true });
            wireEnigma([sheet]);

            await qscloudUpdateSheetThumbnails(BLURRED_FILES, APP_ID, {
                ...BASE_OPTIONS,
                blurSheetStatus: ['public'],
            });

            expect(thumbnailUrlOf(sheet)).toBe(BLURRED_URL);
        });

        test('blurs a published sheet when "published" is listed', async () => {
            const sheet = makeSheet({ approved: false, published: true });
            wireEnigma([sheet]);

            await qscloudUpdateSheetThumbnails(BLURRED_FILES, APP_ID, {
                ...BASE_OPTIONS,
                blurSheetStatus: ['published'],
            });

            expect(thumbnailUrlOf(sheet)).toBe(BLURRED_URL);
        });

        test('does not blur a public sheet when only "published" is listed', async () => {
            const sheet = makeSheet({ approved: true, published: true });
            wireEnigma([sheet]);

            await qscloudUpdateSheetThumbnails(BLURRED_FILES, APP_ID, {
                ...BASE_OPTIONS,
                blurSheetStatus: ['published'],
            });

            expect(thumbnailUrlOf(sheet)).toBe(REGULAR_URL);
        });

        test('blurs by sheet number', async () => {
            const sheet = makeSheet();
            wireEnigma([sheet]);

            await qscloudUpdateSheetThumbnails(BLURRED_FILES, APP_ID, {
                ...BASE_OPTIONS,
                blurSheetNumber: ['1'],
            });

            expect(thumbnailUrlOf(sheet)).toBe(BLURRED_URL);
        });

        test('leaves a sheet number that is not listed unblurred', async () => {
            const sheet = makeSheet();
            wireEnigma([sheet]);

            await qscloudUpdateSheetThumbnails(BLURRED_FILES, APP_ID, {
                ...BASE_OPTIONS,
                blurSheetNumber: ['2'],
            });

            expect(thumbnailUrlOf(sheet)).toBe(REGULAR_URL);
        });

        test('blurs by sheet title', async () => {
            const sheet = makeSheet({ title: 'Salaries' });
            wireEnigma([sheet]);

            await qscloudUpdateSheetThumbnails(BLURRED_FILES, APP_ID, {
                ...BASE_OPTIONS,
                blurSheetTitle: ['Salaries'],
            });

            expect(thumbnailUrlOf(sheet)).toBe(BLURRED_URL);
        });

        test('leaves a title that is not listed unblurred', async () => {
            const sheet = makeSheet({ title: 'Margins' });
            wireEnigma([sheet]);

            await qscloudUpdateSheetThumbnails(BLURRED_FILES, APP_ID, {
                ...BASE_OPTIONS,
                blurSheetTitle: ['Salaries'],
            });

            expect(thumbnailUrlOf(sheet)).toBe(REGULAR_URL);
        });

        test('falls back to the regular thumbnail when no blurred file was created', async () => {
            // The blur rule matches, but nothing produced a blurred image — the sheet must
            // still get a working thumbnail rather than a URL pointing at nothing.
            const sheet = makeSheet({ title: 'Salaries' });
            wireEnigma([sheet]);

            await qscloudUpdateSheetThumbnails(CREATED_FILES, APP_ID, {
                ...BASE_OPTIONS,
                blurSheetTitle: ['Salaries'],
            });

            expect(thumbnailUrlOf(sheet)).toBe(REGULAR_URL);
        });

        test('uses the regular thumbnail when no blur options are set', async () => {
            const sheet = makeSheet({ approved: true, published: true });
            wireEnigma([sheet]);

            await qscloudUpdateSheetThumbnails(BLURRED_FILES, APP_ID, BASE_OPTIONS);

            expect(thumbnailUrlOf(sheet)).toBe(REGULAR_URL);
        });
    });

    describe('a sheet that cannot be updated', () => {
        const THREE_FILES = [
            { sheetPos: 1, fileNameShort: 'thumbnail-1.png' },
            { sheetPos: 2, fileNameShort: 'thumbnail-2.png' },
            { sheetPos: 3, fileNameShort: 'thumbnail-3.png' },
        ];

        test('does not stop the sheets after it', async () => {
            // There was no per-sheet isolation here at all: one read-only sheet discarded
            // every update that came after it.
            const sheets = [
                makeSheet({ qId: 'sheet-a', rank: 1 }),
                makeSheet({ qId: 'sheet-b', rank: 2 }),
                makeSheet({ qId: 'sheet-c', rank: 3 }),
            ];
            sheets[0].obj.setProperties.mockRejectedValue(new Error('sheet is read-only'));
            wireEnigma(sheets);

            await expect(
                qscloudUpdateSheetThumbnails(THREE_FILES, APP_ID, BASE_OPTIONS)
            ).rejects.toThrow(CloudError);

            expect(sheets[1].obj.setProperties).toHaveBeenCalledTimes(1);
            expect(sheets[2].obj.setProperties).toHaveBeenCalledTimes(1);
        });

        test('still closes the engine session', async () => {
            const sheets = [makeSheet({ qId: 'sheet-a', rank: 1 })];
            sheets[0].obj.setProperties.mockRejectedValue(new Error('sheet is read-only'));
            const { session } = wireEnigma(sheets);

            await expect(
                qscloudUpdateSheetThumbnails(THREE_FILES, APP_ID, BASE_OPTIONS)
            ).rejects.toThrow();

            expect(session.close).toHaveBeenCalledTimes(1);
        });

        test('counts only the sheets it tried to update, not the ones it skipped', async () => {
            // Only sheet 1 has a thumbnail; 2 and 3 are deliberately left alone. Reporting
            // "1 of 3" would read as mostly-fine when in fact nothing was updated.
            const sheets = [
                makeSheet({ qId: 'sheet-a', rank: 1 }),
                makeSheet({ qId: 'sheet-b', rank: 2 }),
                makeSheet({ qId: 'sheet-c', rank: 3 }),
            ];
            sheets[0].obj.setProperties.mockRejectedValue(new Error('sheet is read-only'));
            wireEnigma(sheets);

            await expect(
                qscloudUpdateSheetThumbnails(
                    [{ sheetPos: 1, fileNameShort: 'thumbnail-1.png' }],
                    APP_ID,
                    BASE_OPTIONS
                )
            ).rejects.toThrow('Failed to update 1 of 1 sheet(s)');
        });

        test('fails the app, naming how many sheets could not be updated', async () => {
            const sheets = [
                makeSheet({ qId: 'sheet-a', rank: 1 }),
                makeSheet({ qId: 'sheet-b', rank: 2 }),
                makeSheet({ qId: 'sheet-c', rank: 3 }),
            ];
            sheets[0].obj.setProperties.mockRejectedValue(new Error('sheet is read-only'));
            wireEnigma(sheets);

            await expect(
                qscloudUpdateSheetThumbnails(THREE_FILES, APP_ID, BASE_OPTIONS)
            ).rejects.toThrow('Failed to update 1 of 3 sheet(s)');
        });
    });

    describe('error handling', () => {
        test('rejects with CloudError when the engine session cannot be created', async () => {
            enigmaCreate.mockRejectedValue(new Error('engine unreachable'));

            await expect(
                qscloudUpdateSheetThumbnails(CREATED_FILES, APP_ID, BASE_OPTIONS)
            ).rejects.toThrow(CloudError);
        });

        test('names the app that failed', async () => {
            enigmaCreate.mockRejectedValue(new Error('engine unreachable'));

            await expect(
                qscloudUpdateSheetThumbnails(CREATED_FILES, APP_ID, BASE_OPTIONS)
            ).rejects.toThrow(/test-app-id/);
        });

        test('keeps the underlying failure as the error cause', async () => {
            const engineError = new Error('engine unreachable');
            enigmaCreate.mockRejectedValue(engineError);

            let thrown;
            try {
                await qscloudUpdateSheetThumbnails(CREATED_FILES, APP_ID, BASE_OPTIONS);
            } catch (err) {
                thrown = err;
            }

            expect(thrown.cause).toBe(engineError);
        });

        test('rejects when a sheet cannot be updated', async () => {
            const sheet = makeSheet();
            sheet.obj.setProperties.mockRejectedValue(new Error('sheet is read-only'));
            wireEnigma([sheet]);

            await expect(
                qscloudUpdateSheetThumbnails(CREATED_FILES, APP_ID, BASE_OPTIONS)
            ).rejects.toThrow(CloudError);
        });

        test('logs the failure before rejecting', async () => {
            enigmaCreate.mockRejectedValue(new Error('engine unreachable'));

            await expect(
                qscloudUpdateSheetThumbnails(CREATED_FILES, APP_ID, BASE_OPTIONS)
            ).rejects.toThrow();

            expect(logger.error).toHaveBeenCalled();
        });
    });
});

describe('qscloudUpdateSheetThumbnails — saving the app', () => {
    test('saves before closing the engine session', async () => {
        const { app, session } = wireEnigma([makeSheet()]);
        const order = [];
        app.doSave.mockImplementation(async () => order.push('save'));
        session.close.mockImplementation(async () => order.push('close'));

        await qscloudUpdateSheetThumbnails(CREATED_FILES, APP_ID, BASE_OPTIONS);

        expect(order).toEqual(['save', 'close']);
    });

    test('releases the engine session even when the save fails', async () => {
        // Without a finally around save-and-close the websocket leaked once per failing app.
        const { app, session } = wireEnigma([makeSheet()]);
        app.doSave.mockRejectedValue(new Error('app is locked'));

        await expect(
            qscloudUpdateSheetThumbnails(CREATED_FILES, APP_ID, BASE_OPTIONS)
        ).rejects.toThrow();

        expect(session.close).toHaveBeenCalledTimes(1);
    });

    test('names the tenant when reporting the closed session, not an undefined host', async () => {
        // This line interpolated options.host, which Qlik Sense Cloud has no such option for -
        // every run logged "on host undefined". Nothing covered it, which is how it survived.
        wireEnigma([makeSheet()]);

        await qscloudUpdateSheetThumbnails(CREATED_FILES, APP_ID, BASE_OPTIONS);

        const logged = logger.verbose.mock.calls.map((call) => String(call[0])).join('\n');
        expect(logged).toContain('Closed session after updating sheet thumbnail images');
        expect(logged).toContain(`on tenant ${BASE_OPTIONS.tenanturl}`);
        expect(logged).not.toContain('undefined');
    });
});
