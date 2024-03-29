const qrsInteract = require('qrs-interact');

const { logger } = require('../../globals');
const { setupQseowQrsConnection } = require('./qseow-qrs');

/**
 *
 * @param {*} options
 */
const qseowVerifyContentLibraryExists = (options) =>
    new Promise((resolve, reject) => {
        try {
            logger.debug('Checking if QSEoW content library already exists');

            const qseowConfigQrs = setupQseowQrsConnection(options);
            // eslint-disable-next-line new-cap
            const qrsInteractInstance = new qrsInteract(qseowConfigQrs);

            const { contentlibrary } = options;

            const apiUrl = `/contentlibrary?filter=name eq '${contentlibrary}'`;
            logger.debug(`API URL: ${apiUrl}`);

            // Test if content library already exists
            qrsInteractInstance
                .Get(apiUrl)
                .then((result) => {
                    if (result.statusCode === 200 && result.body.length > 0) {
                        // Content library found
                        logger.debug(`Content library '${contentlibrary}' exists`);
                        resolve(true);
                    } else {
                        // Content library mpt found
                        logger.debug(`Content library '${contentlibrary}' does not exist`);
                        resolve(false);
                    }
                })
                .catch((err) => {
                    // Return error msg
                    if (err.stack) {
                        logger.error(`QSEOW CONTENT LIBRARY 1 (stack): ${err.stack}`);
                    } else if (err.message) {
                        logger.error(`QSEOW CONTENT LIBRARY 1 (message): ${err.message}`);
                    } else {
                        logger.error(`QSEOW CONTENT LIBRARY 1: ${err}`);
                    }

                    reject(new Error(`CONTENT LIBRARY 1: ${err}`));
                });
        } catch (err) {
            if (err.stack) {
                logger.error(`QSEOW CONTENT LIBRARY 2 (stack): ${err.stack}`);
            } else if (err.message) {
                logger.error(`QSEOW CONTENT LIBRARY 2 (message): ${err.message}`);
            } else {
                logger.error(`QSEOW CONTENT LIBRARY 2: ${JSON.stringify(err, null, 2)}`);
            }

            reject(new Error(`CONTENT LIBRARY 2: ${err}`));
        }
    });

module.exports = {
    qseowVerifyContentLibraryExists,
};
