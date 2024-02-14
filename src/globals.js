const winston = require('winston');
const upath = require('upath');

// Get app version from package.json file
const appVersion = require('./package.json').version;

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
// Correlate with Correlate with https://chromium.woolyss.com to get revision number to get revision number
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
 *
 * @param {*} newLevel
 */
const setLoggingLevel = (newLevel) => {
    logTransports.find((transport) => transport.name === 'console').level = newLevel;
};

const isPkg = typeof process.pkg !== 'undefined';
const bsiExecutablePath = isPkg ? upath.dirname(process.execPath) : __dirname;

function sleep(ms) {
    // eslint-disable-next-line no-promise-executor-return
    return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
    logger,
    appVersion,
    getLoggingLevel,
    setLoggingLevel,
    isPkg,
    bsiExecutablePath,
    getChromiumRevision,
    sleep,
};
