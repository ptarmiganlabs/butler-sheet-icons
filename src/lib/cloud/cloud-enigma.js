import SenseUtilities from 'enigma.js/sense-utilities.js';
import WebSocket from 'ws';

import { logger } from '../../globals.js';
import { getEnigmaSchema } from '../util/enigma-util.js';

/**
 * Sets up an Enigma connection to a Qlik Sense SaaS tenant.
 *
 * @param {string} appId - The ID of the Qlik Sense app to connect to.
 * @param {object} options - Options for the Enigma connection.
 * @param {string} options.schemaversion - The version of the Enigma schema to use.
 * @param {string} options.tenanturl - The URL of the Qlik Sense SaaS tenant.
 * @param {string} options.apikey - The API key to use for authentication.
 * @param {object} command - Command options, used for logging.
 *
 * @returns {object} An object with `schema`, `url`, and `createSocket(url)` to be used when creating an Enigma session.
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
        /**
         * Builds a `WebSocket` connection to the SaaS Enigma endpoint, using the API key for authentication.
         *
         * @param {string} url - Full WebSocket URL produced by `SenseUtilities.buildUrl`.
         *
         * @returns {WebSocket} A `ws` WebSocket instance ready to be used by `enigma.js`.
         */
        createSocket: (url) =>
            new WebSocket(url, {
                headers: {
                    Authorization: `Bearer ${options.apikey}`,
                },
            }),
    };
};
