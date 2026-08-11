import { describe, test, expect } from '@jest/globals';
import { toAppIdList } from '../app-ids.js';

describe('toAppIdList', () => {
    test('passes an array through untouched', () => {
        expect(toAppIdList(['a', 'b'])).toEqual(['a', 'b']);
    });

    test('wraps a single string instead of exploding it', () => {
        // The reason this helper exists. A string is iterable, so
        // `push(...'test-app-id')` does not throw - it pushes eleven
        // single-character app ids, and the run then fails eleven times over
        // ids nobody asked for. Loud is fine; silent and wrong is not.
        expect(toAppIdList('test-app-id')).toEqual(['test-app-id']);
    });

    test('trims a string, so a stray space is not part of the id', () => {
        expect(toAppIdList('  test-app-id  ')).toEqual(['test-app-id']);
    });

    test.each([
        ['undefined', undefined],
        ['null', null],
        ['an empty string', ''],
        ['whitespace only', '   '],
        ['an empty array', []],
    ])('gives an empty list for %s', (_label, input) => {
        expect(toAppIdList(input)).toEqual([]);
    });

    test('does not treat an empty array as "nothing supplied" by returning something else', () => {
        // `[]` is truthy, which is why the `if (options.appid)` guards that used
        // to wrap these pushes stopped meaning anything once the option became
        // variadic. The helper returns a list either way and the callers spread
        // it unconditionally.
        expect(Array.isArray(toAppIdList([]))).toBe(true);
    });
});
