import { isColourEnabled } from './colour.js';
import { parseHeadlessOption } from './headless-option.js';

/**
 * Rung selection for the run-output ladder (issue #1076): pick the highest
 * output the terminal can honestly render.
 *
 * Pure and injectable - no I/O, no reads of `process` or the real
 * environment. The caller hands over the stream, the environment and the two
 * option-derived facts (log level and `--headless`), and gets back a rung
 * name. The decision is made once, at the start of the run: the stream cannot
 * become a terminal later, which is the same argument `colour.js` makes for
 * its own load-time evaluation.
 *
 * This module *composes* the existing detectors rather than re-implementing
 * them. `isColourEnabled()` deliberately overrides picocolors because that
 * library reports "colour supported" on Windows and in CI even when output is
 * redirected - a second, hand-rolled colour test here would reintroduce
 * exactly the bug that function exists to prevent.
 */

/**
 * Environment variable overriding automatic rung selection.
 *
 * An environment variable rather than a CLI flag, for the same reason as
 * `BSI_ASCII_ONLY` and `BSI_NO_INTERACTIVE`: this is an ambient presentation
 * choice, not a per-invocation one, and a flag would have to be declared on
 * all nine leaf commands (and carried through the wizard's option rebuild).
 */
export const OUTPUT_ENV = 'BSI_OUTPUT';

/**
 * The rungs, from highest fidelity to none.
 *
 * `LIVE` is rung C of the ladder (issue #1075, not yet implemented) - the
 * selector already reports it so that landing the live view changes only the
 * renderer, and today's consumers treat it as `BOARD`. `OFF` suppresses the
 * plan and verdict blocks entirely for anyone whose log shipper chokes on
 * framed output; the per-app and per-sheet progress lines still print, so a
 * six-minute run is not silent.
 */
export const RUNG = Object.freeze({
    LIVE: 'live',
    BOARD: 'board',
    PLAIN: 'plain',
    OFF: 'off',
});

const RUNG_VALUES = Object.freeze(Object.values(RUNG));

/**
 * Parse the `BSI_OUTPUT` override.
 *
 * An enum, so it does not reuse the "anything other than empty/`0`/`false`"
 * test the boolean escape hatches share. An unrecognised value warns and
 * falls back to automatic selection - never aborts: a typo in a scheduler's
 * environment block must not turn a working nightly run into a failing one.
 *
 * @param {object} env - Environment to read.
 * @param {(message: string) => void} warn - Called once for an unrecognised value.
 *
 * @returns {string|null} A value from {@link RUNG}, or null for automatic selection.
 */
const parseOutputOverride = (env, warn) => {
    const raw = env?.[OUTPUT_ENV];

    if (raw === undefined || raw === '') {
        return null;
    }

    const value = raw.toLowerCase();
    if (RUNG_VALUES.includes(value)) {
        return value;
    }

    warn(
        `${OUTPUT_ENV}="${raw}" is not a recognised value (${RUNG_VALUES.join(', ')}) - using automatic output selection instead.`
    );

    return null;
};

/**
 * Select the output rung for this run.
 *
 * The rule: try the live view (C); if the environment cannot honestly render
 * it, fall to the contact sheet (B); if it cannot render that, fall to the
 * plain run card (A), which has no gate and always works.
 *
 * Overrides, in precedence order: `BSI_OUTPUT=off` and `=plain` always win -
 * they only ever step down, which every environment can honour. `=board`
 * forces the contact sheet even where detection would have dropped it; the
 * board is static append-only text, so forcing it onto a misdetected terminal
 * (or a pipe, for a recording) cannot leave a cursor stranded - it degrades
 * to uncoloured, un-glyphed text through the palette and symbol fallbacks
 * instead. `=live` is a *permission*, not a force: it is one of C's gates,
 * never a way to point cursor-addressing output at a stream that cannot
 * render it.
 *
 * Two gates that are not obvious (issue #1076):
 *
 * - Any log level other than `info` drops to plain, in both directions.
 *   Someone at `verbose`+ is debugging, and a board printed over the stream
 *   they asked for is actively harmful. Someone at `warn`/`error` asked for
 *   a *quiet* run - and the board writes to stdout past winston, so it
 *   cannot honour a console level the way the plain rung's blocks (logged
 *   at `info`, filtered by the transport) do. An explicit
 *   `BSI_OUTPUT=board` still wins - the operator stated both wishes.
 * - `--headless false` blocks the live rung only. A real Chrome window is
 *   taking focus, and the operator has said the browser is the thing they
 *   want to watch; the board does not compete for attention, so it stays.
 *
 * `TERM=dumb` is a hard gate on the live rung, independent of colour:
 * `isColourEnabled()` checks `TERM=dumb` *after* `FORCE_COLOR` by design, so
 * `FORCE_COLOR=1 TERM=dumb` on a TTY enables colour - correct for colour,
 * wrong for cursor addressing on a terminal that has declared it cannot move
 * the cursor. Colour capability and cursor addressing are different
 * capabilities and get different gates.
 *
 * Both visual rungs additionally require a TTY. The `columns` test implies
 * one on real streams (a pipe has no `columns`), but the verified matrix on
 * issue #1071 states the stronger property - a TTY-less stream lands on plain
 * for *every* combination of the other variables, `FORCE_COLOR=1` included -
 * and this makes it structural rather than incidental.
 *
 * @param {object} run - The run's environment, all injectable.
 * @param {object} run.stdout - Stream the output is destined for.
 * @param {object} run.env - Environment to read.
 * @param {{logLevel: string|undefined, headless: boolean|string|undefined}} [run.options] -
 *     Option-derived facts. `logLevel` is the console level, defaulting to
 *     `info`. `headless` is the raw `--headless` value, interpreted by
 *     `parseHeadlessOption` so this gate matches what the browser launch will
 *     actually do; absent means no browser window opens.
 * @param {(message: string) => void} [run.warn] - Receives the warning for an
 *     unrecognised `BSI_OUTPUT` value. Defaults to a no-op.
 *
 * @returns {string} A value from {@link RUNG}.
 */
export const selectRung = ({ stdout, env, options = {}, warn = () => {} }) => {
    const override = parseOutputOverride(env, warn);

    if (override === RUNG.OFF || override === RUNG.PLAIN || override === RUNG.BOARD) {
        return override;
    }

    // Both visual rungs require the default `info` level: above it the
    // operator is debugging, below it they asked for quiet - and the board,
    // writing to stdout past winston, could honour neither. The plain
    // rung's blocks log at `info` and follow the console level naturally.
    const logLevel = options.logLevel ?? 'info';
    if (logLevel !== 'info') {
        return RUNG.PLAIN;
    }

    const colour = isColourEnabled(stdout, env);
    const tty = Boolean(stdout?.isTTY);
    const columns = stdout?.columns ?? 0;

    // Reaching here means BSI_OUTPUT is unset or `live`, which is itself one
    // of C's gates - the override parse above has already sent every other
    // recognised value down its own path.
    if (
        colour &&
        tty &&
        columns >= 80 &&
        (stdout?.rows ?? 0) >= 24 &&
        env?.TERM !== 'dumb' &&
        parseHeadlessOption(options.headless)
    ) {
        return RUNG.LIVE;
    }

    if (colour && tty && columns >= 72) {
        return RUNG.BOARD;
    }

    return RUNG.PLAIN;
};
