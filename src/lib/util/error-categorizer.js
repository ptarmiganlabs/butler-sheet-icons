/**
 * Error categorization utilities for Butler Sheet Icons.
 *
 * Categorizes errors based on their properties (HTTP status, Node.js
 * `err.code`, message patterns) so callers can route logs, decide on
 * retries, or emit structured metadata.
 */

/**
 * @typedef {object} ErrorMetadata
 * @property {string} error_category - Coarse category name. One of:
 *   `timeout`, `connection_refused`, `host_not_found`, `connection_reset`,
 *   `auth_error`, `not_found`, `rate_limited`, `http_4xx`, `http_5xx`,
 *   `certificate_error`, `unknown`.
 * @property {string} error_code - The `err.code` if any (e.g. `ETIMEDOUT`).
 * @property {number|null} http_status - HTTP status from an axios-style
 *   `err.response.status`, or `null` when not applicable.
 * @property {string} [request_url] - Sanitized request URL (no query string).
 * @property {number} [request_timeout_ms] - Configured axios timeout if known.
 * @property {string} [remote_address] - `err.cause.address` (Node net layer).
 * @property {number} [remote_port] - `err.cause.port`.
 * @property {string} [syscall] - `err.cause.syscall` (e.g. `connect`).
 */

/**
 * Categorizes an error based on its properties.
 *
 * @param {Error|unknown} err - The error object (or any value).
 * @returns {string} One of: `timeout`, `connection_refused`, `host_not_found`,
 *   `connection_reset`, `auth_error`, `not_found`, `rate_limited`, `http_4xx`,
 *   `http_5xx`, `certificate_error`, `unknown`.
 */
export function getErrorCategory(err) {
    if (!err) return 'unknown';

    // Timeout errors
    if (
        err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNABORTED' ||
        (typeof err.message === 'string' && err.message.toLowerCase().includes('timeout')) ||
        err.name === 'RequestTimedOutError'
    ) {
        return 'timeout';
    }

    // Connection errors (Node net layer)
    if (err.code === 'ECONNREFUSED') return 'connection_refused';
    if (err.code === 'ENOTFOUND') return 'host_not_found';
    if (err.code === 'ECONNRESET') return 'connection_reset';

    // HTTP errors (axios style)
    const status = err.response?.status;
    if (status) {
        if (status === 401 || status === 403) return 'auth_error';
        if (status === 404) return 'not_found';
        if (status === 429) return 'rate_limited';
        if (status >= 500) return 'http_5xx';
        if (status >= 400) return 'http_4xx';
    }

    // Certificate / TLS errors
    if (typeof err.message === 'string') {
        const msg = err.message.toLowerCase();
        if (msg.includes('cert') || msg.includes('tls') || msg.includes('ssl')) {
            return 'certificate_error';
        }
    }

    return 'unknown';
}

/**
 * Extracts error metadata from an error object.
 *
 * Handles Axios errors specially: extracts remote address/port, sanitized
 * request URL (query string stripped), configured timeout, and syscall.
 *
 * @param {Error|unknown} err - The error object (or any value).
 *
 * @returns {ErrorMetadata} A flat metadata object suitable for logging.
 */
export function getErrorMetadata(err) {
    /** @type {ErrorMetadata} */
    const meta = {
        error_category: getErrorCategory(err),
        error_code: err?.code || '',
        http_status: err?.response?.status ?? null,
    };

    // Axios request configuration extras
    if (err?.config) {
        if (err.config.timeout != null) {
            meta.request_timeout_ms = err.config.timeout;
        }
        if (err.config.url) {
            try {
                const u = new URL(err.config.url);
                meta.request_url = `${u.origin}${u.pathname}`;
            } catch {
                meta.request_url = String(err.config.url).split('?')[0];
            }
        }
    }

    // Network-level cause (e.g. ECONNREFUSED — populated by Node's net layer)
    const cause = err?.cause;
    if (cause) {
        if (cause.address) meta.remote_address = cause.address;
        if (cause.port != null) meta.remote_port = cause.port;
        if (cause.syscall) meta.syscall = cause.syscall;
    }

    return meta;
}
