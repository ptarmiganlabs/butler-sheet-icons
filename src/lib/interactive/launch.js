import { logger } from '../../globals.js';
import { runCommand } from '../commands/run-command.js';
import { assertInteractiveCapable } from './tty.js';
import { isPromptCancellation } from './prompt-runtime.js';
import { runInteractive } from './index.js';
import { isInteractiveOption } from './interactive-option.js';
import { rejectedOptionValues } from './mandatory-relaxation.js';

/**
 * Every option the user actually supplied, with its value and where it came from.
 *
 * One definition of "supplied", read once. The two exported maps below are keyed
 * identically by construction, which matters: the wizard looks a value up in one
 * and its origin in the other, and a key present in only one would name an option
 * with no origin - or leave a supplied value unexplained.
 *
 * `getOptionValueSource()` is Commander's own record of where each value came
 * from, so no guessing is involved. Only `cli` and `env` count as supplied - a
 * `default` is what the wizard would offer as a pre-filled answer anyway, and
 * skipping those would hide most of the questions behind values the user never
 * chose.
 *
 * A value the parse refused is not supplied either, however it arrived. It sits
 * on the command because the relaxation kept it there, but it is not an answer
 * the run could use, and treating it as one would hide the question behind a
 * value that is about to fail. Those go to the wizard separately, through
 * {@link rejectedOptionsFrom}, so they can be asked about and explained.
 *
 * @param {import('commander').Command} command - The parsed command.
 *
 * @returns {Array<[string, {value: unknown, source: string}]>} One entry per supplied option.
 */
const suppliedEntries = (command) => {
    const entries = [];
    const rejected = rejectedOptionValues(command);

    for (const option of command?.options ?? []) {
        // The flag that started the wizard is not an answer to anything, and
        // must never reach the options bag or the echoed command line - a line
        // carrying --interactive would re-enter the wizard when pasted back.
        if (isInteractiveOption(option)) {
            continue;
        }

        const key = option.attributeName();
        const source = command.getOptionValueSource(key);

        if ((source === 'cli' || source === 'env') && !(key in rejected)) {
            entries.push([key, { value: command.getOptionValue(key), source }]);
        }
    }

    return entries;
};

/**
 * The answers a wizard should start from, taken from what was already supplied.
 *
 * This is what makes `-i` compose rather than merely exist:
 * `bsi qseow create-sheet-thumbnails --host sense.acme.com -i` should ask for
 * everything *except* the host.
 *
 * @param {import('commander').Command} command - The parsed command.
 *
 * @returns {object} Answers keyed by option attribute name.
 */
export const presetOptionsFrom = (command) =>
    Object.fromEntries(suppliedEntries(command).map(([key, { value }]) => [key, value]));

/**
 * Where each supplied answer came from, `cli` or `env`.
 *
 * Read from Commander rather than inferred: `globals.js` loads `.env` into
 * `process.env`, so testing whether an option's `BSI_*` variable is set cannot
 * tell a value that came from the file apart from one typed on the command line
 * that happens to have a stale variable behind it. That is precisely the case an
 * operator needs named correctly, because it is the one they will otherwise
 * misdiagnose.
 *
 * @param {import('commander').Command} command - The parsed command.
 *
 * @returns {object} `cli` or `env` per option attribute name, for supplied options only.
 */
export const presetSourcesFrom = (command) =>
    Object.fromEntries(suppliedEntries(command).map(([key, { source }]) => [key, source]));

/**
 * The supplied values the parse refused, for the wizard to ask about.
 *
 * Recorded by the relaxation that let the parse survive them (see
 * `relaxMandatoryOptionsIfInteractive`), and read back here so the wizard opens
 * each such question on the refused value and says why it is being asked.
 *
 * @param {import('commander').Command} command - The parsed command.
 *
 * @returns {object} `{ value, message, source }` per option attribute name, refused values only.
 */
export const rejectedOptionsFrom = (command) => rejectedOptionValues(command);

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
                    presetSources: presetSourcesFrom(command),
                    rejectedOptions: rejectedOptionsFrom(command),
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
