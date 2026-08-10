/**
 * A prompt runtime that answers from a queue instead of from a terminal.
 *
 * This is what makes whole wizard flows testable without a pty. It is not a
 * test itself - it lives outside `__tests__` because jest treats every file in
 * there as a suite and would fail on one containing no tests.
 *
 * Three properties earn it its place:
 *
 * - It **fails loudly on an unqueued key**, so a question added without a test
 *   answer breaks the test rather than hanging it, which is the failure mode
 *   that makes prompt testing miserable.
 * - It **runs the real validator and re-asks on rejection**, exactly as a real
 *   prompt does. Queue `['abc', '7']` against a numeric question and the key is
 *   recorded twice: once rejected, once accepted.
 * - It **records what it was asked**, so "the version list was fetched for the
 *   browser the user chose" is an ordinary assertion.
 *
 * Answers are queued per key. An array means successive attempts, except for a
 * `checkbox` question, where the array is itself the answer. A `list` question
 * takes the string a user would type - the driver does the splitting.
 *
 * @param {object} script - Answers keyed by spec key.
 *
 * @returns {object} A runtime with `ask`, `write`, and the `asked`/`written` records.
 */
export const scriptedRuntime = (script = {}) => {
    const asked = [];
    const written = [];
    const queues = new Map();

    const queueFor = (spec) => {
        if (!queues.has(spec.key)) {
            const queued = script[spec.key];
            const isWholeAnswer = spec.type === 'checkbox' || !Array.isArray(queued);

            queues.set(spec.key, isWholeAnswer ? [queued] : [...queued]);
        }

        return queues.get(spec.key);
    };

    return {
        asked,
        written,

        /**
         * Everything written, joined - convenient for `toContain` assertions.
         *
         * @returns {string} The full transcript.
         */
        output: () => written.join(''),

        /**
         * Record a line of wizard output.
         *
         * @param {string} text - The text written.
         *
         * @returns {void}
         */
        write: (text) => {
            written.push(text);
        },

        /**
         * Answer one question from the script, re-asking while answers are rejected.
         *
         * @param {object} spec - The question being asked.
         * @param {object} config - The prompt configuration built for it.
         *
         * @returns {Promise<unknown>} The first scripted answer that passes validation.
         *
         * @throws {Error} If no answer is queued, or every queued answer is rejected.
         */
        ask: async (spec, config) => {
            if (!(spec.key in script)) {
                throw new Error(
                    `scriptedRuntime: no answer queued for "${spec.key}". Asked so far: ${
                        asked.map((entry) => entry.key).join(', ') || '(nothing)'
                    }.`
                );
            }

            const queue = queueFor(spec);

            if (queue.length === 0) {
                // Distinct from "every answer was rejected": this is a question
                // asked more times than the script anticipated, which happens
                // when a flow loops - a restart at the review step, say.
                throw new Error(
                    `scriptedRuntime: "${spec.key}" was asked again but the script has no answer left. Queue another one.`
                );
            }

            let lastVerdict;

            while (queue.length > 0) {
                const answer = queue.shift();

                // Recorded per attempt, not per question, so a test can see
                // that a value was rejected and the question asked again.
                asked.push({
                    key: spec.key,
                    type: spec.type,
                    message: config.message,
                    choices: config.choices,
                    default: config.default,
                    source: config.source,
                });

                if (!config.validate) {
                    return answer;
                }

                lastVerdict = await config.validate(answer);

                if (lastVerdict === true) {
                    return answer;
                }
            }

            throw new Error(
                `scriptedRuntime: every queued answer for "${spec.key}" was rejected. Last rejection: ${lastVerdict}`
            );
        },
    };
};
