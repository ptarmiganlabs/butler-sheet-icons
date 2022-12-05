const upath = require('upath');
const { promises: Fs } = require('fs');

const { logger, bsiExecutablePath } = require('../../globals');

/**
 *
 * @param {*} path
 * @returns
 */
async function exists(pathToCheck) {
    try {
        await Fs.access(pathToCheck);
        return true;
    } catch {
        return false;
    }
}

/**
 *
 * @param {*} options
 * @returns
 */
const qseowVerifyCertificatesExist = (options) =>
    // eslint-disable-next-line no-unused-vars
    new Promise(async (resolve, reject) => {
        try {
            logger.debug('Checking if QSEoW certificates exists');

            const certFile = upath.isAbsolute(options.certfile)
                ? options.certfile
                : upath.join(bsiExecutablePath, options.certfile);
            const certKeyFile = upath.isAbsolute(options.certkeyfile)
                ? options.certkeyfile
                : upath.join(bsiExecutablePath, options.certkeyfile);

            logger.debug(`Path to Qlik Sense certificate file: ${certFile}`);
            logger.debug(`Path to Qlik Sense certificate key file: ${certKeyFile}`);

            const certExists = await exists(certFile);
            const certKeyExists = await exists(certKeyFile);

            if (certExists === true) {
                logger.verbose(`Certificate file ${certFile} exists`);
            } else {
                logger.error(`Certificate file ${certFile} missing`);
                resolve(false);
            }

            if (certKeyExists === true) {
                logger.verbose(`Certificate key file ${certKeyFile} exists`);
            } else {
                logger.error(`Certificate key file ${certKeyFile} missing`);
                resolve(false);
            }

            resolve(true);
        } catch (err) {
            logger.error(`CERT CHECK: ${JSON.stringify(err, null, 2)}`);
            resolve(false);
        }
    });

module.exports = {
    qseowVerifyCertificatesExist,
};
