/**
 * The version, said once, even when a run stops before its header.
 *
 * Every command shows the version in its run header, and the header is logged from inside the
 * command's run. Anything that stops a run earlier skipped it: Commander's own refusals (a missing
 * mandatory option, an unknown option, an invalid value) and a `beforeAction` hook that throws. Those
 * runs printed the error and nothing else, so the one thing a support report needs first was missing
 * exactly when something had gone wrong. Issue #1207.
 *
 * So an early stop gets a one-line version stamp ahead of its error, and on a terminal a blank line
 * ahead of that, to separate the failure from the command that produced it. A redirected log, a
 * scheduler transcript and a test runner get no blank line - only the stamp and the error.
 *
 * "Early" is decided by what was shown, not by where the error came from: the header and the
 * wizard's opening line both record that the version is out, and nothing is stamped after that. A
 * failure halfway through a run already has the version a screen above it.
 */

/**
 * Fold what `--version` reports into one line.
 *
 * `describeVersion` lays a variant build out as a headline and an indented detail block. That suits
 * `--version`, which prints nothing else; ahead of an error it would be four lines of preamble for a
 * one-line failure, so the details are folded in after the headline instead.
 *
 * @param {string} described - What `describeVersion` returned.
 *
 * @returns {string} One line, e.g. `butler-sheet-icons 5.1.0 (acme) - core 5.1.0, acme 2.1.0`.
 */
export const versionStampLine = (described) => {
    const [headline, ...details] = described.split('\n');

    if (details.length === 0) {
        return headline;
    }

    return `${headline} - ${details.map((line) => line.trim().replace(/\s+/, ' ')).join(', ')}`;
};

/**
 * One run's record of whether the version has been shown yet.
 *
 * A factory, so each test gets its own record; the CLI uses the one instance below.
 *
 * @returns {{noteVersionShown: () => void, announceEarlyStop: (how: object) => void}} The record's
 *     two operations.
 */
export const createVersionNotice = () => {
    let shown = false;

    return {
        /**
         * Record that the version is on screen - called wherever a run header or equivalent is
         * logged.
         *
         * @returns {void}
         */
        noteVersionShown: () => {
            shown = true;
        },

        /**
         * Put the version ahead of an early stop, unless it is already out.
         *
         * Takes its two writers rather than choosing them, because the two callers write to
         * different places: Commander's refusals go to stderr through Commander's own writer, while
         * an expected failure is logged through the logger on stdout. Whether to write the blank line
         * is the caller's call for the same reason - it is the destination stream that is or is not
         * a terminal.
         *
         * @param {object} how - Where and what to write.
         * @param {string} how.stamp - The version line, from {@link versionStampLine}.
         * @param {boolean} how.isTerminal - Whether the destination is a terminal.
         * @param {(text: string) => void} how.writeRaw - Writes text as it is; used for the blank
         *     line.
         * @param {(line: string) => void} how.writeLine - Writes one line of output.
         *
         * @returns {void}
         */
        announceEarlyStop: ({ stamp, isTerminal, writeRaw, writeLine }) => {
            if (shown) {
                return;
            }

            shown = true;

            if (isTerminal) {
                writeRaw('\n');
            }

            writeLine(stamp);
        },
    };
};

const notice = createVersionNotice();

/** This process's record, which the CLI, the run header and the wizard share. */
export const { noteVersionShown, announceEarlyStop } = notice;

/**
 * Put the version ahead of every error Commander reports, on every command in the tree.
 *
 * Commander does not pass output settings down to commands attached with `addCommand`, which is how
 * every command here is attached, so the whole tree is walked. Call it once the tree is complete -
 * after anything a build contributes has been added.
 *
 * @param {import('commander').Command} command - The root, or any command below it.
 * @param {object} how - What to write.
 * @param {string} how.stamp - The version line.
 * @param {() => boolean} [how.isTerminal] - Whether Commander's error stream is a terminal.
 * @param {(how: object) => void} [how.announce] - The announcer, injectable for tests.
 *
 * @returns {void}
 */
export const stampCommandErrors = (
    command,
    { stamp, isTerminal = () => Boolean(process.stderr.isTTY), announce = announceEarlyStop }
) => {
    command.configureOutput({
        outputError: (text, write) => {
            announce({
                stamp,
                isTerminal: isTerminal(),
                writeRaw: write,
                writeLine: (line) => write(`${line}\n`),
            });
            write(text);
        },
    });

    for (const child of command.commands) {
        stampCommandErrors(child, { stamp, isTerminal, announce });
    }
};
