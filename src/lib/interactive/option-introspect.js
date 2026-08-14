import { BSI_SECRET_KEYS } from '../util/redact-secrets.js';
import { fromOption, validateEntries } from './validators.js';
import { isInteractiveOption } from './interactive-option.js';

const SECRET_KEYS = new Set(BSI_SECRET_KEYS.map((key) => key.toLowerCase()));

/**
 * @typedef {object} QuestionSpec
 * @property {string} key - Options-bag key. Always `option.attributeName()`, or `_`-prefixed when synthetic.
 * @property {string} type - One of the types `prompt-runtime.js` can render.
 * @property {string} message - The question itself.
 * @property {string} [hint] - Supporting detail, shown but not part of the question.
 * @property {unknown} [default] - Pre-filled answer.
 * @property {Array|Function} [choices] - Fixed list, or `(ctx) => Promise<Array>` for live data.
 * @property {Function} [validate] - `(value) => true|string`.
 * @property {Function} [when] - `(ctx) => boolean`. Skips the question when false.
 * @property {boolean} required - Whether an answer must be supplied.
 * @property {boolean} variadic - Whether the option takes several values.
 * @property {boolean} secret - Whether the answer must never be echoed.
 * @property {string} [group] - Section heading this question belongs under.
 * @property {string[]} [needs] - Keys that must be answered before this one.
 * @property {QuestionSpec} [fallback] - Used when an async `choices` throws.
 * @property {string[]} [replaces] - Real option keys a synthetic question collects between them, so
 *     the wizard knows a value supplied for one of them is asked about rather than skipped.
 * @property {boolean} [checkOnly] - Set by the driver on a question whose answer was already
 *     supplied but which carries a `probe`. The probe runs where the question would have been
 *     asked; only if it fails is the question put to the user after all.
 * @property {string[]} [checks] - Option keys this question's `probe` verifies, when it covers more
 *     than its own. A probe needing two answers hangs off the second of them, so the question it is
 *     attached to is not the whole of what it checks. Defaults to `[key]`.
 * @property {import('commander').Option} [option] - The option this was derived from.
 */

/**
 * Whether an option is declared as `--flag <true|false>` or `--flag [true|false]`.
 *
 * These are the trap in this codebase: they are *string* options carrying
 * boolean* defaults, so `--secure` is `true` when defaulted and `'true'` when
 * supplied. Asking the question as a confirm is right for the user; converting
 * the answer back to the string form is what keeps the wizard's options bag
 * identical to the CLI's.
 *
 * The optional-argument form matters as much as the required one. `browser
 * check` declares `--skip-launch [true|false]` so that Commander passes an
 * environment variable's *value* to the parser rather than setting the flag on
 * the variable's mere presence - which is what made
 * `BSI_BROWSER_C_SKIP_LAUNCH=false` turn skip-launch on. Matching only the
 * angle-bracket form classified that option as free text, so the wizard would
 * have asked for a boolean with an input prompt.
 *
 * @param {import('commander').Option} option - The option to test.
 *
 * @returns {boolean} True for a `<true|false>` or `[true|false]` option.
 */
export const isTrueFalseOption = (option) =>
    option.flags.includes('<true|false>') || option.flags.includes('[true|false]');

/**
 * Split a description into the question and its supporting detail.
 *
 * Descriptions in this codebase are written as a first sentence followed by
 * usage notes, often across several lines. The first sentence reads as the
 * question; the rest is worth showing but would make a poor prompt.
 *
 * @param {string} description - The option's description.
 *
 * @returns {{message: string, hint: string|undefined}} Question and hint.
 */
export const splitDescription = (description = '') => {
    const text = String(description).trim();
    const firstLine = text.split('\n')[0].trim();

    // A sentence ends at .?! only when what follows starts a new sentence, and
    // when the full stop is not part of an abbreviation. Both halves are
    // needed: taking the first full stop turns "Browser build to uninstall: an
    // exact build id (e.g. "151.0.7922.77"), or ..." into a question ending at
    // "(e.g.", which is worse than not splitting at all.
    const sentenceEnd = /[.?!](?=\s+["(A-Z]|$)/g;
    let end = -1;
    let match;

    while ((match = sentenceEnd.exec(firstLine)) !== null) {
        const candidate = firstLine.slice(0, match.index + 1);

        if (/\b(?:e\.g|i\.e|etc|vs|approx|no|fig)\.$/i.test(candidate)) {
            continue;
        }

        end = match.index + 1;
        break;
    }

    const message = (end > 0 ? firstLine.slice(0, end) : firstLine).trim();
    const hint = text.slice(message.length).trim();

    return { message: message || text, hint: hint || undefined };
};

/**
 * Choose the prompt type for an option.
 *
 * Note what is deliberately absent: numeric options do not become `number`
 * prompts. A number prompt answers with a JavaScript number, while the CLI
 * stores the string the user typed - `--pagewait 7` is `'7'`, not `7`. Asking
 * as text and validating with the option's own parser keeps the two identical.
 *
 * @param {import('commander').Option} option - The option to classify.
 * @param {string} key - The option's attribute name.
 *
 * @returns {string} A type `prompt-runtime.js` understands.
 */
const typeForOption = (option, key) => {
    if (option.isBoolean() || isTrueFalseOption(option)) {
        return 'confirm';
    }

    if (SECRET_KEYS.has(key.toLowerCase())) {
        return 'password';
    }

    if (option.argChoices) {
        return option.variadic ? 'checkbox' : 'select';
    }

    return option.variadic ? 'list' : 'input';
};

/**
 * Work out the answer a question should start with.
 *
 * Environment first, matching Commander, which checks `envVar in process.env`
 * rather than testing for a value. A set-but-empty variable therefore beats
 * `.default()` on the command line, and the wizard has to agree with that or it
 * will quietly propose something a real run would not use.
 *
 * @param {import('commander').Option} option - The option.
 * @param {object} env - Environment to read.
 *
 * @returns {unknown} The default answer.
 */
const defaultForOption = (option, env) => {
    if (option.envVar && option.envVar in env) {
        return env[option.envVar];
    }

    return option.defaultValue;
};

/**
 * Derive one question from one Commander option.
 *
 * @param {import('commander').Option} option - The option to derive from.
 * @param {object} [context] - Derivation context.
 * @param {object} [context.env] - Environment to read defaults from.
 *
 * @returns {QuestionSpec} The derived question.
 */
export const specFromOption = (option, { env = process.env } = {}) => {
    // The authoritative key. This codebase mixes run-together names
    // (`tenanturl`, `apikey`) with hyphenated ones Commander camel-cases
    // (`skip-login` -> `skipLogin`), and gets it wrong by hand often enough
    // that issue #890 exists. attributeName() is never wrong.
    const key = option.attributeName();
    const type = typeForOption(option, key);
    const { message, hint } = splitDescription(option.description);
    const defaultValue = defaultForOption(option, env);

    const spec = {
        key,
        type,
        message,
        hint,
        default: defaultValue,
        // `mandatory` alone is not the question. Three options in this codebase
        // are mandatory *and* carry a default, so the missing-mandatory check
        // can never fire for them - `browser uninstall --browser` defaults to
        // 'chrome'. What matters to a prompt is whether the user must supply
        // something, which is only true with nothing to fall back on.
        required:
            option.mandatory === true &&
            option.defaultValue === undefined &&
            !(option.envVar && option.envVar in env),
        variadic: Boolean(option.variadic),
        secret: SECRET_KEYS.has(key.toLowerCase()),
        option,
    };

    if (option.argChoices) {
        spec.choices = [...option.argChoices];
    }

    if (type === 'confirm') {
        // A confirm answers with a real boolean either way. For the
        // `<true|false>` string options the conversion back happens in
        // to-cli-options, where the emitted token has to be the string.
        spec.default = defaultValue === true || defaultValue === 'true';
    } else if (option.variadic) {
        spec.validate = validateEntries(option);
    } else {
        const validate = fromOption(option);
        if (validate) {
            spec.validate = validate;
        }
    }

    return spec;
};

/**
 * Derive every question for a command.
 *
 * This is what makes "adding a CLI option gets a prompt for free" true rather
 * than aspirational: nothing here is hand-maintained, so a new option is a new
 * question the moment it is declared.
 *
 * @param {import('commander').Command} command - The command to derive from.
 * @param {object} [context] - Derivation context.
 * @param {object} [context.env] - Environment to read defaults from.
 *
 * @returns {QuestionSpec[]} One question per option, in declaration order.
 *
 * @throws {Error} If two options on the command would store under the same key.
 */
export const specsFromCommand = (command, { env = process.env } = {}) => {
    const specs = command.options
        // The flag that opened the wizard is not one of the wizard's questions.
        // Left in, it becomes a confirm reading "Answer questions instead of
        // assembling a command line?", and - worse - `--interactive` is emitted
        // into the echoed command line, so the line the wizard tells you to
        // reuse would re-enter the wizard rather than run the command.
        .filter((option) => !isInteractiveOption(option))
        .map((option) => specFromOption(option, { env }));
    const seen = new Set();

    for (const spec of specs) {
        if (seen.has(spec.key)) {
            // Two options writing to one key means one of them can never be
            // read. Better to fail loudly here than to prompt twice for a value
            // only one of which survives.
            throw new Error(
                `Interactive: command "${command.name()}" has two options storing under "${spec.key}".`
            );
        }
        seen.add(spec.key);
    }

    return specs;
};
