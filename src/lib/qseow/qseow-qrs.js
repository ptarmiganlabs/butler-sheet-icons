import upath from 'upath';
import { logger, bsiExecutablePath } from '../../globals.js';

/**
 * Set up connection to QSEoW QRS.
 *
 * @param {object} options - QSEoW options.
 * @param {string} options.host - Qlik Sense server hostname.
 * @param {number} options.qrsport - QRS port number.
 * @param {string} options.certfile - Path to the certificate file.
 * @param {string} options.certkeyfile - Path to the certificate key file.
 * @param {string} options.apiuserdir - User directory for the API user.
 * @param {string} options.apiuserid - User ID for the API user.
 *
 * @returns {object} QRS connection object consumable by `qrs-interact`.
 */
export const setupQseowQrsConnection = (options) => {
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
