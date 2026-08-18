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
 *
 * ## Output going away is not a crash (issue #1019)
 *
 * `butler-sheet-icons browser list-available ... | head -12` used to leave a
 * crash dump behind. `head` closes the pipe once it has its lines, the next
 * write to stdout fails with `EPIPE`, and with nothing listening for it that
 * became an uncaught exception — a crash report for an operator doing something
 * completely ordinary. `less`, `grep -m1` and a quit pager do the same.
 *
 * So a broken output pipe is handled separately from a crash: no log line (the
 * stream it would go to is the one that just died), no crash dump, and an
 * immediate exit with {@link BROKEN_PIPE_EXIT_CODE}.
 *
 * It is caught in two places, because certainty differs between them — and they
 * match on *different sets of error codes* for that reason:
 *
 *   - An `error` listener on stdout and stderr. This is the path that fires in
 *     practice, and it is exact: the event names the stream, so there is no
 *     guessing about which pipe broke. It therefore matches the wider
 *     {@link STREAM_BROKEN_PIPE_CODES}, which covers the socket wording of the
 *     same event as well as the pipe wording.
 *   - The `uncaughtException` path, as a backstop for anything that writes to
 *     fd 1 or 2 without going through those stream objects. Attribution there
 *     is a judgement call — a raw socket write can raise `EPIPE` too — so the
 *     backstop is deliberately narrow: it matches only
 *     {@link BACKSTOP_BROKEN_PIPE_CODES}, `unhandledRejection` never takes it
 *     (all of BSI's network I/O is promise-based, and an `AxiosError` can carry
 *     `code: 'EPIPE'` across), and the exit code stays non-zero, so a
 *     misattributed socket failure still fails a scheduled task. What it would
 *     cost is the crash dump for that one rare case.
 *
 * Keeping the two sets apart is the point rather than an accident of history.
 * The wider one exists because stdout is not always a pipe — captured output is
 * a socket, which reports the reader leaving as `ENOTCONN` or `ECONNRESET`. The
 * narrow one stays narrow because `ECONNRESET` is also what a Qlik Sense server
 * dropping a connection looks like, and that must keep its crash dump.
 */

import { logger as defaultLogger } from '../../globals.js';
import { writeCrashDump as defaultWriteCrashDump } from './crash-dump.js';
import { restoreLiveTerminal } from './run-live.js';

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

/**
 * Exit code used when the output stream goes away: 128 + `SIGPIPE` (13), the
 * status a shell reports for any other tool killed by a closed pipe.
 *
 * Non-zero on purpose. Piping to `head` usually cuts a run short rather than
 * letting it finish, and BSI's exit code is documented as telling a scheduler
 * whether the run did its job — claiming success for output that was thrown
 * away would be the same lie the exit code work removed. It also bounds the
 * cost of the `uncaughtException` backstop misreading a socket failure as this:
 * the dump is lost, but the run is still reported as failed.
 */
export const BROKEN_PIPE_EXIT_CODE = 141;

/**
 * Error codes that mean the reader went away, for an error that arrived on one
 * of the streams this module watches.
 *
 * `EPIPE` is a pipe closed by its reader, and `ERR_STREAM_DESTROYED` a later
 * write to the stream Node tore down in response. The other two are the same
 * event over a socket. Standard output is not always a pipe: when one program
 * runs another and captures its output, libuv hands the child a socket rather
 * than a `pipe(2)` on macOS, and a write once the far end has gone reports
 * `ENOTCONN` or `ECONNRESET` instead of `EPIPE`.
 *
 * `ENOTCONN` is not a theoretical addition. It is what made the end-to-end test
 * for #1019 fail about one run in sixty: which of the two a dead socket reports
 * depends on whether unread data was still buffered when the reader closed, so
 * a loaded machine - where the reader reacts late and more has piled up behind
 * it - brought back crash dumps for a closed pipe, the exact thing #1019
 * removed. Measured on macOS, writing to a `spawn`ed child's stdout: 290 runs
 * where the reader closed promptly were all `EPIPE`, while delaying the close by
 * a single event loop turn produced `ENOTCONN`.
 *
 * Deliberately still an allowlist rather than "any write error". A full disk
 * (`ENOSPC`) or a permission problem is a genuine failure that must keep its
 * crash dump.
 */
const STREAM_BROKEN_PIPE_CODES = new Set([
    'EPIPE',
    'ERR_STREAM_DESTROYED',
    'ENOTCONN',
    'ECONNRESET',
]);

/**
 * The narrower set the `uncaughtException` backstop matches on.
 *
 * Narrower because that path is guessing. An error reaching the stream listener
 * names the stream it came from, so "my output has gone" is a fact; the same
 * code reaching `uncaughtException` might have come from anywhere.
 *
 * `ECONNRESET` is the reason the two sets have to differ rather than one being
 * widened. Every Qlik Sense connection BSI opens can be reset by the far end,
 * and that is a real failure an operator needs the crash dump for. Accepting it
 * here would trade a rare missing dump for routinely discarding the dump that
 * matters most. `ENOTCONN` is left out for the same reason, being just as much
 * a socket error as a stdout error.
 */
const BACKSTOP_BROKEN_PIPE_CODES = new Set(['EPIPE', 'ERR_STREAM_DESTROYED']);

/** True once a fatal event is being handled. Later fatal events are dropped. */
let handlingFatal = false;

/** True once `exit` has been called, so it can never be called twice. */
let exited = false;

/** Handle for the watchdog timer, cleared when the process exits. */
let watchdogTimer = null;

/**
 * Every listener the current installation registered, so a re-install or a
 * reset removes exactly what it added — on `process` and on the output streams
 * alike.
 *
 * @type {Array<{emitter: import('node:events').EventEmitter, event: string, listener: Function}>}
 */
let installedListeners = [];

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
 * Reports whether an error says the stream being written to has gone away.
 *
 * The set is a parameter rather than a constant read from the enclosing scope,
 * so that the two call sites have to name which one they mean. They differ - see
 * {@link STREAM_BROKEN_PIPE_CODES} and {@link BACKSTOP_BROKEN_PIPE_CODES} - and
 * the difference is easy to erase by accident when it lives out of sight.
 *
 * @param {Error|unknown} err - The error to classify.
 * @param {Set<string>} codes - The error codes that count as the reader going away.
 *
 * @returns {boolean} `true` for a broken-pipe error code.
 */
function isBrokenPipeError(err, codes) {
    return codes.has(err?.code);
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
 * Ends the run because there is nowhere left to write: quietly, and without a
 * crash dump.
 *
 * Nothing is logged. The stream a message would go to is the one that just
 * closed, so the line would either vanish or raise the same error again.
 *
 * Takes the re-entry guard for the same reason the fatal path does, and
 * respects it: a pipe breaking while a real crash dump is being written must
 * not exit early and truncate that dump. The watchdog already bounds the wait.
 *
 * @param {object} deps - Resolved dependencies for this installation.
 *
 * @returns {void}
 */
function handleBrokenOutputPipe(deps) {
    if (handlingFatal) return;
    handlingFatal = true;

    // Restore the terminal before exiting: stdout may still be a live TTY
    // when it was stderr's reader that went away, and this exit path must
    // not be the one that strands a hidden cursor. The hook never throws,
    // and a restore write to the dead stream itself is swallowed inside it -
    // so this stays consistent with the rule above: nothing is *logged*.
    try {
        deps.restoreTerminal();
    } catch {
        // Exiting is the one thing this handler must always do.
    }

    exitOnce(BROKEN_PIPE_EXIT_CODE, deps.exit);
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

    // Output going away is an ordinary end to a piped run, not a crash. Only
    // from `uncaughtException`, and only as a backstop to the stream listeners
    // below — see the header for why a rejection never qualifies.
    if (source === 'uncaughtException' && isBrokenPipeError(err, BACKSTOP_BROKEN_PIPE_CODES)) {
        handleBrokenOutputPipe(deps);
        return;
    }

    handlingFatal = true;

    // The watchdog is armed before anything else runs on this path - the
    // #946 rule. The terminal restore below writes to the TTY and could
    // stall; armed first, the watchdog bounds any async stall it causes.
    // (A write that blocks the event loop synchronously - a flow-controlled
    // terminal - is beyond any in-process timer, but that exposure is the
    // same one every log line on this path already has.)
    armWatchdog(deps);

    // Before anything is logged: if the live run view (issue #1075) owns the
    // terminal, the console transport is silenced and the cursor hidden - the
    // FATAL line below would be invisible and the operator's prompt mangled.
    // A mangled terminal after a failed production run is the worst outcome
    // available here, so this is the crash half of the terminal-restore hook;
    // it never throws and is a no-op when no view is active.
    try {
        deps.restoreTerminal();
    } catch {
        // Restoring must never stop the crash dump from being written.
    }

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
    for (const { emitter, event, listener } of installedListeners) {
        try {
            emitter.removeListener(event, listener);
        } catch {
            // Best effort: an emitter that cannot remove listeners is replaced
            // wholesale by the new installation anyway.
        }
    }
    installedListeners = [];
}

/**
 * Registers one listener and records it so it can be removed again.
 *
 * @param {import('node:events').EventEmitter} emitter - Emitter to listen on.
 * @param {string} event - Event name.
 * @param {Function} listener - The listener to register.
 *
 * @returns {void}
 */
function registerListener(emitter, event, listener) {
    emitter.on(event, listener);
    installedListeners.push({ emitter, event, listener });
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
 * @param {Array<import('node:stream').Writable>} [options.outputStreams] - Streams to watch for a
 *   broken pipe. Defaults to `process.stdout` and `process.stderr`.
 * @param {Function} [options.restoreTerminal] - Terminal restore hook, run before the fatal
 *   line is logged. Defaults to the live run view's {@link restoreLiveTerminal}.
 *
 * @returns {void}
 */
export function installFatalHandlers({
    logger = defaultLogger,
    writeCrashDump = defaultWriteCrashDump,
    restoreTerminal = restoreLiveTerminal,
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
    outputStreams = [process.stdout, process.stderr],
} = {}) {
    removeInstalledListeners();

    const deps = { logger, writeCrashDump, exit, watchdogMs, restoreTerminal };

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

    /**
     * Listener for errors on stdout and stderr.
     *
     * Without it a broken pipe has no listener, and Node turns an unlistened
     * stream `error` into an uncaught exception — which is how `| head` came to
     * write a crash dump. Registering it also means these errors are attributed
     * with certainty rather than guessed at from an error code.
     *
     * Anything that is not a broken pipe is passed on to the fatal path, so a
     * genuine failure to write output still produces a dump and exit 1, exactly
     * as it did when it arrived as an uncaught exception.
     *
     * Matches the wider {@link STREAM_BROKEN_PIPE_CODES}, because the event
     * names the stream: whatever this error says, it is about output that can no
     * longer be written, not about some socket elsewhere in the process.
     *
     * @param {Error} err - The stream error.
     *
     * @returns {void}
     */
    const onOutputStreamError = (err) => {
        if (isBrokenPipeError(err, STREAM_BROKEN_PIPE_CODES)) {
            handleBrokenOutputPipe(deps);
            return;
        }

        handleFatal(toError(err), 'uncaughtException', deps);
    };

    registerListener(target, 'uncaughtException', onUncaughtException);
    registerListener(target, 'unhandledRejection', onUnhandledRejection);

    for (const stream of outputStreams) {
        try {
            registerListener(stream, 'error', onOutputStreamError);
        } catch {
            // A stream that cannot take a listener — a stub in a test, a
            // stripped-down SEA environment — leaves the `uncaughtException`
            // backstop to cover it.
        }
    }
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
