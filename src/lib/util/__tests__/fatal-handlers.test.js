import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'node:events';

import {
    installFatalHandlers,
    resetFatalHandlerState,
    FATAL_EXIT_WATCHDOG_MS,
} from '../fatal-handlers.js';

/**
 * Every test installs the handlers onto a throwaway emitter with an injected
 * `exit` spy, so nothing here can register a listener on the real `process` or
 * take the Jest worker down with it.
 */
let target;
let exit;
let logger;

beforeEach(() => {
    resetFatalHandlerState();
    target = new EventEmitter();
    exit = jest.fn();
    logger = { error: jest.fn() };
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
const install = (overrides = {}) => installFatalHandlers({ logger, exit, target, ...overrides });

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
