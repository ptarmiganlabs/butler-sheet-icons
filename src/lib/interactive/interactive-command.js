import { Command, Option } from 'commander';
import { logger, appVersion } from '../../globals.js';
import { runCommand } from '../commands/run-command.js';
import { assertInteractiveCapable } from './tty.js';
import { isPromptCancellation } from './prompt-runtime.js';
import { runSelfTest } from './self-test.js';

/**
 * Run the self-test, treating a cancelled prompt as a normal way to leave.
 *
 * Ctrl-C during the prompt gallery is how a reviewer stops once they have seen
 * enough. Without this the library's own wording surfaces - "User force closed
 * the prompt with 0 null", verified by driving the gallery through a pty - and
 * a deliberate exit reads like a crash.
 *
 * @returns {Promise<boolean>} `true`, whether the gallery finished or was cancelled.
 */
const runSelfTestUnlessCancelled = async () => {
    try {
        return await runSelfTest();
    } catch (err) {
        if (isPromptCancellation(err)) {
            logger.info('Self-test cancelled.');

            return true;
        }

        throw err;
    }
};

/**
 * Handle the `interactive` command.
 *
 * @param {object} [options] - Parsed command options.
 * @param {object} [_cmd] - The Commander command, unused. Kept for symmetry with the other handlers.
 *
 * @returns {Promise<boolean>} `true` on success, `false` on failure.
 */
const handleInteractive = async (options = {}, _cmd) => {
    logger.info(`App version: ${appVersion}`);

    return runCommand(
        'INTERACTIVE MAIN 11',
        async () => {
            if (options.selfTest) {
                return runSelfTestUnlessCancelled();
            }

            // Fail fast rather than blocking on a stdin that will never
            // deliver. A wizard hanging inside a scheduled container run is an
            // outage, not a cosmetic problem, so this is checked before
            // anything else happens.
            assertInteractiveCapable();

            // Placeholder until the browser wizards land. Deliberately not a
            // menu over an empty registry, which would be a worse lie than
            // saying plainly that there is nothing to run yet.
            logger.info(
                'Interactive wizards are not available in this build. Run "butler-sheet-icons interactive --self-test" to check what this terminal supports.'
            );

            return true;
        },
        // The guidance from assertInteractiveCapable is already a complete
        // explanation, so print it alone. The default handler would add the
        // error twice more and a stack trace, which is the noise issue #785
        // was about.
        (err) => {
            logger.error(err.message);
        }
    );
};

/**
 * Build the `interactive` command.
 *
 * A separate top-level `Command` with no required options, which is what lets
 * it sidestep the mandatory-option problem entirely: Commander checks for
 * missing mandatory options before any action handler runs, so putting an
 * interactive flag on a leaf command would hard-fail before reaching any
 * interactive code. Nothing about any existing command's parsing changes.
 *
 * @returns {Command} The configured command.
 */
export const buildInteractiveCommand = () => {
    const command = new Command('interactive');

    command
        .description(
            'Answer questions instead of assembling a command line.\nButler Sheet Icons asks what it needs, checks each answer as it is given, and shows the equivalent command line before running anything.'
        )
        .action(handleInteractive)
        .addOption(
            // Hidden because it is a diagnostic, not a feature: it exists to be
            // named in a support reply ("run this and paste the output") rather
            // than found in --help.
            new Option(
                '--self-test',
                'Report what this terminal supports and render every prompt type, without connecting to anything.'
            ).hideHelp()
        );

    return command;
};

export { handleInteractive };
