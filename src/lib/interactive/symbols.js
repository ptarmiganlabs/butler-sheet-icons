import isUnicodeSupportedDefault from 'is-unicode-supported';

/**
 * Environment variable forcing the ASCII symbol set regardless of detection.
 *
 * Two jobs. It is the escape hatch for an administrator whose console renders
 * the Unicode set as mojibake despite detection saying otherwise, and it is the
 * only way to test the fallback in CI - `is-unicode-supported` returns
 * different verdicts on the ubuntu and windows runners, so a test that relied
 * on detection alone would assert different things on each.
 */
export const ASCII_ONLY_ENV = 'BSI_ASCII_ONLY';

/**
 * Symbols for terminals that render Unicode correctly.
 *
 * Text symbols only, never emoji. Emoji are double-width: `"✅ chrome"` measures
 * width 9 for 8 code units while `"✔ chrome"` measures 8 for 8, so an emoji in
 * a status column silently breaks the alignment of every row after it.
 */
export const UNICODE_SYMBOLS = Object.freeze({
    cursor: '❯',
    done: '✔',
    failed: '✖',
    rule: '─',
    checked: '◉',
    unchecked: '◯',
    spinnerFrames: Object.freeze(['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']),
});

/**
 * Symbols for terminals that cannot render Unicode.
 *
 * Within each pair the widths match - `done`/`failed` are both 4 columns,
 * `checked`/`unchecked` both 3 - so switching sets never shifts a column.
 * Any symbol added here must preserve that property for its own pair.
 */
export const ASCII_SYMBOLS = Object.freeze({
    cursor: '>',
    done: '[ok]',
    failed: '[!!]',
    rule: '-',
    checked: '[x]',
    unchecked: '[ ]',
    spinnerFrames: Object.freeze(['-', '\\', '|', '/']),
});

/**
 * Whether this terminal can render the Unicode symbol set.
 *
 * `is-unicode-supported` is a heuristic over `WT_SESSION`, `TERM`,
 * `TERM_PROGRAM` and the platform. It notably does *not* read the Windows
 * console code page, which is the actual mechanism behind mojibake on conhost -
 * it happens to return the right answer there for a different reason. That is
 * why the explicit override exists, and why the self-test prints the raw inputs
 * alongside the verdict rather than the verdict alone.
 *
 * @param {object} [env] - Environment to read. Defaults to `process.env`.
 * @param {Function} [detect] - Detection function. Injectable for tests.
 *
 * @returns {boolean} True when the Unicode symbol set is safe to use.
 */
export const isUnicodeCapable = (env = process.env, detect = isUnicodeSupportedDefault) => {
    const forced = env[ASCII_ONLY_ENV];

    if (forced !== undefined && forced !== '' && forced !== '0' && forced !== 'false') {
        return false;
    }

    return Boolean(detect());
};

/**
 * The symbol set appropriate for this terminal.
 *
 * @param {object} [env] - Environment to read. Defaults to `process.env`.
 * @param {Function} [detect] - Detection function. Injectable for tests.
 *
 * @returns {object} Either {@link UNICODE_SYMBOLS} or {@link ASCII_SYMBOLS}.
 */
export const getSymbols = (env = process.env, detect = isUnicodeSupportedDefault) =>
    isUnicodeCapable(env, detect) ? UNICODE_SYMBOLS : ASCII_SYMBOLS;

/**
 * Border set name for the `table` package, matching the symbol set.
 *
 * Costs nothing: `table` is already a dependency and already ships both, with
 * `ramac` being pure ASCII and `norc` box-drawing characters. Note the package
 * default is `honeywell`, which is *not* ASCII - a table left on the default
 * mojibakes on the same terminals the ASCII symbol set exists for.
 *
 * @param {object} [env] - Environment to read. Defaults to `process.env`.
 * @param {Function} [detect] - Detection function. Injectable for tests.
 *
 * @returns {string} `'norc'` or `'ramac'`, for `getBorderCharacters()`.
 */
export const tableBorderName = (env = process.env, detect = isUnicodeSupportedDefault) =>
    isUnicodeCapable(env, detect) ? 'norc' : 'ramac';
