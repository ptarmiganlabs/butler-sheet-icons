/* eslint-disable no-await-in-loop */
const enigma = require('enigma.js');

const { setupEnigmaConnection } = require('./qseow-enigma');
const { logger } = require('../../globals');

/**
 *
 * @param {*} createdFiles
 * @param {*} appId
 * @param {*} options
 */
const qseowUpdateSheetThumbnails = async (createdFiles, appId, options) => {
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
            `Created session to server ${options.host}, engine version is ${engineVersion.qComponentVersion}`
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
                // Is this sheet among those that should be updated?
                // eslint-disable-next-line no-loop-func
                if (createdFiles.find((element) => element.sheetPos === iSheetNum) === undefined) {
                    // No thumbnail for this sheet, skip
                    logger.info(
                        `Skipping update of sheet sheet ${iSheetNum}: Name '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}'`
                    );
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
                    // options.blurSheetTag is an array of strings
                    // tagSheetAppMetadata is an array of sheet objects, with the id property being the sheet id
                    if (options.blurSheetTag && blurSheet === false) {
                        // Does the sheet id match any of the ids in tagSheetAppMetadata array?
                        // Set blurSheet to true/false based on the result
                        blurSheet = tagSheetAppMetadata.some(
                            (element) => element.engineObjectId === sheet.qInfo.qId
                        );
                        logger.verbose(
                            `Blurred sheet thumbnail (via tags): ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}'`
                        );
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
                        logger.info(`Using blurred thumbnail for sheet ${iSheetNum}: Name '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}'`);

                        // Set new sheet thumbnail
                        sheetProperties.thumbnail.qStaticContentUrlDef.qUrl = `/content/${options.contentlibrary}/thumbnail-${appId}-${iSheetNum}-blurred.png`;
                    } else {
                        logger.info(`Using regular thumbnail for sheet ${iSheetNum}: Name '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}'`);
                                                
                        // Set new sheet thumbnail
                        sheetProperties.thumbnail.qStaticContentUrlDef.qUrl = `/content/${options.contentlibrary}/thumbnail-${appId}-${iSheetNum}.png`;
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
                `Closed session after updating sheet thumbnail images in QSEoW app ${appId} on host ${options.host}`
            );
        } else {
            logger.error(`Error closing session for QSEoW app ${appId} on host ${options.host}`);
        }
    } catch (err) {
        if (err.stack) {
            logger.error(`QSEOW UPDATE SHEETS (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`QSEOW UPDATE SHEETS (message): ${err.message}`);
        } else {
            logger.error(`QSEOW UPDATE SHEETS: ${JSON.stringify(err, null, 2)}`);
        }

        process.exit(1);
    }
};

module.exports = {
    qseowUpdateSheetThumbnails,
};
