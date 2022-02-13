/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
const SenseUtilities = require('enigma.js/sense-utilities');
const WebSocket = require('ws');
const { logger } = require('../../globals');

/**
 *
 * @param {*} appId
 * @param {*} options
 * @param {*} command
 * @returns
 */
// eslint-disable-next-line no-unused-vars
const setupEnigmaConnection = (appId, options, command) => {
    logger.debug(`Prepping for cloud Enigma connection for app ${appId}`);

    const qixSchema = require(`enigma.js/schemas/${options.schemaversion}`);

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

module.exports = {
    setupEnigmaConnection,
};
