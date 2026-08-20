/**
 * Process-wide interrupt state for Butler Sheet Icons (issue #1107).
 *
 * A signal cannot be thrown into an in-flight promise. Ctrl-C arrives on a
 * synchronous listener while the run is parked on a Puppeteer round trip or a
 * `--pagewait` sleep somewhere twenty frames down, and there is no way to
 * inject a rejection into that await from the outside. So the shutdown works
 * the only way it can: the signal makes the things being awaited fail, and the
 * run unwinds through the error paths that already exist.
 *
 * This module is the shared state that makes that possible. It holds three
 * things and nothing else:
 *
 *   - **The flag.** Whether a signal has arrived, and which one. The two app
 *     loops read it at their boundaries to stop starting new work, and the
 *     report reads it to record an abandoned app as interrupted rather than
 *     failed.
 *   - **An `AbortController`.** `sleep()` in `globals.js` binds to its signal,
 *     so a pending `--pagewait` rejects the moment the flag is set instead of
 *     running out its clock. Without this, shutdown waits for whatever the
 *     operator set `--pagewait` to - fine at the default 5s, past `docker
 *     stop`'s ten-second grace period at the values operators are told to use.
 *   - **A registry of teardown actions.** `launchBrowserForApp` registers a
 *     browser close here, so the signal handler can reach a browser that lives
 *     in a local variable inside a processor. This mirrors the active-view
 *     registry in `run-live.js`, which exists for the same reason: a deep site
 *     has to be reachable without threading a handle through every signature
 *     between here and there.
 *
 * ## Why this is a leaf module
 *
 * It imports nothing - not even the logger. `globals.js` has to import it, for
 * `sleep`, and the signal handler has to import `globals.js`, for the logger.
 * Putting the state and the handler in one module would close that loop. The
 * split keeps the dependency one-way: `interrupt.js` <- `globals.js`, and
 * `interrupt.js` + `globals.js` <- `signal-handlers.js`.
 *
 * Everything user-visible - installing the listeners, the log lines, the
 * watchdog, the exit - lives in `signal-handlers.js`.
 */

// ---------------------------------------------------------------------------
// Exit codes
// ---------------------------------------------------------------------------

/**
 * Exit code per signal: 128 + the signal number, the status a shell reports for
 * any process killed by that signal.
 *
 * `SIGHUP` gets 129 on the same rule (128 + 1): a dropped SSH session or a
 * closed terminal window ends the run, and a scheduler reading the code should
 * see that it was stopped rather than that it failed.
 *
 * This follows the signal convention rather than the graded run-outcome table
 * in issue #1090, and deliberately so: an interrupted run has no outcome to
 * grade. It did not succeed, it did not fail, it was stopped - and a scheduler
 * that sees 130 knows a human pressed Ctrl-C, which is the one thing the graded
 * codes cannot express. `fatal-handlers.js` already sets the precedent with
 * `BROKEN_PIPE_EXIT_CODE = 141` (128 + SIGPIPE).
 *
 * Exit codes are a versioned public interface under issue #1101, so these two
 * numbers cannot change without a major release.
 */
export const INTERRUPT_EXIT_CODES = Object.freeze({
    SIGINT: 130,
    SIGTERM: 143,
    SIGHUP: 129,
});

/** Used when the signal name is not one of the two above. */
const DEFAULT_INTERRUPT_EXIT_CODE = 130;

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/** The signal that interrupted the run, or null while it has not been. */
let interruptingSignal = null;

/**
 * Aborted when the first signal arrives. Recreated by `resetInterruptState()`
 * so each test starts with a controller that has not already fired.
 */
let controller = new AbortController();

/**
 * Teardown actions to run on the way out, newest first when they fire.
 *
 * A `Set` rather than an array so an action removed by its own unregister thunk
 * cannot be removed twice, and so registration order is preserved for the rare
 * case where two browsers are open at once.
 *
 * @type {Set<Function>}
 */
const actions = new Set();

/**
 * Depth of open interruptible runs. A counter rather than a boolean because
 * nesting is cheap to allow and impossible to reason about once it happens by
 * accident.
 */
let openRuns = 0;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/**
 * Records that a signal arrived, and aborts everything bound to the shared
 * controller.
 *
 * Idempotent: the first signal owns the shutdown, and a second one must not
 * re-abort or overwrite which signal is being reported. `signal-handlers.js`
 * checks {@link isInterrupted} before calling this and takes the force-exit
 * path instead, so the guard here is a backstop rather than the mechanism.
 *
 * @param {string} signal - The signal name, e.g. `'SIGINT'`.
 *
 * @returns {boolean} `true` if this call was the one that set the flag.
 */
export const markInterrupted = (signal) => {
    if (interruptingSignal !== null) {
        return false;
    }

    interruptingSignal = signal;

    try {
        controller.abort();
    } catch {
        // An AbortController that cannot abort leaves the flag set, which is
        // what the loop boundaries read. Sleeps run out their clock; the
        // watchdog still bounds the shutdown.
    }

    return true;
};

/**
 * Whether a signal has arrived. Read at every loop boundary and by the report.
 *
 * @returns {boolean} `true` once the run has been interrupted.
 */
export const isInterrupted = () => interruptingSignal !== null;

/**
 * The signal that interrupted the run.
 *
 * @returns {string|null} The signal name, or null if the run was not interrupted.
 */
export const interruptSignal = () => interruptingSignal;

/**
 * The exit code for the signal that interrupted the run.
 *
 * @returns {number} 130 for SIGINT, 143 for SIGTERM, 130 for anything else.
 */
export const interruptExitCode = () =>
    INTERRUPT_EXIT_CODES[interruptingSignal] ?? DEFAULT_INTERRUPT_EXIT_CODE;

/**
 * The `AbortSignal` that fires when the run is interrupted.
 *
 * Read fresh on every call rather than exported as a value: `resetInterruptState()`
 * replaces the controller, and a module that captured the signal at import time
 * would hold the previous test's aborted one forever.
 *
 * @returns {AbortSignal} The shared abort signal.
 */
export const interruptAbortSignal = () => controller.signal;

// ---------------------------------------------------------------------------
// Teardown actions
// ---------------------------------------------------------------------------

/**
 * Runs one teardown action, swallowing everything it does wrong.
 *
 * @param {Function} action - The action to run.
 *
 * @returns {void}
 */
const runOneAction = (action) => {
    try {
        // Not awaited, and a rejection is swallowed here rather than left to
        // the `unhandledRejection` handler - which would write a crash dump for
        // a browser that failed to close during a shutdown the operator asked
        // for.
        Promise.resolve(action()).catch(() => {});
    } catch {
        // A synchronous throw from a teardown action must not stop the
        // remaining ones from running.
    }
};

/**
 * Registers a teardown action to run when a signal arrives.
 *
 * The action is what actually unblocks the run - closing the browser makes
 * every in-flight Puppeteer await reject, which is the fastest route out and
 * the one that reuses `closeBrowserQuietly`. It may return a promise; the
 * signal handler does not await it, because the handler is synchronous and the
 * unwinding it triggers is the thing that has to happen next.
 *
 * Registering after the interrupt has already been recorded runs the action
 * immediately: a browser launched during shutdown would otherwise be stranded
 * with nothing left to close it.
 *
 * @param {Function} action - Teardown to run on interrupt. Must not throw.
 *
 * @returns {() => void} Unregisters the action. Safe to call more than once.
 */
export const registerInterruptAction = (action) => {
    if (isInterrupted()) {
        runOneAction(action);
        return () => {};
    }

    actions.add(action);

    return () => {
        actions.delete(action);
    };
};

/**
 * Runs every registered teardown action and clears the registry.
 *
 * @returns {number} How many actions were run.
 */
export const runInterruptActions = () => {
    const pending = [...actions];
    actions.clear();

    for (const action of pending) {
        runOneAction(action);
    }

    return pending.length;
};

// ---------------------------------------------------------------------------
// Interruptible run regions
// ---------------------------------------------------------------------------

/**
 * Opens an interruptible region: a stretch of work that can shut down
 * gracefully and has a report to render on the way out.
 *
 * Only `runOverAppsWithReport` opens one, which is the point. A signal arriving
 * anywhere else - the interactive wizard, `browser install`, `doctor` - has
 * nothing to unwind and no report to wait for, so the handler exits at once
 * instead of leaving the operator staring at a terminal that ignored their
 * Ctrl-C until a watchdog fired.
 *
 * @returns {void}
 */
export const beginInterruptibleRun = () => {
    openRuns += 1;
};

/**
 * Closes an interruptible region. Belongs in a `finally`.
 *
 * @returns {void}
 */
export const endInterruptibleRun = () => {
    openRuns = Math.max(0, openRuns - 1);
};

/**
 * Whether any interruptible region is open.
 *
 * @returns {boolean} `true` when a graceful shutdown is worth waiting for.
 */
export const hasInterruptibleWork = () => openRuns > 0;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/**
 * Clears every piece of state in this module.
 *
 * Exists for tests, which need a clean slate between cases. Production code
 * never resets: by the time the flag is set, the process is on its way out.
 *
 * @returns {void}
 */
export const resetInterruptState = () => {
    interruptingSignal = null;
    controller = new AbortController();
    actions.clear();
    openRuns = 0;
};
