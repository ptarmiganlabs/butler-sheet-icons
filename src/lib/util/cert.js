import path from 'path';

import { bsiExecutablePath } from '../../globals.js';
import { CertError } from './errors.js';

/**
 * Resolves the certificate and key file paths to absolute paths, anchored at
 * the Butler Sheet Icons executable directory.
 *
 * @param {object} options - Options object with the following properties.
 * @param {string} options.certfile - Path to the client certificate file (relative to the BSI executable dir).
 * @param {string} options.certkeyfile - Path to the certificate key file (relative to the BSI executable dir).
 *
 * @returns {{ fileCert: string, fileCertKey: string }} Absolute paths to the client certificate and key files.
 *
 * @throws {CertError} When path resolution fails. The top-level safety net
 *   in `src/butler-sheet-icons.js` will write a crash dump and exit.
 */
export const getCertFilePaths = (options) => {
    let fileCert;
    let fileCertKey;
    // let fileCertCA;

    try {
        // Get cert paths from command line options
        fileCert = path.resolve(bsiExecutablePath, options.certfile);
        fileCertKey = path.resolve(bsiExecutablePath, options.certkeyfile);
        // fileCertCA = path.resolve(bsiExecutablePath, options.authRootCertFile);
    } catch (err) {
        throw new CertError('Failed to resolve certificate file paths', { cause: err });
    }

    // return { fileCert, fileCertKey, fileCertCA };
    return { fileCert, fileCertKey };
};
