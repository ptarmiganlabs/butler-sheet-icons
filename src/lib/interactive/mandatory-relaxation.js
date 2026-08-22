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
 * The invalid-value error Commander would have raised, reproduced for the
 * false-positive path below.
 *
 * Two spellings, because Commander has two: a value typed on the command line is
 * an "argument", a value read from a variable names the variable - and the
 * variable is the one the operator has to go and edit.
 *
 * @param {import('commander').Option} option - The option whose value was refused.
 * @param {unknown} value - The refused value.
 * @param {string} source - Commander's record of where it came from, `cli` or `env`.
 * @param {Error} err - The `InvalidArgumentError` the parser threw.
 *
 * @returns {string} The message, as Commander prints it.
 */
const invalidValueMessage = (option, value, source, err) =>
    source === 'env'
        ? `error: option '${option.flags}' value '${value}' from env '${option.envVar}' is invalid. ${err.message}`
        : `error: option '${option.flags}' argument '${value}' is invalid. ${err.message}`;

/**
 * What each wizard-bound command's parse refused, keyed by the command.
 *
 * A `WeakMap` rather than a property on the command, so nothing is added to
 * Commander's object and the record goes away with the command.
 *
 * @type {WeakMap<import('commander').Command, Record<string, {value: unknown, message: string, source: string}>>}
 */
const rejectionsByCommand = new WeakMap();

/**
 * The supplied values a wizard's own parse refused, so the wizard can ask about
 * them instead of the command dying on them.
 *
 * Empty for a command that was not parsed under the relaxation, or whose values
 * all passed. Keyed by option attribute name, as the wizard's answers are.
 *
 * @param {import('commander').Command} command - The parsed leaf command.
 *
 * @returns {Record<string, {value: unknown, message: string, source: string}>} The
 *     refused value, the parser's message and where the value came from, per option.
 */
export const rejectedOptionValues = (command) => rejectionsByCommand.get(command) ?? {};

/**
 * Let a wizard past Commander's missing-mandatory check and its value parsers,
 * without changing what happens to anybody else.
 *
 * `qseow create-sheet-thumbnails` declares 18 mandatory options, 6 of which have
 * no default and so can actually fail the check. Commander runs that check
 * before `preAction` and before the action handler, so `-i` on a leaf command
 * would be rejected before a single line of interactive code ran. The options
 * are therefore cleared for the duration of the parse.
 *
 * The parsers are relaxed for the same reason. Commander runs each option's
 * `argParser` on the command line *and* on the environment during the parse, and
 * an `InvalidArgumentError` there exits the process - so a stale
 * `BSI_QSEOW_CST_ENGINE_PORT=abc` or a `BSI_QSEOW_CST_HOST` carrying a path in a
 * `.env` file killed `-i` before the wizard that exists to correct such values
 * could open (issue #1148). Instead, for the duration of the parse, a refused
 * value is recorded and kept as it was, and the wizard then asks about it -
 * showing the parser's own message, which is the same text the prompt would
 * have shown had the value been typed there.
 *
 * Two things make that safe rather than merely convenient:
 *
 * 1. `makeOptionMandatory(false)` is Commander's own public API for this, and is
 *    in its typings. `parseArg` is the field `.argParser()` sets, read by
 *    Commander and by the wizard's validator alike. Nothing here writes to an
 *    undocumented field.
 * 2. The relaxation lasts only as long as the parse. The `preAction` hook
 *    restores every option it touched before any handler runs, so nothing
 *    downstream ever observes a relaxed command. That matters concretely:
 *    `specsFromCommand()` reads `option.mandatory` to decide which questions are
 *    required and `option.parseArg` to build their validators, and against a
 *    still-relaxed command it would quietly decide that nothing is required and
 *    nothing needs checking.
 *
 * The same hook closes the `-i`-as-a-value false positive. Once the parse is
 * done, whether the flag was really set is knowable, and if it was not, the
 * first refused value is reported and then the missing-mandatory check re-run by
 * hand - reproducing Commander's messages and error codes exactly, in the order
 * Commander raises them. So for any command line that does not genuinely ask
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

    /** @type {Map<import('commander').Option, Function>} Each wrapped parser, by option. */
    const wrapped = new Map();

    /** @type {Map<import('commander').Option, {value: unknown, err: Error}>} First refusal per option. */
    const refused = new Map();

    const relax = (command) => {
        const mandatory = command.options.filter((option) => option.mandatory);

        if (mandatory.length > 0) {
            cleared.set(command, mandatory);

            for (const option of mandatory) {
                option.makeOptionMandatory(false);
            }
        }

        for (const option of command.options) {
            if (typeof option.parseArg !== 'function') {
                continue;
            }

            const original = option.parseArg;
            wrapped.set(option, original);

            option.parseArg = (value, previous) => {
                try {
                    return original(value, previous);
                } catch (err) {
                    // Only the refusal Commander itself would act on. Anything else
                    // is a parser bug, and hiding it would be worse than the exit.
                    if (err?.code !== 'commander.invalidArgument') {
                        throw err;
                    }

                    if (!refused.has(option)) {
                        refused.set(option, { value, err });
                    }

                    // Kept rather than dropped, so the option still counts as
                    // supplied and the wizard can open its question on the value
                    // being complained about. Never used as a value: the wizard
                    // asks, and the false-positive path below exits first.
                    return value;
                }
            };
        }

        for (const child of command.commands) {
            relax(child);
        }
    };

    relax(program);

    if (cleared.size === 0 && wrapped.size === 0) {
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

        for (const [option, original] of wrapped) {
            option.parseArg = original;
        }

        // The refusals on the path that ran, in Commander's order: the acting
        // command's options before its ancestors', and within a command in
        // declaration order - which is the order Commander parsed them.
        const rejected = [];

        for (const command of commandAndAncestors(actionCommand)) {
            for (const option of command.options) {
                if (refused.has(option)) {
                    const key = option.attributeName();
                    const { value, err } = refused.get(option);

                    rejected.push({
                        key,
                        option,
                        value,
                        err,
                        source: command.getOptionValueSource(key),
                    });
                }
            }
        }

        if (actionCommand.opts()[INTERACTIVE_OPTION_ATTRIBUTE]) {
            rejectionsByCommand.set(
                actionCommand,
                Object.fromEntries(
                    rejected.map(({ key, value, err, source }) => [
                        key,
                        { value, message: err.message, source },
                    ])
                )
            );

            return;
        }

        // The flag was not really set, so this command line was never entitled
        // to skip anything. Re-run both checks, reporting exactly what Commander
        // would - a refused value first, because Commander refuses it while
        // parsing, before it ever looks for missing options.
        if (rejected.length > 0) {
            const { option, value, source, err } = rejected[0];

            actionCommand.error(invalidValueMessage(option, value, source, err), {
                exitCode: err.exitCode,
                code: err.code,
            });
        }

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
