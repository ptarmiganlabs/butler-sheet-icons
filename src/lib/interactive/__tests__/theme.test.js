import { describe, test, expect } from '@jest/globals';
import { buildTheme } from '../theme.js';
import { ASCII_SYMBOLS, UNICODE_SYMBOLS } from '../symbols.js';
import { createPalette } from '../../util/colour.js';

// Built from a char code rather than written as a literal, so the escape
// character does not appear in the source (no-control-regex).
const ESCAPE = new RegExp(`${String.fromCharCode(27)}\\[`);

const inert = createPalette(false);
const active = createPalette(true);

// Every `(text) => string` entry in a theme, flattened for bulk assertions.
const styleEntries = (theme) =>
    Object.entries(theme.style).filter(([, value]) => typeof value === 'function');

describe('buildTheme', () => {
    test('provides every style entry the core prompts and their extensions read', () => {
        const theme = buildTheme({ palette: inert, symbols: UNICODE_SYMBOLS });

        // Core theme contract, plus the select/checkbox/search extensions. One
        // superset object serves all of them because @inquirer merges a partial
        // theme onto its own defaults per prompt.
        for (const key of [
            'answer',
            'message',
            'error',
            'defaultAnswer',
            'help',
            'highlight',
            'key',
            'disabled',
            'description',
            'searchTerm',
            'keysHelpTip',
        ]) {
            expect(typeof theme.style[key]).toBe('function');
        }

        expect(typeof theme.prefix.idle).toBe('string');
        expect(typeof theme.prefix.done).toBe('string');
        expect(theme.spinner.interval).toBeGreaterThan(0);
        expect(theme.spinner.frames.length).toBeGreaterThan(1);
        expect(typeof theme.icon.cursor).toBe('string');
    });

    describe('with colour disabled', () => {
        const theme = buildTheme({ palette: inert, symbols: UNICODE_SYMBOLS });

        test('no style entry emits an escape code', () => {
            for (const [name, format] of styleEntries(theme)) {
                const rendered =
                    name === 'keysHelpTip' ? format([['a', 'do a thing']]) : format('sample');

                expect(`${name}: ${rendered}`).not.toMatch(ESCAPE);
            }
        });

        test('no prefix, spinner frame or icon emits an escape code', () => {
            const decorations = [
                theme.prefix.idle,
                theme.prefix.done,
                ...theme.spinner.frames,
                ...Object.values(theme.icon),
            ];

            for (const decoration of decorations) {
                expect(decoration).not.toMatch(ESCAPE);
            }
        });

        test('the text handed in still comes back out', () => {
            expect(theme.style.answer('sample')).toBe('sample');
            expect(theme.style.message('sample')).toBe('sample');
            expect(theme.style.error('sample')).toContain('sample');
            expect(theme.style.defaultAnswer('sample')).toContain('sample');
        });
    });

    describe('with colour enabled', () => {
        const theme = buildTheme({ palette: active, symbols: UNICODE_SYMBOLS });

        test('styles are actually applied, so the inert case is proving something', () => {
            expect(theme.style.answer('sample')).toMatch(ESCAPE);
            expect(theme.style.message('sample')).toMatch(ESCAPE);
        });
    });

    describe('with the ASCII symbol set', () => {
        const theme = buildTheme({ palette: inert, symbols: ASCII_SYMBOLS });

        test('the cursor, icons and spinner all follow the symbol set', () => {
            expect(theme.icon.cursor).toBe(ASCII_SYMBOLS.cursor);
            expect(theme.icon.checked).toBe(ASCII_SYMBOLS.checked);
            expect(theme.icon.unchecked).toBe(ASCII_SYMBOLS.unchecked);
            expect(theme.spinner.frames).toEqual([...ASCII_SYMBOLS.spinnerFrames]);
        });

        test('nothing rendered by the theme falls outside ASCII', () => {
            // The spinner is the trap: it is the one thing a user is forced to
            // watch while waiting, and braille frames are Unicode. Hard-coding
            // them - as the library default does - mojibakes exactly there.
            const printable = /^[\x20-\x7e]*$/;
            const rendered = [
                theme.prefix.idle,
                theme.prefix.done,
                ...theme.spinner.frames,
                ...Object.values(theme.icon),
                theme.style.error('failed to connect'),
                theme.style.defaultAnswer('chrome'),
            ];

            for (const text of rendered) {
                expect(printable.test(text)).toBe(true);
            }
        });
    });

    test('keysHelpTip renders the key/action pairs it is handed', () => {
        const theme = buildTheme({ palette: inert, symbols: UNICODE_SYMBOLS });

        expect(
            theme.style.keysHelpTip([
                ['arrow keys', 'move'],
                ['enter', 'select'],
            ])
        ).toBe('arrow keys to move, enter to select');
    });

    test("defaults to the process palette and this terminal's symbol set", () => {
        expect(() => buildTheme()).not.toThrow();
        expect(typeof buildTheme().style.answer).toBe('function');
    });
});
