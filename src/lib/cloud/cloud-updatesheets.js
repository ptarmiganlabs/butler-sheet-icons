import { setupEnigmaConnection } from './cloud-enigma.js';
import { logger } from '../../globals.js';
import { CloudError } from '../util/errors.js';
import { withEngineSession } from '../util/engine-session.js';
import {
    runOverSheets,
    SHEET_SKIPPED,
    sortSheetsByRank,
    saveIfChanged,
} from '../util/sheet-list.js';

/**
 * Updates sheet thumbnails in a Qlik Sense Cloud app.
 *
 * @param {Array<object>} createdFiles - Array of objects describing the files
 * that were created during the thumbnail creation step. Each object includes
 * properties `fileNameShort` (short name of the file), and `fileNameShortBlurred`
 * (short name of the blurred file).
 * @param {string} appId - The ID of the Qlik Sense Cloud app to process.
 * @param {object} options - Configuration options for updating the app.
 * @param {string} options.tenanturl - URL of the Qlik Sense Cloud tenant.
 * @param {string} options.apikey - API key for authentication.
 * @param {string} options.loglevel - Log level for the operation.
 * @param {Array<string>} [options.blurSheetStatus] - Array of sheet statuses to be blurred.
 * @param {Array<string>} [options.blurSheetNumber] - Array of sheet numbers to be blurred.
 * @param {Array<string>} [options.blurSheetTitle] - Array of sheet titles to be blurred.
 *
 * @returns {Promise<void>} Resolves when every sheet that had a generated thumbnail was
 *     updated.
 *
 * @throws {CloudError} When any sheet could not be updated, or when thumbnails were created
 *     but no sheet matched one. Other sheets are still attempted first and the engine
 *     session is always released.
 * @throws {Error} Whatever the engine threw, if the session itself was lost.
 */
export const qscloudUpdateSheetThumbnails = async (createdFiles, appId, options) => {
    let sheetRun;

    try {
        logger.verbose(`Starting update of sheet icons for app ${appId}`);

        // Configure Enigma.js
        const configEnigma = setupEnigmaConnection(appId, options);

        await withEngineSession(
            configEnigma,
            {
                logPrefix: 'CLOUD UPDATE SHEETS',
                loglevel: options.loglevel,
                connectionLabel: `Qlik Sense Cloud tenant ${options.tenanturl}`,
            },
            async (global) => {
                const app = await global.openDoc(appId, '', '', '', false);
                logger.verbose(`Opened app ${appId}`);

                // Get list of app sheets
                const appSheetsCall = {
                    qInfo: {
                        qId: 'SheetList',
                        qType: 'SheetList',
                    },
                    qAppObjectListDef: {
                        qType: 'sheet',
                        qData: {
                            thumbnail: '/thumbnail',
                            rank: '/rank',
                        },
                    },
                };

                const genericListObj = await app.createSessionObject(appSheetsCall);
                const sheetListObj = await genericListObj.getLayout();

                if (sheetListObj.qAppObjectList.qItems.length > 0) {
                    // dimObj.qAppObjectList.qItems[] now contains array of app sheets.
                    logger.info(`Number of sheets: ${sheetListObj.qAppObjectList.qItems.length}`);

                    // Sort sheets
                    sortSheetsByRank(sheetListObj.qAppObjectList.qItems);

                    sheetRun = await runOverSheets(
                        sheetListObj.qAppObjectList.qItems,
                        {
                            logPrefix: 'CLOUD UPDATE SHEETS',
                            appId,
                            action: 'update',
                            requireAttempt: createdFiles.length > 0,
                            ErrorClass: CloudError,
                        },
                        async (sheet, iSheetNum) => {
                            const createdFile = createdFiles.find(
                                (element) => element.sheetPos === iSheetNum
                            );
                            if (!createdFile) {
                                // Guarded: this line is inside the counted region, so an unguarded
                                // dereference here would fail the app over a sheet nobody was
                                // going to touch.
                                logger.info(
                                    `Skipping update of sheet ${iSheetNum}: Name '${sheet?.qMeta?.title}', ID ${sheet?.qInfo?.qId}, description '${sheet?.qMeta?.description}'`
                                );

                                return SHEET_SKIPPED;
                            } else {
                                // Should blurred sheet thumbnail be used?
                                // Options are
                                // --blur-sheet-number <number...>
                                // --blur-sheet-title <title...>
                                // --blur-sheet-status <status...>

                                let blurSheet = false;

                                // Get published status of sheet
                                let sheetPublished;
                                if (
                                    sheet.qMeta?.published === undefined ||
                                    sheet.qMeta.published === false
                                ) {
                                    sheetPublished = false;
                                } else {
                                    sheetPublished = true;
                                }

                                // Get approved status of sheet
                                let sheetApproved;
                                if (
                                    sheet.qMeta?.approved === undefined ||
                                    sheet.qMeta.approved === false
                                ) {
                                    sheetApproved = false;
                                } else {
                                    sheetApproved = true;
                                }

                                // Should this sheet be blurred based on its published status?
                                // Public sheets
                                if (
                                    sheetApproved === true &&
                                    sheetPublished === true &&
                                    options.blurSheetStatus &&
                                    options.blurSheetStatus.includes('public')
                                ) {
                                    blurSheet = true;
                                    logger.verbose(
                                        `Blurred sheet thumbnail (status public): ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}'`
                                    );
                                }

                                // Published sheets
                                if (
                                    sheetApproved === false &&
                                    sheetPublished === true &&
                                    options.blurSheetStatus &&
                                    options.blurSheetStatus.includes('published')
                                ) {
                                    blurSheet = true;
                                    logger.verbose(
                                        `Blurred sheet thumbnail (status published): ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}'`
                                    );
                                }

                                // Should this sheet be blurred based on its position/sheet number?
                                if (options.blurSheetNumber && blurSheet === false) {
                                    // Does the sheet number match any of the numbers in options.blurSheetNumber array?
                                    // Take into account that iSheetNum is an integer, so we need to convert it to a string
                                    if (options.blurSheetNumber.includes(iSheetNum.toString())) {
                                        blurSheet = true;
                                        logger.verbose(
                                            `Blurred sheet thumbnail (via sheet number): ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}'`
                                        );
                                    }
                                }

                                // Should this sheet be blurred based on its title?
                                if (options.blurSheetTitle && blurSheet === false) {
                                    // Does the sheet title match any of the titles options.blurSheetTitle array?
                                    if (options.blurSheetTitle.includes(sheet.qMeta.title)) {
                                        blurSheet = true;
                                        logger.verbose(
                                            `Blurred sheet thumbnail (via sheet title): ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}'`
                                        );
                                    }
                                }

                                // Get properties of current sheet
                                const sheetObj = await app.getObject(sheet.qInfo.qId);
                                const sheetProperties = await sheetObj.getProperties();

                                if (blurSheet === true && createdFile.fileNameShortBlurred) {
                                    logger.info(
                                        `Using blurred thumbnail for sheet ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}'`
                                    );

                                    sheetProperties.thumbnail.qStaticContentUrlDef.qUrl = `/api/v1/apps/${appId}/media/files/thumbnails/${createdFile.fileNameShortBlurred}`;
                                } else {
                                    logger.info(
                                        `Using regular thumbnail for sheet ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}'`
                                    );

                                    sheetProperties.thumbnail.qStaticContentUrlDef.qUrl = `/api/v1/apps/${appId}/media/files/thumbnails/${createdFile.fileNameShort}`;
                                }

                                // Set & save new sheet thumbnail
                                const res = await sheetObj.setProperties(sheetProperties);
                                logger.debug(
                                    `Set thumbnail result: ${JSON.stringify(res, null, 2)}`
                                );
                            }
                        }
                    );
                }

                // Saved inside the session callback: withEngineSession closes the session once
                // this resolves or throws, so a save that rejects - a published app, or one the
                // service account may not write - still releases the websocket.
                await saveIfChanged(
                    app,
                    { logPrefix: 'CLOUD UPDATE SHEETS', appId },
                    sheetRun?.changed ?? 0
                );
            }
        );
        logger.verbose(
            `Closed session after updating sheet thumbnail images in QS Cloud app ${appId} on tenant ${options.tenanturl}`
        );
    } catch (err) {
        if (err.stack) {
            logger.error(`CLOUD UPDATE SHEETS (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`CLOUD UPDATE SHEETS (stack): ${err.message}`);
        } else {
            logger.error(`CLOUD UPDATE SHEETS: ${JSON.stringify(err, null, 2)}`);
        }

        throw new CloudError(`Failed to update sheet thumbnails in app ${appId}`, { cause: err });
    }

    sheetRun?.assertAllProcessed();
};
