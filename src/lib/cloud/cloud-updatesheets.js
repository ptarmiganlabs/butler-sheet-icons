import { setupEnigmaConnection } from './cloud-enigma.js';
import { logger } from '../../globals.js';
import { CloudError } from '../util/errors.js';
import { withEngineSession } from '../util/engine-session.js';
import { logError } from '../util/log-error.js';
import {
    runOverSheets,
    SHEET_SKIPPED,
    sortSheetsByRank,
    saveIfChanged,
    getSheetList,
} from '../util/sheet-list.js';
import { determineSheetBlurStatus } from './determine-sheet-blur-status.js';

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
                const sheets = await getSheetList(app);

                if (sheets.length > 0) {
                    // dimObj.qAppObjectList.qItems[] now contains array of app sheets.
                    logger.info(`Number of sheets: ${sheets.length}`);

                    // Sort sheets
                    sortSheetsByRank(sheets);

                    sheetRun = await runOverSheets(
                        sheets,
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
                                // The blur decision lives in determine-sheet-blur-status.js so
                                // the dry-run planner shares it (#993); only the write below
                                // stays here.
                                const { blurSheet } = determineSheetBlurStatus(
                                    sheet,
                                    options,
                                    iSheetNum,
                                    logger
                                );

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
        logError('CLOUD UPDATE SHEETS', err);

        throw new CloudError(`Failed to update sheet thumbnails in app ${appId}`, { cause: err });
    }

    sheetRun?.assertAllProcessed();
};
