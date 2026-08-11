import { INTERACTIVE_OPTION_ATTRIBUTE, INTERACTIVE_OPTION_LONG } from './interactive-option.js';

/** Argv words that ask for a wizard. */
const INTERACTIVE_FLAGS = new Set(['-i', INTERACTIVE_OPTION_LONG]);

/**
 * Whether the command line asks for interactive mode.
 *
 * A plain scan, because it has to run *before* Commander parses anything:
 * Commander checks for missing mandatory options before `preAction` hooks and
 * before the action handler, so by the time anything parsed is available the
 * hard failure has already happened.
 *
 * The scan stops at `--`, so words after it are operands and not flags.
 *
 * A literal `-i` appearing as an option *value* before `--` therefore looks like
 * a request for interactive mode when it is not. That false positive is not left
 * standing: see {@link relaxMandatoryOptionsIfInteractive}, which re-checks once
 * the real parse can say whether the flag was actually set.
 *
 * @param {string[]} [argv] - Full argv, including the node and script entries.
 *
 * @returns {boolean} True when `-i` or `--interactive` was asked for.
 */
export const wantsInteractive = (argv = []) => {
    for (const arg of argv.slice(2)) {
        if (arg === '--') {
            return false;
        }

        if (INTERACTIVE_FLAGS.has(arg)) {
            return true;
        }
    }

    return false;
};

/**
 * A command and its ancestors, nearest first.
 *
 * Mirrors what Commander's own missing-mandatory check walks, so the re-check
 * below covers exactly the same options in exactly the same order.
 *
 * @param {import('commander').Command} command - The command to start from.
 *
 * @returns {import('commander').Command[]} The command, then each ancestor.
 */
const commandAndAncestors = (command) => {
    const chain = [];

    for (let cmd = command; cmd; cmd = cmd.parent) {
        chain.push(cmd);
    }

    return chain;
};

/**
 * Let a wizard past Commander's missing-mandatory check, without changing what
 * happens to anybody else.
 *
 * `qseow create-sheet-thumbnails` declares 18 mandatory options, 6 of which have
 * no default and so can actually fail the check. Commander runs that check
 * before `preAction` and before the action handler, so `-i` on a leaf command
 * would be rejected before a single line of interactive code ran. The options
 * are therefore cleared for the duration of the parse.
 *
 * Two things make that safe rather than merely convenient:
 *
 * 1. `makeOptionMandatory(false)` is Commander's own public API for this, and is
 *    in its typings. Nothing here writes to an undocumented field.
 * 2. The relaxation lasts only as long as the parse. The `preAction` hook
 *    restores every option it cleared before any handler runs, so nothing
 *    downstream ever observes a relaxed command. That matters concretely:
 *    `specsFromCommand()` reads `option.mandatory` to decide which questions are
 *    required, and against a still-relaxed command it would quietly decide that
 *    nothing is.
 *
 * The same hook closes the `-i`-as-a-value false positive. Once the parse is
 * done, whether the flag was really set is knowable, and if it was not the
 * missing-mandatory check is re-run by hand - reproducing Commander's message
 * and error code exactly. So for any command line that does not genuinely ask
 * for a wizard, behaviour is identical to not calling this function at all.
 *
 * Called once, on the root program, before `parseAsync`.
 *
 * @param {import('commander').Command} program - The root command.
 * @param {string[]} [argv] - Full argv, including the node and script entries.
 *
 * @returns {boolean} True when the tree was relaxed.
 */
export const relaxMandatoryOptionsIfInteractive = (program, argv = process.argv) => {
    if (!wantsInteractive(argv)) {
        return false;
    }

    /** @type {Map<import('commander').Command, import('commander').Option[]>} */
    const cleared = new Map();

    const relax = (command) => {
        const mandatory = command.options.filter((option) => option.mandatory);

        if (mandatory.length > 0) {
            cleared.set(command, mandatory);

            for (const option of mandatory) {
                option.makeOptionMandatory(false);
            }
        }

        for (const child of command.commands) {
            relax(child);
        }
    };

    relax(program);

    if (cleared.size === 0) {
        return true;
    }

    // One hook on the root covers every command: Commander collects preAction
    // hooks from the acting command and all of its ancestors.
    program.hook('preAction', (_hookedCommand, actionCommand) => {
        // Restore first, and restore everything - not just the branch that ran.
        // From here on the tree is exactly as its builder declared it.
        for (const options of cleared.values()) {
            for (const option of options) {
                option.makeOptionMandatory(true);
            }
        }

        if (actionCommand.opts()[INTERACTIVE_OPTION_ATTRIBUTE]) {
            return;
        }

        // The flag was not really set, so this command line was never entitled
        // to skip the check. Re-run it, reporting exactly what Commander would.
        for (const command of commandAndAncestors(actionCommand)) {
            for (const option of cleared.get(command) ?? []) {
                if (command.getOptionValue(option.attributeName()) === undefined) {
                    command.error(`error: required option '${option.flags}' not specified`, {
                        code: 'commander.missingMandatoryOptionValue',
                    });
                }
            }
        }
    });

    return true;
};
