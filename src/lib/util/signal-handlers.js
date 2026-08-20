/**
 * Graceful shutdown on `SIGINT` and `SIGTERM` (issue #1107).
 *
 * Before this existed, BSI had no signal handling at all. Ctrl-C, `docker stop`
 * or a CI timeout killed the process outright, and the cost was not the leaked
 * websocket or the stranded Chromium - it was that **the operator was left with
 * no record of what had already been written**.
 *
 * Both platform workers have the same shape per app: open an engine session,
 * launch a browser, capture every sheet, close the browser, upload the images,
 * point the sheets at them. The last step is the write, and it is irreversible.
 * Interrupt a fifty-app run and apps 1..k have new thumbnails in Sense, app k+1
 * was abandoned before its write, and apps k+2 onwards were never touched -
 * with nothing anywhere saying what k was. `remove-sheet-icons` is worse: it
 * writes per sheet, so an interrupted app is genuinely part-cleared.
 *
 * ## How the shutdown actually works
 *
 * A signal cannot be thrown into an in-flight promise. The listener runs
 * synchronously while the run is parked on a Puppeteer round trip somewhere far
 * below, and there is no way to inject a rejection into that await from here.
 * So the signal path does not unwind the run - it makes the things the run is
 * waiting on fail, and lets the error paths that already exist do the unwinding:
 *
 *   1. Record the interrupt. That aborts the shared controller, so every
 *      pending `sleep()` - the `--pagewait` between sheets - rejects at once.
 *   2. Close the browser, through `closeBrowserQuietly` and the teardown
 *      registry in `interrupt.js`. Every in-flight Puppeteer await rejects,
 *      which propagates into the processor's `catch`, and `withEngineSession`'s
 *      `finally` releases the websocket on the way past.
 *   3. The app loop and the sheet loop see the flag at their next boundary and
 *      stop starting work.
 *   4. The run report renders what was done, and the process exits 130 or 143.
 *
 * Reusing that teardown rather than writing a second one is the point.
 * `withEngineSession`'s own header records that six hand-rolled copies of the
 * close sequence had already drifted, and only some of them closed on the happy
 * path. A separate shutdown path would be the seventh.
 *
 * ## Why speed is a design constraint, not a nicety
 *
 * `docker stop` sends `SIGTERM` and then `SIGKILL` roughly ten seconds later
 * regardless of what the process is doing, and a single sheet capture can sit
 * on a ninety-second page timeout. Waiting for the current sheet - let alone the
 * current app - would blow through that window and make Ctrl-C feel ignored.
 * Closing the browser and aborting the sleeps is what keeps shutdown inside it.
 *
 * That is also why the shutdown never waits on anything it cannot bound:
 *
 *   - **A second signal exits immediately.** Standard CLI behaviour, and the
 *     guard against a shutdown that itself hangs - which would be worse than no
 *     handler at all.
 *   - **A watchdog exits anyway.** `docker stop` sends one signal and there is
 *     nobody at a keyboard to send a second, so the second-signal escape does
 *     not cover the container case. {@link INTERRUPT_EXIT_WATCHDOG_MS} bounds
 *     it instead.
 *   - **A signal outside a run exits at once.** The wizard, `browser install`
 *     and `doctor` have no report to render and nothing registered to unwind,
 *     so there is nothing to wait for. `runOverAppsWithReport` is the only
 *     caller that opens an interruptible region.
 *
 * Both exit paths emit the run verdict first, through the once-only seam in
 * `run-report.js`, so a stalled shutdown still prints what the report holds
 * rather than dying silently - and the operator never sees it twice.
 *
 * ## Why this is not part of `fatal-handlers.js`
 *
 * That module is about crashes: an eighty-line header on issue #946's 479,178
 * crash dumps, a re-entry guard, and a crash-dump writer. An interrupt is not a
 * crash. It writes no dump, it is not a bug, and its exit code says a person
 * stopped the run rather than that the run broke. Only the shape is borrowed -
 * every dependency injectable so the handlers can be tested without killing the
 * test process, listeners recorded so a re-install removes exactly what it
 * added, and a reset for tests.
 */

import { logger as defaultLogger } from '../../globals.js';
import { restoreLiveTerminal } from './run-live.js';
import { flushAndExit } from './flush-exit.js';
import { emitRunVerdictOnce } from './run-report.js';
import {
    isInterrupted,
    markInterrupted,
    interruptExitCode,
    runInterruptActions,
    hasInterruptibleWork,
} from './interrupt.js';

// ---------------------------------------------------------------------------
// Module-level constants and state
// ---------------------------------------------------------------------------

/**
 * The signals handled. All three mean "stop", and all three get the same
 * treatment.
 *
 * `SIGHUP` is here for a reason that is easy to miss: it is what a closing
 * terminal or a dropped SSH session sends, and BSI runs are long enough that
 * losing a connection mid-run is an ordinary event rather than an exotic one.
 *
 * It also cannot be left out now that `launchBrowserForApp` turns Puppeteer's
 * own handlers off. Node's default disposition for SIGHUP terminates the
 * process *without* running `process.on('exit')` - measured: exit 129, no exit
 * hook - and that hook is the last thing standing between a dropped connection
 * and an orphaned Chromium, which is spawned `detached` into its own process
 * group and so survives the terminal that started it. Handling it here means
 * the browser is closed through the same teardown registry as the other two.
 */
export const HANDLED_SIGNALS = Object.freeze(['SIGINT', 'SIGTERM', 'SIGHUP']);

/**
 * How long (ms) graceful shutdown gets before the process exits anyway.
 *
 * Eight seconds, chosen against `docker stop`: it sends `SIGTERM`, waits ten
 * seconds, then `SIGKILL`s. Exiting at eight leaves room for the verdict to be
 * written and the process to go, so the report lands rather than being killed
 * halfway through it. Under Ctrl-C the operator has the second-signal escape
 * long before this fires, so in practice it only ever runs in a container or a
 * CI job where nobody is watching.
 *
 * Longer would risk the SIGKILL; shorter would cut off an app that was seconds
 * from finishing its writes.
 */
export const INTERRUPT_EXIT_WATCHDOG_MS = 8000;

/** True once the process has been told to exit, so it can never be told twice. */
let exiting = false;

/** Handle for the watchdog timer, cleared when the process exits. */
let watchdogTimer = null;

/**
 * Every listener the current installation registered, so a re-install or a
 * reset removes exactly what it added.
 *
 * @type {Array<{emitter: import('node:events').EventEmitter, event: string, listener: Function}>}
 */
let installedListeners = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Logs one line, never throwing.
 *
 * The console transport may have just been restored from a silenced live view,
 * or the stream may be gone entirely. Failing to log must not stop the process
 * from exiting.
 *
 * @param {object} logger - Logger with `warn` and `info` methods.
 * @param {string} level - Level to log at.
 * @param {string} message - The line.
 *
 * @returns {void}
 */
const logQuietly = (logger, level, message) => {
    try {
        logger[level](message);
    } catch {
        // Nothing left to log with. Carry on to the exit.
    }
};

/** ANSI "show cursor". The counterpart of the sequence a prompt writes to hide it. */
export const SHOW_CURSOR = '\u001B[?25h';

/**
 * Restores the terminal, never throwing.
 *
 * Runs before anything is logged, for the same reason the crash path in
 * `fatal-handlers.js` does it in that order: under the live run view (issue
 * #1075) the console transport is silenced and the cursor hidden, so the line
 * below would be invisible and the operator's prompt left mangled. It also
 * means the verdict renders to a quiet terminal through the ordinary board
 * path.
 *
 * The unconditional show-cursor afterwards covers the case the live view's own
 * hook cannot: the interactive wizard hides the cursor itself, and a signal at
 * a prompt used to leave it hidden for the rest of the session - measured on
 * `main`, where the process was killed outright and nothing restored it. BSI
 * owns that exit now, so it owns putting the cursor back. Writing it when
 * nothing hid it is harmless; leaving it hidden is not.
 *
 * Only to a TTY. Piped output must not gain an escape sequence, which is the
 * same rule the rest of the terminal handling follows.
 *
 * @param {object} deps - Resolved dependencies for this installation.
 *
 * @returns {void}
 */
const restoreQuietly = (deps) => {
    try {
        deps.restoreTerminal();
    } catch {
        // Exiting is the one thing this handler must always do.
    }

    try {
        if (deps.stdout?.isTTY) {
            deps.stdout.write(SHOW_CURSOR);
        }
    } catch {
        // A stream that has gone away cannot be tidied. Carry on to the exit.
    }
};

/**
 * Emits the run verdict, never throwing.
 *
 * Idempotent at the other end: `emitRunVerdictOnce` clears the pending verdict
 * before rendering it, so whichever of the three shutdown paths arrives first
 * is the one that prints, and the others are no-ops.
 *
 * @returns {void}
 */
const emitVerdictQuietly = () => {
    try {
        emitRunVerdictOnce();
    } catch {
        // A report that cannot be rendered must not stop the exit.
    }
};

/**
 * Exits the process, at most once per process lifetime.
 *
 * @param {object} deps - Resolved dependencies for this installation.
 *
 * @returns {void}
 */
const exitOnce = (deps) => {
    if (exiting) return;
    exiting = true;

    if (watchdogTimer !== null) {
        clearTimeout(watchdogTimer);
        watchdogTimer = null;
    }

    // Through the flush, never `deps.exit` directly: the verdict was written
    // microseconds ago and on a pipe it is still in the stream's buffer. A
    // bare exit here discards the report on `docker stop` - the one path it
    // exists for. See `flush-exit.js` for the measurements.
    deps.flushAndExit(interruptExitCode(), { exit: deps.exit });
};

/**
 * Arms the watchdog that force-exits if graceful shutdown stalls.
 *
 * `unref`'d so it can never by itself keep an otherwise healthy process alive -
 * a run that shuts down in two seconds must not sit here for another six.
 *
 * @param {object} deps - Resolved dependencies for this installation.
 *
 * @returns {void}
 */
const armWatchdog = (deps) => {
    try {
        watchdogTimer = setTimeout(() => {
            logQuietly(
                deps.logger,
                'warn',
                `Shutdown did not finish within ${deps.watchdogMs / 1000}s. Exiting now - the report below covers what had been recorded by this point.`
            );
            emitVerdictQuietly();
            exitOnce(deps);
        }, deps.watchdogMs);

        if (typeof watchdogTimer.unref === 'function') watchdogTimer.unref();
    } catch {
        // Without a watchdog the second signal is still an escape, and the
        // run is still unwinding on its own.
    }
};

/**
 * Handles the second (or later) signal: exit now, without waiting for anything.
 *
 * @param {string} signal - The signal received.
 * @param {object} deps - Resolved dependencies for this installation.
 *
 * @returns {void}
 */
const handleForceExit = (signal, deps) => {
    if (exiting) return;

    restoreQuietly(deps);
    logQuietly(deps.logger, 'warn', `Second ${signal} received. Exiting immediately.`);
    emitVerdictQuietly();
    exitOnce(deps);
};

/**
 * Handles the first signal.
 *
 * @param {string} signal - The signal received.
 * @param {object} deps - Resolved dependencies for this installation.
 *
 * @returns {void}
 */
const handleFirstSignal = (signal, deps) => {
    // Aborts the shared controller, so every pending sleep rejects. Done
    // before the browser close, so a run parked on a --pagewait starts
    // unwinding at the same moment as one parked on a page navigation.
    markInterrupted(signal);

    restoreQuietly(deps);

    // Nothing to unwind and no report to wait for: the wizard, `browser
    // install`, `doctor`. Waiting here would make Ctrl-C look ignored for
    // eight seconds and then exit with the same code anyway.
    if (!hasInterruptibleWork()) {
        logQuietly(deps.logger, 'warn', `${signal} received. Exiting.`);
        exitOnce(deps);
        return;
    }

    logQuietly(
        deps.logger,
        'warn',
        `${signal} received. Stopping the run and reporting what has already been done - press Ctrl-C again to exit immediately.`
    );

    // Fired, not awaited. This listener is synchronous, and the point of these
    // actions is to make the awaits below reject so the run unwinds - waiting
    // for the browser to finish closing would delay the very thing it exists
    // to trigger.
    runInterruptActions();

    armWatchdog(deps);
};

/**
 * Removes the listeners registered by a previous installation.
 *
 * @returns {void}
 */
const removeInstalledListeners = () => {
    for (const { emitter, event, listener } of installedListeners) {
        try {
            emitter.removeListener(event, listener);
        } catch {
            // Best effort: an emitter that cannot remove listeners is
            // replaced wholesale by the new installation anyway.
        }
    }
    installedListeners = [];
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Installs the `SIGINT` and `SIGTERM` handlers.
 *
 * Call this in the entry point beside `installFatalHandlers()`. Calling it more
 * than once is safe: the previous listeners are removed first, so there is
 * never more than one listener per signal.
 *
 * Every dependency is injectable so the handlers can be unit-tested without
 * killing the test process.
 *
 * @param {object} [options] - Dependency overrides. All are optional.
 * @param {object} [options.logger] - Logger with `warn` and `info`. Defaults to the global logger.
 * @param {Function} [options.exit] - Exit function. Defaults to `process.exit`.
 * @param {import('node:events').EventEmitter} [options.target] - Emitter to listen on. Defaults to `process`.
 * @param {number} [options.watchdogMs] - Watchdog delay in ms. Defaults to {@link INTERRUPT_EXIT_WATCHDOG_MS}.
 * @param {Function} [options.restoreTerminal] - Terminal restore hook, run before anything is
 *     logged. Defaults to the live run view's `restoreLiveTerminal`.
 * @param {import('node:stream').Writable} [options.stdout] - Stream the show-cursor sequence is
 *     written to when it is a TTY. Defaults to `process.stdout`.
 * @param {Function} [options.flushAndExit] - Drain-then-exit helper. Defaults to the real
 *     {@link flushAndExit}; injected by tests that assert on the exit code directly.
 *
 * @returns {void}
 */
export const installSignalHandlers = ({
    logger = defaultLogger,
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
    watchdogMs = INTERRUPT_EXIT_WATCHDOG_MS,
    stdout = process.stdout,
    flushAndExit: flush = flushAndExit,
} = {}) => {
    removeInstalledListeners();

    const deps = { logger, exit, watchdogMs, restoreTerminal, stdout, flushAndExit: flush };

    for (const signal of HANDLED_SIGNALS) {
        /**
         * Listener for one signal.
         *
         * @param {string} received - The signal name Node passes in.
         *
         * @returns {void}
         */
        const listener = (received = signal) => {
            if (isInterrupted()) {
                handleForceExit(received, deps);
                return;
            }

            handleFirstSignal(received, deps);
        };

        try {
            target.on(signal, listener);
            installedListeners.push({ emitter: target, event: signal, listener });
        } catch {
            // A target that cannot take a listener leaves the default
            // behaviour in place, which is what happened before this existed.
        }
    }
};

/**
 * Removes the installed listeners and clears the exit and watchdog state.
 *
 * Exists for tests. Production code installs the handlers once and never
 * resets them. Does not touch `interrupt.js` - call `resetInterruptState()`
 * for that.
 *
 * @returns {void}
 */
export const resetSignalHandlerState = () => {
    removeInstalledListeners();

    exiting = false;

    if (watchdogTimer !== null) {
        clearTimeout(watchdogTimer);
        watchdogTimer = null;
    }
};
