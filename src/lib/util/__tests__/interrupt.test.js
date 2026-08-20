import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

import {
    INTERRUPT_EXIT_CODES,
    markInterrupted,
    isInterrupted,
    interruptSignal,
    interruptExitCode,
    interruptAbortSignal,
    registerInterruptAction,
    runInterruptActions,
    beginInterruptibleRun,
    endInterruptibleRun,
    hasInterruptibleWork,
    resetInterruptState,
} from '../interrupt.js';

beforeEach(() => {
    resetInterruptState();
});

afterEach(() => {
    resetInterruptState();
});

describe('interrupt state', () => {
    test('starts clean', () => {
        expect(isInterrupted()).toBe(false);
        expect(interruptSignal()).toBeNull();
        expect(hasInterruptibleWork()).toBe(false);
        expect(interruptAbortSignal().aborted).toBe(false);
    });

    test('records the signal and aborts the shared controller', () => {
        const signal = interruptAbortSignal();

        expect(markInterrupted('SIGINT')).toBe(true);

        expect(isInterrupted()).toBe(true);
        expect(interruptSignal()).toBe('SIGINT');
        expect(signal.aborted).toBe(true);
    });

    test('the first signal wins - a second cannot overwrite which one is reported', () => {
        markInterrupted('SIGINT');

        expect(markInterrupted('SIGTERM')).toBe(false);
        expect(interruptSignal()).toBe('SIGINT');
    });

    test('exit code follows the signal convention', () => {
        expect(INTERRUPT_EXIT_CODES.SIGINT).toBe(130);
        expect(INTERRUPT_EXIT_CODES.SIGTERM).toBe(143);
        expect(INTERRUPT_EXIT_CODES.SIGHUP).toBe(129);

        markInterrupted('SIGTERM');
        expect(interruptExitCode()).toBe(143);
    });

    test('SIGHUP exits 129, so a dropped session is not read as a failure', () => {
        markInterrupted('SIGHUP');
        expect(interruptExitCode()).toBe(129);
    });

    test('an unknown signal still gets a usable exit code', () => {
        markInterrupted('SIGUSR2');
        expect(interruptExitCode()).toBe(130);
    });

    test('the abort signal is re-read after a reset, never captured once', () => {
        markInterrupted('SIGINT');
        expect(interruptAbortSignal().aborted).toBe(true);

        resetInterruptState();

        // A module that captured the signal at import time would still hold
        // the aborted one, and every sleep would reject for the rest of the
        // process.
        expect(interruptAbortSignal().aborted).toBe(false);
    });
});

describe('teardown actions', () => {
    test('run on interrupt, and the registry is emptied', () => {
        const close = jest.fn();
        registerInterruptAction(close);

        expect(runInterruptActions()).toBe(1);
        expect(close).toHaveBeenCalledTimes(1);

        // A second pass must not close a browser that has already gone.
        expect(runInterruptActions()).toBe(0);
        expect(close).toHaveBeenCalledTimes(1);
    });

    test('an unregistered action does not run', () => {
        const close = jest.fn();
        const unregister = registerInterruptAction(close);

        unregister();
        runInterruptActions();

        expect(close).not.toHaveBeenCalled();
    });

    test('unregistering twice is safe', () => {
        const unregister = registerInterruptAction(jest.fn());

        unregister();
        expect(() => unregister()).not.toThrow();
    });

    test('one action throwing does not stop the others', () => {
        const first = jest.fn(() => {
            throw new Error('browser handle already gone');
        });
        const second = jest.fn();

        registerInterruptAction(first);
        registerInterruptAction(second);

        expect(() => runInterruptActions()).not.toThrow();
        expect(second).toHaveBeenCalledTimes(1);
    });

    test('a rejecting action is swallowed rather than becoming an unhandled rejection', async () => {
        // Left unhandled, this would reach the `unhandledRejection` handler and
        // write a crash dump for a browser that failed to close during a
        // shutdown the operator asked for.
        registerInterruptAction(async () => {
            throw new Error('close timed out');
        });

        expect(() => runInterruptActions()).not.toThrow();

        await new Promise((resolve) => setImmediate(resolve));
    });

    test('registering after the interrupt runs the action immediately', () => {
        markInterrupted('SIGINT');

        const close = jest.fn();
        registerInterruptAction(close);

        // A browser launched during shutdown would otherwise be stranded with
        // nothing left to close it.
        expect(close).toHaveBeenCalledTimes(1);
    });
});

describe('interruptible run regions', () => {
    test('open and close', () => {
        beginInterruptibleRun();
        expect(hasInterruptibleWork()).toBe(true);

        endInterruptibleRun();
        expect(hasInterruptibleWork()).toBe(false);
    });

    test('nest', () => {
        beginInterruptibleRun();
        beginInterruptibleRun();
        endInterruptibleRun();

        expect(hasInterruptibleWork()).toBe(true);

        endInterruptibleRun();
        expect(hasInterruptibleWork()).toBe(false);
    });

    test('an unbalanced close cannot drive the depth negative', () => {
        endInterruptibleRun();
        endInterruptibleRun();
        beginInterruptibleRun();

        // A negative counter would swallow the next real region, and the
        // signal handler would exit immediately in the middle of a run.
        expect(hasInterruptibleWork()).toBe(true);
    });
});
