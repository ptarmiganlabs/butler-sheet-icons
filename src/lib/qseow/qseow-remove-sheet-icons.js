/* eslint-disable no-await-in-loop */
/* eslint-disable import/extensions */
const enigma = require('enigma.js');
const qrsInteract = require('qrs-interact');

const { setupEnigmaConnection } = require('./qseow-enigma.js');
const { logger, setLoggingLevel, bsiExecutablePath, isPkg } = require('../../globals.js');
const { qseowVerifyCertificatesExist } = require('./qseow-certificates.js');
const { setupQseowQrsConnection } = require('./qseow-qrs.js');

/**
 *
 * @param {*} appId
 * @param {*} g
 * @param {*} options
 */
const removeSheetIconsQSEoWApp = async (appId, g, options) => {
    try {
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
            `Created session to server ${options.host}, engine version is ${engineVersion.qComponentVersion}`
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
                    `Removing icon for sheet: ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}'`
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
                    `Closed session after generating sheet thumbnail images for all sheets in QSEoW app ${appId} on host ${options.host}`
                );
            } else {
                logger.error(
                    `Error closing session for QSEoW app ${appId} on host ${options.host}`
                );
            }
        }

        logger.info(`Done processing app ${appId}`);
    } catch (err) {
        logger.error(`QSEoW APP: ${err}`);
    }
};

/**
 *
 * @param {*} options
 * @returns
 */
const qseowRemoveSheetIcons = async (options) => {
    try {
        // Set log level
        setLoggingLevel(options.loglevel);

        logger.info('Starting creation of thumbnails for Qlik Sense Enterprise on Windows (QSEoW)');
        logger.verbose(`Running as standalone app: ${isPkg}`);
        logger.debug(`BSI executable path: ${bsiExecutablePath}`);
        logger.debug(`Options: ${JSON.stringify(options, null, 2)}`);

        const appIdsToProcess = [];

        // Verify QSEoW certificates exist
        const certsExist = await qseowVerifyCertificatesExist(options);
        if (certsExist === false) {
            logger.error('Missing certificate file(s). Aborting');
            throw Error('Missing certificate file(s)');
        } else {
            logger.verbose(`Certificate files found`);
        }

        // Is there a specific app ID specified?
        if (options.appid) {
            appIdsToProcess.push(options.appid);
        }

        // If --qliksensetag exists we should loop over all matching apps.
        // If --qliksensetag does not exist the app specified by --appid should be processed.
        if (options.qliksensetag && options.qliksensetag.length > 0) {
            // Get all apps matching the tag in --qliksensetag
            const qseowConfigQrs = setupQseowQrsConnection(options);

            // eslint-disable-next-line new-cap
            const qrsInteractInstance = new qrsInteract(qseowConfigQrs);
            logger.debug(`QSEoW QRS config: ${JSON.stringify(qseowConfigQrs, null, 2)}`);

            logger.debug(`GETAPPS 1: app/full?filter=tags.name eq '${options.qliksensetag}'`);
            const result = await qrsInteractInstance.Get(
                `app/full?filter=tags.name eq '${options.qliksensetag}'`
            );

            // Add all apps with this tag
            // eslint-disable-next-line no-restricted-syntax
            for (const app of result.body) {
                appIdsToProcess.push(app.id);
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

                await removeSheetIconsQSEoWApp(appId, global, options);

                logger.verbose(`Done processing app ${appId}`);
            } catch (err) {
                logger.error(`QSEOW PROCESS APP: ${err}`);
            }
        }

        return true;
    } catch (err) {
        logger.error(`CREATE THUMBNAILS 2: ${err}`);
        return false;
    }
};

module.exports = {
    qseowRemoveSheetIcons,
};
