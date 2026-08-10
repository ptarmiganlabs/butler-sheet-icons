import { logger } from '../../globals.js';
import { leafCommandAt } from './command-tree.js';
import { specsFromCommand } from './option-introspect.js';
import { askQuestions } from './ask-questions.js';
import { answersToOptions } from './to-cli-options.js';
import { formatCommandLine, formatSecretEnvVars } from './render-command-line.js';
import { defaultRuntime } from './prompt-runtime.js';
import { buildTheme } from './theme.js';
import { getSymbols } from './symbols.js';
import { loadWizard } from './registry.js';

/** What the review step can decide. */
const REVIEW_CHOICES = [
    { name: 'Run it', value: 'run' },
    { name: 'Start over', value: 'restart' },
    { name: 'Cancel', value: 'cancel' },
];

/**
 * Show what is about to happen, and ask whether to go ahead.
 *
 * The echoed command line is the highest value-per-line part of the whole
 * feature: it turns the wizard from a one-off convenience into a teaching tool,
 * and gives someone a path from "I clicked through it" to "it runs in my
 * scheduler". Printing it *before* execution means it doubles as the
 * confirmation rather than needing one of its own.
 *
 * @param {object} args - Arguments.
 * @param {string} args.path - Command path.
 * @param {Array} args.specs - The derived specs, used for the command line.
 * @param {object} args.answers - Final answers, keyed by real option name.
 * @param {object} args.runtime - Prompt runtime.
 * @param {object} args.theme - Prompt theme.
 * @param {object} args.symbols - Symbol set.
 *
 * @returns {Promise<string>} `run`, `restart` or `cancel`.
 */
const review = async ({ path, specs, answers, runtime, theme, symbols }) => {
    const line = formatCommandLine(path, specs, answers);
    const envLines = formatSecretEnvVars(specs, answers);

    runtime.write(`\n${symbols.rule.repeat(2)} Review ${symbols.rule.repeat(38)}\n`);
    runtime.write('\n  Equivalent command:\n');
    runtime.write(`  ${line}\n`);

    if (envLines.length > 0) {
        // Putting a credential in a shell command is how it reaches shell
        // history and a scheduler's stored arguments.
        runtime.write('\n  Supply the secrets as environment variables rather than flags:\n');
        for (const envLine of envLines) {
            runtime.write(`  ${envLine.split('=')[0]}=...\n`);
        }
    }

    runtime.write('\n');

    return runtime.ask(
        { key: '_review', type: 'select' },
        { message: 'Ready?', choices: REVIEW_CHOICES, theme }
    );
};

/**
 * Run one wizard, from first question to finished command.
 *
 * @param {object} args - Arguments.
 * @param {string} args.path - Command path, e.g. `browser uninstall`.
 * @param {object} [args.presetOptions] - Answers already known, used as starting values.
 * @param {object} [args.runtime] - Prompt runtime. Injectable for tests.
 *
 * @returns {Promise<boolean>} `true` when the command ran and succeeded, or when the user cancelled.
 */
export const runInteractive = async ({
    path,
    presetOptions = {},
    runtime = defaultRuntime,
} = {}) => {
    const wizard = await loadWizard(path);
    const command = leafCommandAt(path);
    const symbols = getSymbols();
    const theme = buildTheme({ symbols });

    // Derived from the command every time, so a newly added option is asked
    // about without anyone editing the wizard.
    const specs = specsFromCommand(command);

    // Said once, up front. There is no way back to a previous question - the
    // prompt library has no such gesture - so the two things a user can do
    // instead have to be discoverable before they need them, not after.
    runtime.write(
        `\n${theme.style.help('Ctrl+C cancels. Nothing is changed until you confirm at the end, where you can also start over.')}\n`
    );

    for (;;) {
        const asked = wizard.refine ? wizard.refine(specs, { answers: presetOptions }) : specs;
        const raw = await askQuestions(asked, { symbols, theme, answers: {} }, { runtime });
        const answers = {
            ...presetOptions,
            ...(wizard.finalize ? wizard.finalize(raw, { specs }) : raw),
        };

        const decision = await review({ path, specs, answers, runtime, theme, symbols });

        if (decision === 'cancel') {
            logger.info('Cancelled. Nothing was changed.');

            return true;
        }

        if (decision === 'restart') {
            continue;
        }

        const options = answersToOptions(specs, answers);

        runtime.write('\n');

        // Prompting is over, so winston owns the terminal again from here.
        const result = await wizard.run(options);

        return result !== false;
    }
};
