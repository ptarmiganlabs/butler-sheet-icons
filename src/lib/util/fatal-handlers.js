/**
 * Process-level fatal error handlers for Butler Sheet Icons.
 *
 * These are the safety net of last resort: the `uncaughtException` and
 * `unhandledRejection` listeners that catch anything escaping every try/catch
 * in the application, write a crash dump, and exit with a non-zero code.
 *
 * They live here rather than in `src/butler-sheet-icons.js` for two reasons:
 * importing the entry point runs the CLI as a side effect, so the handlers
 * could not be unit-tested where they were; and the two handlers are twins, so
 * keeping them in one place stops a fix being applied to one and not the other.
 *
 * ## Why the shape of this module matters
 *
 * Issue #946 reported a single process producing 479,178 crash dump files and
 * never exiting. Two properties of the old handlers combined to allow that:
 *
 *   1. They were re-entrant. Every fatal event started its own crash dump, so a
 *      failing run that produced a burst of rejections produced a burst of
 *      dumps. Measured before this module existed: 200 unhandled rejections in
 *      one process wrote 400 files.
 *   2. They ended with `writeCrashDump(...).finally(() => process.exit(1))`.
 *      `.finally()` does not handle a rejection — it passes it through, and the
 *      promise it returns then rejects with nobody listening, which Node reports
 *      as a fresh `unhandledRejection`. A failing crash dump could therefore
 *      re-trigger the handler that asked for it.
 *
 * Four independent guards now close that off, so that no single mistake can
 * bring the runaway back:
 *
 *   - A re-entry guard. The first fatal event owns the exit; later ones are
 *     dropped. This is what makes the loop structurally impossible.
 *   - A `.catch()` before the `.finally()`, so a rejected crash dump can never
 *     become a new fatal event.
 *   - A watchdog timer, so the process still exits if the crash dump write
 *     never settles (a hung network filesystem, say).
 *   - A per-process cap inside `writeCrashDump()` itself, which covers any
 *     future caller rather than just these two handlers.
 *
 * A second fatal error arriving while the first crash dump is still being
 * written is dropped rather than exiting immediately. Exiting there would
 * truncate the one dump the operator actually needs, leaving the zero-byte file
 * that #946 is about; the watchdog bounds how long the wait can be instead.
 */

import { logger as defaultLogger } from '../../globals.js';
import { writeCrashDump as defaultWriteCrashDump } from './crash-dump.js';

// ---------------------------------------------------------------------------
// Module-level constants and state
// ---------------------------------------------------------------------------

/**
 * Maximum time (ms) to wait for the crash dump write to settle before exiting
 * anyway. Twice `CRASH_DUMP_WRITE_TIMEOUT_MS` in `crash-dump.js`, so under
 * normal conditions the dump's own timeout always fires first and this is never
 * reached. It exists for the case where the dump promise never settles at all.
 */
export const FATAL_EXIT_WATCHDOG_MS = 10000;

/** True once a fatal event is being handled. Later fatal events are dropped. */
let handlingFatal = false;

/** True once `exit` has been called, so it can never be called twice. */
let exited = false;

/** Handle for the watchdog timer, cleared when the process exits. */
let watchdogTimer = null;

/**
 * The listeners currently registered, so a re-install can remove them first.
 * `null` when nothing is installed.
 *
 * @type {{target: import('node:events').EventEmitter, listeners: Array<[string, Function]>}|null}
 */
let installation = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Coerces an unhandled rejection reason into an `Error`.
 *
 * Rejection reasons are arbitrary values, and `String(reason)` can itself throw
 * when the reason is an object with a hostile `toString`. Throwing here would
 * turn an unhandled rejection into an uncaught exception before the re-entry
 * guard is set, so the coercion is guarded.
 *
 * @param {Error|unknown} reason - The rejection reason.
 *
 * @returns {Error} The reason itself when it is already an `Error`, otherwise a
 *   new `Error` describing it.
 */
function toError(reason) {
    if (reason instanceof Error) return reason;
    try {
        return new Error(String(reason));
    } catch {
        return new Error('Unhandled promise rejection with an uncoercible reason');
    }
}

/**
 * Writes the single `FATAL:` log line for a fatal event.
 *
 * Never throws: falls back to `console.error` if the logger is broken, and
 * gives up silently if that fails too. A failure to log must not stop the crash
 * dump from being written.
 *
 * @param {Error} err - The error that caused the crash.
 * @param {string} source - Where the crash originated (`uncaughtException` | `unhandledRejection`).
 * @param {object} logger - Logger with an `error` method.
 *
 * @returns {void}
 */
function logFatalLine(err, source, logger) {
    const label =
        source === 'uncaughtException' ? 'Uncaught exception' : 'Unhandled promise rejection';
    const message = `FATAL: ${label}: ${err?.message ?? err}`;

    try {
        logger.error(message);
    } catch {
        try {
            console.error(message);
        } catch {
            // Nothing left to log with. Carry on to the crash dump.
        }
    }
}

/**
 * Exits the process, at most once per process lifetime.
 *
 * Both the crash dump completing and the watchdog firing lead here, so this
 * collapses them into a single exit.
 *
 * @param {number} code - Exit code to pass to the injected exit function.
 * @param {Function} exit - The exit function (`process.exit` in production).
 *
 * @returns {void}
 */
function exitOnce(code, exit) {
    if (exited) return;
    exited = true;

    if (watchdogTimer !== null) {
        clearTimeout(watchdogTimer);
        watchdogTimer = null;
    }

    exit(code);
}

/**
 * Arms the watchdog that force-exits if the crash dump write never settles.
 *
 * The timer is `unref`'d so it can never by itself keep an otherwise healthy
 * process alive.
 *
 * @param {object} deps - Resolved dependencies for this installation.
 *
 * @returns {void}
 */
function armWatchdog(deps) {
    try {
        watchdogTimer = setTimeout(() => exitOnce(1, deps.exit), deps.watchdogMs);
        if (typeof watchdogTimer.unref === 'function') watchdogTimer.unref();
    } catch {
        // If the timer cannot be created we still have the crash dump's own
        // timeout as a path to exit.
    }
}

/**
 * Handles one fatal event: log it, write a crash dump, exit.
 *
 * The first fatal event to arrive wins; every later one returns immediately
 * without logging, writing, or exiting.
 *
 * @param {Error} err - The error that caused the crash.
 * @param {string} source - Where the crash originated (`uncaughtException` | `unhandledRejection`).
 * @param {object} deps - Resolved dependencies for this installation.
 *
 * @returns {void}
 */
function handleFatal(err, source, deps) {
    // A fatal error raised while already handling a fatal error is dropped.
    if (handlingFatal) return;
    handlingFatal = true;

    armWatchdog(deps);
    logFatalLine(err, source, deps.logger);

    try {
        // `Promise.resolve` so that a `writeCrashDump` which returns a
        // non-promise cannot throw here, and `.catch` so that a failed dump can
        // never become a new fatal event.
        Promise.resolve(deps.writeCrashDump(err, source))
            .catch(() => {})
            .finally(() => exitOnce(1, deps.exit));
    } catch {
        // `writeCrashDump` threw synchronously. Exit anyway — that is the one
        // thing this handler must always do.
        exitOnce(1, deps.exit);
    }
}

/**
 * Removes the listeners registered by a previous `installFatalHandlers()` call.
 *
 * @returns {void}
 */
function removeInstalledListeners() {
    if (installation === null) return;

    for (const [event, listener] of installation.listeners) {
        try {
            installation.target.removeListener(event, listener);
        } catch {
            // Best effort: a target that cannot remove listeners is replaced
            // wholesale by the new installation anyway.
        }
    }
    installation = null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Installs the `uncaughtException` and `unhandledRejection` safety net.
 *
 * Call this before any other work in the entry point, so the net is in place
 * before anything can fail. Calling it more than once is safe: the previous
 * listeners are removed first, so there is never more than one listener per
 * event.
 *
 * Every dependency is injectable so the handlers can be unit-tested without
 * killing the test process.
 *
 * @param {object} [options] - Dependency overrides. All are optional.
 * @param {object} [options.logger] - Logger with an `error` method. Defaults to the global logger.
 * @param {Function} [options.writeCrashDump] - Crash dump writer. Defaults to the real one.
 * @param {Function} [options.exit] - Exit function. Defaults to `process.exit`.
 * @param {import('node:events').EventEmitter} [options.target] - Emitter to listen on. Defaults to `process`.
 * @param {number} [options.watchdogMs] - Watchdog delay in ms. Defaults to {@link FATAL_EXIT_WATCHDOG_MS}.
 *
 * @returns {void}
 */
export function installFatalHandlers({
    logger = defaultLogger,
    writeCrashDump = defaultWriteCrashDump,
    /**
     * Default exit function: terminate the process with the given code.
     *
     * @param {number} code - Process exit code.
     *
     * @returns {void}
     */
    exit = (code) => process.exit(code),
    target = process,
    watchdogMs = FATAL_EXIT_WATCHDOG_MS,
} = {}) {
    removeInstalledListeners();

    const deps = { logger, writeCrashDump, exit, watchdogMs };

    /**
     * Listener for synchronous uncaught exceptions.
     *
     * @param {Error} err - The uncaught error.
     *
     * @returns {void}
     */
    const onUncaughtException = (err) => handleFatal(toError(err), 'uncaughtException', deps);

    /**
     * Listener for unhandled promise rejections.
     *
     * BSI runs short-lived batch commands, so an unhandled rejection is treated
     * exactly like an uncaught exception: there is no "recovery" mode worth
     * returning to, and silently continuing can leave half-completed work in
     * Qlik Sense.
     *
     * @param {Error|unknown} reason - The rejection reason (usually an `Error`).
     *
     * @returns {void}
     */
    const onUnhandledRejection = (reason) =>
        handleFatal(toError(reason), 'unhandledRejection', deps);

    target.on('uncaughtException', onUncaughtException);
    target.on('unhandledRejection', onUnhandledRejection);

    installation = {
        target,
        listeners: [
            ['uncaughtException', onUncaughtException],
            ['unhandledRejection', onUnhandledRejection],
        ],
    };
}

/**
 * Removes the installed listeners and clears the re-entry, exit, and watchdog
 * state.
 *
 * Exists for tests, which need a clean slate between cases. Production code
 * installs the handlers once and never resets them — by the time either guard
 * has been set, the process is on its way out.
 *
 * @returns {void}
 */
export function resetFatalHandlerState() {
    removeInstalledListeners();

    handlingFatal = false;
    exited = false;

    if (watchdogTimer !== null) {
        clearTimeout(watchdogTimer);
        watchdogTimer = null;
    }
}
