import { BSI_SECRET_KEYS } from '../util/redact-secrets.js';
import { emissionsFor } from './to-cli-options.js';

const SECRET_KEYS = new Set(BSI_SECRET_KEYS.map((key) => key.toLowerCase()));

/** Written in place of a secret's value when secrets are not being saved. */
export const SECRET_PLACEHOLDER = '<set this yourself>';

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
                `${spec.option.envVar}=${includeSecrets ? answers[spec.key] : SECRET_PLACEHOLDER}`
            );
            continue;
        }

        if (!emitted) {
            continue;
        }

        const answer = answers[spec.key];
        const value = Array.isArray(answer) ? answer.join(',') : String(answer);

        lines.push(`${spec.option.envVar}=${value}`);
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
