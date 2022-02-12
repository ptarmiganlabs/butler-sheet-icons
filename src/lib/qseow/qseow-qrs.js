const path = require('path');
const { logger } = require('../../globals');

/**
 *
 * @param {*} options
 * @returns
 */
const setupQseowQrsConnection = (options) => {
    logger.debug('Setting up connection to QSEoW QRS...');

    // Set up QSEoW repository service configuration
    // Always connect directly to QRS, i.e. with virtual proxy ''
    return {
        hostname: options.host,
        portnumber: options.qrsport,
        virtualProxyPrefix: '',
        certificates: {
            certFile: path.resolve(__dirname, options.certfile),
            keyFile: path.resolve(__dirname, options.certkeyfile),
        },
        headers: {
            'Content-Type': 'png',
            'X-Qlik-User': `UserDirectory=${options.apiuserdir};UserId=${options.apiuserid}`,
        },
    };
};

module.exports = {
    setupQseowQrsConnection,
};
