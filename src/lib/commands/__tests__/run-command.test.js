import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    },
}));

jest.unstable_mockModule('../../util/log-error.js', () => ({ logError: jest.fn() }));

const restoreLiveTerminal = jest.fn();
jest.unstable_mockModule('../../util/run-live.js', () => ({ restoreLiveTerminal }));

const { runCommand } = await import('../run-command.js');
const { markInterrupted, resetInterruptState } = await import('../../util/interrupt.js');

/**
 * The exit code the process had before this suite ran, so a test that sets it
 * cannot make the Jest worker itself exit non-zero.
 */
let originalExitCode;

beforeEach(() => {
    jest.clearAllMocks();
    resetInterruptState();
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
});

afterEach(() => {
    resetInterruptState();
    process.exitCode = originalExitCode;
});

describe('runCommand exit codes', () => {
    test('a successful command leaves the exit code alone', async () => {
        await runCommand('TEST', async () => true);

        expect(process.exitCode).toBeUndefined();
    });

    test('a command reporting failure exits 1', async () => {
        await runCommand('TEST', async () => false);

        expect(process.exitCode).toBe(1);
    });

    test('a throwing command exits 1 without rethrowing', async () => {
        await expect(
            runCommand('TEST', async () => {
                throw new Error('server unreachable');
            })
        ).resolves.toBe(false);

        expect(process.exitCode).toBe(1);
    });
});

describe('runCommand when the run is interrupted (issue #1107)', () => {
    test('SIGINT exits 130 even though nothing failed', async () => {
        // The app loop stops at a boundary, so an interrupted run can report
        // success. Exiting 0 there would tell a scheduler the run did its job
        // when the operator had just stopped it.
        await runCommand('TEST', async () => {
            markInterrupted('SIGINT');
            return true;
        });

        expect(process.exitCode).toBe(130);
    });

    test('SIGTERM exits 143', async () => {
        await runCommand('TEST', async () => {
            markInterrupted('SIGTERM');
            return true;
        });

        expect(process.exitCode).toBe(143);
    });

    test('the signal code wins over the ordinary failure code', async () => {
        await runCommand('TEST', async () => {
            markInterrupted('SIGINT');
            return false;
        });

        // "A person stopped this" is the more useful thing to tell a
        // scheduler than "something went wrong".
        expect(process.exitCode).toBe(130);
    });

    test('the signal code wins even when the command threw on the way out', async () => {
        await runCommand('TEST', async () => {
            markInterrupted('SIGINT');
            throw new Error('Protocol error: Target closed');
        });

        expect(process.exitCode).toBe(130);
    });

    test('the terminal is still restored on the interrupt path', async () => {
        await runCommand('TEST', async () => {
            markInterrupted('SIGINT');
            return true;
        });

        expect(restoreLiveTerminal).toHaveBeenCalled();
    });
});
