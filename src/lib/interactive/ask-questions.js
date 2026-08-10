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

/**
 * Build the configuration one prompt type expects.
 *
 * @param {import('./option-introspect.js').QuestionSpec} spec - The question.
 * @param {Array|undefined} choices - Resolved choices.
 * @param {object} theme - Prompt theme.
 *
 * @returns {object} Configuration for the runtime.
 */
const configFor = (spec, choices, theme) => {
    // The hint is deliberately NOT folded into the message. Several option
    // descriptions in this codebase run to three or four sentences, and
    // appending them produced a prompt several lines long with the actual
    // question lost at the front of it. The driver prints the hint on its own
    // dimmed line instead, where it reads as supporting detail rather than as
    // part of what is being asked.
    const config = { message: spec.message, theme };

    if (spec.type === 'confirm') {
        config.default = Boolean(spec.default);

        return config;
    }

    if (spec.type === 'checkbox') {
        const chosen = new Set(splitEntries(spec.default).map(String));

        config.choices = (choices ?? []).map((choice) =>
            typeof choice === 'object' && choice !== null
                ? { ...choice, checked: chosen.has(String(choice.value)) }
                : { value: choice, name: String(choice), checked: chosen.has(String(choice)) }
        );
        if (spec.validate) config.validate = spec.validate;

        return config;
    }

    if (spec.type === 'select') {
        config.choices = choices ?? [];
        if (spec.default !== undefined && spec.default !== '') config.default = spec.default;

        return config;
    }

    if (spec.type === 'search') {
        // `search` takes a source function rather than a list, so a fixed list
        // is wrapped into one.
        const list = choices ?? [];
        config.source = async (term) =>
            !term
                ? list
                : list.filter((choice) => {
                      const label = typeof choice === 'object' ? choice.name : String(choice);

                      return label.toLowerCase().includes(term.toLowerCase());
                  });

        return config;
    }

    // input, password, list, number
    if (spec.default !== undefined && spec.default !== '') {
        config.default =
            spec.type === 'list' ? splitEntries(spec.default).join(', ') : spec.default;
    }
    if (spec.validate) {
        config.validate =
            spec.type === 'list' ? (value) => spec.validate(splitEntries(value)) : spec.validate;
    }
    if (spec.required && !spec.validate) {
        config.validate = (value) =>
            String(value ?? '').trim().length > 0 ? true : 'This one is required.';
    }

    return config;
};

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
