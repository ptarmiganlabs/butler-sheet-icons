import pc from 'picocolors';

/**
 * Whether colour output is appropriate for a given stream.
 *
 * This owns the decision deliberately, rather than delegating to picocolors'
 * own `isColorSupported`. That flag is computed as
 *
 *     FORCE_COLOR || --color || platform === 'win32' || (stdout.isTTY && TERM !== 'dumb') || CI
 *
 * so `platform === 'win32'` and `CI` short-circuit the TTY test entirely: on
 * Windows, and on every CI runner, picocolors reports "colour supported" even
 * when output is being redirected to a file. Those are the two environments
 * Butler Sheet Icons most often runs in unattended, so the library's answer is
 * wrong exactly where it matters. picocolors is still used for the palette
 * itself, which is what it is good at.
 *
 * Node's own `stream.hasColors()` is not usable as a first test either: it
 * lives on `tty.WriteStream.prototype`, so on a piped stream it is not a
 * function at all rather than merely returning false. `isTTY` has to be
 * checked first regardless.
 *
 * Precedence follows the informal cross-tool convention: an explicit
 * `NO_COLOR` beats everything, then an explicit `FORCE_COLOR`, then the
 * terminal's own capabilities.
 *
 * @param {object} [stream] - Stream the output is destined for. Defaults to `process.stdout`.
 * @param {object} [env] - Environment to read. Defaults to `process.env`. Injectable for tests.
 *
 * @returns {boolean} True when ANSI colour codes should be emitted.
 */
export const isColourEnabled = (stream = process.stdout, env = process.env) => {
    // https://no-color.org - any non-empty value disables colour.
    if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') {
        return false;
    }

    // FORCE_COLOR overrides capability detection in both directions, so it is
    // checked before TERM and isTTY. `0` and `false` mean "force off", which is
    // how the variable is used in the wild even though it reads oddly.
    if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '') {
        return env.FORCE_COLOR !== '0' && env.FORCE_COLOR !== 'false';
    }

    if (env.TERM === 'dumb') {
        return false;
    }

    return Boolean(stream?.isTTY);
};

/**
 * Build a colour palette that is active or inert.
 *
 * When disabled, every entry is the identity function, so call sites never need
 * to branch on whether colour is available - they can always call
 * `palette.dim(text)` and get plain text back when colour is off.
 *
 * @param {boolean} enabled - Whether the returned formatters should emit escape codes.
 *
 * @returns {object} picocolors formatter set.
 */
export const createPalette = (enabled) => pc.createColors(enabled);

/**
 * The palette for the current process, decided once at load time.
 *
 * Load-time evaluation matches how the logger's console transport is built, so
 * the two cannot disagree. Anything needing a palette for a different stream
 * should call {@link createPalette} with its own {@link isColourEnabled} result.
 *
 * @type {object}
 */
export const colours = createPalette(isColourEnabled());
