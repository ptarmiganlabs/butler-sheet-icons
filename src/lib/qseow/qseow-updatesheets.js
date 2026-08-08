import { setupEnigmaConnection } from './qseow-enigma.js';
import { logger } from '../../globals.js';
import { QseowError } from '../util/errors.js';
import { withEngineSession } from '../util/engine-session.js';
import {
    isSheetTagged,
    runOverSheets,
    SHEET_SKIPPED,
    sortSheetsByRank,
    saveIfChanged,
} from '../util/sheet-list.js';

/**
 * Updates sheet thumbnails in a Qlik Sense Enterprise on Windows (QSEoW) app.
 *
 * @param {Array<object>} createdFiles - Array of objects describing the files
 * that were created during the previous step in the process.
 * @param {string} appId - The ID of the QSEoW app to process.
 * @param {object} options - Configuration options for processing the app.
 * @param {Array<object>} [tagSheetAppMetadata] - Sheet metadata from QRS for sheets carrying the
 * tag named by `--blur-sheet-tag`, each entry exposing `engineObjectId`. Defaults to empty so the
 * tag rule simply matches nothing when the caller has not looked it up.
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

        // Warn rather than silently ignore: --blur-sheet-tag is accepted by the CLI but nothing
        // looks the tag up yet, so the rule below can never match. See issue #840.
        if (options.blurSheetTag && tagSheetAppMetadata.length === 0) {
            logger.warn(
                '--blur-sheet-tag is not yet implemented for QSEoW and will be ignored. See https://github.com/ptarmiganlabs/butler-sheet-icons/issues/840'
            );
        }

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
                                // Should blurred sheet thumbnail be used?
                                // Options are
                                // --blur-sheet-tag <value>
                                // --blur-sheet-number <number...>
                                // --blur-sheet-title <title...>
                                // --blur-sheet-status <status...>

                                let blurSheet = false;

                                // Should this sheet be blurred based on its published status?
                                // Public sheets
                                if (
                                    sheet.qMeta.approved === true &&
                                    sheet.qMeta.published === true &&
                                    options.blurSheetStatus &&
                                    options.blurSheetStatus.includes('public')
                                ) {
                                    blurSheet = true;
                                    logger.verbose(
                                        `Blurred sheet thumbnail (status public): ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}'`
                                    );
                                }

                                // Published sheets
                                if (
                                    sheet.qMeta.approved === false &&
                                    sheet.qMeta.published === true &&
                                    options.blurSheetStatus &&
                                    options.blurSheetStatus.includes('published')
                                ) {
                                    blurSheet = true;
                                    logger.verbose(
                                        `Blurred sheet thumbnail (status published): ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}'`
                                    );
                                }

                                // Should this sheet be blurred based on tags?
                                // tagSheetAppMetadata is an array of sheet objects, each exposing engineObjectId.
                                // It arrives empty unless the caller looked the tag up, which nothing does yet -
                                // see issue #840. Until then the rule matches nothing rather than throwing.
                                if (options.blurSheetTag && blurSheet === false) {
                                    blurSheet = isSheetTagged(tagSheetAppMetadata, sheet);
                                    if (blurSheet) {
                                        logger.verbose(
                                            `Blurred sheet thumbnail (via tags): ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}'`
                                        );
                                    }
                                }

                                // Should this sheet be blurred based on its position/sheet number?
                                if (options.blurSheetNumber && blurSheet === false) {
                                    // Does the sheet number match any of the numbers in options.blurSheetNumber array?
                                    // Take into account that iSheetNum is an integer, so we need to convert it to a string
                                    if (options.blurSheetNumber.includes(iSheetNum.toString())) {
                                        blurSheet = true;
                                        logger.verbose(
                                            `Blurred sheet thumbnail (via sheet number): ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}'`
                                        );
                                    }
                                }

                                // Should this sheet be blurred based on its title?
                                if (options.blurSheetTitle && blurSheet === false) {
                                    // Does the sheet title match any of the titles options.blurSheetTitle array?
                                    if (options.blurSheetTitle.includes(sheet.qMeta.title)) {
                                        blurSheet = true;
                                        logger.verbose(
                                            `Blurred sheet thumbnail (via sheet title): ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}'`
                                        );
                                    }
                                }

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
        if (err.stack) {
            logger.error(`QSEOW UPDATE SHEETS (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`QSEOW UPDATE SHEETS (message): ${err.message}`);
        } else {
            logger.error(`QSEOW UPDATE SHEETS: ${JSON.stringify(err, null, 2)}`);
        }

        throw new QseowError(`Failed to update sheet thumbnails in app ${appId}`, { cause: err });
    }

    sheetRun?.assertAllProcessed();
};
