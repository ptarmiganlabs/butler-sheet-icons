const upath = require('upath');
const { logger, bsiExecutablePath } = require('../../globals');

/**
 *
 * @param {*} options
 * @returns
 */
const setupQseowQrsConnection = (options) => {
    logger.debug('Setting up connection to QSEoW QRS...');

    const certFile = upath.isAbsolute(options.certfile)
        ? options.certfile
        : upath.join(bsiExecutablePath, options.certfile);
    const keyFile = upath.isAbsolute(options.certkeyfile)
        ? options.certkeyfile
        : upath.join(bsiExecutablePath, options.certkeyfile);

    // Set up QSEoW repository service configuration
    // Always connect directly to QRS, i.e. with virtual proxy ''
    return {
        hostname: options.host,
        portnumber: options.qrsport,
        virtualProxyPrefix: '',
        certificates: {
            certFile,
            keyFile,
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
