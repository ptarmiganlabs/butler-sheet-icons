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
            // port: options.engineport,
            // prefix: options.prefix,
            secure: true,
            appId,
        }),
        createSocket: (url) =>
            new WebSocket(url, {
                // key: readCert(path.resolve(__dirname, options.certkeyfile)),
                // cert: readCert(path.resolve(__dirname, options.certfile)),
                headers: {
                    // 'X-Qlik-User': `UserDirectory=${options.apiuserdir};UserId=${options.apiuserid}`,
                    Authorization: `Bearer ${options.apikey}`,
                },
                // rejectUnauthorized: options.rejectUnauthorized === 'true',
            }),
    };
};

module.exports = {
    setupEnigmaConnection,
};
