/* eslint-disable no-await-in-loop */
import enigma from 'enigma.js';

import { setupEnigmaConnection } from './cloud-enigma.js';
import { logger } from '../../globals.js';

/**
 * Updates sheet thumbnails in a Qlik Sense Cloud app.
 *
 * @param {Array<Object>} createdFiles - Array of objects describing the files
 * that were created during the thumbnail creation step. Each object includes
 * properties `fileNameShort` (short name of the file), and `fileNameShortBlurred`
 * (short name of the blurred file).
 * @param {string} appId - The ID of the Qlik Sense Cloud app to process.
 * @param {Object} options - Configuration options for updating the app.
 * @param {string} options.tenanturl - URL of the Qlik Sense Cloud tenant.
 * @param {string} options.apikey - API key for authentication.
 * @param {string} options.loglevel - Log level for the operation.
 * @param {Array<string>} [options.blurSheetStatus] - Array of sheet statuses to be blurred.
 * @param {Array<string>} [options.blurSheetNumber] - Array of sheet numbers to be blurred.
 * @param {Array<string>} [options.blurSheetTitle] - Array of sheet titles to be blurred.
 *
 * @returns {Promise<void>} A promise that resolves when the sheet thumbnails
 * have been successfully updated in the Qlik Sense Cloud app.
 */

export const qscloudUpdateSheetThumbnails = async (createdFiles, appId, options) => {
    try {
        logger.verbose(`Starting update of sheet icons for app ${appId}`);

        // Configure Enigma.js
        const configEnigma = setupEnigmaConnection(appId, options);

        const session = await enigma.create(configEnigma);
        if (options.loglevel === 'silly') {
            // eslint-disable-next-line no-console
            session.on('traffic:sent', (data) => console.log('sent:', data));
            // eslint-disable-next-line no-console
            session.on('traffic:received', (data) => console.log('received:', data));
        }

        const global = await session.open();

        const engineVersion = await global.engineVersion();
        logger.verbose(
            `Created session to Qlik Sense Cloud tenant ${options.tenanturl}, engine version is ${engineVersion.qComponentVersion}`
        );

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
            sheetListObj.qAppObjectList.qItems.sort((sheet1, sheet2) => {
                if (sheet1.qData.rank < sheet2.qData.rank) return -1;
                if (sheet1.qData.rank > sheet2.qData.rank) return 1;
                return 0;
            });

            let iSheetNum = 1;
            // eslint-disable-next-line no-restricted-syntax
            for (const sheet of sheetListObj.qAppObjectList.qItems) {
                const createdFile = createdFiles.find((element) => element.sheetPos === iSheetNum);
                if (!createdFile) {
                    logger.info(
                        `Skipping update of sheet ${iSheetNum}: Name '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}'`
                    );
                } else {
                    // Should blurred sheet thumbnail be used?
                    // Options are
                    // --blur-sheet-number <number...>
                    // --blur-sheet-title <title...>
                    // --blur-sheet-status <status...>

                    let blurSheet = false;

                    // Get published status of sheet
                    let sheetPublished;
                    if (sheet.qMeta?.published === undefined || sheet.qMeta.published === false) {
                        sheetPublished = false;
                    } else {
                        sheetPublished = true;
                    }

                    // Get approved status of sheet
                    let sheetApproved;
                    if (sheet.qMeta?.approved === undefined || sheet.qMeta.approved === false) {
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
                    logger.debug(`Set thumbnail result: ${JSON.stringify(res, null, 2)}`);
                    await app.doSave();
                }
                iSheetNum += 1;
            }
        }

        if ((await session.close()) === true) {
            logger.verbose(
                `Closed session after updating sheet thumbnail images in QS Cloud app ${appId} on host ${options.host}`
            );
        } else {
            logger.error(`Error closing session for QS Cloud app ${appId}`);
        }
    } catch (err) {
        if (err.stack) {
            logger.error(`CLOUD UPDATE SHEETS (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`CLOUD UPDATE SHEETS (stack): ${err.message}`);
        } else {
            logger.error(`CLOUD UPDATE SHEETS: ${JSON.stringify(err, null, 2)}`);
        }

        process.exit(1);
    }
};
