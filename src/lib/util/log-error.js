/**
 * Shared error logging for Butler Sheet Icons.
 *
 * Every caught error is reported the same way: what went wrong at `error` level, and the stack
 * trace at `debug` level.
 *
 * The split matters because the default log level is `info`. Before this helper was used, roughly
 * thirty `catch` blocks each carried their own copy of
 *
 * ```js
 * if (err.stack) logger.error(`SOMETHING (stack): ${err.stack}`);
 * else if (err.message) ...
 * ```
 *
 * and since a real `Error` always has a `.stack`, the second branch was unreachable and every
 * ordinary failure printed a full JavaScript stack trace to a Qlik Sense administrator running a
 * packaged binary. Sixteen frames of `at async ./build/build.cjs:131375:17` tell that reader
 * nothing and bury the one line that does. The same reasoning produced the message/stack split in
 * `src/lib/browser/` for issue #785; this is that convention made shared.
 *
 * The stack is not discarded, only moved: `--loglevel debug` still prints it, from a packaged
 * binary as well as from source.
 */

import { logger } from '../../globals.js';

/**
 * `String(value)` that cannot throw.
 *
 * @param {unknown} value - The value to stringify.
 * @returns {string} The string form, or the object tag if even `String()` fails.
 */
const safeString = (value) => {
    try {
        return String(value);
    } catch {
        // A null-prototype object has no toString(), so even String() throws on it. Nothing may
        // throw from here: this helper runs inside `catch` blocks, and a logging call that fails
        // would replace a reported error with an unreported crash.
        return Object.prototype.toString.call(value);
    }
};

/**
 * Reads a property that may be an accessor written by whoever threw the value.
 *
 * @param {unknown} source - The value to read from.
 * @param {string} property - Property name.
 * @returns {unknown} The value, or `undefined` if reading it threw.
 */
const safeRead = (source, property) => {
    try {
        return source?.[property];
    } catch {
        return undefined;
    }
};

/**
 * Renders any single value as a string, preferring JSON over `[object Object]`.
 *
 * @param {unknown} value - The value to render.
 * @returns {string} Always a string; never throws.
 */
const describeValue = (value) => {
    if (typeof value === 'string') return value;

    try {
        const json = JSON.stringify(value);
        // `undefined` for a function or symbol, `{}` for an object with no enumerable properties -
        // in both cases String() is more informative than the JSON.
        if (json && json !== '{}') return json;
    } catch {
        // Circular references, or a throwing toJSON(). Fall through to String().
    }

    return safeString(value);
};

/**
 * Renders a caught value as a single human-readable line.
 *
 * Anything can be thrown, so this deliberately handles more than `Error`. Plain objects are
 * JSON-encoded rather than stringified, since `[object Object]` names nothing — several of the
 * `catch` blocks this replaced had their own `JSON.stringify` fallback for exactly that reason.
 *
 * @param {Error|unknown} error - The caught value.
 * @returns {string} A description suitable for the end of a log line.
 */
const describeError = (error) => {
    if (typeof error === 'string') return error;

    // `.message` is whatever was thrown and need not be a string. It must become one here:
    // describeWithCauses does substring matching over these values, and a non-string reaching
    // that comparison threw `TypeError: part.includes is not a function` out of the logger -
    // from inside a `catch` block, so the real error was lost and replaced by a crash.
    const message = safeRead(error, 'message');
    if (message !== undefined && message !== null && message !== '') return describeValue(message);

    return describeValue(error);
};

/** How many `cause` links to follow, so a cyclic or absurdly deep chain cannot run away. */
const MAX_CAUSE_DEPTH = 5;

/**
 * Renders an error together with its `cause` chain.
 *
 * The typed errors in `./errors.js` are thrown with `{ cause }` throughout, so the outermost
 * message is usually the general one ("Failed to update sheet thumbnails in app X") and the
 * specific reason ("Not connected") is one or more levels down. Reporting only the outer message
 * tells the user which step failed but not why.
 *
 * A cause already quoted in an enclosing message is skipped: several call sites throw
 * ``new Error(`PREFIX: ${err}`, { cause: err })``, and repeating it would say the same thing twice.
 *
 * Exported for the handful of `catch` blocks that report a failure at `warn` rather than
 * `error` - a step that is allowed to fail without failing the run. They need the same
 * never-throws rendering as `logError`, at a different log level.
 *
 * @param {Error|unknown} error - The caught value.
 * @returns {string} e.g. `Failed to update sheet thumbnails in app X [caused by: Not connected]`.
 */
export const describeWithCauses = (error) => {
    const parts = [describeError(error)];
    const seen = new Set([error]);

    // Counts links followed, not entries kept. Bounding `parts.length` instead looked equivalent
    // but was not: a cause skipped by the dedup below never grows `parts`, so a chain whose links
    // share one message advanced no counter at all. That walked a 50 000-link chain in full, and
    // against a `cause` accessor returning a fresh object each read - which also defeats `seen` -
    // it never terminated.
    let steps = 0;
    let current = safeRead(error, 'cause');
    while (current && steps < MAX_CAUSE_DEPTH && !seen.has(current)) {
        steps += 1;
        seen.add(current);

        const description = describeError(current);
        if (!parts.some((part) => part.includes(description))) {
            parts.push(description);
        }

        current = safeRead(current, 'cause');
    }

    const [outermost, ...causes] = parts;
    return causes.length > 0 ? `${outermost} [caused by: ${causes.join(': ')}]` : outermost;
};

/**
 * Logs a caught error: the reason at `error` level, the stack trace at `debug` level.
 *
 * @param {string} message - Context for the error, used as a prefix. Written as a statement of
 *   what failed rather than a bare symbol name, since it is what the user reads first.
 * @param {Error|unknown} [error] - The caught value. When omitted, `message` is logged on its own.
 *
 * @example
 * try {
 *     await uploadThumbnail(sheet);
 * } catch (err) {
 *     logError('QSEOW UPLOAD: Failed to upload thumbnail', err);
 * }
 */
export function logError(message, error) {
    if (error === undefined || error === null) {
        logger.error(message);
        return;
    }

    logger.error(`${message}: ${describeWithCauses(error)}`);

    if (error.stack) {
        logger.debug(error.stack);
    }
}
