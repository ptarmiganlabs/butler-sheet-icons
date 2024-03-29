/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
const SenseUtilities = require('enigma.js/sense-utilities');
const WebSocket = require('ws');
const fs = require('fs-extra');
const upath = require('upath');
const { logger, bsiExecutablePath } = require('../../globals');

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

    const certFile = upath.isAbsolute(options.certfile)
        ? options.certfile
        : upath.join(bsiExecutablePath, options.certfile);
    const keyFile = upath.isAbsolute(options.certkeyfile)
        ? options.certkeyfile
        : upath.join(bsiExecutablePath, options.certkeyfile);

    // try {
    const qixSchema = require(`enigma.js/schemas/${options.schemaversion}`);
    logger.debug(`Successfully required Enigma`);

    return {
        schema: qixSchema,
        url: SenseUtilities.buildUrl({
            host: options.host,
            port: options.engineport,
            prefix: options.prefix,
            secure: options.secure === 'true' || options.secure === true,
            appId,
        }),
        createSocket: (url) =>
            new WebSocket(url, {
                key: readCert(keyFile),
                cert: readCert(certFile),
                headers: {
                    'X-Qlik-User': `UserDirectory=${options.apiuserdir};UserId=${options.apiuserid}`,
                },
                rejectUnauthorized:
                    options.rejectUnauthorized === 'true' || options.rejectUnauthorized === true,
            }),
    };
    // } catch (err) {
    //     logger.error(`ENIGMA: ${err}`);
    // }
};

module.exports = {
    setupEnigmaConnection,
};
