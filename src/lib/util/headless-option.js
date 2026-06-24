/**
 * Coerces the user-provided `--headless` option into the value consumed by
 * Puppeteer's `launch({ headless })`.
 *
 * The CLI accepts boolean true/false as well as the strings `'true'` / `'false'`
 * (which is how Commander surfaces boolean flags). Undefined / unknown values
 * default to headless mode enabled.
 *
 * @param {boolean|string|undefined} value - Raw value supplied via options/CLI.
 *
 * @returns {boolean} `true` for headless mode, `false` for headed mode.
 */
export const parseHeadlessOption = (value) => {
    if (value === 'true' || value === true) {
        return true;
    }
    if (value === 'false' || value === false) {
        return false;
    }
    return true;
};
