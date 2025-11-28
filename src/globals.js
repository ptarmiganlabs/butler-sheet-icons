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
        isSea: () => false,
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
];

/**
 * Determine if deprecation warnings should be suppressed.
 * Default: suppress for SEA binaries, show for regular Node.js.
 * Can be overridden with BSI_SUPPRESS_DEPRECATIONS environment variable.
 */
const shouldSuppressDeprecations = () => {
    const envValue = process.env.BSI_SUPPRESS_DEPRECATIONS;
    if (envValue === '1' || envValue === 'true') return true;
    if (envValue === '0' || envValue === 'false') return false;
    // Default: suppress for SEA, show for regular Node.js
    return sea.isSea();
};

// Install warning filter if deprecation suppression is enabled
if (shouldSuppressDeprecations()) {
    // Prevent Node.js from printing warnings directly to console
    // This must be set BEFORE any warnings are emitted
    process.noProcessWarnings = true;

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
 * Functions to get/set current console logging level
 * @returns
 */
const getLoggingLevel = () => logTransports.find((transport) => transport.name === 'console').level;

/**
 * Set the console logging level
 * @param {*} newLevel
 */
const setLoggingLevel = (newLevel) => {
    logTransports.find((transport) => transport.name === 'console').level = newLevel;
};

/**
 * Boolean to indicate if we are running as a standalone app or not
 */
const isSea = sea.isSea();
const bsiExecutablePath = isSea ? path.dirname(process.execPath) : process.cwd();

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
