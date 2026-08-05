/**
 * Typed error classes for Butler Sheet Icons.
 *
 * Library code throws these instead of calling `process.exit(1)` so that:
 *
 *   1. The top-level `process.on('uncaughtException')` handler in
 *      `src/butler-sheet-icons.js` is the single source of process exit
 *      logic. Crash dumps, log lines, and exit codes live in one place.
 *   2. Test code can `await expect(promise).rejects.toThrow(<ErrorClass>)`
 *      instead of monkey-patching `process.exit` (which never worked
 *      cleanly under ESM).
 *   3. Callers can catch a specific error type if they need to do
 *      something different from the default crash-and-exit behavior
 *      (e.g. a `--no-fail` integration test mode).
 *
 * All classes accept the standard `Error` constructor shape (message +
 * `{ cause }` options) so they remain transparent to consumers.
 */

/**
 * Base class for all Butler Sheet Icons errors.
 *
 * Distinguishing BSI errors from foreign `Error` instances lets the
 * safety net log them with the `BSI.` prefix and lets future code branch
 * on `err instanceof BsiError` if needed.
 */
export class BsiError extends Error {
    /**
     * Construct a BSI error with an optional cause.
     *
     * @param {string} message - Human-readable error message.
     * @param {object} [options] - Standard `Error` options.
     * @param {Error|unknown} [options.cause] - Original error that caused this one.
     */
    constructor(message, options = {}) {
        super(message, options);
        this.name = 'BsiError';
    }
}

/**
 * Certificate loading or path resolution failure.
 */
export class CertError extends BsiError {
    /**
     * Construct a certificate-related error.
     *
     * @param {string} message - Human-readable error message.
     * @param {object} [options] - Standard `Error` options.
     */
    constructor(message, options = {}) {
        super(message, options);
        this.name = 'CertError';
    }
}

/**
 * Enigma.js schema lookup / load failure.
 */
export class EnigmaError extends BsiError {
    /**
     * Construct an Enigma.js error.
     *
     * @param {string} message - Human-readable error message.
     * @param {object} [options] - Standard `Error` options.
     */
    constructor(message, options = {}) {
        super(message, options);
        this.name = 'EnigmaError';
    }
}

/**
 * Qlik Sense Cloud processing failure (collection lookup, app processing, etc.).
 */
export class CloudError extends BsiError {
    /**
     * Construct a Qlik Sense Cloud error.
     *
     * @param {string} message - Human-readable error message.
     * @param {object} [options] - Standard `Error` options.
     */
    constructor(message, options = {}) {
        super(message, options);
        this.name = 'CloudError';
    }
}

/**
 * QSEoW processing failure (sheet exclude status, app processing, etc.).
 */
export class QseowError extends BsiError {
    /**
     * Construct a QSEoW error.
     *
     * @param {string} message - Human-readable error message.
     * @param {object} [options] - Standard `Error` options.
     */
    constructor(message, options = {}) {
        super(message, options);
        this.name = 'QseowError';
    }
}
