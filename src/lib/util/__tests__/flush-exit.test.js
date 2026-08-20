import { jest, describe, test, expect } from '@jest/globals';
import { flushAndExit, FLUSH_TIMEOUT_MS } from '../flush-exit.js';

/**
 * A stand-in Writable that reports a non-empty buffer and only invokes the
 * drain callback when the test says so — the shape of a pipe whose reader is
 * behind.
 *
 * @param {object} [options] - Stream shape.
 * @param {number} [options.writableLength] - Bytes reported as still queued.
 * @param {boolean} [options.writableEnded] - Whether the stream is already ended.
 * @param {boolean} [options.throws] - Make `write` throw, as a dead stream does.
 *
 * @returns {object} The fake stream, with `release()` to drain it.
 */
const fakeStream = ({ writableLength = 100, writableEnded = false, throws = false } = {}) => {
    let cb = null;

    return {
        writableLength,
        writableEnded,
        /**
         * Records the drain callback instead of calling it.
         *
         * @param {string} _chunk - Ignored.
         * @param {Function} callback - Drain callback.
         *
         * @returns {void}
         */
        write(_chunk, callback) {
            if (throws) throw new Error('EPIPE');
            cb = callback;
        },
        /**
         * Fires the recorded drain callback.
         *
         * @returns {void}
         */
        release() {
            cb?.();
        },
    };
};

/**
 * Lets queued `setImmediate` callbacks run.
 *
 * @returns {Promise<void>} Resolves on the next macrotask turn.
 */
const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('flushAndExit', () => {
    test('waits for a lagging stream before exiting', async () => {
        const exit = jest.fn();
        const stream = fakeStream();

        flushAndExit(130, { streams: [stream], exit });
        await tick();

        // The whole point: a bare process.exit() here discards the report.
        // Measured at 333 of 400 lines delivered, verdict block among them.
        expect(exit).not.toHaveBeenCalled();

        stream.release();
        expect(exit).toHaveBeenCalledWith(130);
    });

    test('exits without waiting when nothing is buffered', async () => {
        const exit = jest.fn();

        flushAndExit(143, { streams: [fakeStream({ writableLength: 0 })], exit });
        await tick();

        // The TTY case: writes already completed synchronously, so Ctrl-C
        // must stay instant rather than paying the drain.
        expect(exit).toHaveBeenCalledWith(143);
    });

    test('exits anyway when the reader never drains', async () => {
        jest.useFakeTimers();
        const exit = jest.fn();

        flushAndExit(130, { streams: [fakeStream()], exit, timeoutMs: 50 });
        jest.advanceTimersByTime(0);
        await Promise.resolve();
        jest.advanceTimersByTime(50);

        // A reader that has gone away never calls the callback; the timer is
        // the only route out, and a shutdown that hangs is worse than one
        // that truncates.
        expect(exit).toHaveBeenCalledWith(130);
        jest.useRealTimers();
    });

    test('exits once, not twice, when the drain and the timer race', async () => {
        jest.useFakeTimers();
        const exit = jest.fn();
        const stream = fakeStream();

        flushAndExit(130, { streams: [stream], exit, timeoutMs: 50 });
        jest.advanceTimersByTime(0);
        await Promise.resolve();
        stream.release();
        jest.advanceTimersByTime(500);

        expect(exit).toHaveBeenCalledTimes(1);
        jest.useRealTimers();
    });

    test('sets process.exitCode as well, so a missed exit still ends correctly', async () => {
        const original = process.exitCode;
        try {
            flushAndExit(143, { streams: [fakeStream({ writableLength: 0 })], exit: jest.fn() });
            expect(process.exitCode).toBe(143);
        } finally {
            process.exitCode = original;
        }
    });

    test('a stream that cannot be written does not hold up the exit', async () => {
        const exit = jest.fn();

        flushAndExit(130, { streams: [fakeStream({ throws: true })], exit });
        await tick();

        expect(exit).toHaveBeenCalledWith(130);
    });

    test('the default deadline stays inside docker stop’s grace period', () => {
        expect(FLUSH_TIMEOUT_MS).toBeLessThan(10_000);
    });
});
