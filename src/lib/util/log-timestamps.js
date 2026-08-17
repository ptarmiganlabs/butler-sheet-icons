import { FALSE_WORDS } from './boolean-option.js';

/**
 * Environment variable that removes the timestamp prefix from console log lines.
 *
 * Console lines are prefixed with an ISO-8601 timestamp and the level - around
 * 31 columns before any content. Under Docker, systemd/journald, and most log
 * shippers the runtime adds its own timestamp, so the prefix is duplicated
 * noise there; it also dominates terminal recordings.
 *
 * An environment variable rather than a CLI flag for the same reason as
 * `BSI_ASCII_ONLY` and `BSI_NO_INTERACTIVE`: this is an ambient presentation
 * choice, not a per-invocation one, and a flag would have to be declared on
 * every leaf command.
 */
export const LOG_TIMESTAMPS_ENV = 'BSI_LOG_TIMESTAMPS';

/**
 * Whether console log lines should carry the timestamp prefix.
 *
 * Off exactly when the value is one of the {@link FALSE_WORDS} administrators
 * actually write - `false`, `0`, `no`, `off` - shared with the boolean CLI
 * options so the two never disagree on vocabulary. The value is trimmed and
 * case-folded first: a `.env` authored on Windows arrives with a trailing
 * `\r` through `docker run --env-file`, and `cmd.exe` keeps trailing spaces
 * from `set NAME=value `, and both used to be silent no-ops.
 *
 * Unlike `booleanOptionParser`, an unrecognised value is *not* refused - it
 * leaves timestamps on. This runs while the logger is being constructed, so
 * there is nowhere to report a refusal yet, and losing timestamps to a typo
 * would be worse than the reverse. The raw value is surfaced in
 * `interactive --self-test` so an ignored value is at least visible.
 *
 * This governs the console transport only. A log *file* without timestamps is
 * far less useful than a terminal without them, so any future file transport
 * is expected to keep its own prefix regardless of this switch.
 *
 * @param {object} [env] - Environment to read. Defaults to `process.env`. Injectable for tests.
 *
 * @returns {boolean} True when the timestamp prefix should be emitted.
 */
export const isTimestampEnabled = (env = process.env) => {
    const value = env[LOG_TIMESTAMPS_ENV];

    if (typeof value !== 'string') {
        return true;
    }

    return !FALSE_WORDS.has(value.trim().toLowerCase());
};
