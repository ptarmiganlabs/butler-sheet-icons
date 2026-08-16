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
 * The free-text layer has to tell a credential apart from a sentence that
 * happens to contain the word `token`. It does so by context: after an
 * `Authorization:` header name anything goes, while a bare `Bearer`/`Basic`/
 * `Token` only redacts what follows if it does not look like an English word.
 * See `isProseWord()` and issue #949.
 *
 * Both layers are best-effort: a determined attacker could craft values
 * that evade either, but normal Qlik Sense / Qlik Cloud / Qlik config
 * shapes are covered.
 *
 * ## What the free-text layer deliberately does not do
 *
 * It does not redact the **unquoted** command-line form, `--logonpwd hunter2`.
 * That is a deliberate limit, not an oversight, and it was arrived at by
 * shipping the opposite and measuring it:
 *
 * - There is no textual signal separating `--logonpwd correcthorsebattery`
 *   from `Provide --apikey instead.` They are the same shape. Any rule that
 *   redacts the first mangles the second, and a rule that spares the second
 *   leaks the first. An attempt keyed on `isProseWord()` did both at once: it
 *   let every all-lowercase password through *and* ate the capitalised word in
 *   `see --auth Options for details`, which is issue #949 exactly.
 * - Nothing in Butler Sheet Icons feeds a raw command line into this function.
 *   `process.argv` is never logged (it reaches Commander and nowhere else), and
 *   the one place a command line is rendered for a user - the interactive
 *   wizard's `formatCommandLine()` - redacts by *option key*, which is reliable
 *   because it knows which option is a secret rather than guessing from shape.
 *
 * So the unquoted form has no live source here, while a rule for it would run
 * over every log line the product emits. If a future feature accepts pasted
 * text or a user-supplied log file - `doctor analyze` is the one on the map -
 * that input is untrusted in a way BSI's own prose is not, and over-redacting
 * it is cheap. The aggressive rule belongs there, applied to that input only,
 * and not in the formatter every `logger.info` passes through.
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
 * Tests whether the text following a bare auth scheme keyword reads as ordinary
 * prose rather than as a credential.
 *
 * Credentials are base64, hex, JWTs or UUIDs: mixed case, digits, dots or
 * dashes. A run of plain lowercase letters short enough to be a word
 * (`parameter`, `authentication`, `available`) is prose. The 24-letter ceiling
 * keeps longer lowercase runs — too long to be an English word — on the
 * redacted side.
 *
 * @param {string} value - The text following an auth scheme keyword.
 * @returns {boolean} `true` when the value looks like prose rather than a credential.
 */
function isProseWord(value) {
    return /^[a-z]{1,23}$/.test(value);
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

    // 2a. Authorization headers. The header name in front of the scheme settles
    //     the question: whatever follows is a credential, whatever it looks like.
    //     The optional quotes cover the stringified-config form
    //     (`"Authorization": "Bearer …"`) that reaches the log when a caller does
    //     `JSON.stringify(err)` - see the note in cloud-repo-request.js.
    result = result.replace(
        /\b((?:proxy-)?authorization["']?\s*[:=]\s*["']?)(bearer|basic|token)(\s+)[A-Za-z0-9+/=._~-]+/gi,
        '$1$2$3[REDACTED]'
    );

    // 2b. A bare scheme word, as it appears in a stack trace or a server error.
    //     With no header name there is nothing to say the next word is a
    //     credential rather than prose: `Token` also matches the English word
    //     `token`, which turned "API token parameter is required" into
    //     "API token [REDACTED] is required" - the message an operator gets when
    //     --apikey (or BSI_QSCLOUD_CST_APIKEY) is empty, with the one useful word
    //     removed (issue #949).
    //
    //     The prose test has to live in a callback. This regex is
    //     case-insensitive, so an inline `(?![a-z]+\b)` lookahead would fold to
    //     any case and match base64 such as `dXNlcjpwYXNz`, silently disabling
    //     the rule for real credentials.
    result = result.replace(
        /\b(Bearer|Basic|Token)(\s+)([A-Za-z0-9+/=._-]{8,})/gi,
        (match, scheme, space, value) =>
            isProseWord(value) ? match : `${scheme}${space}[REDACTED]`
    );

    // 3. Common key=value secret patterns (query strings, connection strings, etc.)
    //    Matches: password=, passwd=, pwd=, logonpwd=, secret=, token=, api_key=,
    //             apiKey=, apitoken=, access_key=, accessKey=, auth=, passphrase=,
    //             clientSecret=, client_secret=
    result = result.replace(
        /\b(logonpwd|password|passwd|pwd|secret|token|api[_-]?key|api[_-]?token|access[_-]?key|auth|passphrase|client[_-]?secret)\s*[=:]\s*[^\s&,;"'[\]{}()]+/gi,
        '$1=[REDACTED]'
    );

    // 3b. A secret whose value is *quoted*, in either the `--flag "value"` or the
    //     `key="value"` form. Rule 3 stops at the opening quote, because its value class
    //     excludes quote characters - so a password containing spaces, which is the only
    //     reason anyone quotes one, survived every rule in this function untouched.
    //
    //     The quote is what makes this safe to do, and it is the whole reason this rule is
    //     limited to the quoted form. A quoted token immediately after a secret-named flag is
    //     that flag's argument; prose does not quote the word after a flag. The unquoted
    //     `--logonpwd hunter2` form is deliberately NOT matched here - see the note below on
    //     why it cannot be done in this function without re-creating issue #949.
    result = result.replace(
        /(\b(?:--)?(?:logonpwd|password|passwd|pwd|secret|token|api[_-]?key|api[_-]?token|access[_-]?key|auth|passphrase|client[_-]?secret)\s*(?:=|\s)\s*)("[^"]+"|'[^']+')/gi,
        (_match, lead, value) => `${lead}${value[0]}[REDACTED]${value[0]}`
    );

    // 4. JSON-style quoted key/value pairs for the same patterns
    //    e.g. `"password": "mysecret"` or `'token': 'abc123'`
    result = result.replace(
        /["'](logonpwd|password|passwd|pwd|secret|token|api[_-]?key|api[_-]?token|access[_-]?key|auth|passphrase|client[_-]?secret)["']\s*:\s*["'][^"']+["']/gi,
        '"$1": "[REDACTED]"'
    );

    return result;
}
