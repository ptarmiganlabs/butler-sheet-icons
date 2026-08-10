import { setupEnigmaConnection } from './qseow-enigma.js';
import { logger, setLoggingLevel, bsiExecutablePath, isSea } from '../../globals.js';
import { redactOptions } from '../util/redact-secrets.js';
import { qseowVerifyCertificatesExist } from './qseow-certificates.js';
import { QseowError } from '../util/errors.js';
import {
    runOverSheets,
    sortSheetsByRank,
    saveIfChanged,
    getSheetList,
    SHEET_LIST_FIELDS_EXTENDED,
} from '../util/sheet-list.js';
import { runOverApps } from '../util/run-over-apps.js';
import { getAppIdsByTag } from './qseow-app-lookup.js';
import { withEngineSession } from '../util/engine-session.js';

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
 * @returns {Promise<void>} Resolves once every sheet's icon has been cleared, or the app has
 *     no sheets.
 *
 * @throws {QseowError} When any sheet's icon could not be cleared. Other sheets are still
 *     attempted first and the engine session is always released.
 * @throws {Error} Whatever the engine threw, if the session itself was lost.
 */
const removeSheetIconsQSEoWApp = async (appId, g, options) => {
    let sheetRun;

    try {
        // Configure Enigma.js
        const configEnigma = setupEnigmaConnection(appId, options);
        await withEngineSession(
            configEnigma,
            {
                logPrefix: 'QSEOW REMOVE SHEET ICONS',
                // A top-level command, like the two process-app paths: its own "Opened app" line
                // is already info, and the default log level is info. Only the update step,
                // which re-opens an app process-app already reported, stays at verbose.
                sessionLogLevel: 'info',
                loglevel: options.loglevel,
                connectionLabel: `server ${options.host}`,
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
                        }
                    );
                }

                // Saved inside the session callback: withEngineSession closes the session once
                // this resolves or throws, so a save that rejects - a published app, or one the
                // service account may not write - still releases the websocket.
                // Called outside the sheet-count guard: an app with no sheets is still saved
                // through the same path, and the session is released either way.
                await saveIfChanged(
                    app,
                    { logPrefix: 'QSEOW REMOVE SHEET ICONS', appId },
                    sheetRun?.changed ?? 0
                );
            }
        );
        logger.verbose(
            `Closed session after removing sheet icons in QSEoW app ${appId} on host ${options.host}`
        );

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

    sheetRun?.assertAllProcessed();
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
            appIdsToProcess.push(...(await getAppIdsByTag(options)));
        }

        return await runOverApps(
            appIdsToProcess,
            {
                logPrefix: 'QSEOW REMOVE SHEET ICONS',
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
