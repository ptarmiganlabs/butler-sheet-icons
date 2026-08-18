import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'node:events';

import {
    installFatalHandlers,
    resetFatalHandlerState,
    FATAL_EXIT_WATCHDOG_MS,
    BROKEN_PIPE_EXIT_CODE,
} from '../fatal-handlers.js';

/**
 * Every test installs the handlers onto a throwaway emitter with an injected
 * `exit` spy, so nothing here can register a listener on the real `process` or
 * take the Jest worker down with it. The output streams are stand-ins for the
 * same reason: attaching to the real `process.stdout` would leave a listener on
 * the stream Jest reports through.
 */
let target;
let exit;
let logger;
let stdout;
let stderr;

beforeEach(() => {
    resetFatalHandlerState();
    target = new EventEmitter();
    exit = jest.fn();
    logger = { error: jest.fn() };
    stdout = new EventEmitter();
    stderr = new EventEmitter();
});

afterEach(() => {
    resetFatalHandlerState();
    jest.useRealTimers();
});

/**
 * Installs the handlers with the shared test doubles, overriding as needed.
 *
 * @param {object} [overrides] - Dependency overrides passed to `installFatalHandlers`.
 *
 * @returns {void}
 */
const install = (overrides = {}) =>
    installFatalHandlers({
        logger,
        exit,
        target,
        outputStreams: [stdout, stderr],
        ...overrides,
    });

/** The wording Node uses for the codes that do not follow the `write X` shape. */
const WRITE_ERROR_MESSAGES = { ERR_STREAM_DESTROYED: 'Cannot call write after destroy' };

/**
 * Builds an error carrying a write-failure code, shaped like the one Node raises
 * when a write cannot be delivered.
 *
 * The messages are the real ones: `write EPIPE` and `write ENOTCONN` are what a
 * dead pipe and a dead socket actually produce, which matters because a reader
 * of a failing test should recognise what they are looking at.
 *
 * @param {string} [code] - The error code. Defaults to `EPIPE`.
 *
 * @returns {Error} The error, with `code` and `syscall` set.
 */
const brokenPipeError = (code = 'EPIPE') => {
    const err = new Error(WRITE_ERROR_MESSAGES[code] ?? `write ${code}`);
    err.code = code;
    err.syscall = 'write';
    return err;
};

/**
 * Yields to the microtask queue so the promise chain inside the handler can
 * settle before assertions run.
 *
 * @returns {Promise<void>} Resolves on the next macrotask tick.
 */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('installFatalHandlers', () => {
    test('registers exactly one listener per fatal event', () => {
        install();

        expect(target.listenerCount('uncaughtException')).toBe(1);
        expect(target.listenerCount('unhandledRejection')).toBe(1);
    });

    test('is idempotent: installing twice does not double up listeners or dumps', async () => {
        const writeCrashDump = jest.fn().mockResolvedValue(undefined);
        install({ writeCrashDump });
        install({ writeCrashDump });

        expect(target.listenerCount('uncaughtException')).toBe(1);
        expect(target.listenerCount('unhandledRejection')).toBe(1);

        target.emit('uncaughtException', new Error('boom'));
        await flush();

        expect(writeCrashDump).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenCalledTimes(1);
    });

    test('resetFatalHandlerState removes the listeners', () => {
        install();
        resetFatalHandlerState();

        expect(target.listenerCount('uncaughtException')).toBe(0);
        expect(target.listenerCount('unhandledRejection')).toBe(0);
    });
});

describe('happy path', () => {
    test.each([
        ['uncaughtException', 'uncaughtException'],
        ['unhandledRejection', 'unhandledRejection'],
    ])('%s writes one dump and exits once with code 1', async (event, source) => {
        const writeCrashDump = jest.fn().mockResolvedValue(undefined);
        install({ writeCrashDump });

        const err = new Error('boom');
        target.emit(event, err);
        await flush();

        expect(writeCrashDump).toHaveBeenCalledTimes(1);
        expect(writeCrashDump).toHaveBeenCalledWith(err, source);
        expect(exit).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenCalledWith(1);
    });

    test('logs a single FATAL line naming the kind of failure', async () => {
        install({ writeCrashDump: jest.fn().mockResolvedValue(undefined) });

        target.emit('unhandledRejection', new Error('the reason'));
        await flush();

        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith('FATAL: Unhandled promise rejection: the reason');
    });

    test('restores the terminal before the FATAL line is logged (issue #1075)', async () => {
        // Order matters: while the live view is active the console transport
        // is silenced, so a FATAL line logged before the restore would be
        // invisible - on exactly the run whose crash the operator most needs
        // to see.
        const restoreTerminal = jest.fn();
        install({ writeCrashDump: jest.fn().mockResolvedValue(undefined), restoreTerminal });

        target.emit('uncaughtException', new Error('boom'));
        await flush();

        expect(restoreTerminal).toHaveBeenCalledTimes(1);
        expect(restoreTerminal.mock.invocationCallOrder[0]).toBeLessThan(
            logger.error.mock.invocationCallOrder[0]
        );
    });

    test('the exit watchdog is armed before the terminal restore runs', async () => {
        // The restore writes to the TTY and could stall; the #946 rule is
        // that the watchdog is armed before anything else on the fatal path,
        // so an async stall in the restore is still bounded.
        const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
        let timersWhenRestoreRan = null;
        install({
            writeCrashDump: jest.fn().mockResolvedValue(undefined),
            restoreTerminal: jest.fn(() => {
                timersWhenRestoreRan = setTimeoutSpy.mock.calls.length;
            }),
        });
        setTimeoutSpy.mockClear();

        target.emit('uncaughtException', new Error('boom'));
        await flush();

        expect(timersWhenRestoreRan).toBeGreaterThanOrEqual(1);
        setTimeoutSpy.mockRestore();
    });

    test('a throwing terminal restore does not stop the crash dump', async () => {
        const writeCrashDump = jest.fn().mockResolvedValue(undefined);
        install({
            writeCrashDump,
            restoreTerminal: jest.fn(() => {
                throw new Error('restore failed');
            }),
        });

        target.emit('uncaughtException', new Error('boom'));
        await flush();

        expect(writeCrashDump).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenCalledWith(1);
    });
});

describe('a failing crash dump cannot re-enter the handler (issue #946)', () => {
    test('a rejecting writeCrashDump still exits exactly once', async () => {
        const writeCrashDump = jest.fn().mockRejectedValue(new Error('dump write failed'));
        install({ writeCrashDump });

        target.emit('unhandledRejection', new Error('seed'));
        await flush();

        expect(writeCrashDump).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenCalledWith(1);
    });

    test('the rejection does not escape as a new unhandled rejection', async () => {
        // The old code ended in `.finally(...)`, whose derived promise rejects
        // and is reported by Node as a fresh unhandledRejection — feeding the
        // handler that produced it. Watch the real process for that escape.
        const escaped = [];
        /**
         * Records any unhandled rejection Node reports during this test.
         *
         * @param {unknown} reason - The rejection reason.
         *
         * @returns {void}
         */
        const spy = (reason) => escaped.push(reason);
        process.on('unhandledRejection', spy);

        try {
            install({ writeCrashDump: jest.fn().mockRejectedValue(new Error('dump failed')) });
            target.emit('unhandledRejection', new Error('seed'));
            await flush();
            await flush();
        } finally {
            process.removeListener('unhandledRejection', spy);
        }

        expect(escaped).toEqual([]);
    });

    test('a writeCrashDump that throws synchronously still exits once', async () => {
        const writeCrashDump = jest.fn(() => {
            throw new Error('not even a promise');
        });
        install({ writeCrashDump });

        target.emit('uncaughtException', new Error('seed'));
        await flush();

        expect(exit).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenCalledWith(1);
    });

    test('a writeCrashDump that returns a non-promise still exits once', async () => {
        install({ writeCrashDump: jest.fn(() => undefined) });

        target.emit('uncaughtException', new Error('seed'));
        await flush();

        expect(exit).toHaveBeenCalledTimes(1);
    });
});

describe('re-entry guard', () => {
    test('a burst of 200 rejections produces one dump and one exit', async () => {
        // Measured against the pre-fix handlers, this burst wrote 400 files.
        const writeCrashDump = jest.fn().mockResolvedValue(undefined);
        install({ writeCrashDump });

        for (let i = 0; i < 200; i += 1) {
            target.emit('unhandledRejection', new Error(`boom ${i}`));
        }
        await flush();

        expect(writeCrashDump).toHaveBeenCalledTimes(1);
        expect(writeCrashDump).toHaveBeenCalledWith(expect.any(Error), 'unhandledRejection');
        expect(exit).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledTimes(1);
    });

    test('the guard is shared across both handlers', async () => {
        // The two handlers are twins. A guard held per-handler would let an
        // uncaught exception raised while handling a rejection start a second
        // dump, which is the hole the issue is about.
        const writeCrashDump = jest.fn().mockResolvedValue(undefined);
        install({ writeCrashDump });

        target.emit('uncaughtException', new Error('first'));
        target.emit('unhandledRejection', new Error('second'));
        await flush();

        expect(writeCrashDump).toHaveBeenCalledTimes(1);
        expect(writeCrashDump).toHaveBeenCalledWith(expect.any(Error), 'uncaughtException');
        expect(exit).toHaveBeenCalledTimes(1);
    });

    test('a fatal event arriving while the dump is in flight is dropped, not exited on', async () => {
        // The dropped event must not shortcut to exit: that would truncate the
        // one dump the operator needs and leave a zero-byte file.
        let releaseDump;
        const dumpPromise = new Promise((resolve) => {
            releaseDump = resolve;
        });
        const writeCrashDump = jest.fn(() => dumpPromise);
        install({ writeCrashDump });

        target.emit('unhandledRejection', new Error('first'));
        await flush();

        target.emit('unhandledRejection', new Error('while writing'));
        await flush();

        expect(writeCrashDump).toHaveBeenCalledTimes(1);
        expect(exit).not.toHaveBeenCalled();

        releaseDump();
        await flush();

        expect(exit).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenCalledWith(1);
    });
});

describe('exit watchdog', () => {
    test('exits when the crash dump promise never settles', async () => {
        jest.useFakeTimers();
        // A dump that never settles: a hung network filesystem, say. Without
        // the watchdog the process hangs and a scheduled job never returns.
        install({ writeCrashDump: jest.fn(() => new Promise(() => {})) });

        target.emit('uncaughtException', new Error('boom'));
        expect(exit).not.toHaveBeenCalled();

        jest.advanceTimersByTime(FATAL_EXIT_WATCHDOG_MS + 1);

        expect(exit).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenCalledWith(1);
    });

    test('honours an injected watchdog delay', () => {
        jest.useFakeTimers();
        install({ writeCrashDump: jest.fn(() => new Promise(() => {})), watchdogMs: 250 });

        target.emit('uncaughtException', new Error('boom'));

        jest.advanceTimersByTime(249);
        expect(exit).not.toHaveBeenCalled();

        jest.advanceTimersByTime(2);
        expect(exit).toHaveBeenCalledTimes(1);
    });

    test('does not exit a second time after the dump has already exited', async () => {
        jest.useFakeTimers();
        install({ writeCrashDump: jest.fn().mockResolvedValue(undefined), watchdogMs: 250 });

        target.emit('uncaughtException', new Error('boom'));
        await Promise.resolve();
        await Promise.resolve();

        expect(exit).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(10_000);
        expect(exit).toHaveBeenCalledTimes(1);
    });

    test('the watchdog timer is unref’d so it cannot hold a process open', () => {
        jest.useFakeTimers();
        const unref = jest.spyOn(global, 'setTimeout');
        install({ writeCrashDump: jest.fn(() => new Promise(() => {})) });

        target.emit('uncaughtException', new Error('boom'));

        const timer = unref.mock.results[unref.mock.results.length - 1].value;
        expect(typeof timer.unref).toBe('function');
        unref.mockRestore();
    });
});

describe('rejection reasons that are not Errors', () => {
    test('a string reason is coerced to an Error carrying that text', async () => {
        const writeCrashDump = jest.fn().mockResolvedValue(undefined);
        install({ writeCrashDump });

        target.emit('unhandledRejection', 'just a string');
        await flush();

        const [err, source] = writeCrashDump.mock.calls[0];
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('just a string');
        expect(source).toBe('unhandledRejection');
    });

    test('a reason whose toString throws does not take the handler down', async () => {
        const writeCrashDump = jest.fn().mockResolvedValue(undefined);
        install({ writeCrashDump });

        const hostile = {
            /**
             * Throwing `toString`, so `String(reason)` cannot be trusted.
             *
             * @returns {never} Never returns; always throws.
             */
            toString() {
                throw new Error('cannot stringify');
            },
        };
        target.emit('unhandledRejection', hostile);
        await flush();

        const [err] = writeCrashDump.mock.calls[0];
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('Unhandled promise rejection with an uncoercible reason');
        expect(exit).toHaveBeenCalledTimes(1);
    });
});

describe('output pipe closing is not a crash (issue #1019)', () => {
    // `butler-sheet-icons browser list-available ... | head -12`. `head` closes
    // the pipe once it has its lines, the next write raises EPIPE, and that
    // used to leave a crash report behind for an operator who did nothing
    // wrong.

    // Which error codes each catch site treats as "the reader went away", stated
    // as one table rather than as scattered cases, because the whole point is
    // that the two sites deliberately DISAGREE. Reading down the two verdict
    // columns is how that disagreement stays visible; a code asserted at only
    // one site says nothing about the other, which is how ENOTCONN came to be
    // handled at neither.
    //
    // `quiet` is exit 141 with no crash dump. `crash` is the ordinary fatal
    // path: one dump, exit 1.
    const CODE_MATRIX = [
        {
            code: 'EPIPE',
            why: 'a pipe closed by its reader, the original #1019 case',
            atStream: 'quiet',
            atBackstop: 'quiet',
        },
        {
            code: 'ERR_STREAM_DESTROYED',
            why: 'a write after Node tore the stream down in response',
            atStream: 'quiet',
            atBackstop: 'quiet',
        },
        {
            code: 'ENOTCONN',
            // The flake this table was written for. Captured output is a socket
            // rather than a pipe, and a socket reports its reader leaving this
            // way when data was still buffered - so the end-to-end test for
            // #1019 wrote crash dumps about one loaded run in sixty.
            why: 'the same event over a socket, which captured output is',
            atStream: 'quiet',
            atBackstop: 'crash',
        },
        {
            code: 'ECONNRESET',
            // Why the two sets cannot be collapsed into one. On a stream we
            // watch this is our own output going away; arriving loose, it is far
            // more likely to be a Qlik Sense connection dropping, and that needs
            // its dump.
            why: 'a socket reader that went away - or a Qlik Sense connection reset',
            atStream: 'quiet',
            atBackstop: 'crash',
        },
        {
            code: 'ENOSPC',
            why: 'a full disk is a real failure however it arrives',
            atStream: 'crash',
            atBackstop: 'crash',
        },
        {
            code: 'EACCES',
            why: 'so is a permission problem',
            atStream: 'crash',
            atBackstop: 'crash',
        },
    ];

    /**
     * Asserts one row of the matrix against whichever site raised the error.
     *
     * @param {'quiet'|'crash'} verdict - What the site is required to do.
     * @param {Function} writeCrashDump - The crash dump spy.
     * @param {Error} err - The error that was raised.
     *
     * @returns {void}
     */
    const expectVerdict = (verdict, writeCrashDump, err) => {
        if (verdict === 'quiet') {
            expect(writeCrashDump).not.toHaveBeenCalled();
            expect(exit).toHaveBeenCalledTimes(1);
            expect(exit).toHaveBeenCalledWith(BROKEN_PIPE_EXIT_CODE);

            return;
        }

        expect(writeCrashDump).toHaveBeenCalledTimes(1);
        expect(writeCrashDump).toHaveBeenCalledWith(err, 'uncaughtException');
        expect(exit).toHaveBeenCalledWith(1);
    };

    describe('caught at the stream, which is where the pipe is known', () => {
        test.each(CODE_MATRIX)(
            'a $code on the stream is $atStream — $why',
            async ({ code, atStream }) => {
                const writeCrashDump = jest.fn().mockResolvedValue(undefined);
                install({ writeCrashDump });

                const err = brokenPipeError(code);
                stdout.emit('error', err);
                await flush();

                expectVerdict(atStream, writeCrashDump, err);
            }
        );

        test('stderr is watched on the same terms as stdout', async () => {
            const writeCrashDump = jest.fn().mockResolvedValue(undefined);
            install({ writeCrashDump });

            stderr.emit('error', brokenPipeError());
            await flush();

            expect(writeCrashDump).not.toHaveBeenCalled();
            expect(exit).toHaveBeenCalledTimes(1);
            expect(exit).toHaveBeenCalledWith(BROKEN_PIPE_EXIT_CODE);
        });

        test('the terminal is restored before a broken-pipe exit (issue #1075)', async () => {
            // stderr's reader going away must not strand a hidden cursor on
            // a stdout that is still a live TTY - the broken-pipe path is an
            // exit path like any other for the terminal-restore hook.
            const restoreTerminal = jest.fn();
            install({ writeCrashDump: jest.fn().mockResolvedValue(undefined), restoreTerminal });

            stderr.emit('error', brokenPipeError());
            await flush();

            expect(restoreTerminal).toHaveBeenCalledTimes(1);
            expect(restoreTerminal.mock.invocationCallOrder[0]).toBeLessThan(
                exit.mock.invocationCallOrder[0]
            );
            expect(exit).toHaveBeenCalledWith(BROKEN_PIPE_EXIT_CODE);
        });

        test('nothing is logged, since the stream to log to is the one that closed', async () => {
            const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
            install({ writeCrashDump: jest.fn().mockResolvedValue(undefined) });

            stdout.emit('error', brokenPipeError());
            await flush();

            expect(logger.error).not.toHaveBeenCalled();
            expect(consoleError).not.toHaveBeenCalled();

            consoleError.mockRestore();
        });

        test('the stream listeners are removed on reset, and not doubled up on re-install', () => {
            install();
            install();

            expect(stdout.listenerCount('error')).toBe(1);
            expect(stderr.listenerCount('error')).toBe(1);

            resetFatalHandlerState();

            expect(stdout.listenerCount('error')).toBe(0);
            expect(stderr.listenerCount('error')).toBe(0);
        });

        test('a stream that will not take a listener does not stop installation', () => {
            const hostile = {
                /**
                 * Stands in for a stream stub, or a stripped-down SEA runtime,
                 * that cannot register listeners.
                 *
                 * @returns {never} Never returns; always throws.
                 */
                on() {
                    throw new Error('no listeners here');
                },
            };

            expect(() => install({ outputStreams: [hostile, stdout] })).not.toThrow();
            expect(stdout.listenerCount('error')).toBe(1);
            expect(target.listenerCount('uncaughtException')).toBe(1);
        });
    });

    describe('backstop on the uncaughtException path', () => {
        // The same table, read down the other column. Attribution here is a
        // guess - nothing says the error came from stdout - so this site matches
        // fewer codes, and the rows where the two columns differ are the ones
        // carrying the design.
        test.each(CODE_MATRIX)(
            'an uncaught $code is $atBackstop — $why',
            async ({ code, atBackstop }) => {
                const writeCrashDump = jest.fn().mockResolvedValue(undefined);
                install({ writeCrashDump });

                const err = brokenPipeError(code);
                target.emit('uncaughtException', err);
                await flush();

                expectVerdict(atBackstop, writeCrashDump, err);
            }
        );

        test('the backstop is narrower than the stream listener, on purpose', () => {
            // A guard on the table itself rather than on the code. Widening the
            // backstop to match the stream listener would pass every case above
            // if the table were widened with it, and would mean a Qlik Sense
            // connection reset silently losing its crash dump.
            const widerAtStream = CODE_MATRIX.filter(
                (row) => row.atStream === 'quiet' && row.atBackstop === 'crash'
            ).map((row) => row.code);

            expect(widerAtStream).toEqual(['ENOTCONN', 'ECONNRESET']);
        });

        test('an EPIPE-coded rejection is still a crash', async () => {
            // Every network call in BSI is promise-based, and a wrapper such as
            // an AxiosError copies `code` across from the socket error it came
            // from. Quietly swallowing those would hide real Qlik Sense
            // failures, so the backstop stops at uncaught exceptions.
            const writeCrashDump = jest.fn().mockResolvedValue(undefined);
            install({ writeCrashDump });

            const err = brokenPipeError();
            target.emit('unhandledRejection', err);
            await flush();

            expect(writeCrashDump).toHaveBeenCalledTimes(1);
            expect(writeCrashDump).toHaveBeenCalledWith(err, 'unhandledRejection');
            expect(exit).toHaveBeenCalledWith(1);
        });
    });

    describe('interaction with a crash already being handled', () => {
        test('a pipe breaking mid-dump does not truncate that dump', async () => {
            // The order that matters: a real crash starts a dump, and logging it
            // is itself what breaks the pipe. Exiting on that would leave the
            // zero-byte dump of issue #946.
            let releaseDump;
            const dumpPromise = new Promise((resolve) => {
                releaseDump = resolve;
            });
            const writeCrashDump = jest.fn(() => dumpPromise);
            install({ writeCrashDump });

            target.emit('uncaughtException', new Error('the real failure'));
            await flush();

            stdout.emit('error', brokenPipeError());
            await flush();

            expect(exit).not.toHaveBeenCalled();

            releaseDump();
            await flush();

            expect(writeCrashDump).toHaveBeenCalledTimes(1);
            expect(exit).toHaveBeenCalledTimes(1);
            expect(exit).toHaveBeenCalledWith(1);
        });

        test('a crash arriving after the pipe broke cannot exit a second time', async () => {
            const writeCrashDump = jest.fn().mockResolvedValue(undefined);
            install({ writeCrashDump });

            stdout.emit('error', brokenPipeError());
            target.emit('uncaughtException', new Error('too late'));
            await flush();

            expect(writeCrashDump).not.toHaveBeenCalled();
            expect(exit).toHaveBeenCalledTimes(1);
            expect(exit).toHaveBeenCalledWith(BROKEN_PIPE_EXIT_CODE);
        });

        test('no watchdog is armed, so the quiet exit needs no timer to complete', () => {
            jest.useFakeTimers();
            install({ writeCrashDump: jest.fn().mockResolvedValue(undefined) });

            stdout.emit('error', brokenPipeError());
            expect(exit).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(FATAL_EXIT_WATCHDOG_MS * 2);
            expect(exit).toHaveBeenCalledTimes(1);
        });
    });
});

describe('a broken logger', () => {
    test('falls back to console.error and still writes the dump and exits', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        const writeCrashDump = jest.fn().mockResolvedValue(undefined);
        install({
            writeCrashDump,
            logger: {
                /**
                 * Logger whose `error` method is itself broken.
                 *
                 * @returns {never} Never returns; always throws.
                 */
                error() {
                    throw new Error('logger is broken');
                },
            },
        });

        target.emit('uncaughtException', new Error('boom'));
        await flush();

        expect(consoleError).toHaveBeenCalledWith('FATAL: Uncaught exception: boom');
        expect(writeCrashDump).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenCalledTimes(1);

        consoleError.mockRestore();
    });

    test('a logger that cannot log at all still writes the dump and exits', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {
            throw new Error('console is broken too');
        });
        const writeCrashDump = jest.fn().mockResolvedValue(undefined);
        install({
            writeCrashDump,
            logger: {
                /**
                 * Logger whose `error` method is itself broken.
                 *
                 * @returns {never} Never returns; always throws.
                 */
                error() {
                    throw new Error('logger is broken');
                },
            },
        });

        target.emit('uncaughtException', new Error('boom'));
        await flush();

        expect(writeCrashDump).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenCalledTimes(1);

        consoleError.mockRestore();
    });
});
