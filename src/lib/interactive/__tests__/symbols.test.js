import { describe, test, expect } from '@jest/globals';
import { getBorderCharacters } from 'table';
import {
    ASCII_ONLY_ENV,
    ASCII_SYMBOLS,
    UNICODE_SYMBOLS,
    getSymbols,
    isUnicodeCapable,
    tableBorderName,
} from '../symbols.js';

const unicodeYes = () => true;
const unicodeNo = () => false;

describe('the symbol sets', () => {
    test('have identical key sets, so switching can never leave a hole', () => {
        expect(Object.keys(ASCII_SYMBOLS).sort()).toEqual(Object.keys(UNICODE_SYMBOLS).sort());
    });

    test('are frozen, so one caller cannot restyle every other', () => {
        expect(Object.isFrozen(ASCII_SYMBOLS)).toBe(true);
        expect(Object.isFrozen(UNICODE_SYMBOLS)).toBe(true);
    });

    test('the ASCII set is genuinely ASCII, every entry', () => {
        // The whole point of the fallback. One stray box-drawing character here
        // and the terminal that needed the fallback still shows mojibake.
        const printable = /^[\x20-\x7e]+$/;

        for (const [name, value] of Object.entries(ASCII_SYMBOLS)) {
            const entries = Array.isArray(value) ? value : [value];
            for (const entry of entries) {
                expect(`${name}: ${entry}`).toEqual(expect.stringMatching(/.+/));
                expect(printable.test(entry)).toBe(true);
            }
        }
    });

    test('paired symbols are the same width within each set, so columns do not shift', () => {
        expect(ASCII_SYMBOLS.done).toHaveLength(ASCII_SYMBOLS.failed.length);
        expect(ASCII_SYMBOLS.checked).toHaveLength(ASCII_SYMBOLS.unchecked.length);
        expect([...UNICODE_SYMBOLS.done]).toHaveLength([...UNICODE_SYMBOLS.failed].length);
        expect([...UNICODE_SYMBOLS.checked]).toHaveLength([...UNICODE_SYMBOLS.unchecked].length);
    });

    test('carry nothing pictographic, which a font may draw as double-width emoji', () => {
        // Extended_Pictographic deliberately, not the narrower
        // Emoji_Presentation. This test used to allow the latter, on the
        // reasoning that U+2714 and U+2716 are text-presentation by default and
        // therefore single-width. A screenshot from Windows Terminal disproved
        // it: both were drawn from the emoji font, in colour, at double width,
        // shifting every following column by one. Default presentation does not
        // bind the font, so the conservative property is the correct one.
        const pictographic = /\p{Extended_Pictographic}|\p{Emoji_Presentation}|️/u;

        for (const set of [UNICODE_SYMBOLS, ASCII_SYMBOLS]) {
            for (const [name, value] of Object.entries(set)) {
                const entries = Array.isArray(value) ? value : [value];
                for (const entry of entries) {
                    expect(`${name}: ${pictographic.test(entry)}`).toBe(`${name}: false`);
                }
            }
        }
    });

    test('both provide spinner frames', () => {
        expect(UNICODE_SYMBOLS.spinnerFrames.length).toBeGreaterThan(1);
        expect(ASCII_SYMBOLS.spinnerFrames.length).toBeGreaterThan(1);
    });
});

describe('isUnicodeCapable', () => {
    test('follows the detector when nothing is forced', () => {
        expect(isUnicodeCapable({}, unicodeYes)).toBe(true);
        expect(isUnicodeCapable({}, unicodeNo)).toBe(false);
    });

    test('the override forces ASCII even when detection says Unicode is fine', () => {
        expect(isUnicodeCapable({ [ASCII_ONLY_ENV]: '1' }, unicodeYes)).toBe(false);
    });

    test('a falsy override is ignored', () => {
        for (const value of ['', '0', 'false']) {
            expect(isUnicodeCapable({ [ASCII_ONLY_ENV]: value }, unicodeYes)).toBe(true);
        }
    });

    test('the override cannot force Unicode on, only off', () => {
        // Deliberately one-way: forcing Unicode onto a terminal that cannot
        // render it produces mojibake, which is the failure this guards.
        expect(isUnicodeCapable({ [ASCII_ONLY_ENV]: '0' }, unicodeNo)).toBe(false);
    });
});

describe('getSymbols', () => {
    test('selects the set matching the terminal', () => {
        expect(getSymbols({}, unicodeYes)).toBe(UNICODE_SYMBOLS);
        expect(getSymbols({}, unicodeNo)).toBe(ASCII_SYMBOLS);
        expect(getSymbols({ [ASCII_ONLY_ENV]: '1' }, unicodeYes)).toBe(ASCII_SYMBOLS);
    });
});

describe('tableBorderName', () => {
    test('tracks the symbol set', () => {
        expect(tableBorderName({}, unicodeYes)).toBe('norc');
        expect(tableBorderName({}, unicodeNo)).toBe('ramac');
        expect(tableBorderName({ [ASCII_ONLY_ENV]: '1' }, unicodeYes)).toBe('ramac');
    });

    test('the names resolve to real border sets with the expected character range', () => {
        // Pins the assumption this module is built on, against the installed
        // copy of `table` rather than its documentation. Note the package
        // default is honeywell, which is not ASCII - which is why callers must
        // ask for a name rather than relying on the default.
        const ascii = /^[\x20-\x7e]*$/;

        expect(ascii.test(Object.values(getBorderCharacters('ramac')).join(''))).toBe(true);
        expect(ascii.test(Object.values(getBorderCharacters('norc')).join(''))).toBe(false);
    });
});
