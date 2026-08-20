/**
 * Exit the process without throwing away buffered output.
 *
 * `process.exit()` is immediate and unsentimental: it discards whatever is
 * still sitting in a stream's internal buffer. On a TTY that is invisible,
 * because writes to a terminal are synchronous - which is exactly why this is
 * so easy to ship. On a **pipe** they are not, and a pipe is what
 * `docker logs`, a CI log collector and `bsi ... | tee run.log` all are.
 *
 * Measured on Node 24 against a reader lagging one second: 400 lines followed
 * by `process.exit(130)` delivered 333 of them and lost the final report
 * block entirely; the identical program that let the process end naturally
 * delivered all 400 plus the report. So on the one path where the report
 * matters most - `docker stop` on a container - a bare exit throws away the
 * thing the run was interrupted to produce.
 *
 * The codebase already knows this. `browser/check.js` and `doctor/check.js`
 * both carry the rule: set `process.exitCode` "rather than calling
 * `process.exit()`, so winston flushes the report that explains it. A hard
 * exit would truncate it."
 *
 * The catch is that an interrupted run cannot simply return and let Node
 * drain, which is what those two commands do: Puppeteer and enigma leave
 * handles behind that can hold the event loop open indefinitely, and a
 * shutdown that hangs is worse than one that truncates. So this does both -
 * drain first, exit second, and never wait longer than
 * {@link FLUSH_TIMEOUT_MS}.
 *
 * Imports nothing, so the signal path and the entry point can both use it
 * without pulling the module graph in behind them.
 */

/**
 * How long (ms) to wait for buffered output to reach the far end.
 *
 * Deliberately short. It is bounded by `docker stop`'s ten-second window,
 * which the interrupt watchdog has already spent most of by the time this can
 * run, and by the fact that a reader which has genuinely gone away will never
 * call the drain callback at all - the timer is the only thing that ends that
 * case.
 */
export const FLUSH_TIMEOUT_MS = 2000;

/**
 * Flush the given streams, then exit.
 *
 * A zero-length write is the documented way to ask a Node stream "call me when
 * everything queued ahead of this has been handed to the OS". Streams with an
 * empty buffer are skipped, so the common case - a TTY, where writes already
 * completed synchronously - exits on the same tick and Ctrl-C stays instant.
 *
 * `setImmediate` first, because winston hands its lines to the stream from a
 * stream callback of its own: without one turn of the event loop the last log
 * line may not have reached `process.stdout` yet, and draining would then
 * report success while the line the operator needs is still upstream.
 *
 * @param {number} code - Exit code.
 * @param {object} [options] - Overrides, all optional; injectable for tests.
 * @param {Array<import('node:stream').Writable>} [options.streams] - Streams to drain.
 *     Defaults to `process.stdout` and `process.stderr`.
 * @param {Function} [options.exit] - Exit function. Defaults to `process.exit`.
 * @param {number} [options.timeoutMs] - Drain deadline. Defaults to {@link FLUSH_TIMEOUT_MS}.
 *
 * @returns {void}
 */
export const flushAndExit = (
    code,
    {
        streams = [process.stdout, process.stderr],
        /**
         * Default exit function: terminate the process with the given code.
         *
         * @param {number} exitCode - Process exit code.
         *
         * @returns {void}
         */
        exit = (exitCode) => process.exit(exitCode),
        timeoutMs = FLUSH_TIMEOUT_MS,
    } = {}
) => {
    // Set as well as passed, so that if anything below fails badly enough to
    // leave the process to end on its own, it still ends with the right code.
    process.exitCode = code;

    let finished = false;

    /**
     * Exit, at most once, however we got here.
     *
     * @returns {void}
     */
    const finish = () => {
        if (finished) return;
        finished = true;
        exit(code);
    };

    let timer = null;
    try {
        // Armed before the drains, and `unref`'d so it can never by itself keep
        // a process alive that is otherwise ready to go. A reader that has
        // vanished never calls its callback; this is what ends that case.
        timer = setTimeout(finish, timeoutMs);
        if (typeof timer.unref === 'function') timer.unref();
    } catch {
        // Without a timer the drain callbacks are the only route out. They
        // fire in every case except a dead reader.
    }

    setImmediate(() => {
        let pending = 0;

        /**
         * One stream finished draining.
         *
         * @returns {void}
         */
        const drained = () => {
            pending -= 1;
            if (pending === 0) {
                if (timer) clearTimeout(timer);
                finish();
            }
        };

        for (const stream of streams) {
            try {
                // Nothing queued means nothing to wait for - the TTY case.
                if (!stream || stream.writableEnded || !(stream.writableLength > 0)) {
                    continue;
                }
                pending += 1;
                stream.write('', drained);
            } catch {
                // A stream that cannot take a write is one we cannot flush.
                // Do not let it hold up the exit.
                if (pending > 0) pending -= 1;
            }
        }

        if (pending === 0) {
            if (timer) clearTimeout(timer);
            finish();
        }
    });
};
