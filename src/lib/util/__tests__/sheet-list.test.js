import { describe, test, expect } from '@jest/globals';

import { sortSheetsByRank } from '../sheet-list.js';

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
