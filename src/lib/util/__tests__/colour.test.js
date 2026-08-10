import { describe, test, expect } from '@jest/globals';
import { isColourEnabled, createPalette, colours } from '../colour.js';

const tty = { isTTY: true };
const piped = { isTTY: false };

describe('isColourEnabled', () => {
    describe('terminal detection', () => {
        test('enabled for a TTY', () => {
            expect(isColourEnabled(tty, {})).toBe(true);
        });

        test('disabled for a piped stream', () => {
            expect(isColourEnabled(piped, {})).toBe(false);
        });

        test('disabled when the stream is missing entirely', () => {
            // process.stdout can be undefined in exotic embeddings; never throw.
            expect(isColourEnabled(undefined, {})).toBe(false);
        });

        test('disabled for a dumb terminal even when it is a TTY', () => {
            expect(isColourEnabled(tty, { TERM: 'dumb' })).toBe(false);
        });
    });

    describe('NO_COLOR', () => {
        test('any non-empty value disables colour on a TTY', () => {
            expect(isColourEnabled(tty, { NO_COLOR: '1' })).toBe(false);
            expect(isColourEnabled(tty, { NO_COLOR: 'yes' })).toBe(false);
            expect(isColourEnabled(tty, { NO_COLOR: '0' })).toBe(false);
        });

        test('an empty value is not a signal, per the NO_COLOR spec', () => {
            expect(isColourEnabled(tty, { NO_COLOR: '' })).toBe(true);
        });

        test('beats FORCE_COLOR', () => {
            expect(isColourEnabled(tty, { NO_COLOR: '1', FORCE_COLOR: '1' })).toBe(false);
        });
    });

    describe('FORCE_COLOR', () => {
        test('enables colour on a piped stream', () => {
            expect(isColourEnabled(piped, { FORCE_COLOR: '1' })).toBe(true);
        });

        test('overrides a dumb terminal', () => {
            expect(isColourEnabled(tty, { FORCE_COLOR: '1', TERM: 'dumb' })).toBe(true);
        });

        test('"0" and "false" force colour off', () => {
            expect(isColourEnabled(tty, { FORCE_COLOR: '0' })).toBe(false);
            expect(isColourEnabled(tty, { FORCE_COLOR: 'false' })).toBe(false);
        });

        test('an empty value is ignored, falling through to capability detection', () => {
            expect(isColourEnabled(tty, { FORCE_COLOR: '' })).toBe(true);
            expect(isColourEnabled(piped, { FORCE_COLOR: '' })).toBe(false);
        });
    });

    // The reason this module exists rather than calling picocolors'
    // isColorSupported. Its expression short-circuits on `platform === 'win32'`
    // and on `CI`, so both of these would report "colour supported" there while
    // output is being redirected to a file. Windows and CI are precisely where
    // Butler Sheet Icons runs unattended with its output captured.
    describe('the cases picocolors gets wrong', () => {
        test('a redirected stream on Windows gets no colour', () => {
            expect(isColourEnabled(piped, { OS: 'Windows_NT' })).toBe(false);
        });

        test('a redirected stream under CI gets no colour', () => {
            expect(isColourEnabled(piped, { CI: 'true' })).toBe(false);
        });

        test('CI with a real terminal still gets colour', () => {
            // Not keyed on CI at all: someone may legitimately have it set in a
            // shell where colour is perfectly fine.
            expect(isColourEnabled(tty, { CI: 'true' })).toBe(true);
        });
    });
});

describe('createPalette', () => {
    test('emits escape codes when enabled', () => {
        expect(createPalette(true).red('x')).toContain('[');
    });

    test('every formatter is the identity function when disabled', () => {
        const palette = createPalette(false);
        const formatters = Object.entries(palette).filter(([, fn]) => typeof fn === 'function');

        expect(formatters.length).toBeGreaterThan(5);
        for (const [name, format] of formatters) {
            expect(`${name}: ${format('sample')}`).toBe(`${name}: sample`);
        }
    });
});

describe('colours', () => {
    test('is a usable palette regardless of how this process was started', () => {
        // Decided at load time from the real stdout, so the value depends on
        // whether jest is attached to a terminal. Either way it must be callable
        // and must round-trip the text it is given.
        expect(typeof colours.dim).toBe('function');
        expect(colours.dim('sample')).toContain('sample');
    });
});
