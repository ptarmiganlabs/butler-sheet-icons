/**
 * Validation for interactive answers, single-sourced from the CLI's own rules.
 *
 * Nothing here restates a constraint. Every check runs the `parseArg` function
 * Commander already holds, so `parsePositiveInteger`'s wording - "Engine port
 * must be a non-negative integer." - appears under the prompt character for
 * character identical to what the CLI prints. A second copy of a rule is a
 * second thing to keep in step, and the wizard is exactly where a drifting copy
 * would be hardest to notice.
 */

/**
 * Build an inline validator from an option's own parser.
 *
 * `option.parseArg` is set by both `.argParser()` and `.choices()`, so one
 * bridge covers custom parsers and closed value sets alike. Note that
 * `.choices()` *overwrites* `parseArg` when both are declared - 19 options in
 * this codebase pair them, and in every case the choices validator is the one
 * that runs.
 *
 * @param {import('commander').Option} option - The option to validate for.
 *
 * @returns {((value: string) => true|string)|undefined} A validator, or `undefined` when the option accepts anything.
 */
export const fromOption = (option) => {
    if (!option?.parseArg) {
        return undefined;
    }

    return (value) => {
        try {
            option.parseArg(String(value), undefined);

            return true;
        } catch (err) {
            // Commander's InvalidArgumentError carries exactly the sentence the
            // CLI would have printed. `true | string` is what @inquirer wants,
            // so the message becomes an inline correction rather than a crash.
            return err?.message ?? String(err);
        }
    };
};

/**
 * Build a validator for a variadic option, reporting which entry was rejected.
 *
 * A single "invalid value" against a list of six is not actionable. Naming the
 * position and the offending text is the difference between fixing it and
 * retyping the lot.
 *
 * @param {import('commander').Option} option - The variadic option to validate for.
 *
 * @returns {(values: string[]) => true|string} A validator over the whole list.
 */
export const validateEntries = (option) => {
    const validateOne = fromOption(option);

    return (values) => {
        const entries = Array.isArray(values) ? values : [values];

        if (!validateOne) {
            return true;
        }

        for (const [index, entry] of entries.entries()) {
            const verdict = validateOne(entry);

            if (verdict !== true) {
                return `Entry ${index + 1} ("${entry}"): ${verdict}`;
            }
        }

        return true;
    };
};

/**
 * Split the free text of a list answer into entries.
 *
 * Commas and whitespace both separate, because both are what people type when
 * asked for "one or more" of something. Empty entries are dropped so a trailing
 * comma is not an error.
 *
 * @param {string|string[]} answer - Raw answer.
 *
 * @returns {string[]} The entries.
 */
export const splitEntries = (answer) => {
    if (Array.isArray(answer)) {
        return answer;
    }

    return String(answer ?? '')
        .split(/[,\s]+/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
};
