/**
 * Coerces a `<true|false>` CLI option into a boolean.
 *
 * Commander surfaces these options as the strings `'true'` / `'false'` when they
 * come from the command line or an environment variable, but as a real boolean
 * when they come from the option's own `.default()`. Every consumer therefore has
 * to accept both spellings, which is why this lives in one place rather than as a
 * `x === 'true' || x === true` chain at each call site.
 *
 * @param {boolean|string|undefined} value - Raw value supplied via options/CLI/env.
 * @param {boolean} [defaultValue] - Result for undefined or unrecognised input. Defaults to true.
 *
 * @returns {boolean} The coerced value.
 */
export const parseTrueFalseOption = (value, defaultValue = true) => {
    if (value === 'true' || value === true) {
        return true;
    }
    if (value === 'false' || value === false) {
        return false;
    }
    return defaultValue;
};
