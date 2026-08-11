import { Option } from 'commander';

/**
 * The flags the interactive option is declared with.
 *
 * `-i` is free across the whole CLI: the only option in `src/` occupying a short
 * slot is `--log-level, --loglevel`, which is a dual-*long* declaration Commander
 * happens to store in the short position. Nothing collides.
 */
export const INTERACTIVE_OPTION_FLAGS = '-i, --interactive';

/** The long flag, used to recognise the option again once it is on a command. */
export const INTERACTIVE_OPTION_LONG = '--interactive';

/** The key Commander stores the option under. */
export const INTERACTIVE_OPTION_ATTRIBUTE = 'interactive';

/**
 * Whether an option is the interactive flag.
 *
 * Matched on the long flag rather than on identity, because the option is
 * re-created by every call to a command builder and the command tree is rebuilt
 * several times per process - once for the real parse, and once more each time
 * `everyLeafCommand()` walks the builders.
 *
 * @param {import('commander').Option} option - The option to test.
 *
 * @returns {boolean} True for the interactive flag.
 */
export const isInteractiveOption = (option) => option?.long === INTERACTIVE_OPTION_LONG;

/**
 * Add `-i, --interactive` to a command.
 *
 * A shared helper rather than a hand-written option on each command, so the
 * flags, the description and the storage key cannot drift between the commands
 * that offer it.
 *
 * Only commands with a registered wizard get this. `registry.test.js` asserts
 * the two lists agree, so a command cannot advertise `-i` and then fail to find
 * a wizard for itself at run time.
 *
 * @param {import('commander').Command} command - The command to extend.
 *
 * @returns {import('commander').Command} The same command, for chaining.
 */
export const addInteractiveOption = (command) =>
    command.addOption(
        new Option(
            INTERACTIVE_OPTION_FLAGS,
            'Answer questions instead of assembling a command line.\nOptions already supplied - here or through their BSI_* environment variables - are kept and not asked about again.'
        )
    );
