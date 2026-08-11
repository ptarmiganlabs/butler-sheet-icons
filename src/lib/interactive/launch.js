import { logger } from '../../globals.js';
import { runCommand } from '../commands/run-command.js';
import { assertInteractiveCapable } from './tty.js';
import { isPromptCancellation } from './prompt-runtime.js';
import { runInteractive } from './index.js';
import { isInteractiveOption } from './interactive-option.js';

/**
 * The answers a wizard should start from, taken from what was already supplied.
 *
 * This is what makes `-i` compose rather than merely exist:
 * `bsi qseow create-sheet-thumbnails --host sense.acme.com -i` should ask for
 * everything *except* the host.
 *
 * `getOptionValueSource()` is Commander's own record of where each value came
 * from, so no guessing is involved. Only `cli` and `env` count as supplied - a
 * `default` is what the wizard would offer as a pre-filled answer anyway, and
 * skipping those would hide most of the questions behind values the user never
 * chose.
 *
 * @param {import('commander').Command} command - The parsed command.
 *
 * @returns {object} Answers keyed by option attribute name.
 */
export const presetOptionsFrom = (command) => {
    const presets = {};

    for (const option of command?.options ?? []) {
        // The flag that started the wizard is not an answer to anything, and
        // must never reach the options bag or the echoed command line - a line
        // carrying --interactive would re-enter the wizard when pasted back.
        if (isInteractiveOption(option)) {
            continue;
        }

        const key = option.attributeName();
        const source = command.getOptionValueSource(key);

        if (source === 'cli' || source === 'env') {
            presets[key] = command.getOptionValue(key);
        }
    }

    return presets;
};

/**
 * Run a leaf command's wizard instead of the command itself.
 *
 * Routed through `runCommand()` so the exit code behaves exactly as it does for
 * every other command, and so a wizard that cannot run fails fast rather than
 * blocking on a stdin that will never deliver.
 *
 * @param {string} logPrefix - Prefix for error lines, matching the command's own.
 * @param {string} path - Command path, e.g. `browser uninstall`.
 * @param {import('commander').Command} command - The parsed command, read for pre-filled answers.
 *
 * @returns {Promise<boolean>} `true` on success or cancellation, `false` on failure.
 */
export const launchInteractive = async (logPrefix, path, command) =>
    runCommand(
        logPrefix,
        async () => {
            // A wizard blocking forever inside a scheduled container run is an
            // outage, not a cosmetic problem, so this is checked before anything
            // else happens.
            assertInteractiveCapable();

            try {
                return await runInteractive({
                    path,
                    presetOptions: presetOptionsFrom(command),
                });
            } catch (err) {
                if (isPromptCancellation(err)) {
                    logger.info('Cancelled. Nothing was changed.');

                    return true;
                }

                throw err;
            }
        },
        // The guidance from assertInteractiveCapable is already a complete
        // explanation, so print it alone rather than following it with the
        // error twice more and a stack trace - the noise issue #785 was about.
        (err) => {
            logger.error(err.message);
        }
    );
