import { markReported } from '../util/reported-error.js';

/**
 * Environment variable that switches interactive mode off unconditionally.
 *
 * Deliberately not keyed on `CI`: someone may legitimately have that set in a
 * shell where prompting is perfectly fine. An explicit opt-out is honest about
 * being a choice rather than a guess.
 */
export const INTERACTIVE_OPT_OUT_ENV = 'BSI_NO_INTERACTIVE';

/**
 * Short codes for the reasons interactive mode can be unavailable.
 *
 * Tests and the self-test command match on these rather than on message text,
 * so the wording stays free to improve.
 */
export const BLOCKER = Object.freeze({
    OPT_OUT: 'opt-out',
    STDIN_NOT_TTY: 'stdin-not-tty',
    STDOUT_NOT_TTY: 'stdout-not-tty',
    NO_RAW_MODE: 'no-raw-mode',
    DUMB_TERMINAL: 'dumb-terminal',
});

const RERUN_HINT =
    'Re-run with the options on the command line, or start the container with "docker run -it".';

/**
 * Why interactive mode cannot run, or `null` when it can.
 *
 * The checks are ordered so the message names the *first* thing a user can act
 * on. In particular stdin is tested before raw mode, because a piped stdin is
 * not a `tty.ReadStream` and therefore has no `setRawMode` either - reporting
 * "no raw mode" for a plain pipe would send the reader looking for a terminal
 * bug that is not there.
 *
 * @param {object} [deps] - Injection point for tests.
 * @param {object} [deps.stdin] - Input stream. Defaults to `process.stdin`.
 * @param {object} [deps.stdout] - Output stream. Defaults to `process.stdout`.
 * @param {object} [deps.env] - Environment to read. Defaults to `process.env`.
 *
 * @returns {{reason: string, message: string}|null} The blocker, or `null` when interactive mode is available.
 */
export const interactiveBlocker = ({
    stdin = process.stdin,
    stdout = process.stdout,
    env = process.env,
} = {}) => {
    const optOut = env[INTERACTIVE_OPT_OUT_ENV];
    if (optOut !== undefined && optOut !== '' && optOut !== '0' && optOut !== 'false') {
        return {
            reason: BLOCKER.OPT_OUT,
            message: `Interactive mode is switched off by ${INTERACTIVE_OPT_OUT_ENV}=${optOut}. Unset it to use the wizard.`,
        };
    }

    if (!stdin?.isTTY) {
        return {
            reason: BLOCKER.STDIN_NOT_TTY,
            message: `Interactive mode needs a terminal. Standard input is not a terminal - this happens with piped input, cron, "docker run" without -it, and most CI runners. ${RERUN_HINT}`,
        };
    }

    if (!stdout?.isTTY) {
        return {
            reason: BLOCKER.STDOUT_NOT_TTY,
            message: `Interactive mode needs a terminal. Standard output is being redirected, so the prompts would not be visible. ${RERUN_HINT}`,
        };
    }

    // PowerShell ISE is not a console host at all and has no raw mode, so it
    // cannot report keystrokes as they are typed. Without this check the prompt
    // would wait forever for input that can never arrive. The absent method is
    // the detectable signature - there is no version or product string to test.
    if (typeof stdin.setRawMode !== 'function') {
        return {
            reason: BLOCKER.NO_RAW_MODE,
            message: `Interactive mode needs a terminal that reports keystrokes as they are typed. This one does not - PowerShell ISE is the usual cause. Use Windows Terminal, PowerShell, or cmd.exe instead. ${RERUN_HINT}`,
        };
    }

    if (env.TERM === 'dumb') {
        return {
            reason: BLOCKER.DUMB_TERMINAL,
            message: `Interactive mode needs a terminal that can move the cursor, and this one reports TERM=dumb. ${RERUN_HINT}`,
        };
    }

    return null;
};

/**
 * Whether interactive prompting can run in this process.
 *
 * @param {object} [deps] - Injection point for tests. See {@link interactiveBlocker}.
 *
 * @returns {boolean} True when prompts can be displayed and answered.
 */
export const isInteractiveCapable = (deps) => interactiveBlocker(deps) === null;

/**
 * Fail fast when interactive mode is requested but impossible.
 *
 * This throws rather than calling `process.exit()`. Every command in this
 * codebase routes through `runCommand()`, which sets `process.exitCode` and
 * never hard-exits; a direct exit here would be the only one in the codebase,
 * would bypass that contract, and would be untestable. The thrown error is
 * marked as already reported so the handler prints the guidance once, without a
 * stack trace.
 *
 * The property that matters is that this returns control immediately. A wizard
 * blocking on a closed stdin inside a scheduled container run is a production
 * incident, not a cosmetic problem.
 *
 * @param {object} [deps] - Injection point for tests. See {@link interactiveBlocker}.
 *
 * @returns {void}
 *
 * @throws {Error} When interactive mode cannot run, carrying actionable guidance.
 */
export const assertInteractiveCapable = (deps) => {
    const blocker = interactiveBlocker(deps);

    if (blocker) {
        const err = new Error(blocker.message);
        err.blockerReason = blocker.reason;
        throw markReported(err);
    }
};
