import path from 'path';

import { bsiExecutablePath } from '../../globals.js';

/**
 * Resolves the paths to the certificate files (client and key) and the root
 * certificate file based on the command line options.
 *
 * @param {Object} options - Options object with the following properties:
 *   - `authCertFile`: The path to the certificate file.
 *   - `authCertKeyFile`: The path to the certificate key file.
 *   - `authRootCertFile`: The path to the root certificate file.
 *
 * @returns {Object} An object with the resolved paths to the certificate files
 * and the root certificate file.
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
        process.exit(1);
    }

    // return { fileCert, fileCertKey, fileCertCA };
    return { fileCert, fileCertKey };
};
