import qrsInteract from 'qrs-interact';

import { logger } from '../../globals.js';
import { setupQseowQrsConnection } from './qseow-qrs.js';
import { qrsGetList } from './qrs-response.js';
import { qrsFilterAnyOf, qrsPathWithFilter } from './qrs-filter.js';

/**
 * Verifies if a specified content library exists in Qlik Sense Enterprise on Windows (QSEoW).
 *
 * @param {object} options - Configuration options for the verification.
 * @param {string} options.contentlibrary - Name of the content library to check for existence.
 *
 * @returns {Promise<boolean>} Resolves to `true` if the content library exists, `false` otherwise.
 *
 * @throws {Error} Throws an error if there is an issue during the verification process.
 */
export const qseowVerifyContentLibraryExists = async (options) => {
    try {
        logger.debug('Checking if QSEoW content library already exists');

        const qseowConfigQrs = setupQseowQrsConnection(options);

        const qrsInteractInstance = new qrsInteract(qseowConfigQrs);

        const { contentlibrary } = options;

        const apiUrl = qrsPathWithFilter('/contentlibrary', qrsFilterAnyOf('name', contentlibrary));
        logger.debug(`API URL: ${apiUrl}`);

        // qrsGetList throws when QRS answers with something that is not a list, so an empty
        // result here means "no library matched the filter" and nothing else. That distinction
        // matters: the caller turns `false` into "Content library '<name>' does not exist -
        // aborting", which is the wrong advice, and the wrong thing to go fix, when the real
        // problem is that QRS or a proxy in front of it returned something unreadable.
        const matches = await qrsGetList(qrsInteractInstance, apiUrl);

        if (matches.length > 0) {
            logger.debug(`Content library '${contentlibrary}' exists`);
            return true;
        }

        logger.debug(`Content library '${contentlibrary}' does not exist`);
        return false;
    } catch (err) {
        if (err.stack) {
            logger.error(`QSEOW CONTENT LIBRARY 1 (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`QSEOW CONTENT LIBRARY 1 (message): ${err.message}`);
        } else {
            logger.error(`QSEOW CONTENT LIBRARY 1: ${err}`);
        }

        throw new Error(`CONTENT LIBRARY 1: ${err}`, { cause: err });
    }
};
