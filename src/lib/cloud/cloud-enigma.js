/* eslint-disable global-require */
import SenseUtilities from 'enigma.js/sense-utilities.js';
import WebSocket from 'ws';

import { logger } from '../../globals.js';
import { getEnigmaSchema } from '../util/enigma-util.js';

/**
 * Sets up an Enigma connection to a Qlik Sense SaaS tenant.
 *
 * @param {string} appId - The ID of the Qlik Sense app to connect to.
 * @param {Object} options - Options for the Enigma connection.
 * @param {string} options.schemaversion - The version of the Enigma schema to use.
 * @param {string} options.tenanturl - The URL of the Qlik Sense SaaS tenant.
 * @param {string} options.apikey - The API key to use for authentication.
 * @param {Object} command - Command options, used for logging.
 *
 * @returns {Object} An object with properties `schema` and `url` to be used when creating an Enigma session.
 */
export const setupEnigmaConnection = (appId, options, command) => {
    logger.debug(`Prepping for cloud Enigma connection for app ${appId}`);

    // Set up enigma.js configuration
    logger.debug(`Enigma.js schema version: ${options.schemaversion}`);
    const qixSchema = getEnigmaSchema(options);

    return {
        schema: qixSchema,
        url: SenseUtilities.buildUrl({
            host: options.tenanturl,
            secure: true,
            appId,
        }),
        createSocket: (url) =>
            new WebSocket(url, {
                headers: {
                    Authorization: `Bearer ${options.apikey}`,
                },
            }),
    };
};
