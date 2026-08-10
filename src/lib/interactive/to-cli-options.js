import { Command } from 'commander';
import { splitEntries } from './validators.js';

/**
 * @typedef {object} Emission
 * @property {import('./option-introspect.js').QuestionSpec} spec - The question this came from.
 * @property {boolean} emitted - Whether it reaches the command line at all.
 * @property {string[]} tokens - The argv words it contributes, empty when not emitted.
 * @property {string} [reason] - Why it was omitted, for the "show all" view.
 */

/**
 * Whether an answer is indistinguishable from the option's declared default.
 *
 * @param {import('./option-introspect.js').QuestionSpec} spec - The question.
 * @param {unknown} answer - The answer given.
 *
 * @returns {boolean} True when supplying the answer would change nothing.
 */
const matchesDeclaredDefault = (spec, answer) => {
    const declared = spec.option?.defaultValue;

    if (declared === undefined) {
        return false;
    }

    if (spec.option?.variadic) {
        const entries = splitEntries(answer);
        const defaults = Array.isArray(declared) ? declared : [declared];

        return (
            entries.length === defaults.length &&
            entries.every((entry, index) => String(entry) === String(defaults[index]))
        );
    }

    if (spec.type === 'confirm') {
        return Boolean(answer) === (declared === true || declared === 'true');
    }

    return String(answer) === String(declared);
};

/**
 * Turn one answer into the argv words it contributes.
 *
 * @param {import('./option-introspect.js').QuestionSpec} spec - The question.
 * @param {unknown} answer - The answer given.
 *
 * @returns {string[]} Zero or more argv words.
 */
const tokensFor = (spec, answer) => {
    const flag = spec.option.long;

    // A flag that takes no value can only say "true" by being present. Nothing
    // in this codebase declares one defaulting to true, which would need a
    // --no-x form to be expressible at all.
    if (spec.option.isBoolean()) {
        return answer ? [flag] : [];
    }

    if (spec.type === 'confirm') {
        // A <true|false> option is a *string* option. The prompt asks it as a
        // yes/no question because that is the honest question, but the value
        // has to go back as the word the CLI expects.
        return [flag, answer ? 'true' : 'false'];
    }

    if (spec.option.variadic) {
        const entries = splitEntries(answer);

        return entries.length > 0 ? [flag, ...entries.map(String)] : [];
    }

    return [flag, String(answer)];
};

/**
 * Decide what reaches the command line, once, for every consumer.
 *
 * Both the options bag and the echoed command line are built from this, which
 * is what makes them agree by construction rather than by coincidence. Two
 * functions each deciding separately what to include is precisely how an echoed
 * line drifts from the run it claims to describe.
 *
 * Omitting answers equal to their default is a correctness requirement, not
 * tidiness. Several options in this codebase declare a default of a different
 * type* than a supplied value produces - `--pagewait` defaults to the number
 * `5` but stores the string `'7'` when given, and `--secure` defaults to the
 * boolean `true` but stores `'false'` when given. Emitting a defaulted value
 * explicitly would therefore change its type, and the wizard's bag would stop
 * matching the CLI's.
 *
 * An option whose environment variable is currently set is always emitted, even
 * when the answer matches the declared default. That keeps the printed line
 * reproducible somewhere else: without it, a line pasted into a scheduler on
 * another machine would silently pick up different values.
 *
 * @param {import('./option-introspect.js').QuestionSpec[]} specs - The questions asked.
 * @param {object} answers - Answers, keyed by spec key.
 * @param {object} [context] - Context.
 * @param {object} [context.env] - Environment to consult. Defaults to `process.env`.
 *
 * @returns {Emission[]} One entry per spec, in order.
 */
export const emissionsFor = (specs, answers, { env = process.env } = {}) =>
    specs.map((spec) => {
        const notEmitted = (reason) => ({ spec, emitted: false, tokens: [], reason });

        // Synthetic questions - "how do you want to pick apps?" - exist to
        // shape the conversation and correspond to no option at all.
        if (spec.key.startsWith('_') || !spec.option) {
            return notEmitted('synthetic');
        }

        if (!(spec.key in answers)) {
            return notEmitted('not asked');
        }

        const answer = answers[spec.key];

        if (answer === undefined || answer === null) {
            return notEmitted('no answer');
        }

        const envIsSet = Boolean(spec.option.envVar && spec.option.envVar in env);

        if (!envIsSet && matchesDeclaredDefault(spec, answer)) {
            return notEmitted('same as default');
        }

        const tokens = tokensFor(spec, answer);

        return tokens.length > 0
            ? { spec, emitted: true, tokens }
            : notEmitted('nothing to express');
    });

/**
 * Build the argv words for a set of answers.
 *
 * @param {import('./option-introspect.js').QuestionSpec[]} specs - The questions asked.
 * @param {object} answers - Answers, keyed by spec key.
 * @param {object} [context] - Context, as for {@link emissionsFor}.
 *
 * @returns {string[]} The argv words, in spec order.
 */
export const tokensFrom = (specs, answers, context) =>
    emissionsFor(specs, answers, context).flatMap((emission) => emission.tokens);

/**
 * Convert answers into the options bag Commander itself would produce.
 *
 * Commander does the conversion, rather than this module reimplementing it.
 * That is deliberate and it is the whole correctness argument: the storage
 * rules are subtle enough that a second implementation would drift. Verified
 * against the real parser, a variadic option yields an array whether it carries
 * `.choices()`, a custom `argParser`, or neither; a numeric option stores the
 * string typed but the number declared; and a `<true|false>` option stores a
 * string when supplied and a boolean when defaulted. Reproducing all of that by
 * hand is how a wizard becomes a second way to produce a bare string where the
 * CLI produces an array - the trap described in issue #872.
 *
 * `parseOptions()` is used rather than `parse()` for one specific reason: it
 * populates values identically but skips the missing-mandatory check, so no
 * `option.mandatory` has to be written to. It also does not apply environment
 * variables, which is exactly why {@link emissionsFor} emits any option whose
 * env var is set - with those explicit on the command line, the two agree.
 *
 * @param {import('./option-introspect.js').QuestionSpec[]} specs - The questions asked.
 * @param {object} answers - Answers, keyed by spec key.
 * @param {object} [context] - Context, as for {@link emissionsFor}.
 *
 * @returns {object} The options bag, shaped exactly as Commander would.
 */
export const answersToOptions = (specs, answers, context) => {
    const probe = new Command();
    probe.exitOverride();

    // The real Option instances, not copies. Values live on the Command, not on
    // the Option, so a throwaway parent cannot disturb the command they came
    // from - the existing option tests in commands.test.js rely on the same
    // property.
    for (const spec of specs) {
        if (spec.option) {
            probe.addOption(spec.option);
        }
    }

    probe.parseOptions(tokensFrom(specs, answers, context));

    return probe.opts();
};
