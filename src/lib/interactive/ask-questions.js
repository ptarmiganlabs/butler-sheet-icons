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
            ...(spec.validate ? { validate: spec.validate } : {}),
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
