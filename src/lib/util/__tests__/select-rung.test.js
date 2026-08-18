import { describe, test, expect, jest } from '@jest/globals';
import { selectRung, rendersAsBoard, RUNG, OUTPUT_ENV } from '../select-rung.js';

/**
 * The gate matrix for rung selection (issue #1076).
 *
 * Every test injects its stream and environment rather than reading the real
 * ones: CI runners disagree about TTYs, colour and Unicode (which is why
 * `BSI_ASCII_ONLY` exists), so a test that consulted the real environment
 * would assert different things on each runner.
 */

/**
 * A stream that passes every terminal gate unless overridden.
 *
 * @param {object} overrides - Stream fields to override.
 *
 * @returns {object} The fake stream.
 */
const tty = (overrides = {}) => ({ isTTY: true, columns: 100, rows: 30, ...overrides });

/**
 * Shorthand: select with a capable terminal and empty environment.
 *
 * @param {object} [overrides] - Any of `stdout`, `env`, `options`, `warn`.
 *
 * @returns {string} The selected rung.
 */
const select = (overrides = {}) =>
    selectRung({ stdout: tty(), env: {}, options: {}, ...overrides });

describe('selectRung - automatic selection', () => {
    test('a fully capable terminal at info level selects live', () => {
        expect(select()).toBe(RUNG.LIVE);
    });

    test('the documented gate matrix', () => {
        const matrix = [
            // [description, stdout, env, options, expected]
            ['no TTY, no colour', { isTTY: false }, {}, {}, RUNG.PLAIN],
            ['TTY but NO_COLOR', tty(), { NO_COLOR: '1' }, {}, RUNG.PLAIN],
            ['TTY but TERM=dumb (no FORCE_COLOR)', tty(), { TERM: 'dumb' }, {}, RUNG.PLAIN],
            [
                'FORCE_COLOR with TERM=dumb: colour is forced but cursor addressing is not',
                tty(),
                { FORCE_COLOR: '1', TERM: 'dumb' },
                {},
                RUNG.BOARD,
            ],
            ['narrow terminal', tty({ columns: 60 }), {}, {}, RUNG.PLAIN],
            ['short terminal', tty({ rows: 10 }), {}, {}, RUNG.BOARD],
            // warn/error asked for a QUIET run: the board writes to stdout
            // past winston, so it cannot honour a console level - only the
            // plain rung's info-logged blocks can. Both directions off info
            // drop all the way to plain.
            ['log level warn drops to plain', tty(), {}, { logLevel: 'warn' }, RUNG.PLAIN],
            ['log level error drops to plain', tty(), {}, { logLevel: 'error' }, RUNG.PLAIN],
            ['log level verbose drops to plain', tty(), {}, { logLevel: 'verbose' }, RUNG.PLAIN],
            ['log level debug drops to plain', tty(), {}, { logLevel: 'debug' }, RUNG.PLAIN],
            ['log level silly drops to plain', tty(), {}, { logLevel: 'silly' }, RUNG.PLAIN],
            ['visible browser window drops to board', tty(), {}, { headless: 'false' }, RUNG.BOARD],
            ['visible browser window, boolean form', tty(), {}, { headless: false }, RUNG.BOARD],
            ['headless browser keeps live', tty(), {}, { headless: 'true' }, RUNG.LIVE],
            ['no browser at all keeps live', tty(), {}, {}, RUNG.LIVE],
        ];

        for (const [description, stdout, env, options, expected] of matrix) {
            expect(`${description}: ${selectRung({ stdout, env, options })}`).toBe(
                `${description}: ${expected}`
            );
        }
    });

    test('column boundaries: 71 selects plain, 72 selects board', () => {
        // Off-by-one at a boundary is the likely regression, and it is
        // invisible in normal use - so the exact edges are pinned.
        expect(select({ stdout: tty({ columns: 71 }) })).toBe(RUNG.PLAIN);
        expect(select({ stdout: tty({ columns: 72 }) })).toBe(RUNG.BOARD);
    });

    test('column boundaries: 79 selects board, 80 selects live', () => {
        expect(select({ stdout: tty({ columns: 79 }) })).toBe(RUNG.BOARD);
        expect(select({ stdout: tty({ columns: 80 }) })).toBe(RUNG.LIVE);
    });

    test('row boundaries: 23 selects board, 24 selects live', () => {
        expect(select({ stdout: tty({ rows: 23 }) })).toBe(RUNG.BOARD);
        expect(select({ stdout: tty({ rows: 24 }) })).toBe(RUNG.LIVE);
    });

    test('a TTY-less stream lands on plain for every combination of the other variables', () => {
        // The verified matrix on issue #1071: FORCE_COLOR forces colour codes
        // but must never force a rung - the TTY gate sits above it. The
        // synthetic columns/rows make the property structural rather than an
        // accident of pipes having no dimensions.
        for (const env of [{}, { FORCE_COLOR: '1' }, { FORCE_COLOR: '1', TERM: 'xterm' }]) {
            for (const options of [{}, { logLevel: 'info' }, { headless: 'true' }]) {
                expect(
                    selectRung({
                        stdout: { isTTY: false, columns: 100, rows: 30 },
                        env,
                        options,
                    })
                ).toBe(RUNG.PLAIN);
            }
        }
    });
});

describe('rendersAsBoard', () => {
    test('live collapses to the board until rung C exists; plain and off do not', () => {
        expect(rendersAsBoard(RUNG.BOARD)).toBe(true);
        expect(rendersAsBoard(RUNG.LIVE)).toBe(true);
        expect(rendersAsBoard(RUNG.PLAIN)).toBe(false);
        expect(rendersAsBoard(RUNG.OFF)).toBe(false);
    });
});

describe('selectRung - the BSI_OUTPUT override', () => {
    test('off and plain always win, on any terminal', () => {
        for (const stdout of [tty(), { isTTY: false }]) {
            expect(selectRung({ stdout, env: { [OUTPUT_ENV]: 'off' } })).toBe(RUNG.OFF);
            expect(selectRung({ stdout, env: { [OUTPUT_ENV]: 'plain' } })).toBe(RUNG.PLAIN);
        }
    });

    test('board is forced even where detection would have dropped it', () => {
        // The escape hatch for a misdetected terminal - and for recordings
        // through a pipe. The board is static append-only text, so forcing it
        // cannot strand a cursor; palette and symbols degrade on their own.
        expect(selectRung({ stdout: { isTTY: false }, env: { [OUTPUT_ENV]: 'board' } })).toBe(
            RUNG.BOARD
        );
    });

    test('board beats the verbose-level drop; off does too', () => {
        expect(
            selectRung({
                stdout: tty(),
                env: { [OUTPUT_ENV]: 'board' },
                options: { logLevel: 'debug' },
            })
        ).toBe(RUNG.BOARD);
        expect(
            selectRung({
                stdout: tty(),
                env: { [OUTPUT_ENV]: 'off' },
                options: { logLevel: 'debug' },
            })
        ).toBe(RUNG.OFF);
    });

    test('live is a permission, not a force: selection stays automatic', () => {
        expect(selectRung({ stdout: tty(), env: { [OUTPUT_ENV]: 'live' } })).toBe(RUNG.LIVE);
        expect(selectRung({ stdout: { isTTY: false }, env: { [OUTPUT_ENV]: 'live' } })).toBe(
            RUNG.PLAIN
        );
    });

    test('values are case-insensitive, empty means unset', () => {
        expect(selectRung({ stdout: { isTTY: false }, env: { [OUTPUT_ENV]: 'BOARD' } })).toBe(
            RUNG.BOARD
        );
        expect(selectRung({ stdout: tty(), env: { [OUTPUT_ENV]: '' } })).toBe(RUNG.LIVE);
    });

    test('an unrecognised value warns and falls back to automatic, never throws', () => {
        const warn = jest.fn();

        expect(selectRung({ stdout: tty(), env: { [OUTPUT_ENV]: 'fancy' }, warn })).toBe(RUNG.LIVE);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('BSI_OUTPUT="fancy"');
        expect(warn.mock.calls[0][0]).toContain('live, board, plain, off');
    });

    test('recognised and unset values never warn', () => {
        const warn = jest.fn();

        for (const env of [{}, { [OUTPUT_ENV]: 'board' }, { [OUTPUT_ENV]: 'off' }]) {
            selectRung({ stdout: tty(), env, warn });
        }
        expect(warn).not.toHaveBeenCalled();
    });
});
