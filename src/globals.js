const winston = require('winston');
const upath = require('upath');
const sea = require('node:sea');
const { readFileSync } = require('node:fs');

// Get app version from package.json file
const filenamePackage = `./src/package.json`;
let a;
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
    a = __filename;

    // Strip off the filename
    b = upath.dirname(a);

    // Add path to package.json file
    c = upath.join(b, '..', filenamePackage);

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
// const chromiumRevision = '1056772';
// const chromiumRevisionLinux = '1056772';
const chromiumRevisionLinux = '1109227';
const chromiumRevisionWin = '1097664';
const chromiumRevisionMac = '1097624';
// const chromiumRevisionMac = '1056772';

// const cdnUrl = 'https://storage.googleapis.com/chromium-browser-snapshots';
// const cdnUrl = 'https://www.googleapis.com/download/storage/v1/b/chromium-browser-snapshots/o/';

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
 * Booleann to indicate if we are running as a standalone app or not
 */
const isSea = sea.isSea();
const bsiExecutablePath = isSea ? upath.dirname(process.execPath) : process.cwd();

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
    logger,
    appVersion,
    getLoggingLevel,
    setLoggingLevel,
    isSea,
    bsiExecutablePath,
    getChromiumRevision,
    sleep,
};
