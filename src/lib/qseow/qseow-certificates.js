const path = require('path');
const { promises: Fs } = require('fs');

const { logger } = require('../../globals');

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
    new Promise(async (resolve, reject) => {
        try {
            logger.debug('Checking if QSEoW certificates exists');

            const certFile = path.resolve(__dirname, options.certfile);
            const certKeyFile = path.resolve(__dirname, options.certkeyfile);

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
