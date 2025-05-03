import qrsInteract from 'qrs-interact';

import { logger } from '../../globals.js';
import { setupQseowQrsConnection } from './qseow-qrs.js';

/**
 * Verifies if a specified content library exists in Qlik Sense Enterprise on Windows (QSEoW).
 *
 * @param {object} options - Configuration options for the verification.
 * @param {string} options.contentlibrary - Name of the content library to check for existence.
 *
 * @returns {Promise<boolean>} - Resolves to true if the content library exists, false otherwise.
 *
 * @throws {Error} - Throws an error if there is an issue during the verification process.
 */

export const qseowVerifyContentLibraryExists = async (options) => {
    try {
        logger.debug('Checking if QSEoW content library already exists');

        const qseowConfigQrs = setupQseowQrsConnection(options);
        // eslint-disable-next-line new-cap
        const qrsInteractInstance = new qrsInteract(qseowConfigQrs);

        const { contentlibrary } = options;

        const apiUrl = `/contentlibrary?filter=name eq '${contentlibrary}'`;
        logger.debug(`API URL: ${apiUrl}`);

        // Test if content library already exists
        const result = await qrsInteractInstance.Get(apiUrl);

        if (result.statusCode === 200 && result.body.length > 0) {
            // Content library found
            logger.debug(`Content library '${contentlibrary}' exists`);
            return true;
        } else {
            // Content library not found
            logger.debug(`Content library '${contentlibrary}' does not exist`);
            return false;
        }
    } catch (err) {
        if (err.stack) {
            logger.error(`QSEOW CONTENT LIBRARY 1 (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`QSEOW CONTENT LIBRARY 1 (message): ${err.message}`);
        } else {
            logger.error(`QSEOW CONTENT LIBRARY 1: ${err}`);
        }

        throw new Error(`CONTENT LIBRARY 1: ${err}`);
    }
};
