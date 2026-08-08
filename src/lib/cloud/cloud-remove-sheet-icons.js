import { setupEnigmaConnection } from './cloud-enigma.js';
import { logger, setLoggingLevel, bsiExecutablePath, isSea } from '../../globals.js';
import { redactOptions } from '../util/redact-secrets.js';
import QlikSaas from './cloud-repo.js';
import { qscloudTestConnection } from './cloud-test-connection.js';
import { runOverApps } from '../util/run-over-apps.js';
import { CloudError } from '../util/errors.js';
import {
    runOverSheets,
    sortSheetsByRank,
    saveIfChanged,
    getSheetList,
    SHEET_LIST_FIELDS_EXTENDED,
} from '../util/sheet-list.js';
import { withEngineSession } from '../util/engine-session.js';

/**
 * Removes all sheet icons from a Qlik Sense Cloud app.
 *
 * @param {string} appId - The ID of the Qlik Sense Cloud app to process.
 * @param {object} saasInstance - Instance of the QlikSaas class.
 * @param {object} options - Configuration options for processing the app.
 * @param {string} options.tenanturl - Host address of the Qlik Sense Cloud tenant.
 * @param {string} options.apikey - API key for the Qlik Sense Cloud tenant.
 * @param {string} options.loglevel - The level of logging to output. Valid values are 'error', 'warn', 'info', 'verbose', 'debug', 'silly'.
 *
 * @returns {Promise<void>} Resolves once every sheet's icon has been removed, or the app has
 *     no sheets.
 *
 * @throws {CloudError} When any sheet's icon could not be removed. Other sheets are still
 *     attempted first and the engine session is always released.
 * @throws {Error} Whatever the engine or media API threw, if the session itself was lost.
 */
const removeSheetIconsCloudApp = async (appId, saasInstance, options) => {
    let sheetRun;

    try {
        // Configure Enigma.js
        const configEnigma = setupEnigmaConnection(appId, options);
        await withEngineSession(
            configEnigma,
            {
                logPrefix: 'CLOUD REMOVE SHEET ICONS',
                loglevel: options.loglevel,
                connectionLabel: `Qlik Sense Cloud tenant ${options.tenanturl}`,
            },
            async (global) => {
                const app = await global.openDoc(appId, '', '', '', false);
                logger.info(`Opened app ${appId}`);

                // Get list of app sheets
                const sheets = await getSheetList(app, SHEET_LIST_FIELDS_EXTENDED);

                if (sheets.length > 0) {
                    // sheets[] now contains array of app sheets.
                    logger.info(`Number of sheets in app: ${sheets.length}`);

                    // Sort sheets
                    sortSheetsByRank(sheets);

                    sheetRun = await runOverSheets(
                        sheets,
                        {
                            logPrefix: 'CLOUD REMOVE SHEET ICONS',
                            appId,
                            action: 'remove icons for',
                            ErrorClass: CloudError,
                        },
                        async (sheet, iSheetNum) => {
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
                        }
                    );
                }

                // Saved inside the session callback: withEngineSession closes the session once
                // this resolves or throws, so a save that rejects - a published app, or one the
                // service account may not write - still releases the websocket.
                await saveIfChanged(
                    app,
                    { logPrefix: 'CLOUD REMOVE SHEET ICONS', appId },
                    sheetRun?.changed ?? 0
                );
            }
        );
        logger.verbose(
            `Closed session after updating sheet thumbnail images in QS Cloud app ${appId} on tenant ${options.tenanturl}`
        );

        // Deleted only after the sheets have been repointed and the app saved. Doing it
        // first meant a failed save left every sheet pointing at images that no longer
        // existed - broken icons on every sheet, where the old behaviour of saving per
        // sheet had at least persisted the ones processed before the failure. Clearing the
        // reference and then removing the file is the order that degrades safely.
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

        logger.info(`Done processing app ${appId}`);
    } catch (err) {
        if (err.stack) {
            logger.error(`CLOUD REMOVE SHEET ICONS 1 (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`CLOUD REMOVE SHEET ICONS 1 (message): ${err.message}`);
        } else {
            logger.error(`CLOUD REMOVE SHEET ICONS 1: ${err}`);
        }
        // Rethrow so the app loop can count this app as failed. Logging and returning
        // normally made a run in which every app failed look exactly like a clean run.
        throw err;
    }

    sheetRun?.assertAllProcessed();
};

/**
 * Removes all sheet icons from one or more Qlik Sense Cloud applications.
 *
 * @param {object} options - Configuration options for the command.
 * @param {string} options.tenanturl - URL or host of Qlik Sense cloud tenant. Example: `https://tenant.eu.qlikcloud.com` or `tenant.eu.qlikcloud.com`.
 * @param {string} options.apikey - API key used to access the Sense APIs.
 * @param {string} options.appid - The ID of the Qlik Sense Cloud application to process.
 * @param {string} options.collectionid - The ID of the collection containing apps to process.
 * @param {string} options.loglevel - The level of logging to output. Valid values are 'error', 'warn', 'info', 'verbose', 'debug', 'silly'.
 *
 * @returns {Promise<boolean>} Resolves to `true` if thumbnails were removed successfully, `false` otherwise.
 */
export const qscloudRemoveSheetIcons = async (options) => {
    try {
        // Set log level
        if (options.loglevel === undefined || options.logLevel) {
            options.loglevel = options.logLevel;
        }
        setLoggingLevel(options.loglevel);

        logger.info('Starting removal of sheet icons for Qlik Sense Cloud');
        logger.verbose(`Running as standalone app: ${isSea}`);
        logger.debug(`BSI executable path: ${bsiExecutablePath}`);
        logger.debug(`Options: ${JSON.stringify(redactOptions(options), null, 2)}`);

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
                logger.error(`CLOUD REMOVE SHEET ICONS: connection test (stack): ${err.stack}`);
            } else if (err.message) {
                logger.error(`CLOUD REMOVE SHEET ICONS: connection test (message): ${err.message}`);
                logger.error(
                    `CLOUD REMOVE SHEET ICONS: connection test (error code): ${err.status}="${err.statusText}"`
                );
            } else {
                logger.error(`CLOUD REMOVE SHEET ICONS: connection test: ${err}`);
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

        return await runOverApps(
            appIdsToProcess,
            {
                logPrefix: 'CLOUD PROCESS APP 2',
                emptySelectionHint: 'Check the --appid and --collectionid options.',
            },
            (appId) => removeSheetIconsCloudApp(appId, saasInstance, options)
        );
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
