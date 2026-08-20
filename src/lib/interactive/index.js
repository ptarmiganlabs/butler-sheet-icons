import { logger } from '../../globals.js';
import { DRY_RUN_OPTION_ATTRIBUTE } from '../commands/dry-run-option.js';
import { leafCommandAt } from './command-tree.js';
import { specsFromCommand } from './option-introspect.js';
import { askQuestions } from './ask-questions.js';
import { answersToOptions } from './to-cli-options.js';
import { formatCommandLine, formatSecretEnvVars } from './render-command-line.js';
import { defaultRuntime } from './prompt-runtime.js';
import { isInterrupted } from '../util/interrupt.js';
import { buildTheme } from './theme.js';
import { getSymbols } from './symbols.js';
import { loadWizard } from './registry.js';
import { formatReviewTable } from './review-table.js';
import { saveEnvFile, ENV_FILE } from './save-env-file.js';
import { openingOn } from './spec-ops.js';
import { extensions } from '#extensions';
import { runBeforeAction } from '../extensions/apply.js';

/** Heading for the checks that run before the first question is asked. */
const CHECKED_UP_FRONT = 'Checking what you supplied';

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
 * @param {object} [args.presetSources] - Where each of those came from, `cli` or `env`, keyed the
 *     same way. Used to name the environment variable behind a value whose check fails.
 * @param {object} [args.runtime] - Prompt runtime. Injectable for tests.
 * @param {string} [args.cwd] - Directory a saved `.env` is written to. Injectable for tests.
 *
 * @returns {Promise<boolean>} `true` when the command ran and succeeded, when the user cancelled, or
 *     when the wizard's `precheck` declined to start.
 */
export const runInteractive = async ({
    path,
    presetOptions = {},
    presetSources = {},
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
    //
    // Given whatever the command line and the environment already supplied,
    // because a precheck that looks at the world has to look at the same part of
    // it the command would: `browser uninstall --browser-cache-dir X -i` must
    // not decide there is nothing to uninstall by inspecting the default cache.
    const stop = await wizard.precheck?.({ answers: presetOptions });

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

    const refined = wizard.refine ? wizard.refine(specs, { answers: presetOptions }) : specs;

    // Anything already given on the command line or through a BSI_* environment
    // variable is an answer, not a question. Dropped here rather than in
    // `refine`, so every wizard composes with `-i` without having to remember
    // to.
    //
    // Computed once rather than per restart: `refine` sees the same specs and
    // the same preset answers every time round the loop, and the banner below
    // has to be built from the result before the first question is asked.
    const kept = refined.filter((spec) => !(spec.key in presetOptions));

    // Two reasons a question survives having been answered already, and one set
    // to hold both, because everything downstream - the filter, the banner, the
    // pre-fill - treats them identically.
    //
    // A question another one **stands in for**. uninstall's picker is keyed
    // `_build` and collects `browser` and `browserVersion` between them, so
    // without this the banner announced that --browser-version would not be
    // asked about and the wizard then asked for exactly that, using that
    // option's help text as the prompt (issue #1013). The Qlik wizards' app
    // picker is the same shape: the question leading to it is synthetic, so
    // dropping the questions it leads to left it announcing itself and then
    // asking nothing at all.
    //
    // A question describing **this run rather than this environment**. A host or
    // a certificate path is a property of the server and stays true; which apps
    // to update, how much of each sheet to capture and which sheets to skip are
    // decisions, and a decision taken once in a .env file should not be taken
    // again silently on every later run. Wizards mark these with `perRun`.
    const alwaysAsk = new Set([
        ...kept.flatMap((spec) => spec.replaces ?? []),
        ...refined.filter((spec) => spec.perRun).map((spec) => spec.key),
    ]);

    // A supplied answer that carries a probe is checked rather than trusted.
    //
    // Not asked - it stays a property of the environment, and re-asking it is
    // the tedium `-i` exists to remove - but the probe is the whole reason the
    // wizard beats the plain CLI: a content library that no longer exists, a
    // stale API key or a moved certificate is reported where it can be fixed,
    // rather than after every other question has been answered and the run
    // confirmed. Skipping the question was skipping the check with it, which is
    // exactly the failure probes were added to prevent (issue #897).
    //
    // Checked in place rather than in a pass before the first question, because
    // a probe reads more than its own answer: `qseowVerifyContentLibraryExists`
    // opens a QRS connection built from the host, the certificates and the
    // credentials. Run up front, against a `.env` supplying only the library
    // name, it would fail on a value that is perfectly good. At its own position
    // in the conversation everything it reads has been answered or supplied.
    const checkOnly = (spec) =>
        spec.key in presetOptions && !alwaysAsk.has(spec.key) && Boolean(spec.probe);

    // Opened on whatever was supplied, so asking again costs a keystroke rather
    // than a retype. Done here rather than in each wizard: the driver is what
    // decided to ask, so it is what owes the pre-fill. A checked question gets
    // it too - if its check fails it becomes a real question, and it should open
    // on the value being complained about.
    const asked = refined
        .filter(
            (spec) => !(spec.key in presetOptions) || alwaysAsk.has(spec.key) || checkOnly(spec)
        )
        .map((spec) =>
            spec.key in presetOptions ? openingOn(spec, presetOptions[spec.key]) : spec
        )
        .map((spec) => (checkOnly(spec) ? { ...spec, checkOnly: true } : spec));

    // A check whose every input was supplied too can run before the first
    // question, and should.
    //
    // The objection to checking everything up front is that a probe reads more
    // than its own answer, so a `.env` supplying only the content library name
    // would fail a check on a value that is fine. That objection is exactly
    // `needs`, and it disappears when those keys were supplied as well - which is
    // the saved-`.env` case this feature is for, and the one the wizard itself
    // creates through "Save the answers to .env".
    //
    // What it buys is the whole point of probing: on a full `.env` the content
    // library check used to fire after the app picker had fetched and listed
    // several hundred apps. Now a library that no longer exists is reported
    // before the first question, and the run becomes "verify the environment,
    // then ask about this run".
    //
    // A question carrying `when` is left where it is regardless: its condition is
    // written against answers that may not have been given yet, and evaluating it
    // early would read a blank.
    const upFront = (spec) =>
        spec.checkOnly && !spec.when && (spec.needs ?? []).every((key) => key in presetOptions);

    // Re-grouped rather than specially cased. Everything downstream - the
    // heading, the probe, the promotion to a real question on failure - already
    // works off order and `group`, so moving these to the front under one heading
    // is the whole change. `specs` is untouched, so the review table and the
    // echoed command line are unaffected.
    const ordered = [
        ...asked.filter(upFront).map((spec) => ({ ...spec, group: CHECKED_UP_FRONT })),
        ...asked.filter((spec) => !upFront(spec)),
    ];

    // Named by flag rather than by storage key, because the flag is what the
    // user typed. Secrets are named but never shown.
    const nameOf = (spec) => spec.option?.long ?? spec.key;
    const supplied = specs.filter((spec) => spec.key in presetOptions);
    const prefilled = supplied.filter((spec) => !alwaysAsk.has(spec.key)).map(nameOf);
    const overridden = supplied.filter((spec) => alwaysAsk.has(spec.key)).map(nameOf);

    // What a failing check needs in order to be actionable: the flag the user
    // typed, and where the value came from. Naming the environment variable
    // matters more than naming the flag here - the value is usually in a `.env`
    // file the operator has not looked at in months, and "which of my settings
    // is this?" is the question they are about to ask.
    //
    // Only the values that were not asked about, because those are the ones the
    // operator has not just seen on screen.
    const suppliedInfo = Object.fromEntries(
        supplied
            .filter((spec) => !alwaysAsk.has(spec.key))
            .map((spec) => [
                spec.key,
                {
                    flag: nameOf(spec),
                    source: presetSources[spec.key],
                    envVar: spec.option?.envVar,
                },
            ])
    );

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

    if (overridden.length > 0) {
        // Deliberately still asked, and the wording has to cover both reasons:
        // a picker over what is really there beats a value remembered from an
        // earlier run, and a decision about this run should not be taken
        // silently by a file. Saying nothing would leave someone who set the
        // value wondering why it was ignored.
        runtime.write(
            `${theme.style.help(`Supplied, but asked about again so you can change it for this run: ${overridden.join(', ')}.`)}\n`
        );
    }

    for (;;) {
        const raw = await askQuestions(
            // Seeded with what is already known, so a later `when` or `choices`
            // sees the pre-filled answers as well as the typed ones.
            ordered,
            { symbols, theme, answers: { ...presetOptions }, supplied: suppliedInfo },
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

        // --dry-run is deliberately not a wizard question (#993), so it has no
        // spec - and answersToOptions builds the bag from specs, which is how
        // the flag used to evaporate here: typing the safety flag alongside -i
        // produced a real, writing run. Carry it through explicitly, and say so
        // out loud, because the review screen cannot show it either.
        if (answers[DRY_RUN_OPTION_ATTRIBUTE] === true) {
            options[DRY_RUN_OPTION_ATTRIBUTE] = true;
            runtime.write(
                '\nDRY RUN: --dry-run is in effect - the run below plans only, nothing will be changed.\n'
            );
        }

        // The authoritative entitlement point for an interactive run, and the reason this call
        // exists at all. The `preAction` hook fired before the first question was asked, when the
        // options bag held `interactive: true` and little else; these are the options the run will
        // actually use. Throwing here aborts before the run starts, which is the same promise the
        // hook makes on an ordinary command line. Does nothing unless this build describes a hook.
        await runBeforeAction(extensions, path, options);

        runtime.write('\n');

        // Prompting is over, so winston owns the terminal again from here.
        const result = await wizard.run(options);
        const ok = result !== false;

        // An interrupted run returns false so the exit code is right, but it
        // did not fail (issue #1107). Saying so here would sit directly under
        // a verdict that just went out of its way to print INTERRUPTED rather
        // than FAILED, and send the operator hunting for broken apps that do
        // not exist.
        let line;
        if (isInterrupted()) {
            line = `${symbols.warning} Stopped - the run card above says which apps were already updated`;
        } else if (ok) {
            line = `${symbols.done} Done`;
        } else {
            line = `${symbols.failed} The run reported a failure - the log above says which apps and why`;
        }

        runtime.write(`\n${line}\n`);

        return ok;
    }
};
