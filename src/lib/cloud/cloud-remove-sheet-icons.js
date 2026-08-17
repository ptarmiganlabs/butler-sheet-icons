import { setupEnigmaConnection } from './cloud-enigma.js';
import { logger, setLoggingLevel, bsiExecutablePath, isSea } from '../../globals.js';
import { redactOptions } from '../util/redact-secrets.js';
import QlikSaas from './cloud-repo.js';
import { qscloudTestConnection } from './cloud-test-connection.js';
import { CloudError } from '../util/errors.js';
import {
    runOverSheets,
    sortSheetsByRank,
    saveIfChanged,
    getSheetList,
    SHEET_LIST_FIELDS_EXTENDED,
    SHEET_SKIPPED,
} from '../util/sheet-list.js';
import { withEngineSession } from '../util/engine-session.js';
import { resolveCloudAppSelection } from './cloud-app-selection.js';
import { CLEAR_REASON } from '../util/sheet-decision-reasons.js';
import {
    runOverAppsWithReport,
    announceDryRun,
    addAppToReport,
    recordSheetDecision,
} from '../util/run-report.js';
import { logError } from '../util/log-error.js';

/**
 * Removes all sheet icons from a Qlik Sense Cloud app.
 *
 * @param {string} appId - The ID of the Qlik Sense Cloud app to process.
 * @param {object} saasInstance - Instance of the QlikSaas class.
 * @param {object} options - Configuration options for processing the app.
 * @param {string} options.tenanturl - Host address of the Qlik Sense Cloud tenant.
 * @param {string} options.apikey - API key for the Qlik Sense Cloud tenant.
 * @param {string} options.loglevel - The level of logging to output. Valid values are 'error', 'warn', 'info', 'verbose', 'debug', 'silly'.
 *
 * @returns {Promise<void>} Resolves once every sheet's icon has been removed, or the app has
 *     no sheets.
 *
 * @throws {CloudError} When any sheet's icon could not be removed. Other sheets are still
 *     attempted first and the engine session is always released.
 * @throws {Error} Whatever the engine or media API threw, if the session itself was lost.
 */
const removeSheetIconsCloudApp = async (appId, saasInstance, options) => {
    let sheetRun;

    try {
        // Configure Enigma.js
        const configEnigma = setupEnigmaConnection(appId, options);
        await withEngineSession(
            configEnigma,
            {
                logPrefix: 'CLOUD REMOVE SHEET ICONS',
                // A top-level command, like the two process-app paths: its own "Opened app" line
                // is already info, and the default log level is info. Only the update step,
                // which re-opens an app process-app already reported, stays at verbose.
                sessionLogLevel: 'info',
                loglevel: options.loglevel,
                connectionLabel: `Qlik Sense Cloud tenant ${options.tenanturl}`,
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
                            logPrefix: 'CLOUD REMOVE SHEET ICONS',
                            appId,
                            action: 'remove icons for',
                            ErrorClass: CloudError,
                        },
                        async (sheet, iSheetNum) => {
                            logger.info(
                                `Removing icon for sheet ${iSheetNum}: Name '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}'`
                            );

                            // Get properties of current sheet
                            const sheetObj = await app.getObject(sheet.qInfo.qId);
                            const sheetProperties = await sheetObj.getProperties();

                            // A sheet without the thumbnail structure has no icon
                            // to clear - failing the whole app over it turned a
                            // no-op into an error, and made the dry run predict
                            // success for exactly the input that broke the run.
                            if (!sheetProperties?.thumbnail?.qStaticContentUrlDef) {
                                logger.verbose(
                                    `Sheet ${iSheetNum} has no thumbnail structure - nothing to clear`
                                );

                                return SHEET_SKIPPED;
                            }

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
                await saveIfChanged(
                    app,
                    { logPrefix: 'CLOUD REMOVE SHEET ICONS', appId },
                    sheetRun?.changed ?? 0
                );
            }
        );
        logger.verbose(
            `Closed session after removing sheet icons in QS Cloud app ${appId} on tenant ${options.tenanturl}`
        );

        // Deleted only after the sheets have been repointed and the app saved. Doing it
        // first meant a failed save left every sheet pointing at images that no longer
        // existed - broken icons on every sheet, where the old behaviour of saving per
        // sheet had at least persisted the ones processed before the failure. Clearing the
        // reference and then removing the file is the order that degrades safely.
        // Does the app have a thumbnail folder in its media library?
        const mediaList = await saasInstance.Get(`apps/${appId}/media/list`);

        if (
            mediaList.find((item) => {
                const thumbnailFolderExists =
                    item.type === 'directory' && item.name === 'thumbnails';
                return thumbnailFolderExists;
            })
        ) {
            // "thumbnails" folder exists in app's media library
            // Remove all existing thumbnail images from this app
            const existingThumbnails = await saasInstance.Get(
                `apps/${appId}/media/list/thumbnails`
            );

            for (const thumbnailImg of existingThumbnails) {
                if (thumbnailImg.type === 'image') {
                    const result = await saasInstance.Delete(
                        `apps/${appId}/media/files/thumbnails/${thumbnailImg.name}`
                    );
                    logger.debug(
                        `Deleted existing file ${JSON.stringify(
                            thumbnailImg.name
                        )}, result=${JSON.stringify(result)}`
                    );
                }
            }
        }

        logger.info(`Done processing app ${appId}`);
    } catch (err) {
        logError('CLOUD REMOVE SHEET ICONS 1', err);
        // Rethrow so the app loop can count this app as failed. Logging and returning
        // normally made a run in which every app failed look exactly like a clean run.
        throw err;
    }

    sheetRun?.assertAllProcessed();
};

/**
 * Plans icon removal for one Cloud app without changing anything: the dry-run
 * twin of `removeSheetIconsCloudApp`.
 *
 * Reads the same sheet list in the same order, plus each sheet's current
 * thumbnail property so the report can say which sheets actually carry an icon
 * - a read the real run skips because it clears unconditionally. Also counts
 * the thumbnail media files the real run would delete afterwards. Writes
 * nothing: no `setProperties`, no save, no media `Delete`.
 *
 * @param {string} appId - The Cloud app to plan.
 * @param {import('./cloud-test-connection.js').QlikSaasInstance} saasInstance - QlikSaas object.
 * @param {object} options - The same options bag the real run receives.
 * @param {object} report - Run report; one app section is recorded onto it.
 *
 * @returns {Promise<void>} Resolves when the app's plan is recorded.
 */
const planRemoveSheetIconsCloudApp = async (appId, saasInstance, options, report) => {
    // Get app name - the report is the product here, and a plan listing bare
    // GUIDs cannot be recognised by the operator it exists for. This is one
    // read the real remover does not make; that is the right trade.
    const appMetadata = await saasInstance.Get(`apps/${appId}`);

    const configEnigma = setupEnigmaConnection(appId, options);

    await withEngineSession(
        configEnigma,
        {
            logPrefix: 'CLOUD PLAN REMOVE ICONS',
            sessionLogLevel: 'info',
            loglevel: options.loglevel,
            connectionLabel: `Qlik Sense Cloud tenant ${options.tenanturl}`,
        },
        async (global) => {
            const app = await global.openDoc(appId, '', '', '', false);
            logger.info(`Opened app ${appId}`);

            const sheets = await getSheetList(app, SHEET_LIST_FIELDS_EXTENDED);
            logger.info(`Number of sheets in app: ${sheets.length}`);

            const appEntry = addAppToReport(report, {
                id: appId,
                name: appMetadata?.attributes?.name,
                sheetCount: sheets.length,
            });

            sortSheetsByRank(sheets);

            // Through runOverSheets, like the real run: one unreadable sheet
            // fails alone rather than aborting the remaining rows.
            const sheetRun = await runOverSheets(
                sheets,
                {
                    logPrefix: 'CLOUD PLAN REMOVE ICONS',
                    appId,
                    action: 'plan icon removal for',
                    ErrorClass: CloudError,
                },
                async (sheet, iSheetNum) => {
                    // The real run clears every sheet unconditionally, so the
                    // action is always `clear`; the reason column reports the
                    // sheets where that clear is already a no-op. The sheet
                    // list projection already carries /thumbnail, so prefer it
                    // and only fall back to a per-sheet engine read when the
                    // engine omitted the field from the projection.
                    let iconUrl = sheet?.qData?.thumbnail?.qStaticContentUrlDef?.qUrl;
                    if (sheet?.qData?.thumbnail === undefined) {
                        const sheetObj = await app.getObject(sheet.qInfo.qId);
                        const sheetProperties = await sheetObj.getProperties();
                        iconUrl = sheetProperties?.thumbnail?.qStaticContentUrlDef?.qUrl;
                    }

                    recordSheetDecision(appEntry, {
                        n: iSheetNum,
                        title: sheet?.qMeta?.title,
                        action: 'clear',
                        reason: iconUrl ? null : CLEAR_REASON.NO_ICON,
                    });
                }
            );

            sheetRun.assertAllProcessed();

            // The read half of the media cleanup, recorded on the report so the
            // deletion count renders inside the app's section rather than as a
            // log line scrolled far above it.
            const mediaList = await saasInstance.Get(`apps/${appId}/media/list`);
            if (mediaList.find((item) => item.type === 'directory' && item.name === 'thumbnails')) {
                const existingThumbnails = await saasInstance.Get(
                    `apps/${appId}/media/list/thumbnails`
                );
                appEntry.mediaFilesToDelete = existingThumbnails.filter(
                    (item) => item.type === 'image'
                ).length;
            }
        }
    );

    logger.verbose(`Planned icon removal for Qlik Sense Cloud app ${appId} - no changes made`);
};

/**
 * Removes all sheet icons from one or more Qlik Sense Cloud applications.
 *
 * @param {object} options - Configuration options for the command.
 * @param {string} options.tenanturl - URL or host of Qlik Sense cloud tenant. Example: `https://tenant.eu.qlikcloud.com` or `tenant.eu.qlikcloud.com`.
 * @param {string} options.apikey - API key used to access the Sense APIs.
 * @param {string[]} options.appid - IDs of the Qlik Sense Cloud applications to process. Added to
 *     whatever `collectionid` matches rather than replacing it.
 * @param {string} options.collectionid - The ID of the collection containing apps to process.
 * @param {string} options.loglevel - The level of logging to output. Valid values are 'error', 'warn', 'info', 'verbose', 'debug', 'silly'.
 *
 * @returns {Promise<boolean>} Resolves to `true` if thumbnails were removed successfully, `false` otherwise.
 */
export const qscloudRemoveSheetIcons = async (options) => {
    try {
        setLoggingLevel(options.loglevel);

        const dryRun = Boolean(options.dryRun);
        if (dryRun) {
            // Before anything connects - this command's real mode is the most
            // destructive in the CLI, so the log must not open like it.
            announceDryRun('qscloud remove-sheet-icons');
        }

        logger.info('Starting removal of sheet icons for Qlik Sense Cloud');
        logger.verbose(`Running as standalone app: ${isSea}`);
        logger.debug(`BSI executable path: ${bsiExecutablePath}`);
        logger.debug(`Options: ${JSON.stringify(redactOptions(options), null, 2)}`);

        // Get array of all available collections
        const cloudConfig = {
            url: options.tenanturl,
            token: options.apikey,
            // version: X, // optional. default is: 1
        };
        const saasInstance = new QlikSaas(cloudConfig);

        // Test connection to QS Cloud by getting info about the user associated with the API key
        try {
            const res = await qscloudTestConnection(options, saasInstance);
            logger.verbose(
                `Connection to tenant ${options.tenanturl} successful: ${JSON.stringify(res)}`
            );
        } catch (err) {
            logError('CLOUD REMOVE SHEET ICONS: connection test', err);
            // Both halves required: this line used to sit in a branch that a real Error never
            // reached, so it never printed. Now that it does, a status without a statusText
            // would render as 401="undefined".
            if (err?.status && err?.statusText) {
                logger.error(
                    `CLOUD REMOVE SHEET ICONS: connection test (error code): ${err.status}="${err.statusText}"`
                );
            }

            return false;
        }

        // Selection resolution is shared with the other Cloud command; the
        // provenance it returns feeds the run report directly.
        const selection = await resolveCloudAppSelection(saasInstance, options);

        return await runOverAppsWithReport({
            command: 'qscloud remove-sheet-icons',
            dryRun,
            ...selection,
            logPrefix: { plan: 'CLOUD PLAN REMOVE ICONS', process: 'CLOUD REMOVE SHEET ICONS' },
            emptySelectionHint: 'Check the --appid and --collectionid options.',
            planApp: (appId, report) =>
                planRemoveSheetIconsCloudApp(appId, saasInstance, options, report),
            processApp: (appId) => removeSheetIconsCloudApp(appId, saasInstance, options),
        });
    } catch (err) {
        logError('CLOUD REMOVE THUMBNAILS 3', err);

        return false;
    }
};
