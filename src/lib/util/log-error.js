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

    // `.message` is whatever was thrown and need not be a string, and reading it can itself
    // throw when it is an accessor. Neither may escape: this runs inside `catch` blocks, where a
    // failing log call would replace a reported error with an unreported crash.
    const message = safeRead(error, 'message');
    if (message !== undefined && message !== null && message !== '') return describeValue(message);

    return describeValue(error);
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

    logger.error(`${message}: ${describeError(error)}`);

    if (error.stack) {
        logger.debug(error.stack);
    }
}
