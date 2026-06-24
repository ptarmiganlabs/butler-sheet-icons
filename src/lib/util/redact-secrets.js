/**
 * Secret redaction utilities for Butler Sheet Icons.
 *
 * Used by the winston `sanitizeFormat` formatter in `globals.js` and by direct
 * callers (e.g. option debug dumps) to ensure that passwords, API keys, bearer
 * tokens, and other sensitive values never reach log files or crash dumps.
 *
 * Two layers of protection:
 *  1. `BSI_SECRET_KEYS` — explicit allow-list of well-known property names
 *     (e.g. `logonpwd`, `apikey`) that are always redacted in deep-cloned
 *     option bags, regardless of value.
 *  2. `redactSensitivePatterns()` — pattern-based redaction applied to free
 *     text (log messages, error stacks). Catches URLs with embedded
 *     credentials, `Authorization: Bearer …` headers, and key=value
 *     patterns such as `password=…` or `api_key=…` in any string.
 *
 * Both layers are best-effort: a determined attacker could craft values
 * that evade either, but normal Qlik Sense / Qlik Cloud / Qlik config
 * shapes are covered.
 */

/**
 * Names of option properties that should always be redacted in deep-cloned
 * option objects (regardless of value). Matched case-insensitively.
 *
 * Names cover both the commander option names (`logonpwd`, `apikey`, …) and
 * the canonical `BSI_*` env-var stems (`BSI_CLOUD_API_KEY`,
 * `BSI_QSEOW_CST_LOGON_PWD`, …). Add new names here when new secrets
 * enter the option bag.
 */
export const BSI_SECRET_KEYS = [
    // CLI option names
    'logonpwd',
    'apikey',
    'password',
    'pwd',
    'passwd',
    'passphrase',
    'secret',
    'token',
    'authorization',
    // Common option-key spellings
    'apiKey',
    'api_key',
    'apiToken',
    'api_token',
    'accessKey',
    'access_key',
    'clientSecret',
    'client_secret',
    // BSI env-var stems (the logger can include the env-var source name)
    'BSI_CLOUD_API_KEY',
    'BSI_QSEOW_CST_LOGON_PWD',
    'BSI_QSEOW_CST_CERTKEY_FILE',
    'BSI_QSEOW_CST_CERT_FILE',
];

const SECRET_KEY_SET = new Set(BSI_SECRET_KEYS.map((k) => k.toLowerCase()));

/**
 * The placeholder substituted in place of any redacted value.
 */
const REDACTED = '***redacted***';

/**
 * Tests whether a property name should be treated as a secret.
 *
 * @param {string} name - Property name to test.
 * @returns {boolean} `true` when the name is in the secret allow-list (case-insensitive).
 */
function isSecretKey(name) {
    if (typeof name !== 'string') return false;
    return SECRET_KEY_SET.has(name.toLowerCase());
}

/**
 * Returns a deep-clone of `value` with all secret-keyed properties replaced
 * by the redaction placeholder. Non-object inputs (and non-plain objects)
 * are returned unchanged. Plain objects, arrays, and nested combinations
 * are walked recursively.
 *
 * Cycles are broken by reusing the parent placeholder when an object would
 * otherwise be visited twice.
 *
 * @param {unknown} value - The value to clone.
 * @param {object} [seen] - Internal cycle-tracking map. Not for external use.
 *
 * @returns {unknown} A safe deep-clone of `value` with secrets redacted.
 */
export function redactValue(value, seen = new WeakMap()) {
    if (value === null || value === undefined) return value;
    const t = typeof value;
    if (t !== 'object') return value;
    if (seen.has(value)) return REDACTED;
    seen.set(value, REDACTED);

    if (Array.isArray(value)) {
        return value.map((v) => redactValue(v, seen));
    }

    // Plain object path. Treat class instances and exotic objects as opaque
    // (best-effort: we do not introspect them to avoid pulling live data).
    const proto = Object.getPrototypeOf(value);
    if (proto !== null && proto !== Object.prototype) {
        return REDACTED;
    }

    const out = {};
    for (const [k, v] of Object.entries(value)) {
        if (isSecretKey(k)) {
            out[k] = REDACTED;
        } else {
            out[k] = redactValue(v, seen);
        }
    }
    return out;
}

/**
 * Returns a deep-clone of the given options object with all secret-keyed
 * properties replaced. Convenience wrapper around {@link redactValue}.
 *
 * @param {unknown} options - Options object to redact.
 *
 * @returns {unknown} Safe deep-clone of the options with secrets redacted.
 */
export const redactOptions = (options) => redactValue(options);

/**
 * Applies best-effort redaction of common sensitive patterns to a string.
 * Covers URLs with embedded credentials, bearer/basic/token authorization
 * headers, common key=value secret patterns, and JSON-style quoted
 * equivalents.
 *
 * @param {string|undefined} text - Text to redact.
 * @returns {string} Redacted text. Returns `''` for non-string input.
 */
export function redactSensitivePatterns(text) {
    if (typeof text !== 'string' || text === '') return '';
    let result = text;

    // 1. URLs with embedded credentials: protocol://user:pass@host
    result = result.replace(/([\w+.-]+:\/\/)[^@\s]+@/g, '$1[REDACTED]@');

    // 2. Bearer / Basic / Token authorization headers
    result = result.replace(/\b(Bearer|Basic|Token)\s+[A-Za-z0-9+/=._-]{8,}/gi, '$1 [REDACTED]');

    // 3. Common key=value secret patterns (query strings, connection strings, etc.)
    //    Matches: password=, passwd=, pwd=, logonpwd=, secret=, token=, api_key=,
    //             apiKey=, apitoken=, access_key=, accessKey=, auth=, passphrase=,
    //             clientSecret=, client_secret=
    result = result.replace(
        /\b(logonpwd|password|passwd|pwd|secret|token|api[_-]?key|api[_-]?token|access[_-]?key|auth|passphrase|client[_-]?secret)\s*[=:]\s*[^\s&,;"'[\]{}()]+/gi,
        '$1=[REDACTED]'
    );

    // 4. JSON-style quoted key/value pairs for the same patterns
    //    e.g. `"password": "mysecret"` or `'token': 'abc123'`
    result = result.replace(
        /["'](logonpwd|password|passwd|pwd|secret|token|api[_-]?key|api[_-]?token|access[_-]?key|auth|passphrase|client[_-]?secret)["']\s*:\s*["'][^"']+["']/gi,
        '"$1": "[REDACTED]"'
    );

    return result;
}
