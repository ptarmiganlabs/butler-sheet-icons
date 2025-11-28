/**
 * Determine whether bundled deprecation warnings from third-party dependencies should be
 * suppressed. SEA builds default to suppression but the behaviour can be overridden via
 * BSI_SUPPRESS_DEPRECATIONS=1|0.
 *
 * @param {object} [options]
 * @param {NodeJS.ProcessEnv} [options.env=process.env] - Environment variables source.
 * @param {boolean} [options.isSeaRuntime=false] - Whether the CLI is running as a SEA binary.
 * @returns {boolean} True when warnings should be silenced.
 */
export const shouldSilenceBundledDeprecations = ({
    env = process.env,
    isSeaRuntime = false,
} = {}) => {
    const override = env.BSI_SUPPRESS_DEPRECATIONS?.toLowerCase();

    if (override === '0' || override === 'false') {
        return false;
    }
    if (override === '1' || override === 'true') {
        return true;
    }

    return isSeaRuntime;
};
