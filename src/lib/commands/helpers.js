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

export { parsePositiveInteger };
