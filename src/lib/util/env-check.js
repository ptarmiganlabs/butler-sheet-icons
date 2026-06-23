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

const isMissing = (rawValue) => typeof rawValue !== 'string' || rawValue.trim() === '';

/**
 * Redacted status for a secret env var. Never returns the raw value.
 * @param {string|undefined} rawValue
 * @returns {string} 'missing' or 'present (length=N, last4=****abcd)'
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
 * @param {string|undefined} rawValue
 * @returns {string}
 */
export const describePlain = (rawValue) => {
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!value) return 'missing';
    return `present (=${JSON.stringify(value)})`;
};

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
 * @param {string|undefined} rawValue
 * @param {{ diagnostic?: boolean }} [opts]
 * @returns {string}
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
 * @param {NodeJS.ProcessEnv|object} [env={}] - typically `process.env`
 * @param {object} [config={}]
 * @param {string[]} [config.mandatory] - must be set and non-empty (after .trim())
 * @param {string[][]} [config.xor] - each group: at least one must be set
 * @param {string[]} [config.secret] - rendered with formatSecret (redacted)
 * @param {string[]} [config.informational] - rendered, never fail
 * @param {boolean} [config.diagnostic] - opt-in raw byte diagnostic for secrets
 * @returns {{ lines: string[], errors: string[], isValid: boolean }}
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
 * @param {NodeJS.ProcessEnv|object} env
 * @param {object} config - see checkEnv
 * @param {{ label?: string, diagnostic?: boolean }} [opts]
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
 * Resolve the integration test timeout from BSI_TEST_TIMEOUT (ms).
 * Logs the resolved value to the console. Falls back to defaultMs.
 *
 * @param {NodeJS.ProcessEnv|object} env
 * @param {number} [defaultMs=1200000]
 * @returns {number}
 */
export const getTestTimeout = (env, defaultMs = 1200000) => {
    const raw = env && env.BSI_TEST_TIMEOUT;
    const parsed = raw !== undefined && raw !== '' ? Number.parseInt(raw, 10) : NaN;
    const value = Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMs;
    console.log(`Jest timeout: ${value}`);
    return value;
};
