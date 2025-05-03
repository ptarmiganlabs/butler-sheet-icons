import winston from 'winston';
import * as sea from 'node:sea';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import 'dotenv/config';

// Get app version from package.json file
const filenamePackage = `./package.json`;
let b;
let c;
let appVersion;

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
