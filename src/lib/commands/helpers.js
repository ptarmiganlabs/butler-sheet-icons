import { InvalidArgumentError } from 'commander';

/**
 * Validates that the provided CLI argument represents a non-negative integer within optional bounds.
 *
 * @param {string|number} value - Raw argument value supplied via Commander.
 * @param {object} [options] - Validation options.
 * @param {number} [options.min] - Minimum allowed integer value (inclusive). Defaults to `0`.
 * @param {number} [options.max] - Maximum allowed integer value (inclusive).
 * @param {string} [options.errorMessage] - Custom error message for invalid input.
 * @param {boolean} [options.returnNumber] - When true, return the parsed integer; otherwise return the original string. Defaults to `false`.
 *
 * @returns {string|number} Either the trimmed string or parsed integer, depending on `returnNumber`.
 *
 * @throws {InvalidArgumentError} When the input is not an integer or outside the configured boundaries.
 */
const parsePositiveInteger = (value, { min = 0, max, errorMessage, returnNumber = false } = {}) => {
    const stringValue = `${value}`.trim();
    const messageParts = [];
    if (min !== undefined) {
        messageParts.push(`>= ${min}`);
    }
    if (max !== undefined) {
        messageParts.push(`<= ${max}`);
    }
    const defaultMessage =
        errorMessage ||
        `Value must be an integer${messageParts.length ? ` ${messageParts.join(' and ')}` : ''}.`;

    if (!/^\d+$/.test(stringValue)) {
        throw new InvalidArgumentError(defaultMessage);
    }

    const parsed = Number.parseInt(stringValue, 10);

    if (
        Number.isNaN(parsed) ||
        (min !== undefined && parsed < min) ||
        (max !== undefined && parsed > max)
    ) {
        throw new InvalidArgumentError(defaultMessage);
    }

    return returnNumber ? parsed : stringValue;
};

/**
 * Builds a Commander `argParser` for a **variadic** integer option (`<number...>`).
 *
 * Commander has two ways of producing an array-valued option, and they are mutually
 * exclusive. Declaring the option variadic makes Commander collect the values itself -
 * but only for options with no `argParser`. The moment an `argParser` is attached,
 * Commander switches to calling that parser once per value, passing the accumulated
 * result so far as the second argument, and stores whatever the parser returns. A
 * parser that ignores that second argument therefore throws away everything collected
 * before it, and the option ends up holding a bare string instead of an array.
 *
 * That is not a harmless type difference: every consumer of these options asks
 * `.includes(iSheetNum.toString())`, and `String.prototype.includes` is substring
 * matching. `--exclude-sheet-number 12` left as the string `'12'` matches sheet 1 and
 * sheet 2 as well as sheet 12.
 *
 * This helper closes over the validation options and accumulates, so a variadic option
 * keeps its array while still validating each value.
 *
 * Values are kept as **strings**, matching `parsePositiveInteger`'s default, because
 * consumers compare them against `iSheetNum.toString()`.
 *
 * @param {object} [parseOptions] - Validation options forwarded to `parsePositiveInteger`.
 *
 * @returns {(value: string, previous?: string[]) => string[]} Parser suitable for `Option.argParser()`.
 *
 * @throws {InvalidArgumentError} When any single value is not a non-negative integer.
 *
 * @example
 * new Option('--exclude-sheet-number <number...>', '...')
 *     .argParser(collectPositiveIntegers({ errorMessage: 'Must be a non-negative integer.' }))
 */
const collectPositiveIntegers =
    (parseOptions = {}) =>
    (value, previous = []) => [...previous, parsePositiveInteger(value, parseOptions)];

export { parsePositiveInteger, collectPositiveIntegers };
