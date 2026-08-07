import { describe, test, expect } from '@jest/globals';

import { isSheetTagged, sortSheetsByRank } from '../sheet-list.js';

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
