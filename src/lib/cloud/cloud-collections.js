/* eslint-disable import/extensions */
/* eslint-disable no-await-in-loop */
const { logger, setLoggingLevel } = require('../../globals.js');
const QlikSaas = require('./cloud-repo');

/**
 *
 * @param {*} options
 * @param {*} command
 * @returns
 */
const qscloudListCollections = async (options, command) => {
    try {
        // Set log level
        setLoggingLevel(options.loglevel);

        logger.info('Starting listing of available collections');
        logger.debug(`Options: ${JSON.stringify(options, null, 2)}`);

        const cloudConfig = {
            url: options.tenanturl,
            token: options.apikey,
            // version: X, // optional. default is: 1
        };

        const saasInstance = new QlikSaas(cloudConfig);

        // Get all available collections
        const allCollections = await saasInstance.Get('collections');
        logger.info(`Collections:\n${JSON.stringify(allCollections, null, 2)}`);

        return true;
    } catch (err) {
        logger.error(`LIST COLLECTIONS 1: ${err}`);
        return false;
    }
};

const qscloudVerifyCollectionExists = (options) =>
    new Promise((resolve, reject) => {
        try {
            logger.debug('Checking if QS Cloud collection already exists');

            const cloudConfig = {
                url: options.tenanturl,
                token: options.apikey,
                // version: X, // optional. default is: 1
            };

            const saasInstance = new QlikSaas(cloudConfig);

            // Get all available collections
            saasInstance
                .Get('collections')
                .then((allCollections) => {
                    logger.debug(
                        `COLLECTION EXISTS: Collections:\n${JSON.stringify(
                            allCollections,
                            null,
                            2
                        )}`
                    );

                    // Get index of specified collection among the existin ones.
                    const index = allCollections.map((e) => e.id).indexOf(options.collectionid);

                    if (index === -1) {
                        // Content library mpt found
                        resolve(false);
                    } else {
                        // Collection found
                        resolve(true);
                    }
                })
                .catch((err) => {
                    // Return error msg
                    logger.error(`COLLECTION EXISTS 1: ${err}`);
                    reject(new Error(`COLLECTION EXISTS 1: ${err}`));
                });
        } catch (err) {
            logger.error(`COLLECTION EXISTS: ${JSON.stringify(err, null, 2)}`);
            reject(new Error(`COLLECTION EXISTS: ${err}`));
        }
    });

module.exports = {
    qscloudListCollections,
    qscloudVerifyCollectionExists,
};
