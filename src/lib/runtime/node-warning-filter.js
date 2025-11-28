const DEFAULT_SUPPRESSED_CODES = new Set(['DEP0169', 'DEP0005', 'DEP0190']);
const DEFAULT_SUPPRESSED_FRAGMENTS = [
    '`url.parse()` behavior is not standardized',
    'Buffer() is deprecated due to security and usability issues',
    'Passing args to a child process with shell option true',
];

let warningListener;

/**
 * Determine whether a warning should be suppressed based on code or message fragments.
 *
 * @param {Error|{code?: string, message?: string}} warning - Warning emitted by Node.js.
 * @param {Set<string>} suppressedCodes - Warning codes to skip.
 * @param {string[]} suppressedFragments - Message substrings that should be ignored.
 * @returns {boolean} True when the warning must not reach the logger.
 */
const shouldSuppressWarning = (warning, suppressedCodes, suppressedFragments) => {
    if (!warning) {
        return false;
    }

    if (warning.code && suppressedCodes.has(warning.code)) {
        return true;
    }

    if (typeof warning.message === 'string') {
        return suppressedFragments.some((fragment) => warning.message.includes(fragment));
    }

    return false;
};

/**
 * Remove the warning listener to keep Jest tests isolated.
 */
const resetWarningFilterForTests = () => {
    if (warningListener) {
        process.off('warning', warningListener);
        warningListener = undefined;
    }
};

/**
 * Install a singleton warning listener that suppresses known noisy deprecations and forwards
 * everything else to the provided logger.
 *
 * @param {object} [options]
 * @param {boolean} [options.enabled=true] - Whether the listener should attach.
 * @param {Set<string>} [options.suppressedCodes] - Warning codes to drop.
 * @param {string[]} [options.suppressedFragments] - Message substrings to drop.
 * @param {{warn: Function}} [options.logger=console] - Logger receiving non-suppressed warnings.
 */
export const installWarningFilter = ({
    enabled = true,
    suppressedCodes = DEFAULT_SUPPRESSED_CODES,
    suppressedFragments = DEFAULT_SUPPRESSED_FRAGMENTS,
    logger = console,
} = {}) => {
    if (!enabled || warningListener) {
        return;
    }

    warningListener = (warning) => {
        if (shouldSuppressWarning(warning, suppressedCodes, suppressedFragments)) {
            return;
        }

        const output = warning?.stack ?? `${warning?.name ?? 'Warning'}: ${warning?.message ?? ''}`;
        logger.warn(output);
    };

    process.on('warning', warningListener);
};

/**
 * Expose helpers for unit tests without exporting them publicly.
 */
export const __testing = {
    shouldSuppressWarning,
    resetWarningFilterForTests,
};
