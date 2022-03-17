/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
const SenseUtilities = require('enigma.js/sense-utilities');
const WebSocket = require('ws');
const fs = require('fs-extra');
const path = require('path');
const { logger } = require('../../globals');

/**
 * Helper function to read the contents of the certificate files:
 * @param {*} filename
 * @returns
 */
const readCert = (filename) => fs.readFileSync(filename);

/**
 *
 * @param {*} appId
 * @param {*} options
 * @param {*} command
 * @returns
 */
// eslint-disable-next-line no-unused-vars
const setupEnigmaConnection = (appId, options, command) => {
    logger.debug(`Prepping for QSEoW Enigma connection for app ${appId}`);
    const qixSchema = require(`enigma.js/schemas/${options.schemaversion}`);
    logger.debug(`Successfully required Enigma`);

    return {
        schema: qixSchema,
        url: SenseUtilities.buildUrl({
            host: options.host,
            port: options.engineport,
            prefix: options.prefix,
            secure: options.secure === 'true',
            appId,
        }),
        createSocket: (url) =>
            new WebSocket(url, {
                key: readCert(path.resolve(__dirname, options.certkeyfile)),
                cert: readCert(path.resolve(__dirname, options.certfile)),
                headers: {
                    'X-Qlik-User': `UserDirectory=${options.apiuserdir};UserId=${options.apiuserid}`,
                },
                rejectUnauthorized: options.rejectUnauthorized === 'true',
            }),
    };
};

module.exports = {
    setupEnigmaConnection,
};
