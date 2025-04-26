/* eslint-disable no-await-in-loop */
/* eslint-disable import/extensions */
import { logger, setLoggingLevel, bsiExecutablePath, isSea } from '../../globals.js';
import QlikSaas from './cloud-repo.js';
import { qscloudTestConnection } from './cloud-test-connection.js';
import { processCloudApp } from './process-cloud-app.js';

/**
 * Create thumbnails for Qlik Sense Cloud (QSC)
 * @param {object} options - Object containing options for creating thumbnails
 * @param {string} options.tenanturl - URL of Qlik Sense Cloud tenant
 * @param {string} options.apikey - API key for Qlik Sense Cloud tenant
 * @param {string} options.loglevel - log level for the operation
 * @param {string} options.logonuserid - user ID for Qlik Sense Cloud tenant
 * @param {string} options.logonpwd - password for Qlik Sense Cloud tenant
 * @param {string} options.collectionid - ID of collection in Qlik Sense Cloud tenant
 * @param {string} options.appid - ID of app in Qlik Sense Cloud tenant
 * @param {string} options.imagedir - directory where images will be stored
 * @param {string} options.includesheetpart - optional parameter to include sheet parts in the thumbnails. Values: 1, 2, 4
 * @param {string} options.schemaversion - version of the QS schema
 * @param {string} options.appid - ID of app in Qlik Sense Cloud tenant
 * @param {string} options.browser - name of browser to use for rendering thumbnails
 * @param {string} options.browserVersion - version of browser to use for rendering thumbnails
 * @param {string} options.blurSheetStatus - which sheet statuses should be blurred
 * @param {string} options.blurSheetTag - which sheet tags should be blurred
 * @param {string} options.blurSheetNumber - number of sheets to blur
 * @param {string} options.blurFactor - blur factor
 *
 * @returns {Promise<boolean>} - true if thumbnails were created successfully, false otherwise
 */
export const qscloudCreateThumbnails = async (options) => {
    try {
        // Set log level
        if (options.loglevel === undefined || options.logLevel) {
            // eslint-disable-next-line no-param-reassign
            options.loglevel = options.logLevel;
        }
        setLoggingLevel(options.loglevel);

        logger.info('Starting creation of thumbnails for Qlik Sense Cloud');
        logger.verbose(`Running as standalone app: ${isSea}`);
        logger.debug(`BSI executable path: ${bsiExecutablePath}`);
        logger.debug(`Options: ${JSON.stringify(options, null, 2)}`);

        const appIdsToProcess = [];

        // If --includesheetpart has been specifed it should contain a valid value
        if (
            options.includesheetpart !== '1' &&
            options.includesheetpart !== '2' &&
            options.includesheetpart !== '4' &&
            options.includesheetpart !== 1 &&
            options.includesheetpart !== 2 &&
            options.includesheetpart !== 4
        ) {
            logger.error(
                `Invalid --includesheetpart paramater: ${options.includesheetpart}. Aborting`
            );
            throw Error('Invalid --includesheetpart paramater');
        }

        // Get array of all available collections
        const cloudConfig = {
            url: options.tenanturl,
            token: options.apikey,
            // version: X, // optional. default is: 1
        };
        const saasInstance = new QlikSaas(cloudConfig);

        // Test connection to QS Cloud by getting info about the user associated with the API key
        try {
            const res = await qscloudTestConnection(options, saasInstance);
            logger.verbose(
                `Connection to tenant ${options.tenanturl} successful: ${JSON.stringify(res)}`
            );
        } catch (err) {
            if (err.stack) {
                logger.error(`TEST CONNECTIVITY 1 (stack): ${err.stack}`);
            } else if (err.message) {
                logger.error(`TEST CONNECTIVITY 1 (message): ${err.message}`);
                if (err.status && err.statusText) {
                    logger.error(
                        `TEST CONNECTIVITY 1 (error code): ${err.status}="${err.statusText}"`
                    );
                }
            } else {
                logger.error(`TEST CONNECTIVITY 1: ${err}`);
            }

            return false;
        }

        // Is there a specific app ID specified?
        if (options.appid) {
            appIdsToProcess.push(options.appid);
        }

        // If --collection exists we should loop over all matching apps.
        // If --collection does not exist the app specified by --appid should be processed.
        if (options.collectionid && options.collectionid.length > 0) {
            // Get index of specified collection among the existin ones.
            const allCollections = await saasInstance.Get('collections');
            logger.debug(`Collections:\n${JSON.stringify(allCollections, null, 2)}`);

            const index = allCollections.map((e) => e.id).indexOf(options.collectionid);

            if (index === -1) {
                // Collection not found
                logger.error(`Collection '${options.collectionid}' does not exist - aborting`);
                throw Error('Collection does not exist');
            } else {
                // Collection found
                logger.verbose(`Collection '${options.collectionid}' exists`);

                // Get all items within collection
                const collectionItems = await saasInstance.Get(
                    `collections/${options.collectionid}/items`
                );

                // Process all apps in this collection
                // eslint-disable-next-line no-restricted-syntax
                for (const item of collectionItems) {
                    // Is item an app?
                    if (item.resourceType === 'app') {
                        appIdsToProcess.push(item.resourceAttributes.id);
                    } else {
                        logger.verbose(
                            `Skipping collection item ${item.id} as it is not an app: ${item.resourceType}`
                        );
                    }
                }
            }
        }

        // Remove duplicates (if any) from list of app IDs that will be processed
        const uniqueAppIds = [...new Set(appIdsToProcess)];

        // Debug output of apps that will be processed
        logger.debug('Will process these app IDs:');
        uniqueAppIds.forEach((appId) => {
            logger.debug(appId);
        });

        // Process all apps
        // eslint-disable-next-line no-restricted-syntax
        for (const appId of uniqueAppIds) {
            try {
                logger.info(`--------------------------------------------------`);
                logger.info(`About to process app ${appId}`);

                await processCloudApp(appId, saasInstance, options);

                logger.verbose(`Done processing app ${appId}`);
            } catch (err) {
                if (err.stack) {
                    logger.error(`CLOUD PROCESS APP (stack): ${err.stack}`);
                } else if (err.message) {
                    logger.error(`CLOUD PROCESS APP (message): ${err.message}`);
                } else {
                    logger.error(`CLOUD PROCESS APP: ${err}`);
                }
            }
        }

        return true;
    } catch (err) {
        if (err.stack) {
            logger.error(`CLOUD CREATE THUMBNAILS 2 (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`CLOUD CREATE THUMBNAILS 2 (message): ${err.message}`);
        } else {
            logger.error(`CLOUD CREATE THUMBNAILS 2: ${JSON.stringify(err, null, 2)}`);
        }

        return false;
    }
};
