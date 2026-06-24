import winston from 'winston';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import 'dotenv/config';

const require = createRequire(import.meta.url);

// Load the experimental SEA helpers only when they exist (packaged builds).
// During tests, Docker, or plain Node runtimes the module is absent, so we
// provide a lightweight shim that preserves the API surface but keeps isSea()
// false to force the traditional filesystem code paths.
let sea;
try {
    sea = require('node:sea');
} catch (error) {
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

logTransports.push(
    new winston.transports.Console({
        name: 'console',
        level: 'info',
        format: winston.format.combine(
            winston.format.errors({ stack: true }),
            winston.format.timestamp(),
            winston.format.colorize(),
            winston.format.simple(),
            winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`)
        ),
    })
);

const logger = winston.createLogger({
    transports: logTransports,
    format: winston.format.combine(
        winston.format.errors({ stack: true }),
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
    let revision = '';

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
    isSea,
    bsiExecutablePath,
    getChromiumRevision,
    sleep,
};
