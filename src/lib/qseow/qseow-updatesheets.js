import { setupEnigmaConnection } from './qseow-enigma.js';
import { logger } from '../../globals.js';
import { QseowError } from '../util/errors.js';
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
 * Updates sheet thumbnails in a Qlik Sense Enterprise on Windows (QSEoW) app.
 *
 * @param {Array<object>} createdFiles - Array of objects describing the files
 * that were created during the previous step in the process.
 * @param {string} appId - The ID of the QSEoW app to process.
 * @param {object} options - Configuration options for processing the app.
 * @param {Array<object>} [tagSheetAppMetadata] - Sheet metadata from QRS for sheets carrying a tag
 * named by `--blur-sheet-tag`, each entry exposing `engineObjectId`. This is the blur-tag set, not
 * the exclude-tag one: passing the latter would blur every sheet the operator asked to skip.
 * Defaults to empty so the tag rule matches nothing when the caller has not looked it up.
 *
 * @returns {Promise<void>} Resolves when every sheet that had a generated thumbnail was
 *     updated.
 *
 * @throws {QseowError} When any sheet could not be updated, or when thumbnails were created
 *     but no sheet matched one. Other sheets are still attempted first and the engine
 *     session is always released.
 * @throws {Error} Whatever the engine threw, if the session itself was lost.
 */
export const qseowUpdateSheetThumbnails = async (
    createdFiles,
    appId,
    options,
    tagSheetAppMetadata = []
) => {
    let sheetRun;

    try {
        logger.verbose(`Starting update of sheet icons for app ${appId}`);

        // Configure Enigma.js
        const configEnigma = setupEnigmaConnection(appId, options);

        await withEngineSession(
            configEnigma,
            {
                logPrefix: 'QSEOW UPDATE SHEETS',
                loglevel: options.loglevel,
                connectionLabel: `server ${options.host}`,
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
                            logPrefix: 'QSEOW UPDATE SHEETS',
                            appId,
                            action: 'update',
                            requireAttempt: createdFiles.length > 0,
                            ErrorClass: QseowError,
                        },
                        async (sheet, iSheetNum) => {
                            // Is this sheet among those that should be updated?

                            if (
                                createdFiles.find((element) => element.sheetPos === iSheetNum) ===
                                undefined
                            ) {
                                // No thumbnail for this sheet, skip. Guarded: this line is inside
                                // the counted region, so an unguarded dereference here would fail
                                // the app over a sheet nobody was going to touch.
                                logger.info(
                                    `Skipping update of sheet sheet ${iSheetNum}: Name '${sheet?.qMeta?.title}', ID ${sheet?.qInfo?.qId}, description '${sheet?.qMeta?.description}'`
                                );

                                return SHEET_SKIPPED;
                            } else {
                                // The blur decision lives in determine-sheet-blur-status.js so
                                // the dry-run planner shares it (#993); only the write below
                                // stays here.
                                const { blurSheet } = determineSheetBlurStatus(
                                    sheet,
                                    options,
                                    tagSheetAppMetadata,
                                    iSheetNum,
                                    logger
                                );

                                // Get properties of current sheet
                                const sheetObj = await app.getObject(sheet.qInfo.qId);
                                const sheetProperties = await sheetObj.getProperties();

                                if (blurSheet === true) {
                                    logger.info(
                                        `Using blurred thumbnail for sheet ${iSheetNum}: Name '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}'`
                                    );

                                    // Set new sheet thumbnail
                                    sheetProperties.thumbnail.qStaticContentUrlDef.qUrl = `/content/${options.contentlibrary}/thumbnail-${appId}-${iSheetNum}-blurred.png`;
                                } else {
                                    logger.info(
                                        `Using regular thumbnail for sheet ${iSheetNum}: Name '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}'`
                                    );

                                    // Set new sheet thumbnail
                                    sheetProperties.thumbnail.qStaticContentUrlDef.qUrl = `/content/${options.contentlibrary}/thumbnail-${appId}-${iSheetNum}.png`;
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
                    { logPrefix: 'QSEOW UPDATE SHEETS', appId },
                    sheetRun?.changed ?? 0
                );
            }
        );
        logger.verbose(
            `Closed session after updating sheet thumbnail images in QSEoW app ${appId} on host ${options.host}`
        );
    } catch (err) {
        logError('QSEOW UPDATE SHEETS', err);

        throw new QseowError(`Failed to update sheet thumbnails in app ${appId}`, { cause: err });
    }

    sheetRun?.assertAllProcessed();
};
