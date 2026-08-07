import enigma from 'enigma.js';
import qrsInteract from 'qrs-interact';

import { setupEnigmaConnection } from './qseow-enigma.js';
import { logger, setLoggingLevel, bsiExecutablePath, isSea } from '../../globals.js';
import { redactOptions } from '../util/redact-secrets.js';
import { qseowVerifyCertificatesExist } from './qseow-certificates.js';
import { setupQseowQrsConnection } from './qseow-qrs.js';
import { QseowError } from '../util/errors.js';
import { runOverSheets, sortSheetsByRank } from '../util/sheet-list.js';
import { runOverApps } from '../util/run-over-apps.js';

/**
 * Removes all sheet icons from a Qlik Sense Enterprise on Windows (QSEoW) application.
 *
 * @param {string} appId - The ID of the QSEoW application to process.
 * @param {object} g - The global object to use with the Enigma.js library.
 * @param {object} options - Configuration options for processing the application.
 * @param {string} options.host - Host address of the Qlik server.
 * @param {string} options.engineport - Engine port of the Qlik server.
 * @param {string} options.qrsport - Qlik Sense Repository Service (QRS) port of the Qlik server.
 * @param {string} options.senseVersion - The version of Qlik Sense being used.
 *
 * @returns {Promise<void>} Resolves once all sheet icons in the app have been cleared.
 */
const removeSheetIconsQSEoWApp = async (appId, g, options) => {
    try {
        // Configure Enigma.js
        const configEnigma = setupEnigmaConnection(appId, options);
        const session = await enigma.create(configEnigma);

        if (options.loglevel === 'silly') {
            session.on('traffic:sent', (data) => console.log('sent:', data));
            session.on('traffic:received', (data) =>
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

        let sheetRun;

        const genericListObj = await app.createSessionObject(appSheetsCall);
        const sheetListObj = await genericListObj.getLayout();

        if (sheetListObj.qAppObjectList.qItems.length > 0) {
            // sheetListObj.qAppObjectList.qItems[] now contains array of app sheets.
            logger.info(`Number of sheets in app: ${sheetListObj.qAppObjectList.qItems.length}`);

            // Sort sheets
            sortSheetsByRank(sheetListObj.qAppObjectList.qItems);

            sheetRun = await runOverSheets(
                sheetListObj.qAppObjectList.qItems,
                {
                    logPrefix: 'QSEOW REMOVE SHEET ICONS',
                    appId,
                    action: 'remove icons for',
                    ErrorClass: QseowError,
                },
                async (sheet, iSheetNum) => {
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
                }
            );
        }

        // Closed outside the sheet-count guard: an app with no sheets still holds an open
        // engine session that has to be released.
        // enigma.js always resolves close() truthy; a real failure rejects into the catch below.
        await session.close();
        logger.verbose(
            `Closed session after generating sheet thumbnail images for all sheets in QSEoW app ${appId} on host ${options.host}`
        );

        sheetRun?.assertAllProcessed();

        logger.info(`Done processing app ${appId}`);
    } catch (err) {
        if (err.stack) {
            logger.error(`QSEOW: removeSheetIconsQSEoWApp (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`QSEOW: removeSheetIconsQSEoWApp (message): ${err.message}`);
        } else {
            logger.error(`QSEOW: removeSheetIconsQSEoWApp: ${err}`);
        }
        // Rethrow so the app loop can count this app as failed. Logging and returning
        // normally made a run in which every app failed look exactly like a clean run.
        throw err;
    }
};

/**
 * Removes all sheet icons from one or more Qlik Sense Enterprise on Windows (QSEoW) applications.
 *
 * @param {object} options - Configuration options for the command.
 * @param {string} options.host - Host address of the Qlik server.
 * @param {string} options.engineport - Engine port of the Qlik server.
 * @param {string} options.qrsport - Qlik Sense Repository Service (QRS) port of the Qlik server.
 * @param {string} options.senseVersion - The version of Qlik Sense being used.
 * @param {string} options.appid - The ID of the Qlik Sense Enterprise on Windows (QSEoW) application to process.
 * @param {string} options.qliksensetag - The tag for which apps will be processed. If specified, all apps with this tag will be processed.
 * @param {string} options.loglevel - The level of logging to output. Valid values are 'error', 'warn', 'info', 'verbose', 'debug', 'silly'.
 *
 * @returns {Promise<boolean>} Resolves to `true` if thumbnails were removed successfully, `false` otherwise.
 */
export const qseowRemoveSheetIcons = async (options) => {
    try {
        // Set log level
        if (options.loglevel === undefined || options.logLevel) {
            options.loglevel = options.logLevel;
        }
        setLoggingLevel(options.loglevel);

        logger.info('Starting creation of thumbnails for Qlik Sense Enterprise on Windows (QSEoW)');
        logger.verbose(`Running as standalone app: ${isSea}`);
        logger.debug(`BSI executable path: ${bsiExecutablePath}`);
        logger.debug(`Options: ${JSON.stringify(redactOptions(options), null, 2)}`);

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

            const qrsInteractInstance = new qrsInteract(qseowConfigQrs);
            logger.debug(`QSEoW QRS config: ${JSON.stringify(qseowConfigQrs, null, 2)}`);

            logger.debug(`GETAPPS 1: app/full?filter=tags.name eq '${options.qliksensetag}'`);
            const result = await qrsInteractInstance.Get(
                `app/full?filter=tags.name eq '${options.qliksensetag}'`
            );

            // Add all apps with this tag

            for (const app of result.body) {
                appIdsToProcess.push(app.id);
            }
        }

        return await runOverApps(
            appIdsToProcess,
            {
                logPrefix: 'QSEOW PROCESS APP: Remove sheet icons',
                emptySelectionHint: 'Check the --appid and --qliksensetag options.',
            },
            (appId) => removeSheetIconsQSEoWApp(appId, global, options)
        );
    } catch (err) {
        logger.error(`QSEOW REMOVE THUMBNAILS 2: ${err}`);
        if (err.message) {
            logger.error(`QSEOW REMOVE THUMBNAILS 2 (message): ${err.message}`);
        }
        if (err.stack) {
            logger.error(`QSEOW REMOVE THUMBNAILS 2 (stack): ${err.stack}`);
        }

        return false;
    }
};
