/* eslint-disable import/extensions */
/* eslint-disable no-await-in-loop */

import { table } from 'table';
import { logger, setLoggingLevel, bsiExecutablePath, isSea } from '../../globals.js';
import QlikSaas from './cloud-repo.js';
import { qscloudTestConnection } from './cloud-test-connection.js';

/**
 * Lists all available collections in the Qlik Sense Cloud tenant.
 *
 * @param {Object} options - Configuration options for listing collections.
 * @param {string} options.tenanturl - URL or host of Qlik Sense cloud tenant.
 * @param {string} options.apikey - API key used to access the Sense APIs.
 * @param {string} options.outputformat - Output format, either 'table' or 'json'.
 * @param {string} [options.loglevel] - Optional log level.
 *
 * @returns {Promise<boolean>} - Resolves to true if collections are successfully listed, false otherwise.
 *
 * @throws {Error} - Throws an error if there is an issue during the listing process.
 */

export const qscloudListCollections = async (options) => {
    try {
        // Set log level
        if (options.loglevel === undefined || options.logLevel) {
            // eslint-disable-next-line no-param-reassign
            options.loglevel = options.logLevel;
        }
        setLoggingLevel(options.loglevel);

        logger.verbose('Starting listing of available collections');
        logger.verbose(`Running as standalone app: ${isSea}`);
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

/**
 * Checks if a specified QS Cloud collection already exists.
 *
 * @param {object} options - Configuration options for the verification.
 * @param {string} options.tenanturl - URL of the QS Cloud tenant.
 * @param {string} options.apikey - API key for the QS Cloud tenant.
 * @param {string} options.collectionid - ID of the collection to check for existence.
 *
 * @returns {Promise<boolean>} - Resolves to true if the collection exists, false otherwise.
 *
 * @throws {Error} - Throws an error if there is an issue during the verification process.
 */
export const qscloudVerifyCollectionExists = async (options) => {
    try {
        logger.debug('Checking if QS Cloud collection already exists');

        const cloudConfig = {
            url: options.tenanturl,
            token: options.apikey,
            // version: X, // optional. default is: 1
        };

        const saasInstance = new QlikSaas(cloudConfig);

        // Get all available collections
        const allCollections = await saasInstance.Get('collections');
        logger.debug(`COLLECTION EXISTS: Collections:\n${JSON.stringify(allCollections, null, 2)}`);

        // Get index of specified collection among the existing ones.
        const index = allCollections.map((e) => e.id).indexOf(options.collectionid);

        if (index === -1) {
            // Collection not found
            return false;
        } else {
            // Collection found
            return true;
        }
    } catch (err) {
        if (err.stack) {
            logger.error(`CLOUD COLLECTION EXISTS 1 (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`CLOUD COLLECTION EXISTS 1 (message): ${err.message}`);
        } else {
            logger.error(`CLOUD COLLECTION EXISTS 1: ${err}`);
        }

        throw new Error(`COLLECTION EXISTS 1: ${err}`);
    }
};
