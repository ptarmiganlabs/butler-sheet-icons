import SenseUtilities from 'enigma.js/sense-utilities.js';
import WebSocket from 'ws';
import fs from 'fs-extra';

import { logger, bsiExecutablePath } from '../../globals.js';
import { getEnigmaSchema } from '../util/enigma-util.js';
import { getCertFilePaths } from '../util/cert.js';

/**
 * Reads a file from disk and returns its bytes.
 *
 * @param {string} filename - Absolute path to the file.
 *
 * @returns {Buffer} The file contents.
 */
const readCert = (filename) => fs.readFileSync(filename);

/**
 * Sets up an Enigma connection to a Qlik Sense Enterprise on Windows (QSEoW) server.
 *
 * @param {string} appId - The ID of the Qlik Sense app to connect to.
 * @param {object} options - Options for the Enigma connection.
 * @param {string} options.host - Host name or IP address of the Qlik Sense server.
 * @param {string} [options.engineport] - Port number to connect to on the Qlik Sense server. Defaults to `4747`.
 * @param {string} options.prefix - URL prefix for accessing the Qlik Sense engine.
 * @param {boolean|string} [options.secure] - Whether to use a secure connection (HTTPS). Defaults to `false`.
 * @param {string} options.apiuserdir - User directory for login.
 * @param {string} options.apiuserid - User ID for login.
 * @param {string} options.certfile - Path to the certificate file to use for authentication.
 * @param {string} options.certkeyfile - Path to the certificate key file to use for authentication.
 * @param {boolean|string} [options.rejectUnauthorized] - Whether to reject unauthorized certificates. Defaults to `false`.
 * @param {string} options.schemaversion - The version of the Enigma schema to use.
 * @param {object} command - Command options, used for logging.
 *
 * @returns {object} An object with `schema`, `url`, and `createSocket(url)` to be used when creating an Enigma session.
 */
export const setupEnigmaConnection = (appId, options, command) => {
    logger.debug(`Prepping for QSEoW Enigma connection for app ${appId}`);

    // Set up enigma.js configuration
    logger.debug(`Enigma.js schema version: ${options.schemaversion}`);

    const qixSchema = getEnigmaSchema(options);
    logger.debug(`Successfully loaded Enigma schema.`);

    logger.verbose(`Using certificates for authentication with Enigma`);
    logger.debug(`BSI executable path: ${bsiExecutablePath}`);

    // Get certificate paths
    const { fileCert, fileCertKey } = getCertFilePaths(options);

    logger.debug(`Cert file: ${fileCert}`);
    logger.debug(`Key file: ${fileCertKey}`);

    return {
        schema: qixSchema,
        url: SenseUtilities.buildUrl({
            host: options.host,
            port: options.engineport,
            prefix: options.prefix,
            secure: options.secure === 'true' || options.secure === true,
            appId,
        }),
        /**
         * Builds a `WebSocket` connection to the QSEoW Enigma endpoint, using the loaded
         * client certificate and the API user header for authentication.
         *
         * @param {string} url - Full WebSocket URL produced by `SenseUtilities.buildUrl`.
         *
         * @returns {WebSocket} A `ws` WebSocket instance ready to be used by `enigma.js`.
         */
        createSocket: (url) =>
            new WebSocket(url, {
                key: readCert(fileCertKey),
                cert: readCert(fileCert),
                headers: {
                    'X-Qlik-User': `UserDirectory=${options.apiuserdir};UserId=${options.apiuserid}`,
                },
                rejectUnauthorized:
                    options.rejectUnauthorized === 'true' || options.rejectUnauthorized === true,
            }),
    };
};
