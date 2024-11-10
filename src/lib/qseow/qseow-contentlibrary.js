const qrsInteract = require('qrs-interact');

const { logger } = require('../../globals');
const { setupQseowQrsConnection } = require('./qseow-qrs');

/**
 *
 * @param {*} options
 */
const qseowVerifyContentLibraryExists = async (options) => {
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

module.exports = {
    qseowVerifyContentLibraryExists,
};
