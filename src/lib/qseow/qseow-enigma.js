/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
const SenseUtilities = require('enigma.js/sense-utilities');
const WebSocket = require('ws');
const fs = require('fs-extra');
const upath = require('upath');
const { logger, bsiExecutablePath } = require('../../globals');

/**
 *
 * @param {*} filename
 * @returns
 */
const readCert = (filename) => fs.readFileSync(filename);

/**
 * Sets up an Enigma connection to a Qlik Sense Enterprise on Windows (QSEoW) server.
 *
 * @param {string} appId - The ID of the Qlik Sense app to connect to.
 * @param {Object} options - Options for the Enigma connection.
 * @param {string} options.host - Host name or IP address of the Qlik Sense server.
 * @param {string} [options.port=4747] - Port number to connect to on the Qlik Sense server.
 * @param {string} options.prefix - URL prefix for accessing the Qlik Sense engine.
 * @param {boolean|string} [options.secure=false] - Whether to use a secure connection (HTTPS).
 * @param {string} options.apiuserdir - User directory for login.
 * @param {string} options.apiuserid - User ID for login.
 * @param {string} options.certfile - Path to the certificate file to use for authentication.
 * @param {string} options.certkeyfile - Path to the certificate key file to use for authentication.
 * @param {boolean|string} [options.rejectUnauthorized=false] - Whether to reject unauthorized certificates.
 * @param {string} options.schemaversion - The version of the Enigma schema to use.
 * @param {Object} command - Command options, used for logging.
 *
 * @returns {Object} An object with properties `schema` and `url` to be used when creating an Enigma session.
 */
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
