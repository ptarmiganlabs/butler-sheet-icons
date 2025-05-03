import upath from 'upath';
import { promises as Fs } from 'fs';

import { logger, bsiExecutablePath } from '../../globals.js';

/**
 * Checks if the specified file path exists and is accessible.
 *
 * @param {string} pathToCheck - The file path to check for existence.
 *
 * @returns {Promise<boolean>} - A promise that resolves to `true` if the file exists and is accessible, `false` otherwise.
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
 * Verifies that the specified certificate and key files exist.
 *
 * @param {object} options - Options object with the following properties:
 *   - `certfile`: The path to the certificate file.
 *   - `certkeyfile`: The path to the certificate key file.
 *
 * @returns {Promise<boolean>} - A promise that resolves to `true` if both the certificate and key files exist and are accessible, `false` otherwise.
 */
export const qseowVerifyCertificatesExist = async (options) => {
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

        if (certExists) {
            logger.verbose(`Certificate file ${certFile} exists`);
        } else {
            logger.error(`Certificate file ${certFile} missing`);
            return false;
        }

        if (certKeyExists) {
            logger.verbose(`Certificate key file ${certKeyFile} exists`);
        } else {
            logger.error(`Certificate key file ${certKeyFile} missing`);
            return false;
        }

        return true;
    } catch (err) {
        if (err.stack) {
            logger.error(`QSEOW CERT CHECK (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`QSEOW CERT CHECK (message): ${err.message}`);
        } else {
            logger.error(`QSEOW CERT CHECK: ${JSON.stringify(err, null, 2)}`);
        }

        return false;
    }
};
