import winston from 'winston';
import { renderSheetStrip, clip, padTo } from './run-board.js';

/**
 * Rung C of the run-output ladder (issue #1075): the live run view.
 *
 * An animated terminal display: preflight rows that resolve as the real
 * `await`s the run performs resolve, then a per-app progress bar driven by the
 * per-sheet decisions the processors record, collapsing to the board verdict
 * at the end. Everything animated lives in a bounded "region" at the bottom of
 * the screen that is erased and repainted; everything finished is committed
 * above it as ordinary scrolling text, so the display never needs to reach
 * back past the visible screen.
 *
 * Three properties are load-bearing:
 *
 * - **The display renders only what was recorded.** The bar and strip are
 *   drawn from the same report entry the verdict counts from, and a preflight
 *   row resolves only when the caller's real `await` has returned. A step
 *   that hangs is visible as the row that never resolves - which is the
 *   diagnostic value the view exists for.
 * - **One cursor writer.** While the view is active the winston console
 *   transport is silenced and a private transport routes `warn`/`error`
 *   lines through the view's commit path instead, so an error mid-run lands as a
 *   committed line above the region rather than tearing through it. The
 *   browser download bar in `browser-install.js` defers to the view for the
 *   same reason - see {@link liveDownloadBar}.
 * - **The terminal is restored on every exit path.** `stop()` erases the
 *   region, shows the cursor and restores the console transport; it is
 *   idempotent and never throws, so the crash path (`installFatalHandlers`),
 *   the completion path (`runCommand`) and the worker error paths can all
 *   call {@link restoreLiveTerminal} unconditionally. Issue #1107's signal
 *   handling extends the same hook.
 *
 * The view is created only for a real run on the `live` rung and only when
 * the stream really is a TTY - {@link createRunLiveView} returns `null`
 * otherwise, so a misrouted caller cannot repaint frames into `docker logs`.
 * Everywhere else the ladder's LIVE≡board fallback in `rendersAsBoard()`
 * still applies, untouched.
 */

/**
 * ANSI control sequences. Plain CSI sequences only, verified on the oldest
 * target console (Server 2019 conhost - see the matrix on issue #1071): node
 * reaches a Windows TTY via WriteConsoleW, so no VT gate beyond the rung
 * selection is needed.
 */
const HIDE_CURSOR = '\u001B[?25l';
const SHOW_CURSOR = '\u001B[?25h';
const ERASE_DOWN = '\u001B[0J';
const cursorUp = (n) => `\u001B[${n}A`;

/**
 * Width of the preflight-row label column ("content library" is the longest
 * label either platform uses).
 */
const STEP_LABEL_WIDTH = 16;

/**
 * Width of the per-app progress bar, matching the issue #1075 mockup.
 */
const BAR_WIDTH = 26;

/**
 * Milliseconds between spinner repaints. Events repaint immediately; the
 * timer only keeps the spinner moving between them, so a hung await is
 * visibly alive-but-stuck rather than frozen.
 */
const FRAME_MS = 120;

/**
 * Labels for the app block's pre-sheet phases. The `download` entry is not a
 * phase of its own - it overlays whichever phase is current while
 * `browser-install.js` reports download progress.
 */
const PHASE_LABEL = Object.freeze({
    opening: 'opening app',
    browser: 'launching browser',
    signin: 'signing in',
});

/**
 * A winston transport that hands `warn` and `error` lines to the live view.
 *
 * While the view owns the cursor the console transport is silenced, but a
 * silenced error is the one thing a live display must never cost - so this
 * transport commits those lines above the animated region instead. `info` and
 * below are represented by the view itself (that is the rung's job), and the
 * plain run-card blocks still go through the logger for any other transport,
 * exactly as on the board rung.
 */
class LiveViewTransport extends winston.Transport {
    /**
     * Build the transport bound to one view.
     *
     * @param {object} view - The live view to commit lines into.
     */
    constructor(view) {
        super({ level: 'warn' });
        this.name = 'live-view';
        this.view = view;
    }

    /**
     * Winston transport hook: route one log record to the view.
     *
     * @param {object} info - The winston info object.
     * @param {Function} callback - Completion callback.
     *
     * @returns {void}
     */
    log(info, callback) {
        this.view.commitLogLine(info.level, String(info.message ?? ''));
        callback();
    }
}

/**
 * The interval driving spinner repaints. Created per view; `unref`'d so the
 * animation can never by itself keep the process alive.
 *
 * @returns {{start: Function, stop: Function}} The timer.
 */
const makeFrameTimer = () => {
    let handle = null;

    return {
        /**
         * Start the interval.
         *
         * @param {Function} fn - Tick function.
         * @param {number} ms - Interval in milliseconds.
         *
         * @returns {void}
         */
        start(fn, ms) {
            handle = setInterval(fn, ms);
            handle.unref?.();
        },
        /**
         * Stop the interval.
         *
         * @returns {void}
         */
        stop() {
            if (handle !== null) {
                clearInterval(handle);
                handle = null;
            }
        },
    };
};

/**
 * Create the live run view, already started: the cursor is hidden and the
 * console transport silenced before this returns.
 *
 * Returns `null` when the stream is not a TTY. The rung selection already
 * guarantees a TTY, but this guard is structural: repainted frames on a
 * redirected stream are the regression that turns `docker logs` into
 * thousands of stale frames, and a second, independent gate here means no
 * future caller can reintroduce it by mis-threading a rung.
 *
 * @param {object} run - The view's environment, all injectable.
 * @param {object} run.stream - The TTY stream to paint on.
 * @param {object} run.ctx - From `boardContext()`: `{palette, symbols, border}`.
 * @param {object} [run.log] - Winston-style logger whose console transport is
 *     silenced while the view runs and restored on stop. Omit for tests that
 *     only exercise painting.
 * @param {{start: Function, stop: Function}} [run.timer] - Frame timer.
 *     Injectable so tests can drive ticks synchronously.
 *
 * @returns {object|null} The view, or `null` when the stream cannot host one.
 */
export const createRunLiveView = ({ stream, ctx, log = null, timer = makeFrameTimer() }) => {
    if (!stream?.isTTY) {
        return null;
    }

    const { palette, symbols } = ctx;
    const frames = symbols.spinnerFrames;
    const sep = ` ${symbols.dot} `;

    let stopped = false;
    let regionLines = 0;
    let spinnerIndex = 0;
    let pendingStep = null; // {label, detail}
    const committedSteps = new Set();
    let app = null; // {n, total, id, entry, phase}
    let downloadPct = null;

    let consoleTransport = null;
    let previousSilent = false;
    let logTransport = null;

    /**
     * Columns available right now. Re-read per paint so a resized terminal
     * gets clipped correctly on the next frame.
     *
     * @returns {number} The column count.
     */
    const columns = () => stream.columns ?? 80;

    /**
     * One preflight row. Padded plain, coloured after - the same width
     * discipline as the board renderers.
     *
     * @param {string} marker - The already-coloured status glyph.
     * @param {string} label - Row label, plain.
     * @param {string} [detail] - Dim detail after the label.
     *
     * @returns {string} The row.
     */
    const stepRow = (marker, label, detail) => {
        const detailPart = detail
            ? `  ${palette.dim(clip(detail, Math.max(10, columns() - STEP_LABEL_WIDTH - 10)))}`
            : '';

        return `  ${marker} ${padTo(label, STEP_LABEL_WIDTH)}${detailPart}`;
    };

    /**
     * The animated region's lines for the current state.
     *
     * @returns {string[]} The lines, each guaranteed narrower than the terminal.
     */
    const renderRegion = () => {
        const lines = [];
        const spinner = palette.yellow(frames[spinnerIndex % frames.length]);

        if (pendingStep) {
            const detail =
                pendingStep.label === 'browser' && downloadPct !== null
                    ? `downloading ${downloadPct}%`
                    : pendingStep.detail;
            lines.push(stepRow(spinner, pendingStep.label, detail));
        }

        if (app) {
            const entry = app.entry;
            const name = clip(entry?.name ?? app.id ?? '', 32);
            const sheetNote =
                typeof entry?.sheetCount === 'number'
                    ? palette.dim(`${sep}${entry.sheetCount} sheets`)
                    : '';
            lines.push('');
            lines.push(`  app ${app.n}/${app.total}  ${palette.bold(name)}${sheetNote}`);

            const inSheets = app.phase === 'sheets' && entry && (entry.sheetCount ?? 0) > 0;
            if (inSheets) {
                const total = entry.sheetCount;
                const done = Math.min(entry.sheets.length, total);
                const filled = Math.min(BAR_WIDTH, Math.round((done / total) * BAR_WIDTH));
                const bar =
                    palette.green(symbols.stripCaptured.repeat(filled)) +
                    palette.dim(symbols.stripExcluded.repeat(BAR_WIDTH - filled));
                const last = entry.sheets[entry.sheets.length - 1];
                const title = last ? palette.dim(`  '${clip(last.title ?? '', 24)}'`) : '';
                lines.push(`  ${bar}  ${done}/${total}${title}`);
                // Clipped at the last recorded position: the unreached tail
                // is the future, not a failure - only interior gaps (a sheet
                // the loop really skipped over) keep the failed glyph. The
                // committed board row shows the full-width strip.
                //
                // Also capped at the terminal width: this is the one region
                // line whose natural length is unbounded (one glyph per
                // sheet), and a wrapped region line breaks the cursor-up
                // erase arithmetic for every following frame. The committed
                // board row still carries the full strip; only the animated
                // copy is capped.
                const reached = entry.sheets.reduce(
                    (max, sheet, i) =>
                        Math.max(
                            max,
                            typeof sheet.n === 'number' && sheet.n >= 1 ? sheet.n : i + 1
                        ),
                    0
                );
                const stripLimit = Math.min(reached, Math.max(1, columns() - 3));
                lines.push(`  ${renderSheetStrip(entry, ctx, stripLimit)}`);
            } else {
                const label =
                    downloadPct !== null
                        ? `downloading browser ${downloadPct}%`
                        : (PHASE_LABEL[app.phase] ?? PHASE_LABEL.opening);
                lines.push(`  ${spinner} ${palette.dim(label)}`);
            }
        }

        return lines;
    };

    /**
     * The erase sequence for the current region, cursor left at its first line.
     *
     * @returns {string} The sequence; empty when nothing is on screen.
     */
    const eraseRegion = () =>
        regionLines > 0 ? `${cursorUp(regionLines)}\r${ERASE_DOWN}` : `\r${ERASE_DOWN}`;

    /**
     * Repaint the animated region in place, in a single write.
     *
     * @returns {void}
     */
    const paint = () => {
        if (stopped) {
            return;
        }

        const lines = renderRegion();
        const body = lines.length > 0 ? `${lines.join('\n')}\n` : '';
        stream.write(`${eraseRegion()}${body}`);
        regionLines = lines.length;
    };

    /**
     * Write finished content above the region: erase, write, repaint - one
     * stream write, so nothing can interleave between the parts.
     *
     * @param {string} text - The static text. A trailing newline is added when missing.
     *
     * @returns {void}
     */
    const commit = (text) => {
        if (stopped) {
            return;
        }

        const block = text.endsWith('\n') ? text : `${text}\n`;
        const lines = renderRegion();
        const body = lines.length > 0 ? `${lines.join('\n')}\n` : '';
        stream.write(`${eraseRegion()}${block}${body}`);
        regionLines = lines.length;
    };

    /**
     * Commit one resolved preflight row. Each label commits once per run -
     * the rows record the first resolution; later apps show the same work as
     * their phase label instead.
     *
     * @param {string} label - The step label.
     * @param {string|undefined} detail - Dim detail text.
     * @param {boolean} ok - Whether the step succeeded.
     *
     * @returns {void}
     */
    const commitStep = (label, detail, ok) => {
        if (committedSteps.has(label)) {
            return;
        }
        committedSteps.add(label);
        if (pendingStep?.label === label) {
            pendingStep = null;
        }
        const marker = ok ? palette.green(symbols.done) : palette.red(symbols.failed);
        commit(stepRow(marker, label, detail));
    };

    const view = {
        /** Separator matching the symbol set, for callers composing details. */
        sep,

        /**
         * Begin an animated preflight row. No-op once the label has committed.
         *
         * @param {string} label - The step label.
         * @param {string} [detail] - Dim detail shown while pending.
         *
         * @returns {void}
         */
        beginStep(label, detail) {
            if (stopped || committedSteps.has(label)) {
                return;
            }
            pendingStep = { label, detail };
            paint();
        },

        /**
         * Resolve a preflight row as succeeded.
         *
         * @param {string} label - The step label.
         * @param {string} [detail] - Dim detail on the committed row.
         *
         * @returns {void}
         */
        stepDone(label, detail) {
            if (stopped) {
                return;
            }
            commitStep(label, detail, true);
        },

        /**
         * Resolve a preflight row as failed.
         *
         * @param {string} label - The step label.
         * @param {string} [detail] - Dim detail on the committed row.
         *
         * @returns {void}
         */
        stepFailed(label, detail) {
            if (stopped) {
                return;
            }
            commitStep(label, detail, false);
        },

        /**
         * Commit a finished block (plan block, banners) above the region.
         *
         * @param {string} text - The rendered block.
         *
         * @returns {void}
         */
        commitBlock(text) {
            commit(text);
        },

        /**
         * Open the app block as the loop hands an app to its processor.
         *
         * @param {object} start - The position.
         * @param {number} start.n - 1-based app number.
         * @param {number} start.total - Apps in the run.
         * @param {string} start.id - App id, shown until the name is known.
         *
         * @returns {void}
         */
        appStarted({ n, total, id }) {
            if (stopped) {
                return;
            }
            app = { n, total, id, entry: null, phase: 'opening' };
            paint();
        },

        /**
         * Attach the report entry once the processor has recorded it. From
         * here the block renders the entry itself - the same object the
         * verdict counts from - so the bar cannot claim a sheet the report
         * does not hold.
         *
         * @param {object} entry - The per-app report entry.
         *
         * @returns {void}
         */
        appOpened(entry) {
            if (stopped || !app || (entry.id && app.id && entry.id !== app.id)) {
                return;
            }
            app.entry = entry;
            paint();
        },

        /**
         * Move the app block to a new pre-sheet phase.
         *
         * @param {string} phase - `browser`, `signin` or `sheets`.
         *
         * @returns {void}
         */
        appPhase(phase) {
            if (stopped || !app) {
                return;
            }
            app.phase = phase;
            paint();
        },

        /**
         * Repaint after a sheet decision was recorded on the entry.
         *
         * @param {object} entry - The entry that grew a sheet row.
         *
         * @returns {void}
         */
        sheetRecorded(entry) {
            if (stopped || !app || app.entry !== entry) {
                return;
            }
            paint();
        },

        /**
         * Close the app block, committing its final board row.
         *
         * A preflight row still pending when a failed app closes is committed
         * as failed: its `await` threw, and leaving it spinning would show a
         * run stuck on a step that has already been abandoned.
         *
         * @param {object} entry - The per-app report entry.
         * @param {string} rowText - The rendered board app row.
         *
         * @returns {void}
         */
        appFinished(entry, rowText) {
            if (stopped) {
                return;
            }
            if (pendingStep && entry?.failed) {
                commitStep(pendingStep.label, undefined, false);
            }
            pendingStep = null;
            app = null;
            downloadPct = null;
            commit(rowText);
        },

        /**
         * Report browser download progress, replacing the phase label.
         *
         * @param {number|null} pct - Percentage 0-100, or null when the
         *     download has finished.
         *
         * @returns {void}
         */
        downloadProgress(pct) {
            if (stopped) {
                return;
            }
            downloadPct = pct === null ? null : Math.max(0, Math.min(100, Math.round(pct)));
            paint();
        },

        /**
         * Commit a routed log line above the region.
         *
         * @param {string} level - Winston level, decides the paint.
         * @param {string} message - The message; may span lines.
         *
         * @returns {void}
         */
        commitLogLine(level, message) {
            if (stopped) {
                return;
            }
            const paintLine = level === 'error' ? palette.red : palette.yellow;
            for (const line of message.split('\n')) {
                commit(`  ${paintLine(`${level}: ${line}`)}`);
            }
        },

        /**
         * Stop the view and restore the terminal: erase the region, show the
         * cursor, restore the console transport. Idempotent, and never
         * throws - this runs on crash paths.
         *
         * @returns {void}
         */
        stop() {
            if (stopped) {
                return;
            }
            stopped = true;

            try {
                timer.stop();
            } catch {
                // A broken timer must not stop the terminal restore below.
            }
            try {
                stream.write(`${eraseRegion()}${SHOW_CURSOR}`);
            } catch {
                // The stream may already be gone (broken pipe); the console
                // restore below still matters.
            }
            regionLines = 0;

            if (log) {
                try {
                    if (logTransport) {
                        log.remove(logTransport);
                    }
                } catch {
                    // Best effort - a logger that cannot remove transports
                    // still gets its console transport back below.
                }
                if (consoleTransport) {
                    consoleTransport.silent = previousSilent;
                }
            }

            if (active === view) {
                active = null;
            }
        },
    };

    // Start immediately: hide the cursor, take the console, start the spinner.
    stream.write(HIDE_CURSOR);

    if (log) {
        consoleTransport = log.transports?.find((transport) => transport.name === 'console');
        if (consoleTransport) {
            // Normalised to a boolean: winston leaves `silent` undefined on a
            // transport that was never silenced, and the restore must hand
            // back an explicit not-silent, not an accidental undefined.
            previousSilent = consoleTransport.silent === true;
            consoleTransport.silent = true;
        }
        try {
            logTransport = new LiveViewTransport(view);
            log.add(logTransport);
        } catch {
            // A logger that cannot take a transport just loses the warn/error
            // pass-through; the view itself still works.
            logTransport = null;
        }
    }

    timer.start(() => {
        spinnerIndex += 1;
        paint();
    }, FRAME_MS);

    return view;
};

/**
 * The process-wide active view, or null.
 *
 * Module state on purpose, unlike the report: the live view is inherently
 * about the one terminal this process owns, and the deep emit sites - the
 * browser modules, the report recorders - must be able to signal it without
 * threading a handle through every signature on the way down. Everything
 * here is a no-op when no view is active, so those sites cost nothing on
 * every other rung.
 */
let active = null;

/**
 * Register a view as the process's active one. Any previous view is stopped
 * first, so two views can never share the cursor.
 *
 * @param {object} view - From {@link createRunLiveView}.
 *
 * @returns {void}
 */
export const activateLiveView = (view) => {
    if (active && active !== view) {
        active.stop();
    }
    active = view;
};

/**
 * The active live view, or null. Emit sites call this and optional-chain.
 *
 * @returns {object|null} The view.
 */
export const activeLiveView = () => active;

/**
 * Restore the terminal if a live view is active; otherwise do nothing.
 *
 * The single reusable restore hook: called on completion (`runCommand`), on
 * the worker error paths, and on a crash (`installFatalHandlers`) - and the
 * place issue #1107's signal handling plugs into. Never throws.
 *
 * @returns {void}
 */
export const restoreLiveTerminal = () => {
    const view = active;
    active = null;
    try {
        view?.stop();
    } catch {
        // Restoring must never mask the failure that triggered it.
    }
};

/**
 * A `cli-progress`-shaped adapter that routes browser download progress into
 * the live view instead of drawing a second bar.
 *
 * Two writers repainting one cursor is the one genuinely new hazard issue
 * #1075 names: `browser-install.js` draws a `SingleBar` when a requested
 * build is not cached, and that path runs mid-run. While a live view is
 * active the install uses this adapter instead, so the download shows up as
 * the current phase's `downloading browser NN%` label - and the two writers
 * are never both active, structurally.
 *
 * @param {object} view - The active live view.
 *
 * @returns {{start: Function, update: Function, stop: Function}} The adapter.
 */
export const liveDownloadBar = (view) => ({
    /**
     * `SingleBar.start` equivalent.
     *
     * @returns {void}
     */
    start() {
        view.downloadProgress(0);
    },
    /**
     * `SingleBar.update` equivalent.
     *
     * @param {number} pct - Percentage 0-100.
     *
     * @returns {void}
     */
    update(pct) {
        view.downloadProgress(pct);
    },
    /**
     * `SingleBar.stop` equivalent.
     *
     * @returns {void}
     */
    stop() {
        view.downloadProgress(null);
    },
});
