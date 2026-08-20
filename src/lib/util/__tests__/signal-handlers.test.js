import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'node:events';

const emitRunVerdictOnce = jest.fn();

// Mocked so these tests are about the shutdown decisions, not about report
// rendering - which `run-report.test.js` owns. Importing the real module here
// would also pull winston in behind the logger this suite replaces.
jest.unstable_mockModule('../run-report.js', () => ({ emitRunVerdictOnce }));

const {
    installSignalHandlers,
    resetSignalHandlerState,
    INTERRUPT_EXIT_WATCHDOG_MS,
    HANDLED_SIGNALS,
    SHOW_CURSOR,
} = await import('../signal-handlers.js');

const {
    resetInterruptState,
    isInterrupted,
    interruptSignal,
    interruptAbortSignal,
    registerInterruptAction,
    beginInterruptibleRun,
    endInterruptibleRun,
} = await import('../interrupt.js');

/**
 * Every test installs onto a throwaway emitter with an injected `exit` spy, so
 * nothing here registers a listener on the real `process` or takes the Jest
 * worker down with it.
 */
let target;
let exit;
let logger;
let restoreTerminal;
let stdout;
let flushAndExit;

beforeEach(() => {
    resetSignalHandlerState();
    resetInterruptState();
    emitRunVerdictOnce.mockClear();

    target = new EventEmitter();
    exit = jest.fn();
    logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn() };
    restoreTerminal = jest.fn();
    stdout = { isTTY: true, write: jest.fn() };
    // Synchronous stand-in for the real drain-then-exit helper, so these tests
    // stay about the shutdown DECISIONS. The draining itself is deferred by a
    // `setImmediate` and is covered by flush-exit.test.js.
    flushAndExit = jest.fn((code, opts) => (opts?.exit ?? exit)(code));
});

afterEach(() => {
    resetSignalHandlerState();
    resetInterruptState();
    jest.useRealTimers();
});

/**
 * Installs the handlers with the shared test doubles.
 *
 * @param {object} [overrides] - Dependency overrides.
 *
 * @returns {void}
 */
const install = (overrides = {}) =>
    installSignalHandlers({
        logger,
        exit,
        target,
        restoreTerminal,
        stdout,
        flushAndExit,
        ...overrides,
    });

/**
 * The lines the logger was given, joined, for substring assertions.
 *
 * @returns {string} All warn and info lines, newline separated.
 */
const loggedText = () =>
    [...logger.warn.mock.calls, ...logger.info.mock.calls].map(([line]) => line).join('\n');

describe('installation', () => {
    test('listens for every handled signal', () => {
        install();

        for (const signal of HANDLED_SIGNALS) {
            expect(target.listenerCount(signal)).toBe(1);
        }
    });

    test('handles SIGHUP, or a dropped SSH session orphans the browser', () => {
        // Node's default disposition for SIGHUP terminates without running
        // `process.on('exit')` - measured - and that hook is the last thing
        // that would close a Chromium spawned `detached` into its own process
        // group. Puppeteer's own SIGHUP handler is switched off at launch, so
        // this listener is the only remaining cover.
        expect(HANDLED_SIGNALS).toContain('SIGHUP');
    });

    test('re-installing replaces rather than stacks listeners', () => {
        install();
        install();

        // Two listeners would run the whole shutdown twice.
        expect(target.listenerCount('SIGINT')).toBe(1);
    });

    test('a target that cannot take listeners does not throw', () => {
        const hostile = {
            /**
             * Refuses every listener, like a stripped-down SEA environment.
             *
             * @returns {void}
             */
            on() {
                throw new Error('no listeners here');
            },
        };

        expect(() => install({ target: hostile })).not.toThrow();
    });
});

describe('a signal outside a run', () => {
    test('exits immediately with the signal exit code', () => {
        install();

        target.emit('SIGINT');

        // Nothing to unwind, no report to wait for. Waiting would make Ctrl-C
        // look ignored for eight seconds and exit with the same code anyway.
        expect(exit).toHaveBeenCalledWith(130);
    });

    test('SIGTERM exits 143', () => {
        install();

        target.emit('SIGTERM');

        expect(exit).toHaveBeenCalledWith(143);
    });

    test('restores the terminal before logging', () => {
        install();

        target.emit('SIGINT');

        // Under the live view the console transport is silenced and the cursor
        // hidden, so a line logged first would be invisible.
        expect(restoreTerminal).toHaveBeenCalled();
        expect(restoreTerminal.mock.invocationCallOrder[0]).toBeLessThan(
            logger.warn.mock.invocationCallOrder[0]
        );
    });
});

describe('a signal during a run', () => {
    beforeEach(() => {
        beginInterruptibleRun();
    });

    afterEach(() => {
        endInterruptibleRun();
    });

    test('does not exit - the run is left to unwind and report', () => {
        install();

        target.emit('SIGINT');

        expect(exit).not.toHaveBeenCalled();
    });

    test('records the interrupt and aborts pending sleeps', () => {
        const abort = interruptAbortSignal();
        install();

        target.emit('SIGINT');

        expect(isInterrupted()).toBe(true);
        expect(interruptSignal()).toBe('SIGINT');
        expect(abort.aborted).toBe(true);
    });

    test('closes the browser through the teardown registry', () => {
        const closeBrowser = jest.fn();
        registerInterruptAction(closeBrowser);
        install();

        target.emit('SIGINT');

        // Asserted, not assumed: this is the thing that makes every in-flight
        // Puppeteer await reject, which is what unwinds the run at all.
        expect(closeBrowser).toHaveBeenCalledTimes(1);
    });

    test('tells the operator a second Ctrl-C exits at once', () => {
        install();

        target.emit('SIGINT');

        expect(loggedText()).toContain('press Ctrl-C again to exit immediately');
    });

    test('a second signal exits immediately, mid-shutdown', () => {
        install();

        target.emit('SIGINT');
        expect(exit).not.toHaveBeenCalled();

        target.emit('SIGINT');

        expect(exit).toHaveBeenCalledWith(130);
        expect(loggedText()).toContain('Second SIGINT');
    });

    test('a second signal of the other kind also exits, keeping the first code', () => {
        install();

        target.emit('SIGINT');
        target.emit('SIGTERM');

        // The first signal owns the shutdown, so it owns the exit code too.
        expect(exit).toHaveBeenCalledWith(130);
    });

    test('a second signal emits the verdict before exiting', () => {
        install();

        target.emit('SIGINT');
        target.emit('SIGINT');

        expect(emitRunVerdictOnce).toHaveBeenCalled();
    });

    test('exits at most once however many signals arrive', () => {
        install();

        target.emit('SIGINT');
        target.emit('SIGINT');
        target.emit('SIGINT');
        target.emit('SIGTERM');

        expect(exit).toHaveBeenCalledTimes(1);
    });
});

describe('the watchdog', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        beginInterruptibleRun();
    });

    afterEach(() => {
        endInterruptibleRun();
    });

    test('exits if graceful shutdown stalls', () => {
        install();

        target.emit('SIGTERM');
        expect(exit).not.toHaveBeenCalled();

        jest.advanceTimersByTime(INTERRUPT_EXIT_WATCHDOG_MS);

        // `docker stop` sends one signal and nobody is there to send a second,
        // so this is the only bound on shutdown in a container.
        expect(exit).toHaveBeenCalledWith(143);
    });

    test('fires inside docker stop’s ten-second grace period', () => {
        expect(INTERRUPT_EXIT_WATCHDOG_MS).toBeLessThan(10_000);
    });

    test('emits the verdict, so a stalled shutdown still reports', () => {
        install();

        target.emit('SIGINT');
        jest.advanceTimersByTime(INTERRUPT_EXIT_WATCHDOG_MS);

        expect(emitRunVerdictOnce).toHaveBeenCalled();
        expect(loggedText()).toContain('Shutdown did not finish');
    });

    test('is cancelled by a second signal, so the exit happens once', () => {
        install();

        target.emit('SIGINT');
        target.emit('SIGINT');

        expect(exit).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(INTERRUPT_EXIT_WATCHDOG_MS * 2);

        expect(exit).toHaveBeenCalledTimes(1);
    });

    test('is cleared on reset, so it cannot outlive the run that armed it', () => {
        install();

        target.emit('SIGINT');
        expect(jest.getTimerCount()).toBe(1);

        resetSignalHandlerState();

        // A run that shuts down in two seconds must not sit here for six.
        // In production the timer is `unref`'d for the same reason; this is
        // the half of it that is observable in-process.
        expect(jest.getTimerCount()).toBe(0);
    });
});

describe('robustness', () => {
    test('a logger that throws does not stop the exit', () => {
        logger.warn.mockImplementation(() => {
            throw new Error('transport gone');
        });
        install();

        target.emit('SIGINT');

        expect(exit).toHaveBeenCalledWith(130);
    });

    test('a terminal restore that throws does not stop the exit', () => {
        restoreTerminal.mockImplementation(() => {
            throw new Error('stdout is gone');
        });
        install();

        target.emit('SIGINT');

        expect(exit).toHaveBeenCalledWith(130);
    });

    test('a verdict that throws does not stop the exit', () => {
        emitRunVerdictOnce.mockImplementation(() => {
            throw new Error('renderer blew up');
        });
        beginInterruptibleRun();
        install();

        target.emit('SIGINT');
        target.emit('SIGINT');

        expect(exit).toHaveBeenCalledWith(130);
        endInterruptibleRun();
    });
});

describe('the terminal is not left worse than it was found', () => {
    test('the cursor is shown again on the way out', () => {
        install();

        target.emit('SIGINT');

        // The interactive wizard hides the cursor itself, and nothing in BSI
        // used to put it back when a signal ended the process - measured on
        // main. BSI owns that exit now.
        expect(stdout.write).toHaveBeenCalledWith(SHOW_CURSOR);
    });

    test('nothing is written when stdout is not a terminal', () => {
        stdout.isTTY = false;
        install();

        target.emit('SIGINT');

        // Piped output must not gain an escape sequence.
        expect(stdout.write).not.toHaveBeenCalled();
    });

    test('a stream that has gone away does not stop the exit', () => {
        stdout.write.mockImplementation(() => {
            throw new Error('EPIPE');
        });
        install();

        target.emit('SIGINT');

        expect(exit).toHaveBeenCalledWith(130);
    });

    test('the cursor is restored on the second-signal path too', () => {
        beginInterruptibleRun();
        install();

        target.emit('SIGINT');
        stdout.write.mockClear();
        target.emit('SIGINT');

        expect(stdout.write).toHaveBeenCalledWith(SHOW_CURSOR);
        endInterruptibleRun();
    });
});

describe('the exit is flushed, never bare (issue #1107)', () => {
    test('every exit path goes through the drain helper', () => {
        install();

        target.emit('SIGINT');

        // A bare `process.exit()` discards stdout's buffer on a pipe, which is
        // where `docker logs` and CI collectors read from - measured at 333 of
        // 400 lines delivered, with the verdict block among the losses.
        expect(flushAndExit).toHaveBeenCalledWith(130, expect.objectContaining({ exit }));
    });

    test('SIGHUP exits 129 through the same route', () => {
        install();

        target.emit('SIGHUP');

        expect(flushAndExit).toHaveBeenCalledWith(129, expect.objectContaining({ exit }));
    });

    test('the second-signal escape is flushed too', () => {
        beginInterruptibleRun();
        install();

        target.emit('SIGINT');
        target.emit('SIGINT');

        expect(flushAndExit).toHaveBeenCalledTimes(1);
        endInterruptibleRun();
    });
});
