import { jest, describe, test, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('enigma.js', () => ({
    default: { create: jest.fn() },
}));
const enigma = (await import('enigma.js')).default;

jest.unstable_mockModule('../qseow-enigma.js', () => ({
    setupEnigmaConnection: jest.fn().mockReturnValue({ url: 'wss://test' }),
}));

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    },
}));
const { logger } = await import('../../../globals.js');

const { qseowUpdateSheetThumbnails } = await import('../qseow-updatesheets.js');

const BLUR_TAG_WARNING = '--blur-sheet-tag is not yet implemented';

/**
 * Wires the enigma mock chain so the function walks its full sheet-update path over a single
 * sheet, and returns the sheet object so tests can inspect the thumbnail URL that was set.
 *
 * @param {string} sheetId - Engine object id to give the single sheet.
 *
 * @returns {object} The mock sheet object, exposing `setProperties` and the props it received.
 */
function wireEnigmaWithOneSheet(sheetId = 'engine-sheet-1') {
    const sheetProperties = {
        thumbnail: { qStaticContentUrlDef: { qUrl: '' } },
    };
    const sheetObj = {
        getProperties: jest.fn().mockResolvedValue(sheetProperties),
        setProperties: jest.fn().mockResolvedValue({ ok: true }),
        _props: sheetProperties,
    };

    const app = {
        createSessionObject: jest.fn().mockResolvedValue({
            getLayout: jest.fn().mockResolvedValue({
                qAppObjectList: {
                    qItems: [
                        {
                            qInfo: { qId: sheetId },
                            qMeta: { title: 'Sheet 1', description: 'first' },
                            qData: { rank: 1 },
                        },
                    ],
                },
            }),
        }),
        getObject: jest.fn().mockResolvedValue(sheetObj),
        doSave: jest.fn().mockResolvedValue(true),
    };

    const globalObj = {
        engineVersion: jest.fn().mockResolvedValue({ qComponentVersion: '12.0.0' }),
        openDoc: jest.fn().mockResolvedValue(app),
    };

    enigma.create.mockResolvedValue({
        open: jest.fn().mockResolvedValue(globalObj),
        close: jest.fn().mockResolvedValue(true),
        on: jest.fn(),
    });

    return sheetObj;
}

const CREATED_FILES = [{ sheetPos: 1, fileNameShort: 'thumbnail-1.png' }];

const BASE_OPTIONS = {
    host: 'test-server.example.com',
    contentlibrary: 'test-library',
    loglevel: 'info',
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('qseowUpdateSheetThumbnails — --blur-sheet-tag handling (issue #840)', () => {
    test('does not throw when blurSheetTag is set and no tag metadata is supplied', async () => {
        // Before the fix this threw `ReferenceError: tagSheetAppMetadata is not defined`,
        // because the identifier did not exist in the function at all.
        wireEnigmaWithOneSheet();

        await expect(
            qseowUpdateSheetThumbnails(CREATED_FILES, 'test-app-id', {
                ...BASE_OPTIONS,
                blurSheetTag: 'some-tag',
            })
        ).resolves.toBeUndefined();
    });

    test('warns that the option is ignored rather than silently dropping it', async () => {
        wireEnigmaWithOneSheet();

        await qseowUpdateSheetThumbnails(CREATED_FILES, 'test-app-id', {
            ...BASE_OPTIONS,
            blurSheetTag: 'some-tag',
        });

        const warned = logger.warn.mock.calls.map((call) => String(call[0])).join('\n');
        expect(warned).toContain(BLUR_TAG_WARNING);
    });

    test('warns once per call, not once per sheet', async () => {
        wireEnigmaWithOneSheet();

        await qseowUpdateSheetThumbnails(CREATED_FILES, 'test-app-id', {
            ...BASE_OPTIONS,
            blurSheetTag: 'some-tag',
        });

        const blurTagWarnings = logger.warn.mock.calls.filter((call) =>
            String(call[0]).includes(BLUR_TAG_WARNING)
        );
        expect(blurTagWarnings).toHaveLength(1);
    });

    test('stays silent when blurSheetTag is not set', async () => {
        wireEnigmaWithOneSheet();

        await qseowUpdateSheetThumbnails(CREATED_FILES, 'test-app-id', { ...BASE_OPTIONS });

        const warned = logger.warn.mock.calls.map((call) => String(call[0])).join('\n');
        expect(warned).not.toContain(BLUR_TAG_WARNING);
    });

    test('leaves the sheet unblurred when the tag rule matches nothing', async () => {
        const sheetObj = wireEnigmaWithOneSheet();

        await qseowUpdateSheetThumbnails(CREATED_FILES, 'test-app-id', {
            ...BASE_OPTIONS,
            blurSheetTag: 'some-tag',
        });

        expect(sheetObj.setProperties).toHaveBeenCalledTimes(1);
        expect(sheetObj._props.thumbnail.qStaticContentUrlDef.qUrl).toBe(
            '/content/test-library/thumbnail-test-app-id-1.png'
        );
    });

    test('blurs the sheet when supplied metadata matches its engine object id, and does not warn', async () => {
        // The parameter exists so a caller that has looked the tag up can drive the rule.
        // Nothing does that yet (#840), but the plumbing has to work for the fix to be real.
        const sheetObj = wireEnigmaWithOneSheet('engine-sheet-1');

        await qseowUpdateSheetThumbnails(
            CREATED_FILES,
            'test-app-id',
            { ...BASE_OPTIONS, blurSheetTag: 'some-tag' },
            [{ engineObjectId: 'engine-sheet-1' }]
        );

        expect(sheetObj._props.thumbnail.qStaticContentUrlDef.qUrl).toBe(
            '/content/test-library/thumbnail-test-app-id-1-blurred.png'
        );

        const warned = logger.warn.mock.calls.map((call) => String(call[0])).join('\n');
        expect(warned).not.toContain(BLUR_TAG_WARNING);
    });

    test('only logs the "via tags" line when the sheet is actually blurred', async () => {
        // The log used to fire unconditionally, claiming a blur that had not happened.
        wireEnigmaWithOneSheet();

        await qseowUpdateSheetThumbnails(CREATED_FILES, 'test-app-id', {
            ...BASE_OPTIONS,
            blurSheetTag: 'some-tag',
        });

        const verbose = logger.verbose.mock.calls.map((call) => String(call[0])).join('\n');
        expect(verbose).not.toContain('via tags');
    });
});

describe('qseowUpdateSheetThumbnails — sheets with missing metadata', () => {
    /**
     * Wires the enigma mock chain over a caller-supplied list of sheet list items.
     *
     * @param {Array<object>} qItems - Sheet list items to return from the SheetList object.
     *
     * @returns {object} The mock app, so tests can inspect `getObject` call order.
     */
    function wireEnigmaWithSheets(qItems) {
        const app = {
            createSessionObject: jest.fn().mockResolvedValue({
                getLayout: jest.fn().mockResolvedValue({ qAppObjectList: { qItems } }),
            }),
            getObject: jest.fn().mockImplementation(async () => ({
                getProperties: jest
                    .fn()
                    .mockResolvedValue({ thumbnail: { qStaticContentUrlDef: { qUrl: '' } } }),
                setProperties: jest.fn().mockResolvedValue({ ok: true }),
            })),
            doSave: jest.fn().mockResolvedValue(true),
        };

        enigma.create.mockResolvedValue({
            open: jest.fn().mockResolvedValue({
                engineVersion: jest.fn().mockResolvedValue({ qComponentVersion: '12.0.0' }),
                openDoc: jest.fn().mockResolvedValue(app),
            }),
            close: jest.fn().mockResolvedValue(true),
            on: jest.fn(),
        });

        return app;
    }

    /**
     * Builds a well-formed sheet list item.
     *
     * @param {string} qId - Engine object id.
     * @param {number} rank - Sheet rank.
     *
     * @returns {object} A sheet list item.
     */
    const sheetItem = (qId, rank) => ({
        qInfo: { qId },
        qMeta: { title: qId, description: '' },
        qData: { rank },
    });

    test('still processes the well-formed sheets when one sheet has no qData', async () => {
        // Sorting runs before any per-sheet handling, so an unguarded read of
        // sheet.qData.rank in the comparator discarded every update for the app.
        // The rank-less sheet now sorts last.
        const app = wireEnigmaWithSheets([
            sheetItem('sheet-b', 2),
            { qInfo: { qId: 'broken' }, qMeta: { title: 'Broken', description: '' } },
            sheetItem('sheet-a', 1),
        ]);

        await qseowUpdateSheetThumbnails(
            [
                { sheetPos: 1, fileNameShort: 'thumbnail-1.png' },
                { sheetPos: 2, fileNameShort: 'thumbnail-2.png' },
                { sheetPos: 3, fileNameShort: 'thumbnail-3.png' },
            ],
            'test-app-id',
            BASE_OPTIONS
        );

        expect(app.getObject.mock.calls.map((call) => call[0])).toEqual([
            'sheet-a',
            'sheet-b',
            'broken',
        ]);
    });
});
