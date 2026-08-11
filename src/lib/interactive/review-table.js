import { table, getBorderCharacters } from 'table';
import { BSI_SECRET_KEYS } from '../util/redact-secrets.js';
import { HIDDEN } from './render-command-line.js';
import { emissionsFor } from './to-cli-options.js';
import { tableBorderName } from './symbols.js';

const SECRET_KEYS = new Set(BSI_SECRET_KEYS.map((key) => key.toLowerCase()));

/** Longest a value may be before it is shortened for the table. */
const MAX_VALUE = 48;

/**
 * Render one answer as a single readable cell.
 *
 * @param {import('./option-introspect.js').QuestionSpec} spec - The question.
 * @param {unknown} answer - The answer given.
 *
 * @returns {string} The cell contents.
 */
export const cellFor = (spec, answer) => {
    if (spec.secret || SECRET_KEYS.has(spec.key.toLowerCase())) {
        return HIDDEN;
    }

    if (Array.isArray(answer)) {
        // A list of app ids is the common case and reads far better as a count
        // plus the first entry than as a wall of GUIDs.
        if (answer.length > 2) {
            return `${answer.length} selected: ${answer[0]}, …`;
        }

        return answer.join(', ');
    }

    if (typeof answer === 'boolean') {
        return answer ? 'yes' : 'no';
    }

    const text = String(answer);

    return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE - 1)}…` : text;
};

/**
 * Render the review table: what is about to happen, in plain terms.
 *
 * Rows come from {@link emissionsFor}, so the table shows exactly what the run
 * will use - the same source as the options bag and the echoed command line.
 * A table built from the raw answers instead would list things the run ignores,
 * which is worse than no table: it would be confidently wrong.
 *
 * Borders follow the terminal's Unicode support through `tableBorderName()`,
 * which picks `norc` box-drawing or pure-ASCII `ramac`. That costs nothing -
 * `table` ships both sets - and is the difference between a tidy summary and
 * mojibake on a Windows Server console.
 *
 * Secrets are shown as a placeholder, never a value, off the same
 * `BSI_SECRET_KEYS` list the logger redacts against.
 *
 * @param {import('./option-introspect.js').QuestionSpec[]} specs - The questions asked.
 * @param {object} answers - Answers, keyed by spec key.
 * @param {object} [options] - Rendering options.
 * @param {object} [options.env] - Environment, as for {@link emissionsFor}.
 *
 * @returns {string} The rendered table, or an empty string when there is nothing to show.
 */
export const formatReviewTable = (specs, answers, { env } = {}) => {
    const rows = [];

    for (const { spec, emitted } of emissionsFor(specs, answers, { env })) {
        if (!emitted || !spec.option) {
            continue;
        }

        rows.push([spec.option.long.replace(/^--/, ''), cellFor(spec, answers[spec.key])]);
    }

    if (rows.length === 0) {
        return '';
    }

    return table(rows, {
        border: getBorderCharacters(tableBorderName()),
        columns: { 1: { width: MAX_VALUE, wrapWord: true } },
        drawHorizontalLine: (index, size) => index === 0 || index === size,
    });
};
