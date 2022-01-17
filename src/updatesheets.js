/* eslint-disable no-await-in-loop */
const enigma = require('enigma.js');

const { setupEnigmaConnection } = require('./enigma');
const { logger } = require('./globals');

/**
 *
 * @param {*} options
 */
const qseowUpdateSheetThumbnails = async (options) => {
    try {
        logger.info('Starting update of sheet icons');

        // Configure Enigma.js
        const configEnigma = setupEnigmaConnection(options);

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

        const app = await global.openDoc(options.appid, '', '', '', false);
        logger.info(`Opened app ${options.appid}`);

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
            logger.info(
                `UPDATE: Number of sheets in app: ${sheetListObj.qAppObjectList.qItems.length}`
            );

            // Sort sheets
            sheetListObj.qAppObjectList.qItems.sort((sheet1, sheet2) => {
                if (sheet1.qData.rank < sheet2.qData.rank) return -1;
                else if (sheet1.qData.rank > sheet2.qData.rank) return 1;
                else return 0;
            });

            let iSheetNum = 1;
            // eslint-disable-next-line no-restricted-syntax
            for (const sheet of sheetListObj.qAppObjectList.qItems) {
                logger.info(
                    `Updating thumbnail for sheet ${iSheetNum}: Name '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}'`
                );

                // Get properties of current sheet
                const sheetObj = await app.getObject(sheet.qInfo.qId);
                const sheetProperties = await sheetObj.getProperties();

                // Set new sheet thumbnail
                if (options.prefix.length > 0) {
                    sheetProperties.thumbnail.qStaticContentUrlDef.qUrl = `/${options.prefix}/content/${options.contentlibrary}/app-${options.appid}-sheet-${iSheetNum}.png`;
                } else {
                    sheetProperties.thumbnail.qStaticContentUrlDef.qUrl = `/content/${options.contentlibrary}/app-${options.appid}-sheet-${iSheetNum}.png`;
                }

                await sheetObj.setProperties(sheetProperties);
                await app.doSave();

                iSheetNum += 1;
            }
        }

        if ((await session.close()) === true) {
            logger.verbose(
                `Closed session after updating sheet thumbnail images in QSEoW app ${options.appid} on host ${options.host}`
            );
        } else {
            logger.error(
                `Error closing session for QSEoW app ${options.appid} on host ${options.host}`
            );
        }
    } catch (err) {
        logger.error(`UPDATE SHEETS: ${JSON.stringify(err, null, 2)}`);
    }
};

module.exports = {
    qseowUpdateSheetThumbnails,
};
