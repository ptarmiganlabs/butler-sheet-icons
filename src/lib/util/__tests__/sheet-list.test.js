import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

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
const {
    isSessionLevelFailure,
    isSheetTagged,
    runOverSheets,
    saveIfChanged,
    SHEET_SKIPPED,
    sortSheetsByRank,
    getSheetList,
    SHEET_LIST_FIELDS,
    SHEET_LIST_FIELDS_EXTENDED,
} = await import('../sheet-list.js');
const { markInterrupted, resetInterruptState } = await import('../interrupt.js');

/**
 * Joins everything logged at error level, for substring assertions.
 *
 * @returns {string} All error lines, newline separated.
 */
const errorLog = () => logger.error.mock.calls.map((call) => String(call[0])).join('\n');

/**
 * Joins everything logged at info level, for substring assertions.
 *
 * @returns {string} All info lines, newline separated.
 */
const infoLog = () => logger.info.mock.calls.map((call) => String(call[0])).join('\n');

beforeEach(() => {
    jest.clearAllMocks();
    resetInterruptState();
});

afterEach(() => {
    resetInterruptState();
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

/**
 * Builds an error shaped the way enigma.js raises one.
 *
 * Spelled out rather than imported from enigma so the test states what the contract is: a
 * message, a numeric `code`, and the `enigmaError` marker. `original` is the WebSocket close
 * event, which enigma attaches to the socket-level rejections.
 *
 * @param {string} message - enigma's wording.
 * @param {number} code - Value from `enigma.js/error-codes.js`.
 * @param {object} [original] - The close event, when there is one.
 *
 * @returns {Error} The error.
 */
const enigmaError = (message, code, original) =>
    Object.assign(new Error(message), { code, enigmaError: true, original });

describe('isSessionLevelFailure', () => {
    // enigma has three wordings for one dead socket, and this loop hits the one the message
    // list missed - see issue #975. All three carry NOT_CONNECTED (-1).
    test.each([
        ['a request issued after the socket died', enigmaError('Not connected', -1)],
        ['a request in flight when the socket died', enigmaError('Socket closed', -1)],
        ['a socket error', enigmaError('Socket error', -1)],
        ['a suspended session', enigmaError('Session suspended', -11)],
    ])('treats %s as session-level', (_label, err) => {
        expect(isSessionLevelFailure(err)).toBe(true);
    });

    test('leaves a per-sheet enigma failure to the per-sheet path', () => {
        // OBJECT_NOT_FOUND (-2) is one sheet's problem; the session is still alive, and the
        // sheets after it can still be processed.
        expect(isSessionLevelFailure(enigmaError('Object not found', -2))).toBe(false);
    });

    test.each([
        ['a dropped enigma socket', new Error('Socket closed')],
        ['a dead session named without its code', new Error('Not connected')],
        ['a closed CDP session', new Error('Protocol error: Session closed.')],
        [
            'a closed puppeteer target',
            new Error('Protocol error (Browser.getVersion): Target closed'),
        ],
        ['a websocket error', new Error('WebSocket connection failed')],
    ])('treats %s as session-level', (_label, err) => {
        expect(isSessionLevelFailure(err)).toBe(true);
    });

    test.each([
        [
            'a refused connection',
            Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
        ],
        ['a reset connection', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })],
    ])('delegates %s to getErrorCategory', (_label, err) => {
        expect(isSessionLevelFailure(err)).toBe(true);
    });

    test.each([
        ['a read-only sheet', new Error('sheet is read-only')],
        ['a missing object', new Error('Object not found')],
        ['a non-Error', 'just a string'],
        ['nothing', undefined],
    ])('treats %s as sheet-level', (_label, err) => {
        expect(isSessionLevelFailure(err)).toBe(false);
    });
});

describe('runOverSheets — a lost engine session', () => {
    const CTX = {
        logPrefix: 'TEST PREFIX',
        appId: 'app-1',
        action: 'update',
        ErrorClass: class TestError extends Error {},
    };
    const sheet = (id) => ({ qInfo: { qId: id }, qMeta: { title: `Sheet ${id}` } });

    test('abandons the remaining sheets instead of failing each one', async () => {
        // A dropped websocket used to be caught 38 times and reported as 38 broken sheets.
        const worker = jest.fn(async (s, n) => {
            if (n >= 2) throw new Error('Socket closed');
        });

        const result = await runOverSheets(
            [sheet('a'), sheet('b'), sheet('c'), sheet('d')],
            CTX,
            worker
        );

        expect(worker).toHaveBeenCalledTimes(2);
        expect(result.failed).toBe(0);
    });

    test('rethrows the original cause, not a sheet count', async () => {
        const boom = new Error('Socket closed');
        const result = await runOverSheets([sheet('a')], CTX, async () => {
            throw boom;
        });

        expect(() => result.assertAllProcessed()).toThrow(boom);
    });

    test('says the session was lost rather than blaming the sheet', async () => {
        await runOverSheets([sheet('a')], CTX, async () => {
            throw new Error('Socket closed');
        });

        expect(errorLog()).toContain('Lost the engine session');
        expect(errorLog()).not.toContain("Failed to update sheet 1 ('Sheet a'");
    });

    test('stops on the `Not connected` that issue #975 actually produced', async () => {
        // The exact run: the socket dies while the browser is busy, so the failure arrives as
        // `Not connected` rather than `Socket closed`, and every sheet after it used to be
        // logged as broken. Five sheets, dying at three, as in the reported log.
        const worker = jest.fn(async (s, n) => {
            if (n >= 3) throw enigmaError('Not connected', -1, { code: 1006, reason: '' });
        });

        const result = await runOverSheets(
            [sheet('a'), sheet('b'), sheet('c'), sheet('d'), sheet('e')],
            CTX,
            worker
        );

        expect(worker).toHaveBeenCalledTimes(3);
        expect(errorLog()).toContain('Lost the engine session');
        expect(errorLog()).not.toContain('Failed to update sheet 4');
        expect(result.failed).toBe(0);
    });

    test('names the websocket close code when enigma carries one', async () => {
        await runOverSheets([sheet('a')], CTX, async () => {
            throw enigmaError('Not connected', -1, { code: 1006, reason: 'going away' });
        });

        expect(errorLog()).toContain('websocket closed with code 1006');
        expect(errorLog()).toContain('going away');
    });

    test('says nothing about a close event when there is none', async () => {
        await runOverSheets([sheet('a')], CTX, async () => {
            throw enigmaError('Not connected', -1);
        });

        expect(errorLog()).toContain('Lost the engine session');
        expect(errorLog()).not.toContain('websocket closed');
    });
});

describe('runOverSheets — requireAttempt', () => {
    const base = {
        logPrefix: 'TEST PREFIX',
        appId: 'app-1',
        action: 'update',
        ErrorClass: class TestError extends Error {},
    };
    const sheet = (id) => ({ qInfo: { qId: id }, qMeta: { title: `Sheet ${id}` } });

    test('fails when work was expected but every sheet was skipped', async () => {
        // Thumbnails were generated but no sheet matched one - nothing was applied, and
        // that used to report success.
        const result = await runOverSheets(
            [sheet('a'), sheet('b')],
            { ...base, requireAttempt: true },
            async () => SHEET_SKIPPED
        );

        expect(() => result.assertAllProcessed()).toThrow(/no icon was updated/i);
    });

    test('passes when every sheet was skipped and no work was expected', async () => {
        const result = await runOverSheets(
            [sheet('a')],
            { ...base, requireAttempt: false },
            async () => SHEET_SKIPPED
        );

        expect(() => result.assertAllProcessed()).not.toThrow();
    });

    test('does not fire when at least one sheet was attempted', async () => {
        const result = await runOverSheets(
            [sheet('a'), sheet('b')],
            { ...base, requireAttempt: true },
            async (s, n) => (n === 1 ? undefined : SHEET_SKIPPED)
        );

        expect(() => result.assertAllProcessed()).not.toThrow();
    });
});

describe('saveIfChanged', () => {
    const CTX = { logPrefix: 'TEST PREFIX', appId: 'app-1' };

    test('saves when at least one sheet was changed', async () => {
        const app = { doSave: jest.fn().mockResolvedValue(true) };

        await expect(saveIfChanged(app, CTX, 3)).resolves.toBe(true);
        expect(app.doSave).toHaveBeenCalledTimes(1);
    });

    test('does not save when nothing was changed', async () => {
        // A run that changed nothing must not produce a new app version.
        const app = { doSave: jest.fn().mockResolvedValue(true) };

        await expect(saveIfChanged(app, CTX, 0)).resolves.toBe(false);
        expect(app.doSave).not.toHaveBeenCalled();
    });

    test('saves once regardless of how many sheets changed', async () => {
        const app = { doSave: jest.fn().mockResolvedValue(true) };

        await saveIfChanged(app, CTX, 40);

        expect(app.doSave).toHaveBeenCalledTimes(1);
    });

    test.each([
        ['undefined', undefined],
        ['null', null],
        ['NaN', NaN],
        ['a negative count', -1],
    ])('does not save for %s', async (_label, count) => {
        // `changedCount === 0` let every one of these through to doSave. Unreachable from
        // the four current callers, but free to rule out.
        const app = { doSave: jest.fn().mockResolvedValue(true) };

        await expect(saveIfChanged(app, CTX, count)).resolves.toBe(false);
        expect(app.doSave).not.toHaveBeenCalled();
    });

    test('lets a failed save reach the caller', async () => {
        const app = { doSave: jest.fn().mockRejectedValue(new Error('app is locked')) };

        await expect(saveIfChanged(app, CTX, 1)).rejects.toThrow('app is locked');
    });
});

describe('runOverSheets — changed count', () => {
    const CTX = {
        logPrefix: 'TEST PREFIX',
        appId: 'app-1',
        action: 'update',
        ErrorClass: class TestError extends Error {},
    };
    const sheet = (id) => ({ qInfo: { qId: id }, qMeta: { title: `Sheet ${id}` } });

    test('counts sheets whose properties were actually written', async () => {
        const worker = jest.fn(async (s, n) => {
            if (n === 1) throw new Error('read-only');
            if (n === 2) return SHEET_SKIPPED;
            return undefined;
        });

        const result = await runOverSheets([sheet('a'), sheet('b'), sheet('c')], CTX, worker);

        expect(result).toMatchObject({ attempted: 2, failed: 1, skipped: 1, changed: 1 });
    });

    test('reports nothing changed when every sheet was skipped', async () => {
        const result = await runOverSheets([sheet('a')], CTX, async () => SHEET_SKIPPED);

        expect(result.changed).toBe(0);
    });
});

describe('getSheetList', () => {
    /**
     * Builds a mock app whose session object serves the supplied sheet items.
     *
     * @param {object[]} items - Sheet list items to return.
     *
     * @returns {object} The mock app.
     */
    const appReturning = (items) => ({
        createSessionObject: jest.fn().mockResolvedValue({
            getLayout: jest.fn().mockResolvedValue({ qAppObjectList: { qItems: items } }),
        }),
    });

    test('returns the sheet items rather than the engine envelope', async () => {
        const items = [{ qInfo: { qId: 'a' } }];

        await expect(getSheetList(appReturning(items))).resolves.toEqual(items);
    });

    test('asks for a SheetList session object', async () => {
        const app = appReturning([]);

        await getSheetList(app);

        expect(app.createSessionObject).toHaveBeenCalledWith(
            expect.objectContaining({
                qInfo: { qId: 'SheetList', qType: 'SheetList' },
                qAppObjectListDef: expect.objectContaining({ qType: 'sheet' }),
            })
        );
    });

    test('requests the minimal projection by default', async () => {
        // These field sets were verified byte-identical to the six hand-written copies they
        // replace. Asking for the wrong ones would leave qData fields undefined downstream,
        // which reads as "sheet has no rank" rather than as an error.
        const app = appReturning([]);

        await getSheetList(app);

        expect(app.createSessionObject.mock.calls[0][0].qAppObjectListDef.qData).toEqual({
            thumbnail: '/thumbnail',
            rank: '/rank',
        });
    });

    test('requests the wider projection when asked', async () => {
        const app = appReturning([]);

        await getSheetList(app, SHEET_LIST_FIELDS_EXTENDED);

        expect(app.createSessionObject.mock.calls[0][0].qAppObjectListDef.qData).toEqual({
            title: '/qMetaDef/title',
            description: '/qMetaDef/description',
            thumbnail: '/thumbnail',
            cells: '/cells',
            rank: '/rank',
            columns: '/columns',
            rows: '/rows',
        });
    });

    test('the wider projection is a superset of the default', async () => {
        Object.entries(SHEET_LIST_FIELDS).forEach(([key, value]) => {
            expect(SHEET_LIST_FIELDS_EXTENDED[key]).toBe(value);
        });
    });

    test('an app with no sheets yields an empty list, not a throw', async () => {
        await expect(getSheetList(appReturning([]))).resolves.toEqual([]);
    });
});

describe('runOverSheets when the run is interrupted (issue #1107)', () => {
    const CTX = {
        logPrefix: 'TEST PREFIX',
        appId: 'app-1',
        action: 'remove icons for',
        ErrorClass: class TestError extends Error {},
    };

    test('stops at the sheet boundary rather than writing to more sheets', async () => {
        // remove-sheet-icons is the one path that writes per sheet, so this
        // boundary is what keeps the cleared count true.
        const worker = jest.fn(async (s, n) => {
            if (n === 2) markInterrupted('SIGINT');
        });

        const result = await runOverSheets(
            [sheet('a'), sheet('b'), sheet('c'), sheet('d')],
            CTX,
            worker
        );

        expect(worker).toHaveBeenCalledTimes(2);
        expect(result.interrupted).toBe(true);
        expect(result.changed).toBe(2);
    });

    test('the abandoned sheet is not counted as failed', async () => {
        const worker = jest.fn(async (s, n) => {
            if (n !== 2) return undefined;
            markInterrupted('SIGINT');
            throw new Error('Protocol error: Target closed');
        });

        const result = await runOverSheets([sheet('a'), sheet('b'), sheet('c')], CTX, worker);

        expect(result.failed).toBe(0);
        expect(result.interrupted).toBe(true);
        expect(errorLog()).toBe('');
    });

    test('does not blame the engine for a browser the shutdown closed', async () => {
        // `Target closed` matches isSessionLevelFailure, so without the
        // interrupt check first this reads as a lost engine session - the
        // wrong explanation, and the one the operator would act on.
        const worker = jest.fn(async () => {
            markInterrupted('SIGINT');
            throw new Error('Protocol error: Target closed');
        });

        await runOverSheets([sheet('a'), sheet('b')], CTX, worker);

        expect(errorLog()).not.toContain('Lost the engine session');
        expect(infoLog()).toContain('abandoned when the run was interrupted');
    });

    test('assertAllProcessed throws so the app unwinds, saying it was abandoned', async () => {
        const worker = jest.fn(async (s, n) => {
            if (n === 2) markInterrupted('SIGINT');
        });

        const result = await runOverSheets([sheet('a'), sheet('b'), sheet('c')], CTX, worker);

        expect(() => result.assertAllProcessed()).toThrow(/abandoned when the run was interrupted/);
        // The count is the number the operator needs: how far the removal got.
        expect(() => result.assertAllProcessed()).toThrow(/2 sheet\(s\) had been processed/);
    });

    test('a real sheet failure outranks the interrupt', async () => {
        const worker = jest.fn(async (s, n) => {
            if (n === 1) throw new Error('sheet is broken');
            markInterrupted('SIGINT');
        });

        const result = await runOverSheets([sheet('a'), sheet('b'), sheet('c')], CTX, worker);

        // Both are true, but only one of them is still true after a re-run.
        // Reported the other way round, an interrupt at sheet 5 erased four
        // genuine failures at sheets 1-4: the app came back as merely
        // abandoned, `failedApps` was 0, and the operator re-ran without ever
        // learning those sheets were broken.
        expect(result.failed).toBe(1);
        expect(result.interrupted).toBe(true);
        expect(() => result.assertAllProcessed()).toThrow(/Failed to remove icons for 1 of/);
    });

    test('a lost engine session also outranks the interrupt', async () => {
        const worker = jest.fn(async (s, n) => {
            if (n === 1) throw new Error('Socket closed');
            markInterrupted('SIGINT');
        });

        const result = await runOverSheets([sheet('a'), sheet('b')], CTX, worker);

        expect(() => result.assertAllProcessed()).toThrow(/Socket closed/);
    });

    test('with nothing broken, the interrupt is what is reported', async () => {
        const worker = jest.fn(async (s, n) => {
            if (n === 2) markInterrupted('SIGINT');
        });

        const result = await runOverSheets([sheet('a'), sheet('b'), sheet('c')], CTX, worker);

        expect(() => result.assertAllProcessed()).toThrow(/abandoned when the run was interrupted/);
    });

    test('an uninterrupted run is untouched', async () => {
        const result = await runOverSheets([sheet('a'), sheet('b')], CTX, jest.fn());

        expect(result.interrupted).toBe(false);
        expect(() => result.assertAllProcessed()).not.toThrow();
    });
});
