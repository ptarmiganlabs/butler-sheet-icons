import { jest, describe, test, expect, beforeEach } from '@jest/globals';

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
const { isSheetTagged, runOverSheets, SHEET_SKIPPED, sortSheetsByRank } =
    await import('../sheet-list.js');

/**
 * Joins everything logged at error level, for substring assertions.
 *
 * @returns {string} All error lines, newline separated.
 */
const errorLog = () => logger.error.mock.calls.map((call) => String(call[0])).join('\n');

beforeEach(() => {
    jest.clearAllMocks();
});

/**
 * Builds a sheet shaped like an entry in the engine's `qAppObjectList.qItems`.
 *
 * @param {string} id - Value for `qInfo.qId`, used to identify the sheet in assertions.
 * @param {number|undefined} rank - Value for `qData.rank`. Pass `undefined` for a sheet
 *     that has `qData` but no rank in it.
 *
 * @returns {object} A sheet object.
 */
const sheet = (id, rank) => ({ qInfo: { qId: id }, qMeta: { title: id }, qData: { rank } });

/**
 * Builds a sheet with no `qData` at all - what the engine returns for a sheet whose
 * metadata could not be read. This is the shape that used to crash the sort.
 *
 * @param {string} id - Value for `qInfo.qId`.
 *
 * @returns {object} A sheet object without `qData`.
 */
const sheetWithoutQData = (id) => ({ qInfo: { qId: id }, qMeta: { title: id } });

/**
 * Extracts the sheet ids from a sorted list, for order assertions.
 *
 * @param {Array<object>} sheets - Sheets to read ids from.
 *
 * @returns {string[]} The ids, in list order.
 */
const ids = (sheets) => sheets.map((s) => s.qInfo.qId);

describe('sortSheetsByRank', () => {
    test('orders sheets by ascending rank', () => {
        const sheets = [sheet('c', 3), sheet('a', 1), sheet('b', 2)];
        expect(ids(sortSheetsByRank(sheets))).toEqual(['a', 'b', 'c']);
    });

    test('sorts in place and returns the same array', () => {
        const sheets = [sheet('b', 2), sheet('a', 1)];
        const returned = sortSheetsByRank(sheets);
        expect(returned).toBe(sheets);
        expect(ids(sheets)).toEqual(['a', 'b']);
    });

    test('does not throw on a sheet with no qData', () => {
        // The regression this guards: sorting runs before the per-sheet try/catch
        // blocks, so this TypeError used to abort the entire app.
        const sheets = [sheet('a', 1), sheetWithoutQData('broken'), sheet('b', 2)];
        expect(() => sortSheetsByRank(sheets)).not.toThrow();
    });

    test('places a sheet with no qData after every ranked sheet', () => {
        const sheets = [sheet('b', 2), sheetWithoutQData('broken'), sheet('a', 1)];
        expect(ids(sortSheetsByRank(sheets))).toEqual(['a', 'b', 'broken']);
    });

    test('places a sheet whose rank is undefined after every ranked sheet', () => {
        const sheets = [sheet('noRank', undefined), sheet('b', 2), sheet('a', 1)];
        expect(ids(sortSheetsByRank(sheets))).toEqual(['a', 'b', 'noRank']);
    });

    test('treats a null rank as missing', () => {
        const sheets = [sheet('nullRank', null), sheet('a', 1)];
        expect(ids(sortSheetsByRank(sheets))).toEqual(['a', 'nullRank']);
    });

    test('keeps rank 0 ahead of ranked sheets rather than treating it as missing', () => {
        const sheets = [sheet('b', 1), sheet('zero', 0)];
        expect(ids(sortSheetsByRank(sheets))).toEqual(['zero', 'b']);
    });

    test('keeps the original relative order of sheets sharing a rank', () => {
        const sheets = [sheet('first', 1), sheet('second', 1), sheet('third', 1)];
        expect(ids(sortSheetsByRank(sheets))).toEqual(['first', 'second', 'third']);
    });

    test('keeps the original relative order of several rank-less sheets', () => {
        const sheets = [sheetWithoutQData('x'), sheet('a', 1), sheetWithoutQData('y')];
        expect(ids(sortSheetsByRank(sheets))).toEqual(['a', 'x', 'y']);
    });

    test('handles an empty list and a single-sheet list', () => {
        expect(sortSheetsByRank([])).toEqual([]);
        expect(ids(sortSheetsByRank([sheetWithoutQData('only')]))).toEqual(['only']);
    });

    test('does not perturb the order of well-formed sheets around a rank-less one', () => {
        // The old comparator reported "equal" for any pair involving a missing rank,
        // which is not transitive - the good sheets could come out in any order.
        const sheets = [sheet('c', 3), sheetWithoutQData('broken'), sheet('a', 1), sheet('b', 2)];
        expect(ids(sortSheetsByRank(sheets))).toEqual(['a', 'b', 'c', 'broken']);
    });
});

describe('isSheetTagged', () => {
    test('matches a sheet whose engine id is in the tagged list', () => {
        const tagged = [{ engineObjectId: 'sheet-a' }, { engineObjectId: 'sheet-b' }];

        expect(isSheetTagged(tagged, { qInfo: { qId: 'sheet-b' } })).toBe(true);
    });

    test('does not match a sheet absent from the tagged list', () => {
        const tagged = [{ engineObjectId: 'sheet-a' }];

        expect(isSheetTagged(tagged, { qInfo: { qId: 'sheet-z' } })).toBe(false);
    });

    test('does not throw for a sheet with no qInfo', () => {
        // `element.engineObjectId === sheet.qInfo.qId` threw here.
        expect(() => isSheetTagged([{ engineObjectId: 'sheet-a' }], { qMeta: {} })).not.toThrow();
        expect(isSheetTagged([{ engineObjectId: 'sheet-a' }], { qMeta: {} })).toBe(false);
    });

    test('a sheet with no id does not match a tag entry that also has no id', () => {
        // The documented trap: guarding only the right-hand side turns the crash into
        // `undefined === undefined`, which is true - so every sheet missing its id would
        // silently be treated as carrying the tag.
        expect(isSheetTagged([{ engineObjectId: undefined }], { qInfo: {} })).toBe(false);
        expect(isSheetTagged([{}], { qMeta: {} })).toBe(false);
        expect(isSheetTagged([{ engineObjectId: null }], { qInfo: { qId: null } })).toBe(false);
    });

    test('treats a missing or empty tag list as no match', () => {
        expect(isSheetTagged(undefined, { qInfo: { qId: 'sheet-a' } })).toBe(false);
        expect(isSheetTagged([], { qInfo: { qId: 'sheet-a' } })).toBe(false);
    });
});

describe('runOverSheets', () => {
    const CTX = {
        logPrefix: 'TEST PREFIX',
        appId: 'app-1',
        action: 'update',
        ErrorClass: class TestError extends Error {},
    };

    /**
     * Builds a sheet with the metadata the error line reads back.
     *
     * @param {string} id - Engine object id, also used as the title suffix.
     *
     * @returns {object} A sheet object.
     */
    const sheet = (id) => ({ qInfo: { qId: id }, qMeta: { title: `Sheet ${id}` } });

    test('runs the worker once per sheet, with 1-based numbering', async () => {
        const worker = jest.fn();

        await runOverSheets([sheet('a'), sheet('b')], CTX, worker);

        expect(worker.mock.calls.map((call) => call[1])).toEqual([1, 2]);
    });

    test('counts a sheet the worker acted on as attempted', async () => {
        const result = await runOverSheets([sheet('a'), sheet('b')], CTX, jest.fn());

        expect(result).toMatchObject({ attempted: 2, failed: 0, skipped: 0 });
    });

    test('does not count a skipped sheet as attempted', async () => {
        // Reporting "1 of 5" for an app where four sheets were deliberately left alone
        // reads as mostly-fine when nothing actually succeeded.
        const worker = jest.fn(async (s, n) => (n === 1 ? undefined : SHEET_SKIPPED));

        const result = await runOverSheets([sheet('a'), sheet('b'), sheet('c')], CTX, worker);

        expect(result).toMatchObject({ attempted: 1, skipped: 2 });
    });

    test('treats a worker that returns nothing as having attempted the sheet', async () => {
        // The safe default: forgetting to return must not silently mark everything skipped.
        const result = await runOverSheets([sheet('a')], CTX, async () => {});

        expect(result).toMatchObject({ attempted: 1, skipped: 0 });
    });

    describe('a failing sheet', () => {
        const failOn = (n) =>
            jest.fn(async (s, i) => {
                if (i === n) throw new Error('sheet is read-only');
            });

        test('does not stop the sheets after it', async () => {
            const worker = failOn(1);

            await runOverSheets([sheet('a'), sheet('b'), sheet('c')], CTX, worker);

            expect(worker).toHaveBeenCalledTimes(3);
        });

        test('is counted as both attempted and failed', async () => {
            const result = await runOverSheets([sheet('a'), sheet('b')], CTX, failOn(1));

            expect(result).toMatchObject({ attempted: 2, failed: 1 });
        });

        test('is identified in the log by title and engine id, not just position', async () => {
            // Position is a rank-order number that appears nowhere in the Qlik Sense UI.
            // Without the title and id an admin cannot find the sheet that failed.
            await runOverSheets([sheet('abc-123')], CTX, failOn(1));

            expect(errorLog()).toContain('TEST PREFIX');
            expect(errorLog()).toContain('Sheet abc-123');
            expect(errorLog()).toContain('abc-123');
            expect(errorLog()).toContain('app-1');
            expect(errorLog()).toContain('sheet is read-only');
        });

        test('survives a sheet with no metadata to name it', async () => {
            await runOverSheets([{}], CTX, failOn(1));

            expect(errorLog()).toContain('sheet is read-only');
        });
    });

    describe('assertAllProcessed', () => {
        test('passes when every attempted sheet succeeded', async () => {
            const result = await runOverSheets([sheet('a')], CTX, jest.fn());

            expect(() => result.assertAllProcessed()).not.toThrow();
        });

        test('passes when every sheet was skipped', async () => {
            const result = await runOverSheets([sheet('a')], CTX, async () => SHEET_SKIPPED);

            expect(() => result.assertAllProcessed()).not.toThrow();
        });

        test('counts against sheets attempted, not sheets present', async () => {
            const worker = jest.fn(async (s, n) => {
                if (n === 1) throw new Error('boom');
                return SHEET_SKIPPED;
            });
            const result = await runOverSheets(
                [sheet('a'), sheet('b'), sheet('c'), sheet('d')],
                CTX,
                worker
            );

            expect(() => result.assertAllProcessed()).toThrow('Failed to update 1 of 1 sheet(s)');
        });

        test('names the app and uses the caller-supplied error type', async () => {
            const result = await runOverSheets([sheet('a')], CTX, async () => {
                throw new Error('boom');
            });

            expect(() => result.assertAllProcessed()).toThrow(CTX.ErrorClass);
            expect(() => result.assertAllProcessed()).toThrow('app-1');
        });
    });
});
