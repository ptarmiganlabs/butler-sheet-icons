/**
 * @typedef {Record<string, (string|undefined)>} ProcessEnvLike
 */

/**
 * @typedef {object} CheckEnvConfig
 * @property {string[]} [mandatory] - Var names that must be set and non-empty (after `.trim()`).
 * @property {string[][]} [xor] - Each inner group is a list of var names where at least one must be set.
 * @property {string[]} [secret] - Var names rendered with `formatSecret` (redacted; raw value never logged).
 * @property {string[]} [informational] - Var names rendered with `describePlain`; never cause failure.
 * @property {boolean} [diagnostic] - When true, includes raw byte diagnostic in secret output.
 */

/**
 * @typedef {object} CheckEnvResult
 * @property {string[]} lines - Human-readable lines to log/print.
 * @property {string[]} errors - One message per failing check (empty when valid).
 * @property {boolean} isValid - True when `errors` is empty.
 */

/**
 * @typedef {object} AssertEnvOptions
 * @property {string} [label] - Label prepended to the thrown error message.
 * @property {boolean} [diagnostic] - When true, enables raw byte diagnostic for secret output.
 */

/**
 * Reusable env-var sanity check for integration tests.
 *
 * Exports a small set of pure helpers plus an `assertEnv` convenience
 * wrapper that logs and throws, and a `getTestTimeout` helper that
 * resolves the standard `BSI_TEST_TIMEOUT` (in ms) with a fallback.
 *
 * Design goals:
 *   - No side effects in the pure helpers; logging + throw are opt-in via
 *     `assertEnv`.
 *   - Same multi-line log format as the original in-file check that lived
 *     in `qscloudCreateThumbnails_success.integration.test.js`.
 *   - Secret values are never logged in clear text. `redactSecret` /
 *     `formatSecret` only return length + last-4 by default; the raw-byte
 *     diagnostic that exposed a Windows CRLF footgun is opt-in via
 *     `{ diagnostic: true }` so it stays one flag away when something
 *     similar shows up again.
 */

/**
 * Tests whether a raw env-var value should be treated as missing/empty.
 *
 * @param {string|undefined} rawValue - Raw env-var value.
 *
 * @returns {boolean} True when the value is not a string or is only whitespace.
 */
const isMissing = (rawValue) => typeof rawValue !== 'string' || rawValue.trim() === '';

/**
 * Redacted status for a secret env var. Never returns the raw value.
 *
 * @param {string|undefined} rawValue - Raw env-var value.
 *
 * @returns {string} Either `'missing'` or `'present (length=N, last4=****abcd)'`.
 */
export const redactSecret = (rawValue) => {
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!value) return 'missing';
    const last4 = value.length >= 4 ? value.slice(-4) : value;
    return `present (length=${value.length}, last4=****${last4})`;
};

/**
 * Plain status for a non-secret env var. Logs the value JSON-quoted so
 * embedded quotes/spaces are unambiguous.
 *
 * @param {string|undefined} rawValue - Raw env-var value.
 *
 * @returns {string} Either `'missing'` or `'present (=<json-quoted value>)'`.
 */
export const describePlain = (rawValue) => {
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!value) return 'missing';
    return `present (=${JSON.stringify(value)})`;
};

/**
 * Formats a numeric char code as a 2-digit uppercase hex string with `0x` prefix.
 *
 * @param {number} code - A character code (`String.prototype.charCodeAt` result).
 *
 * @returns {string} Hex string such as `'0x0D'`.
 */
const toHex = (code) => `0x${code.toString(16).padStart(2, '0').toUpperCase()}`;

/**
 * Secret formatter with optional raw-byte diagnostic. The diagnostic
 * is useful when investigating invisible-character bugs (e.g. trailing
 * `\r` in a .env file). Off by default to keep normal runs clean.
 *
 * Example diagnostic output:
 *   `present (raw=492, trimmed=491, firstByteHex=0x65, lastByteHex=0x0D, last4=****wxyz)`
 *   - raw - trimmed == 1 and lastByteHex == 0x0D is the Windows CRLF signature.
 *
 * @param {string|undefined} rawValue - Raw env-var value.
 * @param {object} [opts] - Options object.
 * @param {boolean} [opts.diagnostic] - When true, include raw byte info (first/last byte hex, raw/trimmed length).
 *
 * @returns {string} A redacted status string safe to log.
 */
export const formatSecret = (rawValue, opts = {}) => {
    const { diagnostic = false } = opts;
    const raw = typeof rawValue === 'string' ? rawValue : '';
    if (!raw || !raw.trim()) return 'missing';
    const trimmed = raw.trim();
    const last4 = trimmed.length >= 4 ? trimmed.slice(-4) : trimmed;
    if (!diagnostic) {
        return `present (length=${trimmed.length}, last4=****${last4})`;
    }
    const firstByteHex = toHex(raw.charCodeAt(0));
    const lastByteHex = toHex(raw.charCodeAt(raw.length - 1));
    return `present (raw=${raw.length}, trimmed=${trimmed.length}, firstByteHex=${firstByteHex}, lastByteHex=${lastByteHex}, last4=****${last4})`;
};

/**
 * Pure env-var sanity check. Returns structured output and a list of errors.
 * Does not log or throw.
 *
 * @param {ProcessEnvLike} [env] - Env-var source. Typically `process.env`. Defaults to `{}`.
 * @param {CheckEnvConfig} [config] - Check configuration. Defaults to `{}`.
 *
 * @returns {CheckEnvResult} The result object with `lines`, `errors`, and `isValid`.
 */
export const checkEnv = (env = {}, config = {}) => {
    const {
        mandatory = [],
        xor = [],
        secret = [],
        informational = [],
        diagnostic = false,
    } = config;

    const lines = [];
    const errors = [];
    const secretSet = new Set(secret);

    /**
     * Renders a single env-var name to a log-friendly status string.
     * Uses the redacted secret formatter for secret names and the plain formatter otherwise.
     *
     * @param {string} name - Env-var name to render.
     *
     * @returns {string} Status string suitable for logging.
     */
    const render = (name) =>
        secretSet.has(name) ? formatSecret(env[name], { diagnostic }) : describePlain(env[name]);

    lines.push('--- Integration test env sanity check ---');

    if (mandatory.length > 0) {
        lines.push('Mandatory vars:');
        for (const name of mandatory) {
            const status = render(name);
            lines.push(`  - ${name}: ${status}`);
            if (status === 'missing') errors.push(`${name}: missing`);
        }
    }

    if (xor.length > 0) {
        lines.push('XOR vars (at least one per group must be set):');
        for (const group of xor) {
            const present = group.filter((n) => !isMissing(env[n]));
            if (present.length === 0) {
                errors.push(`At least one of [${group.join(', ')}] must be set`);
                lines.push(`  - ${group.join(' XOR ')}: at least one must be set`);
            } else {
                for (const name of group) lines.push(`  - ${name}: ${render(name)}`);
            }
        }
    }

    if (informational.length > 0) {
        lines.push('Informational vars:');
        for (const name of informational) lines.push(`  - ${name}: ${render(name)}`);
    }

    lines.push('------------------------------------------');

    return { lines, errors, isValid: errors.length === 0 };
};

/**
 * Convenience wrapper for tests. Logs the check output to console and
 * throws a multi-line Error if any mandatory var is missing/empty.
 *
 * @param {ProcessEnvLike} env - Env-var source, typically `process.env`.
 * @param {CheckEnvConfig} config - See {@link checkEnv}.
 * @param {AssertEnvOptions} [opts] - Options.
 *
 * @returns {void}
 */
export const assertEnv = (env, config, opts = {}) => {
    const { label = 'Integration test prerequisites not met', diagnostic } = opts;
    const finalConfig = diagnostic !== undefined ? { ...config, diagnostic } : config;
    const { lines, errors, isValid } = checkEnv(env, finalConfig);
    console.log(lines.join('\n'));
    if (!isValid) {
        const message =
            `${label}. The following env vars are missing/empty:\n  - ` +
            errors.join('\n  - ') +
            '\nSet the required variables in the test environment and re-run.';
        throw new Error(message);
    }
};

/**
 * Resolve the integration test timeout from `BSI_TEST_TIMEOUT` (ms).
 * Logs the resolved value to the console. Falls back to `defaultMs`.
 *
 * @param {ProcessEnvLike} env - Env-var source, typically `process.env`.
 * @param {number} [defaultMs] - Fallback in milliseconds when `BSI_TEST_TIMEOUT` is unset/invalid. Defaults to 1200000 (20 minutes).
 *
 * @returns {number} The resolved test timeout in milliseconds.
 */
export const getTestTimeout = (env, defaultMs = 1200000) => {
    const raw = env && env.BSI_TEST_TIMEOUT;
    const parsed = raw !== undefined && raw !== '' ? Number.parseInt(raw, 10) : NaN;
    const value = Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMs;
    console.log(`Jest timeout: ${value}`);
    return value;
};
