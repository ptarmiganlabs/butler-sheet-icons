const qrsInteract = require('qrs-interact');

const { logger } = require('./globals');
const { setupQseowQrsConnection } = require('./qrs');

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
                        // logger.verbose(`Content library '${contentlibrary}' exists`);
                        resolve(true);
                    } else {
                        // Content library mpt found
                        // logger.error(`Content library '${contentlibrary}' does not exist - aborting`);
                        resolve(false);
                    }
                })
                .catch((err) => {
                    // Return error msg
                    logger.error(`CONTENT LIBRARY 1: ${err}`);
                    reject(false);
                });
        } catch (err) {
            logger.error(`CONTENT LIBRARY 2: ${JSON.stringify(err, null, 2)}`);
            reject(false);
        }
    });

module.exports = {
    qseowVerifyContentLibraryExists,
};
