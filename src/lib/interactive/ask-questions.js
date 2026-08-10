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
 * broken in a way no answer can fix. Phase 1 has one such edge, so the ordering
 * is simply declaration order and this asserts the declaration is coherent -
 * five lines that make the property real now, and a graph to sort when phase 2
 * has enough edges to need one.
 *
 * @param {import('./option-introspect.js').QuestionSpec[]} specs - The questions.
 *
 * @returns {void}
 *
 * @throws {Error} If a question needs a key that is not answered before it.
 */
export const assertNeedsAreSatisfiable = (specs) => {
    const seen = new Set();

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
    confirm: (spec) => ({ default: Boolean(spec.default) }),

    checkbox: (spec, choices) => {
        const chosen = new Set(splitEntries(spec.default).map(String));
        const check = (value) => chosen.has(String(value));

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
        config.validate =
            spec.type === 'list' ? (value) => spec.validate(splitEntries(value)) : spec.validate;
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
    assertNeedsAreSatisfiable(specs);

    const symbols = ctx.symbols ?? getSymbols();
    const theme = ctx.theme ?? buildTheme({ symbols });
    const answers = ctx.answers ?? {};
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

        const raw = await runtime.ask(asked, configFor(asked, choices, theme));

        // Answers are written back as we go, so a later question's `when` or
        // `choices` sees everything said so far.
        answers[spec.key] = asked.type === 'list' ? splitEntries(raw) : raw;
    }

    return answers;
};
