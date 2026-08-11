import { BSI_SECRET_KEYS } from '../util/redact-secrets.js';
import { emissionsFor } from './to-cli-options.js';

const SECRET_KEYS = new Set(BSI_SECRET_KEYS.map((key) => key.toLowerCase()));

/** Written in place of a secret's value when secrets are not being saved. */
export const SECRET_PLACEHOLDER = '<set this yourself>';

/**
 * Quote a value so `dotenv` reads back exactly what went in.
 *
 * Writing values bare is silently lossy, which is worse than noisily broken.
 * Checked against the `dotenv` this repo depends on: `PWD=pass#word` parses as
 * `pass`, because everything from an unquoted `#` is a comment; leading and
 * trailing spaces are stripped; and a value containing a newline splits into a
 * second, bogus `KEY=VALUE` line. A `#` in a password is entirely ordinary, and
 * the resulting failure - authentication rejected on the next run - points
 * nowhere near the saved file.
 *
 * The two quoting styles are not interchangeable, which is the part worth
 * knowing. **Single quotes are fully literal**: `#`, spaces, double quotes and
 * backslashes all survive untouched, and only a single quote cannot appear.
 * **Double quotes** expand `\n` and `\r` but leave backslashes otherwise alone,
 * so they are the only way to carry a newline - and cannot contain a double
 * quote, since `\"` is *not* unescaped.
 *
 * A value containing a newline, a single quote and a double quote therefore
 * cannot be represented at all. That returns undefined so the caller can say so
 * rather than write something that will be read back wrong.
 *
 * @param {unknown} raw - The value to quote.
 *
 * @returns {string|undefined} The quoted value, or undefined when `dotenv` cannot carry it.
 */
export const quoteEnvValue = (raw) => {
    const value = String(raw);

    if (/[\r\n]/.test(value)) {
        // Only double quotes carry a newline, and they cannot carry a `"`.
        return value.includes('"')
            ? undefined
            : `"${value.replaceAll('\r', String.raw`\r`).replaceAll('\n', String.raw`\n`)}"`;
    }

    if (!value.includes("'")) {
        return `'${value}'`;
    }

    return value.includes('"') ? undefined : `"${value}"`;
};

/**
 * Whether a question's answer belongs in a saved `.env`.
 *
 * @param {import('./option-introspect.js').QuestionSpec} spec - The question.
 *
 * @returns {boolean} True when it maps to an option with an environment variable.
 */
const savable = (spec) => Boolean(spec.option?.envVar);

/**
 * Whether a question holds a credential.
 *
 * @param {import('./option-introspect.js').QuestionSpec} spec - The question.
 *
 * @returns {boolean} True for a secret.
 */
const isSecret = (spec) => spec.secret || SECRET_KEYS.has(spec.key.toLowerCase());

/**
 * Render one `NAME=value` line, or a commented explanation when it cannot be one.
 *
 * @param {string} name - The environment variable.
 * @param {unknown} value - The value to write.
 *
 * @returns {string} The line to write.
 */
const assign = (name, value) => {
    const quoted = quoteEnvValue(value);

    return quoted === undefined
        ? `# ${name} could not be written: the value contains a newline, a single quote and a double quote,\n# which dotenv cannot represent. Set it yourself before running.`
        : `${name}=${quoted}`;
};

/**
 * Render a set of answers as the contents of a `.env` file.
 *
 * Nearly free, which is why it is worth having: every option already declares
 * `.env('BSI_…')`, `globals.js` already does `import 'dotenv/config'`, and
 * `.gitignore` already covers `.env`. So a saved file is honoured on the next
 * run with no new loader and no new config format - which is also why a
 * YAML/JSON config was rejected in #886, since that would need a schema,
 * precedence rules, migration and documentation for a marginal gain.
 *
 * Which answers get written is decided by {@link emissionsFor}, the same
 * function behind the options bag and the echoed command line. One rule, three
 * consumers: a saved file therefore reproduces exactly the run the wizard
 * described, rather than approximately.
 *
 * Variadic values are joined with commas rather than spaces. Commander wraps an
 * environment variable in a one-element array **without splitting it**, so a
 * space-separated list would come back as a single value - the trap #895 fixed
 * by giving `--appid` a comma-splitting parser.
 *
 * @param {string} commandPath - Command the answers belong to, named in the header.
 * @param {import('./option-introspect.js').QuestionSpec[]} specs - The questions asked.
 * @param {object} answers - Answers, keyed by spec key.
 * @param {object} [options] - Rendering options.
 * @param {boolean} [options.includeSecrets] - Write credential values rather than a placeholder.
 * @param {object} [options.env] - Environment, as for {@link emissionsFor}.
 *
 * @returns {string} The file contents, ending in a newline.
 */
export const formatEnvFile = (
    commandPath,
    specs,
    answers,
    { includeSecrets = false, env } = {}
) => {
    const lines = [
        '# Butler Sheet Icons',
        `# Settings for: butler-sheet-icons ${commandPath}`,
        '#',
        '# Written by the interactive wizard. Values here are picked up automatically',
        '# on the next run from this directory, so the command can be repeated with no',
        '# options at all.',
        '',
    ];

    const emissions = emissionsFor(specs, answers, { env });
    let wroteSecret = false;

    for (const { spec, emitted } of emissions) {
        if (!savable(spec)) {
            continue;
        }

        if (isSecret(spec)) {
            // A secret is written whenever it was answered, even if it somehow
            // matched a default: leaving it out would produce a file that looks
            // complete and cannot authenticate.
            const answered = answers[spec.key] !== undefined && answers[spec.key] !== '';

            if (!answered) {
                continue;
            }

            wroteSecret = true;
            lines.push(
                includeSecrets
                    ? assign(spec.option.envVar, answers[spec.key])
                    : `${spec.option.envVar}=${quoteEnvValue(SECRET_PLACEHOLDER)}`
            );
            continue;
        }

        if (!emitted) {
            continue;
        }

        const answer = answers[spec.key];

        lines.push(assign(spec.option.envVar, Array.isArray(answer) ? answer.join(',') : answer));
    }

    if (wroteSecret && !includeSecrets) {
        lines.push(
            '',
            '# The credential(s) above were deliberately not written. Replace the',
            '# placeholder, or supply them another way, before running.'
        );
    }

    return `${lines.join('\n')}\n`;
};
