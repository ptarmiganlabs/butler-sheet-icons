/**
 * Typed error classes for Butler Sheet Icons.
 *
 * Library code throws these instead of calling `process.exit(1)` so that:
 *
 *   1. The `uncaughtException` handler installed by
 *      `src/lib/util/fatal-handlers.js` is the single source of process exit
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
 * No usable browser could be obtained, and Butler Sheet Icons will not look further.
 *
 * Thrown only where continuing would contradict something the operator asked for - today,
 * an explicitly named `--browser-executable-path` that does not exist. A browser merely being
 * absent is not this error: detection returns `null` for that, and the caller downloads one.
 */
export class BrowserNotFoundError extends BsiError {
    /**
     * Construct a browser-not-found error.
     *
     * @param {string} message - Human-readable error message.
     * @param {object} [options] - Standard `Error` options.
     */
    constructor(message, options = {}) {
        super(message, options);
        this.name = 'BrowserNotFoundError';
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

/**
 * Whether an error represents a run that was deliberately stopped, rather than something breaking.
 *
 * The two are not the same event and should not read the same way. A run that cannot proceed - a
 * precondition that was not met, a command line the run refuses to act on - is an ordinary outcome
 * with a message the operator can act on. A fault is what the crash dump exists for. Before this
 * predicate there was no way to tell them apart above `parseAsync`, so both took the crash path:
 * `FATAL: Unhandled promise rejection`, a dump on disk, and a message telling the operator that
 * something fell out of every `try`/`catch` in the application. Issue #1150.
 *
 * **Duck-typed on purpose.** The obvious implementation is `err instanceof SomeClass`, and it would
 * be wrong here: the module behind `#extensions` is substituted at build time and does not import
 * from this tree (`src/lib/extensions/apply.js`), so it has no class to extend. A plain property is
 * the only marker both sides can agree on without a dependency between them.
 *
 * Anything not carrying the marker keeps today's behaviour exactly, which is the important half:
 * the safety net stays a safety net, and a genuine fault - including a bug inside a hook - still
 * writes its dump.
 *
 * @param {unknown} err - The error to classify.
 *
 * @returns {boolean} True when the error marks itself as a deliberately stopped run.
 */
export const isExpectedFailure = (err) => err?.expected === true;

/**
 * A run stopped deliberately, with a message the operator can act on.
 *
 * Core has no site that throws this yet - it exists so that the convention {@link isExpectedFailure}
 * recognises has one obvious spelling for code that *can* import from this tree, rather than every
 * caller hand-setting a property and one of them eventually misspelling it.
 */
export class ExpectedFailure extends BsiError {
    /**
     * Construct a deliberately stopped run.
     *
     * @param {string} message - What to tell the operator, and why the run stopped.
     * @param {object} [options] - Standard `Error` options.
     * @param {Error|unknown} [options.cause] - Original error that caused this one.
     */
    constructor(message, options = {}) {
        super(message, options);
        this.name = 'ExpectedFailure';
        this.expected = true;
    }
}

/**
 * What a deliberately stopped run exits with.
 *
 * The generic failure code, which is what an unhandled throw produced here before - so this change
 * moves no exit code. #1090 defines the graded scheme and is where a distinct value belongs.
 */
export const EXPECTED_FAILURE_EXIT_CODE = 1;

/**
 * Decide what to do with an error that escaped the parse.
 *
 * Split out of the entry point rather than written inline there, and the reason is the bug this
 * exists to fix: `src/butler-sheet-icons.js` is a script, so the test suite reaches it by spawning a
 * process rather than importing it, and nothing inside it is instrumented. Logic living there is
 * logic no unit test can see - which is exactly how a contract and a safety net came to disagree for
 * as long as they did. Issue #1150.
 *
 * @param {unknown} err - The error that escaped.
 * @param {(message: string) => void} log - How to tell the operator. Injected so the decision can be
 *     asserted without a logger.
 *
 * @returns {number} The exit code to set, when the run stopped deliberately.
 *
 * @throws {unknown} The original error, unchanged, when it is a fault rather than a stopped run -
 *     which puts it back on the path to the process-level safety net and its crash dump.
 */
export const reportExpectedFailure = (err, log) => {
    if (!isExpectedFailure(err)) {
        throw err;
    }

    log(err.message);

    return EXPECTED_FAILURE_EXIT_CODE;
};
