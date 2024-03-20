/* eslint-disable import/extensions */
/* eslint-disable no-await-in-loop */

const { table } = require('table');
const { logger, setLoggingLevel, bsiExecutablePath, isPkg } = require('../../globals.js');
const QlikSaas = require('./cloud-repo');
const { qscloudTestConnection } = require('./cloud-test-connection');

/**
 *
 * @param {*} options
 * @returns
 */
const qscloudListCollections = async (options) => {
    try {
        // Set log level
        if (options.loglevel === undefined || options.logLevel) {
            // eslint-disable-next-line no-param-reassign
            options.loglevel = options.logLevel;
        }
        setLoggingLevel(options.loglevel);

        logger.verbose('Starting listing of available collections');
        logger.verbose(`Running as standalone app: ${isPkg}`);
        logger.debug(`BSI executable path: ${bsiExecutablePath}`);
        logger.debug(`Options: ${JSON.stringify(options, null, 2)}`);

        const cloudConfig = {
            url: options.tenanturl,
            token: options.apikey,
            // version: X, // optional. default is: 1
        };

        let saasInstance;
        try {
            saasInstance = new QlikSaas(cloudConfig);
        } catch (err) {
            if (err.stack) {
                logger.error(`LIST COLLECTIONS 1 (stack): ${err.stack}`);
            } else if (err.message) {
                logger.error(`LIST COLLECTIONS 1 (message): ${err.message}`);
            } else {
                logger.error(`LIST COLLECTIONS 1: ${err}`);
            }

            return false;
        }

        // Test connection to QS Cloud by getting info about the user associated with the API key
        try {
            const res = await qscloudTestConnection(options, saasInstance);
            logger.verbose(
                `Connection to tenant ${options.tenanturl} successful: ${JSON.stringify(res)}`
            );
        } catch (err) {
            if (err.stack) {
                logger.error(`LIST COLLECTIONS 1 (stack): ${err.stack}`);
            } else if (err.message) {
                logger.error(`LIST COLLECTIONS 1 (message): ${err.message}`);
                logger.error(`LIST COLLECTIONS 1 (error code): ${err.status}="${err.statusText}"`);
            } else {
                logger.error(`LIST COLLECTIONS 1: ${err}`);
            }

            return false;
        }

        // Get all available collections
        let allCollections;
        try {
            allCollections = await saasInstance.Get('collections');
        } catch (err) {
            if (err.stack) {
                logger.error(`LIST COLLECTIONS 2 (stack): ${err.stack}`);
            } else if (err.message) {
                logger.error(`LIST COLLECTIONS 2 (message): ${err.message}`);
            } else {
                logger.error(`LIST COLLECTIONS 2: ${err}`);
            }
            return false;
        }

        if (options.outputformat === 'table') {
            const tableConfig = {
                header: {
                    alignment: 'center',
                    content: `Butler Sheet Icons\nAvailable collections in tenant ${options.tenanturl}`,
                },
                columns: {
                    1: { width: 30, wrapWord: true },
                },
            };

            const collectionsTable = [];

            // Column headers
            collectionsTable.push([
                'Name',
                'Description',
                'ID',
                'Type',
                'Item count',
                'Created at',
                'Updated at',
            ]);

            allCollections.forEach((collection) => {
                collectionsTable.push([
                    collection.name,
                    collection.description === undefined ? '' : collection.description,
                    collection.id,
                    collection.type,
                    collection.itemCount,
                    collection.createdAt,
                    collection.updatedAt,
                ]);
            });

            logger.info(`Collections:\n${table(collectionsTable, tableConfig)}`);
        } else if (options.outputformat === 'json') {
            logger.info(`Collections:\n${JSON.stringify(allCollections, null, 2)}`);
        }

        return true;
    } catch (err) {
        if (err.stack) {
            logger.error(`LIST COLLECTIONS 3 (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`LIST COLLECTIONS 3 (message): ${err.message}`);
        } else {
            logger.error(`LIST COLLECTIONS 3: ${err}`);
        }

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
                    if (err.stack) {
                        logger.error(`CLOUD COLLECTION EXISTS 1 (stack): ${err.stack}`);
                    } else if (err.message) {
                        logger.error(`CLOUD COLLECTION EXISTS 1 (message): ${err.message}`);
                    } else {
                        logger.error(`CLOUD COLLECTION EXISTS 1: ${err}`);
                    }

                    reject(new Error(`COLLECTION EXISTS 1: ${err}`));
                });
        } catch (err) {
            if (err.stack) {
                logger.error(`CLOUD COLLECTION EXISTS 2 (stack): ${err.stack}`);
            } else if (err.message) {
                logger.error(`CLOUD COLLECTION EXISTS 2 (stack): ${err.message}`);
            } else {
                logger.error(`CLOUD COLLECTION EXISTS 2: ${JSON.stringify(err, null, 2)}`);
            }

            reject(new Error(`COLLECTION EXISTS: ${err}`));
        }
    });

module.exports = {
    qscloudListCollections,
    qscloudVerifyCollectionExists,
};
