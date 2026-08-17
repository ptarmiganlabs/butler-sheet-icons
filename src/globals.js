import winston from 'winston';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
// `dotenv/config` is deliberately NOT imported here. Importing this module used to read `.env`
// off disk as a side effect, and almost every unit test imports it transitively - so unit runs
// executed against whatever Qlik Sense settings the developer happened to have. Because option
// declarations bind `.env('BSI_…')`, a variable in that file changes an option's *effective*
// default, and a test asserting "this equals the default" then asserts something different
// locally than in CI. Three tests were patched individually for that before the cause was found.
// The CLI entry point loads it instead; integration tests load it themselves.
import { redactSensitivePatterns, redactValue } from './lib/util/redact-secrets.js';
import { isColourEnabled } from './lib/util/colour.js';
import { isTimestampEnabled } from './lib/util/log-timestamps.js';

const require = createRequire(import.meta.url);
const LEVEL = Symbol.for('level');

// Load the experimental SEA helpers only when they exist (packaged builds).
// During tests, Docker, or plain Node runtimes the module is absent, so we
// provide a lightweight shim that preserves the API surface but keeps isSea()
// false to force the traditional filesystem code paths.
let sea;
try {
    sea = require('node:sea');
} catch {
    sea = {
        /**
         * Shim for `node:sea`'s `isSea()`. Always returns `false` because `node:sea`
         * is only available inside a SEA-built binary.
         *
         * @returns {boolean} Always `false` in this fallback shim.
         */
        isSea: () => false,
        /**
         * Shim for `node:sea`'s `getAsset()`. Throws because SEA assets are not
         * available outside a SEA-built binary.
         *
         * @returns {never} Never returns; always throws.
         * @throws {Error} Always, because SEA assets are unavailable in this shim.
         */
        getAsset: () => {
            throw new Error('SEA asset access requested outside SEA runtime.');
        },
    };
}

// Get app version from package.json file
const filenamePackage = `./package.json`;
let b;
let c;
let appVersion;
let packageJson;

// Are we running as a packaged app?
if (sea.isSea()) {
    // Get contents of package.json file
    packageJson = sea.getAsset('package.json', 'utf8');
    const version = JSON.parse(packageJson).version;

    appVersion = version;
} else {
    // Get path to JS file
    const __filename = fileURLToPath(import.meta.url);

    // Strip off the filename
    b = path.dirname(__filename);

    // Add path to package.json file
    c = path.join(b, '..', filenamePackage);

    const { version } = JSON.parse(readFileSync(c));
    appVersion = version;
}

// Set up logger with timestamps and colors, and optional logging to disk file
const logTransports = [];

/**
 * Sanitizes a single log payload value before it reaches the logger output.
 *
 * String values are pattern-redacted, arrays are sanitized recursively, and
 * object values are deep-cloned through `redactValue()` so secret-keyed
 * properties are replaced without mutating the original payload.
 *
 * @param {unknown} value - The log payload value to sanitize.
 *
 * @returns {unknown} The sanitized value.
 */
const sanitizeLogValue = (value) => {
    if (typeof value === 'string') {
        return redactSensitivePatterns(value);
    }
    if (Array.isArray(value)) {
        return value.map((entry) => sanitizeLogValue(entry));
    }
    if (value && typeof value === 'object') {
        return redactValue(value);
    }
    return value;
};

/**
 * Winston format that redacts secrets from log output.
 *
 * Runs the regex-based `redactSensitivePatterns` over the message and any
 * string meta values, and runs the deep-clone `redactValue` over any object
 * meta values. The intent is to make it impossible to leak secret-bearing
 * message text or metadata when the caller forgot to redact manually.
 *
 * The standard winston level metadata is left untouched, while message text,
 * stack traces, and splat/meta payloads are sanitized.
 */
const sanitizeFormat = winston.format((info) => {
    try {
        for (const key of Reflect.ownKeys(info)) {
            if (key === 'level' || key === 'timestamp' || key === LEVEL) {
                continue;
            }
            info[key] = sanitizeLogValue(info[key]);
        }
    } catch {
        // Never let the sanitizer break logging. If redaction itself throws
        // (e.g. exotic object with a throwing getter), pass the info through.
    }
    return info;
});

// Colourise only when stdout is really a terminal. `colorize()` rewrites
// `info.level` to carry ANSI codes, and the printf below interpolates that
// value, so applying it unconditionally put escape sequences into every
// redirected log file, scheduler transcript and captured CI log. Deciding once
// here, at load time, keeps the transport consistent for the life of the
// process - the stream cannot become a terminal later.
const colourConsole = isColourEnabled();

// Timestamps on console lines, decided once at load time for the same reason as
// colour above. Console only, deliberately: the logger-level format below keeps
// its own timestamp, so a future file transport inheriting it stays stamped.
//
// This chain deliberately has no `timestamp()` or `simple()` of its own. The
// logger-level format runs first and has already set `info.timestamp`, and a
// plain transport-level `timestamp()` is a no-op on an already-stamped record
// (logform sets the field only when absent - though `timestamp({ format })`
// WOULD override, so don't add one casually). `simple()` only wrote
// Symbol(message), which the printf below overwrites unconditionally.
const consoleTimestamps = isTimestampEnabled();

logTransports.push(
    new winston.transports.Console({
        name: 'console',
        level: 'info',
        format: winston.format.combine(
            winston.format.errors({ stack: true }),
            sanitizeFormat(),
            ...(colourConsole ? [winston.format.colorize()] : []),
            winston.format.printf((info) =>
                consoleTimestamps
                    ? `${info.timestamp} ${info.level}: ${info.message}`
                    : `${info.level}: ${info.message}`
            )
        ),
    })
);

const logger = winston.createLogger({
    transports: logTransports,
    format: winston.format.combine(
        winston.format.errors({ stack: true }),
        sanitizeFormat(),
        winston.format.timestamp(),
        winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`)
    ),
});

// ============================================================================
// Deprecation warning suppression
// ============================================================================

/**
 * List of Node.js deprecation codes to suppress.
 * These typically come from third-party dependencies bundled in SEA builds.
 * Add new codes here as needed.
 */
const SUPPRESSED_DEPRECATION_CODES = [
    'DEP0005', // Buffer() constructor deprecation
    'DEP0169', // url.parse() deprecation
    'DEP0190', // child_process spawn args with shell:true (emitted by @puppeteer/browsers on Windows when running setup.exe)
];

/**
 * Determine if deprecation warnings should be suppressed.
 * Default: always on (covers both SEA binaries and regular Node.js invocations).
 * Can be overridden with BSI_SUPPRESS_DEPRECATIONS environment variable.
 *
 * @returns {boolean} `true` when deprecation warnings should be filtered.
 */
const shouldSuppressDeprecations = () => {
    const envValue = process.env.BSI_SUPPRESS_DEPRECATIONS;
    if (envValue === '1' || envValue === 'true') return true;
    if (envValue === '0' || envValue === 'false') return false;
    // Default: suppress for both SEA binaries and regular Node.js runs
    return true;
};

// Install warning filter if deprecation suppression is enabled
if (shouldSuppressDeprecations()) {
    // Prevent Node.js from printing warnings directly to console
    // This must be set BEFORE any warnings are emitted. The flag is read-only
    // in some environments (e.g. Jest workers) where the listener swap below
    // is sufficient on its own, so treat this assignment as best-effort.
    try {
        process.noProcessWarnings = true;
    } catch {
        // Ignore: the warning listener swap below still suppresses defaults
    }

    // Remove any existing warning listeners to prevent default behavior
    process.removeAllListeners('warning');

    // Install custom warning handler as the ONLY handler
    process.on('warning', (warning) => {
        // Only handle DeprecationWarning types
        if (warning.name === 'DeprecationWarning') {
            // Check if this deprecation code should be suppressed
            if (SUPPRESSED_DEPRECATION_CODES.includes(warning.code)) {
                // Log at debug level instead of console output
                logger.debug(
                    `Suppressed deprecation warning: ${warning.name} [${warning.code}]: ${warning.message}${
                        warning.stack ? `\n${warning.stack}` : ''
                    }`
                );
                return; // Suppress (don't propagate to console)
            }
        }

        // For non-suppressed warnings, log them normally
        logger.warn(
            `Node.js warning: ${warning.name}${warning.code ? ` [${warning.code}]` : ''}: ${warning.message}${
                warning.stack ? `\n${warning.stack}` : ''
            }`
        );
    });

    logger.debug(
        `Deprecation warning suppression enabled (suppressing codes: ${SUPPRESSED_DEPRECATION_CODES.join(', ')})`
    );
}

// ============================================================================

// Suppported Chromium version: https://pptr.dev/chromium-support
// Correlate with https://chromium.woolyss.com to get revision number
const chromiumRevisionLinux = '1109227';
const chromiumRevisionWin = '1097664';
const chromiumRevisionMac = '1097624';

// Inspiration: https://github.com/dtolstyi/node-chromium/blob/master/utils.js
/**
 * Returns the bundled Chromium revision number for the current platform.
 *
 * @returns {string} Chromium revision number (e.g. `1109227` for Linux, `1097664` for Windows, `1097624` for macOS).
 *
 * @throws {Error} When the current platform is not one of `linux`, `win32`, or `darwin`.
 */
const getChromiumRevision = () => {
    const { platform } = process;
    let revision;

    if (platform === 'linux') {
        revision = chromiumRevisionLinux;
    } else if (platform === 'win32') {
        revision = chromiumRevisionWin;
    } else if (platform === 'darwin') {
        revision = chromiumRevisionMac;
    } else {
        throw new Error('Unsupported platform');
    }

    return revision;
};

/**
 * Returns the current console logging level configured on the `winston` console transport.
 *
 * @returns {string} The current log level (e.g. `info`, `debug`).
 */
const getLoggingLevel = () => logTransports.find((transport) => transport.name === 'console').level;

/**
 * Sets the console logging level on the `winston` console transport.
 *
 * @param {string} newLevel - The new log level (e.g. `info`, `debug`, `silly`).
 */
const setLoggingLevel = (newLevel) => {
    logTransports.find((transport) => transport.name === 'console').level = newLevel;
};

/**
 * Routes every console log line to stderr instead of stdout, for the rest of the process.
 *
 * Winston's Console transport writes **everything** to stdout by default - `error` included,
 * because `stderrLevels` is empty unless it is given. That is right for Butler Sheet Icons as a
 * whole: its output is one narrative log, the documentation tells operators to capture it with
 * `> bsi.log`, and splitting it across two streams would drop errors out of every captured log and
 * scramble the interleaving of what is left.
 *
 * It is wrong for exactly one case: a command whose stdout is a *payload* rather than a log.
 * `doctor check --outputformat json` emits a JSON document that scripts pipe into `jq`, and a
 * single winston line landing in the middle of it makes the document unparseable - on precisely
 * the broken machine the document exists to describe, with stderr empty so nothing says why.
 *
 * Hence a call rather than a constructor option: the payload commands opt in, and every other
 * command keeps the stream behaviour its users already depend on. Silencing the console instead
 * would be worse than either - the error is the thing that explains the empty document.
 *
 * @returns {void}
 */
const sendConsoleLogToStderr = () => {
    // Winston indexes this map by level name at log time, so every level set to `true` sends the
    // whole log to stderr. Built from the logger's own level set rather than a hand-written list,
    // which would silently miss a level if the logger's levels ever change.
    logTransports.find((transport) => transport.name === 'console').stderrLevels =
        Object.fromEntries(Object.keys(winston.config.npm.levels).map((level) => [level, true]));
};

/**
 * Boolean to indicate if we are running as a standalone app or not
 */
const isSea = sea.isSea();
const bsiExecutablePath = isSea ? path.dirname(process.execPath) : process.cwd();

/**
 * Resolves after the given number of milliseconds.
 *
 * @param {number} ms - Number of milliseconds to wait before resolving.
 *
 * @returns {Promise<void>} A promise that resolves after `ms` milliseconds.
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Export all the variables and functions
export {
    logger,
    appVersion,
    getLoggingLevel,
    setLoggingLevel,
    sendConsoleLogToStderr,
    isSea,
    bsiExecutablePath,
    getChromiumRevision,
    sleep,
};
