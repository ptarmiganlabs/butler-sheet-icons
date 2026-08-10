import { BSI_SECRET_KEYS } from '../util/redact-secrets.js';
import { emissionsFor } from './to-cli-options.js';

const SECRET_KEYS = new Set(BSI_SECRET_KEYS.map((key) => key.toLowerCase()));

/** Stand-in printed instead of a secret value. */
export const HIDDEN = '<hidden>';

/**
 * How a single quote is expressed inside a single-quoted shell word: close the
 * quote, escape the character, reopen. String.raw so the backslash is literal.
 */
const ESCAPED_SINGLE_QUOTE = String.raw`'\''`;

/**
 * Quote one argv word for a shell, if it needs it.
 *
 * POSIX single-quoting, and only when the word contains something a shell would
 * act on. Over-quoting turns a readable line into a wall of punctuation, which
 * defeats the point of printing it.
 *
 * @param {string} word - The word to quote.
 *
 * @returns {string} The word, quoted if necessary.
 */
export const quoteArg = (word) => {
    const text = String(word);

    if (text.length === 0) {
        return "''";
    }

    if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(text)) {
        return text;
    }

    // Single quotes protect everything except a single quote itself, which has
    // to be closed, escaped and reopened.
    return `'${text.replaceAll("'", ESCAPED_SINGLE_QUOTE)}'`;
};

/**
 * Render the command line equivalent to a set of answers.
 *
 * The highest value-per-line item in the whole feature: it turns the wizard
 * from a one-off convenience into a teaching tool, and gives someone a path
 * from "I clicked through it" to "it runs in my scheduler". It is printed
 * before anything executes, so it doubles as the confirmation step.
 *
 * Secrets are never printed. The list is the same `BSI_SECRET_KEYS` the logger
 * redacts against, so there is one list and two consumers rather than two
 * lists that drift.
 *
 * One line, no shell continuations. The continuation character differs between
 * bash and PowerShell, and a line that is wrong for the reader's shell is worse
 * than a long one.
 *
 * @param {string} commandPath - Space-separated command path, e.g. `browser install`.
 * @param {import('./option-introspect.js').QuestionSpec[]} specs - The questions asked.
 * @param {object} answers - Answers, keyed by spec key.
 * @param {object} [options] - Rendering options.
 * @param {boolean} [options.showAll] - Include answers equal to their default.
 * @param {boolean} [options.redactSecrets] - Replace secret values with a placeholder.
 * @param {string} [options.executable] - Program name to print.
 * @param {object} [options.env] - Environment, as for {@link emissionsFor}.
 *
 * @returns {string} A single-line command.
 */
export const formatCommandLine = (
    commandPath,
    specs,
    answers,
    { showAll = false, redactSecrets = true, executable = 'butler-sheet-icons', env } = {}
) => {
    const words = [executable, ...String(commandPath).split(' ').filter(Boolean)];

    for (const emission of emissionsFor(specs, answers, { env })) {
        const { spec } = emission;

        if (!emission.emitted) {
            // "Show all" reveals defaulted values, but never invents a flag for
            // a question that maps to no option in the first place.
            if (!showAll || emission.reason !== 'same as default' || !spec.option) {
                continue;
            }

            words.push(spec.option.long, String(answers[spec.key]));
            continue;
        }

        const isSecret = spec.secret || SECRET_KEYS.has(spec.key.toLowerCase());

        if (isSecret && redactSecrets) {
            // The flag is still shown: knowing the option is needed is useful,
            // and only the value is dangerous.
            words.push(emission.tokens[0], HIDDEN);
            continue;
        }

        words.push(...emission.tokens);
    }

    return words.map(quoteArg).join(' ');
};

/**
 * Render the environment-variable form for the secrets in a set of answers.
 *
 * Printed alongside the command line, because putting a credential in a shell
 * command is how it ends up in shell history and in a scheduler's stored
 * arguments. Every option in this codebase already declares an env var and
 * `globals.js` already loads `.env`, so this form needs no new machinery.
 *
 * @param {import('./option-introspect.js').QuestionSpec[]} specs - The questions asked.
 * @param {object} answers - Answers, keyed by spec key.
 *
 * @returns {string[]} One `NAME=value` line per secret with an env var, values included.
 */
export const formatSecretEnvVars = (specs, answers) =>
    specs
        .filter(
            (spec) =>
                (spec.secret || SECRET_KEYS.has(spec.key.toLowerCase())) &&
                spec.option?.envVar &&
                answers[spec.key] !== undefined &&
                answers[spec.key] !== ''
        )
        .map((spec) => `${spec.option.envVar}=${answers[spec.key]}`);
