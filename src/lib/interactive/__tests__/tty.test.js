import { describe, test, expect } from '@jest/globals';
import {
    BLOCKER,
    INTERACTIVE_OPT_OUT_ENV,
    interactiveBlocker,
    isInteractiveCapable,
    assertInteractiveCapable,
} from '../tty.js';
import { alreadyReported } from '../../util/reported-error.js';

// A stdin that looks like a real terminal: a TTY that can report keystrokes.
const terminalStdin = () => ({ isTTY: true, setRawMode: () => {} });
const terminalStdout = () => ({ isTTY: true });

// The happy path, with every blocker cleared. Override one field per test so
// each case isolates exactly one reason interactive mode is unavailable.
const capable = (overrides = {}) => ({
    stdin: terminalStdin(),
    stdout: terminalStdout(),
    env: {},
    ...overrides,
});

describe('interactiveBlocker', () => {
    test('returns null when stdin and stdout are both terminals', () => {
        expect(interactiveBlocker(capable())).toBeNull();
    });

    test('blocks on the explicit opt-out', () => {
        const blocker = interactiveBlocker(capable({ env: { [INTERACTIVE_OPT_OUT_ENV]: '1' } }));

        expect(blocker.reason).toBe(BLOCKER.OPT_OUT);
        expect(blocker.message).toContain(INTERACTIVE_OPT_OUT_ENV);
    });

    test('ignores an opt-out set to a falsy value', () => {
        for (const value of ['', '0', 'false']) {
            expect(
                interactiveBlocker(capable({ env: { [INTERACTIVE_OPT_OUT_ENV]: value } }))
            ).toBeNull();
        }
    });

    test('blocks when stdin is not a terminal', () => {
        const blocker = interactiveBlocker(capable({ stdin: { isTTY: false } }));

        expect(blocker.reason).toBe(BLOCKER.STDIN_NOT_TTY);
        expect(blocker.message).toContain('docker run -it');
    });

    test('blocks when stdout is redirected', () => {
        const blocker = interactiveBlocker(capable({ stdout: { isTTY: false } }));

        expect(blocker.reason).toBe(BLOCKER.STDOUT_NOT_TTY);
    });

    test('blocks a terminal with no raw mode, and names the likely cause', () => {
        // PowerShell ISE: isTTY is true but there is no console behind it, so
        // setRawMode is absent and keystrokes can never be reported.
        const blocker = interactiveBlocker(capable({ stdin: { isTTY: true } }));

        expect(blocker.reason).toBe(BLOCKER.NO_RAW_MODE);
        expect(blocker.message).toContain('PowerShell ISE');
    });

    test('blocks a dumb terminal', () => {
        const blocker = interactiveBlocker(capable({ env: { TERM: 'dumb' } }));

        expect(blocker.reason).toBe(BLOCKER.DUMB_TERMINAL);
    });

    // Ordering matters for message quality, not just for coverage. A piped
    // stdin is not a tty.ReadStream and so has no setRawMode either; reporting
    // "no raw mode" for a plain pipe would send the reader hunting for a
    // terminal bug that is not there.
    test('a piped stdin reports the pipe, not the missing raw mode', () => {
        const blocker = interactiveBlocker(capable({ stdin: { isTTY: false } }));

        expect(blocker.reason).toBe(BLOCKER.STDIN_NOT_TTY);
    });

    test('the opt-out beats every capability blocker', () => {
        const blocker = interactiveBlocker({
            stdin: { isTTY: false },
            stdout: { isTTY: false },
            env: { [INTERACTIVE_OPT_OUT_ENV]: '1', TERM: 'dumb' },
        });

        expect(blocker.reason).toBe(BLOCKER.OPT_OUT);
    });

    test('every blocker carries a distinct, non-empty message', () => {
        const blockers = [
            interactiveBlocker(capable({ env: { [INTERACTIVE_OPT_OUT_ENV]: '1' } })),
            interactiveBlocker(capable({ stdin: { isTTY: false } })),
            interactiveBlocker(capable({ stdout: { isTTY: false } })),
            interactiveBlocker(capable({ stdin: { isTTY: true } })),
            interactiveBlocker(capable({ env: { TERM: 'dumb' } })),
        ];
        const messages = blockers.map((blocker) => blocker.message);

        expect(new Set(messages).size).toBe(messages.length);
        expect(new Set(blockers.map((blocker) => blocker.reason)).size).toBe(blockers.length);
        for (const message of messages) {
            expect(message.length).toBeGreaterThan(20);
        }
    });

    test('survives streams that are missing entirely', () => {
        expect(interactiveBlocker({ stdin: undefined, stdout: undefined, env: {} }).reason).toBe(
            BLOCKER.STDIN_NOT_TTY
        );
    });
});

describe('isInteractiveCapable', () => {
    test('true only when there is no blocker', () => {
        expect(isInteractiveCapable(capable())).toBe(true);
        expect(isInteractiveCapable(capable({ stdin: { isTTY: false } }))).toBe(false);
    });
});

describe('assertInteractiveCapable', () => {
    test('returns quietly when interactive mode is available', () => {
        expect(() => assertInteractiveCapable(capable())).not.toThrow();
    });

    test('throws the guidance rather than exiting the process', () => {
        // Throwing keeps the exit-code contract in runCommand()'s hands. The
        // property that matters is that control returns immediately - a wizard
        // blocking on a closed stdin in a scheduled container run is an outage.
        expect(() => assertInteractiveCapable(capable({ stdin: { isTTY: false } }))).toThrow(
            /needs a terminal/
        );
    });

    test('marks the error as reported, so the handler prints no stack', () => {
        try {
            assertInteractiveCapable(capable({ stdin: { isTTY: false } }));
            throw new Error('should have thrown');
        } catch (err) {
            expect(alreadyReported(err)).toBe(true);
            expect(err.blockerReason).toBe(BLOCKER.STDIN_NOT_TTY);
        }
    });
});
