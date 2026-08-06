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
