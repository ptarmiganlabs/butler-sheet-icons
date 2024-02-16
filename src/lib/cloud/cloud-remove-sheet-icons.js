/* eslint-disable no-await-in-loop */
/* eslint-disable import/extensions */
const enigma = require('enigma.js');

const { setupEnigmaConnection } = require('./cloud-enigma.js');
const { logger, setLoggingLevel, bsiExecutablePath, isPkg } = require('../../globals.js');
const QlikSaas = require('./cloud-repo');
const { qscloudTestConnection } = require('./cloud-test-connection');

/**
 *
 * @param {*} appId
 * @param {*} saasInstance
 * @param {*} options
 */
const removeSheetIconsCloudApp = async (appId, saasInstance, options) => {
    try {
        // Does the app have a thumbnail folder in its media library?
        const mediaList = await saasInstance.Get(`apps/${appId}/media/list`);

        if (
            mediaList.find((item) => {
                const thumbnailFolderExists =
                    item.type === 'directory' && item.name === 'thumbnails';
                return thumbnailFolderExists;
            })
        ) {
            // "thumbnails" folder exists in app's media library
            // Remove all existing thumbnail images from this app
            const existingThumbnails = await saasInstance.Get(
                `apps/${appId}/media/list/thumbnails`
            );

            // eslint-disable-next-line no-restricted-syntax
            for (const thumbnailImg of existingThumbnails) {
                if (thumbnailImg.type === 'image') {
                    const result = await saasInstance.Delete(
                        `apps/${appId}/media/files/thumbnails/${thumbnailImg.name}`
                    );
                    logger.debug(
                        `Deleted existing file ${JSON.stringify(
                            thumbnailImg.name
                        )}, result=${JSON.stringify(result)}`
                    );
                }
            }
        }

        // Configure Enigma.js
        const configEnigma = setupEnigmaConnection(appId, options);
        const session = await enigma.create(configEnigma);

        if (options.loglevel === 'silly') {
            // eslint-disable-next-line no-console
            session.on('traffic:sent', (data) => console.log('sent:', data));
            session.on('traffic:received', (data) =>
                // eslint-disable-next-line no-console
                console.log('received:', JSON.stringify(data, null, 2))
            );
        }

        const global = await session.open();

        const engineVersion = await global.engineVersion();
        logger.verbose(
            `Created session to Qlik Sense Cloud tenant ${options.tenanturl}, engine version is ${engineVersion.qComponentVersion}`
        );

        const app = await global.openDoc(appId, '', '', '', false);
        logger.info(`Opened app ${appId}`);

        // Get list of app sheets
        const appSheetsCall = {
            qInfo: {
                qId: 'SheetList',
                qType: 'SheetList',
            },
            qAppObjectListDef: {
                qType: 'sheet',
                qData: {
                    title: '/qMetaDef/title',
                    description: '/qMetaDef/description',
                    thumbnail: '/thumbnail',
                    cells: '/cells',
                    rank: '/rank',
                    columns: '/columns',
                    rows: '/rows',
                },
            },
        };

        const genericListObj = await app.createSessionObject(appSheetsCall);
        const sheetListObj = await genericListObj.getLayout();

        if (sheetListObj.qAppObjectList.qItems.length > 0) {
            // sheetListObj.qAppObjectList.qItems[] now contains array of app sheets.
            logger.info(`Number of sheets in app: ${sheetListObj.qAppObjectList.qItems.length}`);

            // Sort sheets
            sheetListObj.qAppObjectList.qItems.sort((sheet1, sheet2) => {
                if (sheet1.qData.rank < sheet2.qData.rank) return -1;
                if (sheet1.qData.rank > sheet2.qData.rank) return 1;
                return 0;
            });

            let iSheetNum = 1;

            // eslint-disable-next-line no-restricted-syntax
            for (const sheet of sheetListObj.qAppObjectList.qItems) {
                logger.info(
                    `Removing icon for sheet ${iSheetNum}: Name '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}'`
                );

                // Get properties of current sheet
                const sheetObj = await app.getObject(sheet.qInfo.qId);
                const sheetProperties = await sheetObj.getProperties();

                // Clear sheet icon
                sheetProperties.thumbnail.qStaticContentUrlDef.qUrl = '';

                const res = await sheetObj.setProperties(sheetProperties);
                logger.debug(`Set thumbnail result: ${JSON.stringify(res, null, 2)}`);
                await app.doSave();

                iSheetNum += 1;
            }

            if ((await session.close()) === true) {
                logger.verbose(
                    `Closed session after updating sheet thumbnail images in QS Cloud app ${appId} on host ${options.host}`
                );
            } else {
                logger.error(`Error closing session for QS Cloud app ${appId}`);
            }
        }

        logger.info(`Done processing app ${appId}`);
    } catch (err) {
        if (err.stack) {
            logger.error(`CLOUD REMOVE SHEET ICONS 1 (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`CLOUD REMOVE SHEET ICONS 1 (message): ${err.message}`);
        } else {
            logger.error(`CLOUD REMOVE SHEET ICONS 1: ${err}`);
        }
    }
};

/**
 *
 * @param {*} options
 * @returns
 */
const qscloudRemoveSheetIcons = async (options) => {
    try {
        // Set log level
        setLoggingLevel(options.loglevel);

        logger.info('Starting removal of sheet icons for Qlik Sense Cloud');
        logger.verbose(`Running as standalone app: ${isPkg}`);
        logger.debug(`BSI executable path: ${bsiExecutablePath}`);
        logger.debug(`Options: ${JSON.stringify(options, null, 2)}`);

        const appIdsToProcess = [];

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
                logger.error(`LIST COLLECTIONS 1 (stack): ${err.stack}`);
            } else if (err.message) {
                logger.error(`LIST COLLECTIONS 1 (message): ${err.message}`);
                logger.error(`LIST COLLECTIONS 1 (error code): ${err.status}="${err.statusText}"`);
            } else {
                logger.error(`LIST COLLECTIONS 1: ${err}`);
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

                await removeSheetIconsCloudApp(appId, saasInstance, options);

                logger.verbose(`Done processing app ${appId}`);
            } catch (err) {
                logger.error(`CLOUD PROCESS APP 2: ${err}`);
                if (err.message) {
                    logger.error(`CLOUD PROCESS APP 2 (message): ${err.message}`);
                }
                if (err.stack) {
                    logger.error(`CLOUD PROCESS APP 2 (stack): ${err.stack}`);
                }
            }
        }

        return true;
    } catch (err) {
        if (err.stack) {
            logger.error(`CLOUD REMOVE THUMBNAILS 3 (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`CLOUD REMOVE THUMBNAILS 3 (message): ${err.message}`);
        } else {
            logger.error(`CLOUD REMOVE THUMBNAILS 3: ${JSON.stringify(err, null, 2)}`);
        }

        return false;
    }
};

module.exports = {
    qscloudRemoveSheetIcons,
};
