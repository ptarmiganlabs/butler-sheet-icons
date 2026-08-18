import { Option } from 'commander';

/**
 * The flags the dry-run option is declared with. No short flag: `-d` is not
 * obviously "dry run" and short slots are scarce across the CLI's eleven leaf
 * commands.
 */
export const DRY_RUN_OPTION_FLAGS = '--dry-run';

/**
 * The long flag. Aliased rather than spelled again: unlike `-i, --interactive`
 * there is no short form here, so a second literal could only ever drift.
 */
export const DRY_RUN_OPTION_LONG = DRY_RUN_OPTION_FLAGS;

/**
 * The key Commander stores the option under. Exported because a hyphenated
 * long flag camel-cases, and this repo has shipped that bug before:
 * `--skip-login` read as `options.skiplogin` - a key Commander never sets -
 * did nothing at all (#890). Handlers must read `options[DRY_RUN_OPTION_ATTRIBUTE]`
 * or literal `options.dryRun`, never a lowercased variant, and the guard test
 * in `dry-run-guard.test.js` pins the attribute name.
 */
export const DRY_RUN_OPTION_ATTRIBUTE = 'dryRun';

/**
 * Whether an option is the dry-run flag. Matched on the long flag, like
 * `isInteractiveOption`, because command builders re-create their options on
 * every call.
 *
 * @param {import('commander').Option} option - The option to test.
 *
 * @returns {boolean} True for the dry-run flag.
 */
export const isDryRunOption = (option) => option?.long === DRY_RUN_OPTION_LONG;

/**
 * The option prefixes that mean a command has per-sheet exclude/blur rules.
 */
const SHEET_RULE_PREFIXES = ['--exclude-sheet-', '--blur-sheet-'];

/**
 * Whether a command declares exclude or blur rules, and so whether its dry run
 * has any rules to apply.
 *
 * @param {import('commander').Command} command - The command to inspect.
 *
 * @returns {boolean} True when the command carries sheet rules.
 */
const declaresSheetRules = (command) =>
    command.options.some((option) =>
        SHEET_RULE_PREFIXES.some((prefix) => option.long?.startsWith(prefix))
    );

/**
 * Add `--dry-run` to a command.
 *
 * A shared helper, like `addInteractiveOption`, so the flag, description and
 * storage key cannot drift across the commands that offer it. Hand-written
 * copies of the same option are that many chances for the description to disagree.
 *
 * The description is chosen from what the command actually declares. A single
 * fixed string promised that the dry run would "apply every exclude and blur
 * rule" on the two removal commands, which have no such options - and because
 * the doc site's option tables are generated from these declarations, that
 * claim was published to a page whose own prose said the opposite.
 *
 * **Call this after the command's other options are declared**, since the
 * description depends on them. `dry-run-guard.test.js` pins the resulting text
 * for every command, so an early call fails there rather than shipping.
 *
 * Deliberately not an `.env()`-bound option: a dry run is a per-invocation
 * decision made by a person at a keyboard. An ambient BSI_DRY_RUN that a
 * scheduler inherits would turn every scheduled run into a silent no-op - the
 * inverse of the silent surprise this flag exists to prevent.
 *
 * @param {import('commander').Command} command - The command to extend.
 *
 * @returns {import('commander').Command} The same command, for chaining.
 */
export const addDryRunOption = (command) =>
    command.addOption(
        new Option(
            DRY_RUN_OPTION_FLAGS,
            declaresSheetRules(command)
                ? 'Perform every read and decision the real run would - connect, resolve apps, list sheets, apply every exclude and blur rule - but change nothing. Prints the per-sheet plan and exits.'
                : 'Perform every read and decision the real run would - connect, resolve apps, list sheets - but change nothing. Prints the per-sheet plan and exits.'
        )
    );
