import upath from 'upath';
import { promises as Fs, constants as FsConstants } from 'fs';

import { logger, bsiExecutablePath } from '../../globals.js';
import { CertError } from '../util/errors.js';

/**
 * Checks that a file exists and can actually be read.
 *
 * `R_OK` rather than the default `F_OK`: these files are about to be read, so a certificate
 * that exists but is unreadable is no more use than a missing one. Checking existence alone
 * let such a file pass here, and the run then failed much later inside enigma with a TLS
 * error that named neither the file nor the permission problem.
 *
 * @param {string} pathToCheck - The file path to check.
 *
 * @returns {Promise<boolean>} `true` if the file exists and is readable, `false` if it is absent.
 *
 * @throws {Error} When the file exists but cannot be read (EACCES and similar). "Not found" and
 *   "found but unusable" are different answers and must not share a return value.
 */
async function exists(pathToCheck) {
    try {
        await Fs.access(pathToCheck, FsConstants.R_OK);
        return true;
    } catch (err) {
        if (err.code === 'ENOENT') {
            return false;
        }

        throw err;
    }
}

/**
 * Verifies that the specified certificate and key files exist.
 *
 * @param {object} options - Options object with the following properties:
 *   - `certfile`: The path to the certificate file.
 *   - `certkeyfile`: The path to the certificate key file.
 *
 * @returns {Promise<boolean>} Resolves `true` when both files exist and are readable, and `false`
 *   when either is genuinely absent. `false` means "not found", nothing else.
 *
 * @throws {CertError} When the check could not be carried out - a file that exists but cannot be
 *   read, or a path that cannot be resolved. Callers turn `false` into "Missing certificate
 *   file(s)", so a failure of this kind must not be reported through the return value: the
 *   operator would go looking for a file that is sitting right where they put it.
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
        // Rethrown rather than folded into `false`: the caller reports `false` as a missing
        // file, which would send the operator looking for a certificate that is present and
        // merely unreadable.
        logger.error(
            `QSEOW CERT CHECK: Could not check the certificate files: ${err?.stack || err?.message || err}`
        );

        throw new CertError('Could not read the Qlik Sense certificate files', { cause: err });
    }
};
