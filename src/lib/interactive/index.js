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
import { formatReviewTable } from './review-table.js';
import { saveEnvFile, ENV_FILE } from './save-env-file.js';

/** What the review step can decide. */
const REVIEW_CHOICES = [
    { name: 'Run it', value: 'run' },
    { name: 'Start over', value: 'restart' },
    { name: `Save the answers to ${ENV_FILE}`, value: 'save' },
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

    // The table first, because it answers "what is about to happen" in terms of
    // the thing being changed. The command line answers "how would I repeat
    // this", which is the second question, not the first.
    const summary = formatReviewTable(specs, answers);

    if (summary) {
        runtime.write(`\n${summary}`);
    }

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
 * @param {string} [args.cwd] - Directory a saved `.env` is written to. Injectable for tests.
 *
 * @returns {Promise<boolean>} `true` when the command ran and succeeded, when the user cancelled, or
 *     when the wizard's `precheck` declined to start.
 */
export const runInteractive = async ({
    path,
    presetOptions = {},
    runtime = defaultRuntime,
    cwd = process.cwd(),
} = {}) => {
    const wizard = await loadWizard(path);

    // Asked before anything at all is printed, because a wizard with no valid
    // answer to offer must not first announce itself and then bail.
    //
    // Optional, and only a wizard can implement it: `resolveChoices` cannot tell
    // "nothing to do" from "could not find out what there is to do", and treats
    // both as a reason to offer free text. That is right for the app and
    // collection pickers, where an empty list means a tag matched nothing and
    // typing an id by hand is a genuine escape - and wrong for `browser
    // uninstall`, where an empty cache means there is no answer that can
    // succeed (issue #1013).
    //
    // Returns `undefined` to carry on, or `{ reason }` to stop. Stopping is not
    // a failure: nothing was asked for, so nothing failed, and the exit code
    // stays 0 exactly as it does for `browser list-installed` on the same
    // machine.
    const stop = await wizard.precheck?.();

    if (stop) {
        logger.info(stop.reason);

        return true;
    }

    const command = leafCommandAt(path);
    const symbols = getSymbols();
    const theme = buildTheme({ symbols });

    // Derived from the command every time, so a newly added option is asked
    // about without anyone editing the wizard.
    const specs = specsFromCommand(command);

    // Named by flag rather than by storage key, because the flag is what the
    // user typed. Secrets are named but never shown.
    const prefilled = specs
        .filter((spec) => spec.key in presetOptions)
        .map((spec) => spec.option?.long ?? spec.key);

    // Said once, up front. There is no way back to a previous question - the
    // prompt library has no such gesture - so the two things a user can do
    // instead have to be discoverable before they need them, not after.
    runtime.write(
        `\n${theme.style.help('Ctrl+C cancels. Nothing is changed until you confirm at the end, where you can also start over.')}\n`
    );

    if (prefilled.length > 0) {
        runtime.write(
            `${theme.style.help(`Already supplied, so not asked about again: ${prefilled.join(', ')}.`)}\n`
        );
    }

    for (;;) {
        const refined = wizard.refine ? wizard.refine(specs, { answers: presetOptions }) : specs;

        // Anything already given on the command line or through a BSI_*
        // environment variable is an answer, not a question. Dropped here rather
        // than in `refine`, so every wizard composes with `-i` without having to
        // remember to.
        const asked = refined.filter((spec) => !(spec.key in presetOptions));

        const raw = await askQuestions(
            // Seeded with what is already known, so a later `when` or `choices`
            // sees the pre-filled answers as well as the typed ones.
            asked,
            { symbols, theme, answers: { ...presetOptions } },
            { runtime }
        );
        const answers = {
            ...presetOptions,
            ...(wizard.finalize ? wizard.finalize(raw, { specs }) : raw),
        };

        let decision;

        // Inner loop, so saving returns to the review rather than to the first
        // question. Saving is a step on the way to running, not an alternative
        // to it - being made to answer everything again in order to run what was
        // just described would be absurd.
        for (;;) {
            decision = await review({ path, specs, answers, runtime, theme, symbols });

            if (decision !== 'save') {
                break;
            }

            // Saving is optional, so a filesystem that will not cooperate must
            // not cost the operator the answers they have just given. Without
            // this, a read-only directory unwinds all the way out of the wizard
            // through runCommand and every answer is lost - for a step they
            // could have skipped.
            let saved;

            try {
                saved = await saveEnvFile({
                    commandPath: path,
                    specs,
                    answers,
                    runtime,
                    theme,
                    cwd,
                });
            } catch (err) {
                runtime.write(
                    `\n  ${symbols.failed} Could not save: ${err?.message ?? err}\n  ${theme.style.help('Your answers are still here - choose Run it, or try saving again.')}\n`
                );

                continue;
            }

            runtime.write(
                saved.saved
                    ? `\n  ${symbols.done} Saved to ${saved.path}${saved.includedSecrets ? '' : ' (credentials left out)'}${saved.backupPath ? `\n  ${symbols.done} Previous contents kept in ${saved.backupPath}` : ''}\n`
                    : `\n  ${symbols.failed} Not saved. ${ENV_FILE} was left as it was.\n`
            );

            if (saved.saved && saved.superseded?.length > 0) {
                // The old block is still in the file and no longer has any
                // effect. Left alone rather than rewritten, because rewriting a
                // value that spans lines means guessing where it ends - but the
                // operator should know it is there.
                runtime.write(
                    `  ${theme.style.help(`${saved.superseded.join(', ')} already had a value spanning several lines. It was left untouched and the new value added below it, so the old block is now dead text you may want to remove.`)}\n`
                );
            }
        }

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
        const ok = result !== false;

        runtime.write(
            `\n${ok ? `${symbols.done} Done` : `${symbols.failed} The run reported a failure - the log above says which apps and why`}\n`
        );

        return ok;
    }
};
