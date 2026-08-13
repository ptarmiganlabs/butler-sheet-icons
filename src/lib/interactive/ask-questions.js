import { logger } from '../../globals.js';
import { defaultRuntime } from './prompt-runtime.js';
import { buildTheme } from './theme.js';
import { getSymbols } from './symbols.js';
import { splitEntries } from './validators.js';
import { withQuietLogging } from './quiet.js';

/**
 * Check that no question depends on an answer it cannot have yet.
 *
 * `needs` is a developer-facing guarantee, not a user-facing one: a wizard that
 * asks which apps to update before asking for the credentials that list them is
 * broken in a way no answer can fix. No phase 1 question declares an edge today -
 * ordering is simply declaration order - so this guards the declarations a later
 * phase adds, and becomes a graph to sort when there are enough edges to need one.
 *
 * A need is satisfied by an answer, not by a question. Anything supplied on the
 * command line or through a BSI_* environment variable is dropped from the
 * questions but is still an answer, so those keys count as already seen -
 * otherwise `bsi browser install --browser chrome -i` would fail this check for
 * having satisfied it.
 *
 * @param {import('./option-introspect.js').QuestionSpec[]} specs - The questions.
 * @param {string[]} [known] - Keys already answered before the first question.
 *
 * @returns {void}
 *
 * @throws {Error} If a question needs a key that is not answered before it.
 */
export const assertNeedsAreSatisfiable = (specs, known = []) => {
    const seen = new Set(known);

    for (const spec of specs) {
        for (const need of spec.needs ?? []) {
            if (!seen.has(need)) {
                throw new Error(
                    `Interactive: question "${spec.key}" needs "${need}", which is not asked before it.`
                );
            }
        }
        seen.add(spec.key);
    }
};

/**
 * Resolve a spec's choices, which may need a network call.
 *
 * @param {import('./option-introspect.js').QuestionSpec} spec - The question.
 * @param {object} ctx - Wizard context.
 *
 * @returns {Promise<{choices: Array|undefined, spec: object}>} Choices, and the spec to actually ask.
 */
const resolveChoices = async (spec, ctx) => {
    if (typeof spec.choices !== 'function') {
        return { choices: spec.choices, spec };
    }

    try {
        // Worker code logs, and a prompt is about to be on screen.
        const choices = await withQuietLogging(() => spec.choices(ctx));

        if (Array.isArray(choices) && choices.length > 0) {
            return { choices, spec };
        }

        if (!spec.fallback) {
            return { choices: choices ?? [], spec };
        }

        logger.debug(`Interactive: no choices available for "${spec.key}", using the fallback.`);

        return { choices: undefined, spec: { ...spec, ...spec.fallback, key: spec.key } };
    } catch (err) {
        if (!spec.fallback) {
            throw err;
        }

        // A network blip must not strand someone halfway through a wizard.
        // Degrading to free text keeps them moving; the value is validated the
        // same way either way.
        logger.debug(`Interactive: could not fetch choices for "${spec.key}": ${err?.message}`);

        return { choices: undefined, spec: { ...spec, ...spec.fallback, key: spec.key } };
    }
};

/**
 * Check an answer against the thing it describes, once it has been given.
 *
 * This is what makes a wrong credential surface at the credential prompt rather
 * than after every other question has been answered - the single biggest
 * usability difference between the wizard and the plain CLI, where a bad API key
 * is discovered only once the run starts.
 *
 * Distinct from `validate`, which judges the text on its own. A probe reaches
 * the network: it opens the connection the answer describes, and is the natural
 * place to stash the resulting client on `ctx.clients` so later questions can
 * list what is actually there instead of asking someone to type an id.
 *
 * Failure is a message, not an exception, because the driver's response is to
 * re-ask rather than to abort.
 *
 * @param {import('./option-introspect.js').QuestionSpec} spec - The question just answered.
 * @param {object} ctx - Wizard context, carrying the answers so far.
 *
 * @returns {Promise<string|undefined>} A message when the probe failed, otherwise undefined.
 */
const runProbe = async (spec, ctx) => {
    try {
        // Worker code logs, and a prompt is about to be on screen again.
        await withQuietLogging(() => spec.probe(ctx));

        return undefined;
    } catch (err) {
        return err?.message ?? String(err);
    }
};

/**
 * Name a supplied value the way the operator will recognise it.
 *
 * The environment variable rather than the flag whenever the value came from one,
 * because that is what has to be edited to fix it - and the file it lives in is
 * usually one nobody has opened in months.
 *
 * @param {object} [info] - What the driver recorded about a supplied value.
 *
 * @returns {string} The flag, and where the value came from when that is known.
 */
const describeSupplied = (info) => {
    if (!info) {
        return '';
    }

    if (info.source === 'env' && info.envVar) {
        return `${info.flag} (from ${info.envVar})`;
    }

    return info.source === 'cli' ? `${info.flag} (from the command line)` : info.flag;
};

/**
 * Report the supplied values a check has just confirmed.
 *
 * One line each, because a probe often covers more than the question it hangs
 * off: `qseowVerifyCertificatesExist` needs both certificate paths, so it cannot
 * run until the second one is known and is therefore attached to `certkeyfile` -
 * but it checks `certfile` just as thoroughly, and a single line naming only the
 * key file under-reports what was verified. A spec says what it covers with
 * `checks`; the default is the question's own key.
 *
 * Only the covered options that were actually supplied are named. One that was
 * answered on screen a moment ago needs no confirmation that it exists - the
 * operator just typed it - and this report is about the values they were not
 * asked about.
 *
 * @param {import('./option-introspect.js').QuestionSpec} spec - The question that was checked.
 * @param {object} ctx - Wizard context, carrying what the driver recorded about supplied values.
 *
 * @returns {string} The lines to write.
 */
const describePassedCheck = (spec, ctx) => {
    const info = ctx.supplied ?? {};
    const covered = (spec.checks ?? [spec.key]).filter((key) => key in info);
    const named = covered.length > 0 ? covered : [spec.key];

    return named
        .map((key) => `  ${ctx.symbols.done} ${describeSupplied(info[key]) || key} checked\n`)
        .join('');
};

/**
 * Report a supplied value that failed its check.
 *
 * Names the other values the check reads, when those were supplied rather than
 * asked about, because the real culprit is often one of them: a wrong `--host`
 * is what makes the content library check fail, and re-typing the library name
 * can never fix it. Without this line the only clue is a message about a value
 * that is perfectly correct.
 *
 * Taken from the question's declared `needs` rather than from everything that
 * was supplied. Naming all of them was the first attempt, and on the `.env`
 * workflow this feature exists for that is two dozen flags wrapped over several
 * rows, pushing the actual error off screen - a list that narrows nothing is
 * worse than no list.
 *
 * @param {import('./option-introspect.js').QuestionSpec} spec - The question that was checked.
 * @param {string} failure - The probe's message.
 * @param {object} ctx - Wizard context, carrying what the driver recorded about supplied values.
 *
 * @returns {string} The block to write.
 */
const describeFailedCheck = (spec, failure, ctx) => {
    const info = ctx.supplied ?? {};
    const others = (spec.needs ?? []).filter((key) => key in info).map((key) => info[key].flag);

    // `theme.style.error` supplies the ✗ itself, so the heading carries it and
    // the two lines below are left plain - three of them in a row reads as three
    // separate failures rather than as one explained.
    const lines = [
        `  ${ctx.theme.style.error(`${describeSupplied(info[spec.key]) || spec.key}:`)}`,
        `    ${failure}`,
    ];

    if (others.length > 0) {
        // Nothing is said when none of them were supplied: everything this check
        // reads was then answered on screen a moment ago, so there is no unseen
        // value to point at.
        //
        // "Uses", not "any of them could be the real cause". Measured against a
        // live QRS: it answers 200 to a `/contentlibrary` GET carrying a
        // nonsense `X-Qlik-User`, so `apiuserdir` and `apiuserid` are read by
        // this check but cannot be what failed it. Naming them as suspects would
        // send an operator to edit values that are fine.
        lines.push(
            `    ${ctx.theme.style.help(`This check also uses these values you supplied: ${others.join(', ')}.`)}`
        );
    }

    return `${lines.join('\n')}\n`;
};

// The text shown for a choice, which may be a bare value or a {name, value}.
const labelOf = (choice) =>
    typeof choice === 'object' && choice !== null ? choice.name : String(choice);

// Whether a default is worth pre-filling.
const hasDefault = (spec) => spec.default !== undefined && spec.default !== '';

/**
 * Per-type configuration, keyed by prompt type.
 *
 * A lookup rather than a chain of conditionals: each prompt's configuration is
 * independent of every other's, and phase 2 adds both types and per-type
 * behaviour to this. An if-chain grows a branch each time; a table grows a row.
 */
const CONFIG_BUILDERS = Object.freeze({
    // A `<true|false>` option is a *string* option, so its supplied value is the
    // word rather than the boolean - and `Boolean('false')` is `true`. Reading
    // it that way pre-filled the prompt with the opposite of what was supplied,
    // which on --secure or --reject-unauthorized silently offers to weaken a TLS
    // setting the operator had deliberately turned off. `to-cli-options` already
    // treats the string 'true' as the true value; this is the same rule on the
    // way in.
    confirm: (spec) => ({
        default: spec.default === true || String(spec.default).toLowerCase() === 'true',
    }),

    checkbox: (spec, choices) => {
        // Case-insensitive, because the values here are frequently GUIDs, which
        // are not case-sensitive and are routinely pasted in upper case. An id
        // that differs only in case would otherwise leave its row unticked, so
        // submitting the list would drop a value the operator had supplied.
        const chosen = new Set(
            splitEntries(spec.default).map((entry) => String(entry).toLowerCase())
        );
        const check = (value) => chosen.has(String(value).toLowerCase());

        return {
            choices: (choices ?? []).map((choice) =>
                typeof choice === 'object' && choice !== null
                    ? { ...choice, checked: check(choice.value) }
                    : { value: choice, name: String(choice), checked: check(choice) }
            ),
            // The prompt hands its validator the *selected choices* - whole
            // objects - while a spec's validator is built from the option's own
            // parser and expects the values. Passing it straight through meant
            // every entry stringified to "[object Object]", so any option with a
            // closed value set could never be answered: ticking `private` on
            // --exclude-sheet-status was rejected with `Entry 1
            // ("[object Object]"): Allowed choices are private, published,
            // public.` and there was no way past the prompt.
            ...(spec.validate
                ? { validate: (picked) => spec.validate(picked.map((choice) => choice.value)) }
                : {}),
        };
    },

    select: (spec, choices) => ({
        choices: choices ?? [],
        ...(hasDefault(spec) ? { default: spec.default } : {}),
    }),

    // `search` takes a source function rather than a list, so a fixed list is
    // wrapped into one.
    search: (spec, choices) => {
        const list = choices ?? [];

        return {
            source: async (term) =>
                term
                    ? list.filter((choice) =>
                          labelOf(choice).toLowerCase().includes(term.toLowerCase())
                      )
                    : list,
        };
    },
});

// input, password, list and number all take text and validate it.
const textConfig = (spec) => {
    const config = {};

    if (hasDefault(spec)) {
        config.default =
            spec.type === 'list' ? splitEntries(spec.default).join(', ') : spec.default;
    }

    if (spec.validate) {
        const validate =
            spec.type === 'list' ? (value) => spec.validate(splitEntries(value)) : spec.validate;

        // An optional option has to be leaveable. `--port` on qseow is the case
        // that showed this up: it takes no default, so the CLI is happy without
        // it, but its parser rejects an empty string - which in a prompt means
        // the question can never be answered and the wizard cannot continue.
        // Blank is how someone says "not this one", and to-cli-options drops it
        // rather than emitting an empty flag value the parser would then refuse.
        config.validate = (value) =>
            !spec.required && String(value ?? '').trim().length === 0 ? true : validate(value);
    } else if (spec.required) {
        config.validate = (value) =>
            String(value ?? '').trim().length > 0 ? true : 'This one is required.';
    }

    return config;
};

/**
 * Build the configuration one prompt type expects.
 *
 * The hint is deliberately NOT folded into the message. Several option
 * descriptions in this codebase run to three or four sentences, and appending
 * them produced a prompt several lines long with the actual question lost at
 * the front of it. The driver prints the hint on its own dimmed line instead,
 * where it reads as supporting detail rather than as part of the question.
 *
 * @param {import('./option-introspect.js').QuestionSpec} spec - The question.
 * @param {Array|undefined} choices - Resolved choices.
 * @param {object} theme - Prompt theme.
 *
 * @returns {object} Configuration for the runtime.
 */
const configFor = (spec, choices, theme) => ({
    message: spec.message,
    theme,
    ...(CONFIG_BUILDERS[spec.type] ?? textConfig)(spec, choices),
});

/**
 * Ask a list of questions and collect the answers.
 *
 * The runtime is injected rather than imported, which is what makes the whole
 * conversation testable without a terminal: a scripted runtime answers from a
 * queue and records what it was asked, so "the app list was fetched with the
 * tenant url the user typed" and "an invalid value was rejected and re-asked"
 * are ordinary assertions rather than pty wrangling.
 *
 * @param {import('./option-introspect.js').QuestionSpec[]} specs - The questions, in order.
 * @param {object} [ctx] - Wizard context, passed to `when` and `choices`.
 * @param {object} [options] - Options.
 * @param {object} [options.runtime] - Prompt runtime. Defaults to the real one.
 *
 * @returns {Promise<object>} Answers, keyed by spec key.
 */
export const askQuestions = async (specs, ctx = {}, { runtime = defaultRuntime } = {}) => {
    const symbols = ctx.symbols ?? getSymbols();
    const theme = ctx.theme ?? buildTheme({ symbols });
    const answers = ctx.answers ?? {};

    assertNeedsAreSatisfiable(specs, Object.keys(answers));
    const context = { ...ctx, answers, symbols, theme, write: runtime.write };

    let currentGroup;

    for (const spec of specs) {
        if (typeof spec.when === 'function' && !spec.when(context)) {
            continue;
        }

        if (spec.group && spec.group !== currentGroup) {
            currentGroup = spec.group;
            const rule = symbols.rule.repeat(Math.max(3, 46 - spec.group.length));
            runtime.write(`\n${symbols.rule.repeat(2)} ${spec.group} ${rule}\n`);
        }

        // Already answered, so check the answer instead of asking for it. The
        // value is in `answers` already - the driver seeds them from what was
        // supplied - so the probe has everything it needs.
        if (spec.checkOnly) {
            runtime.write('\n');

            const failure = await runProbe(spec, context);

            if (!failure) {
                // Said out loud rather than passed over in silence. A probe
                // reaches the network, so the wizard pauses here; without a line
                // the pause has no explanation, and the operator has no way to
                // tell a check that passed from one that never ran.
                runtime.write(describePassedCheck(spec, context));

                continue;
            }

            // Fall through and ask it after all. A value that cannot be used is
            // worth one question however it arrived, and the spec is already
            // opened on the supplied value, so correcting it is an edit rather
            // than a retype. From here it behaves as any other question does.
            runtime.write(describeFailedCheck(spec, failure, context));
        }

        const { choices, spec: asked } = await resolveChoices(spec, context);

        // A blank line between steps. Answered prompts collapse to a single
        // line and stay on screen, so without this the transcript becomes an
        // undifferentiated block in which the question being asked now is hard
        // to pick out from the ones already answered.
        runtime.write('\n');

        if (asked.hint) {
            runtime.write(`  ${theme.style.help(asked.hint)}\n`);
        }

        for (;;) {
            const raw = await runtime.ask(asked, configFor(asked, choices, theme));

            // Answers are written back as we go, so a later question's `when` or
            // `choices` sees everything said so far.
            answers[spec.key] = asked.type === 'list' ? splitEntries(raw) : raw;

            if (!spec.probe) {
                break;
            }

            const failure = await runProbe(spec, context);

            if (!failure) {
                break;
            }

            // Re-ask this question rather than carrying on. A wrong credential
            // has to be reported where it was typed: the alternative is what the
            // CLI does today, failing after every other answer has been given.
            runtime.write(`  ${theme.style.error(failure)}\n`);
        }
    }

    return answers;
};
