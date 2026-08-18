import { setupEnigmaConnection } from './cloud-enigma.js';
import { logger, appVersion, setLoggingLevel, bsiExecutablePath, isSea } from '../../globals.js';
import { redactOptions } from '../util/redact-secrets.js';
import QlikSaas from './cloud-repo.js';
import { qscloudTestConnection } from './cloud-test-connection.js';
import { CloudError } from '../util/errors.js';
import {
    sortSheetsByRank,
    saveIfChanged,
    getSheetList,
    SHEET_LIST_FIELDS_EXTENDED,
} from '../util/sheet-list.js';
import { clearSheetIcons, planSheetIconRemoval } from '../util/sheet-icon-removal.js';
import { withEngineSession } from '../util/engine-session.js';
import { resolveCloudAppSelection } from './cloud-app-selection.js';
import {
    runOverAppsWithReport,
    announceDryRun,
    emitRunHeader,
    addAppToReport,
} from '../util/run-report.js';
import { appProgressLine } from '../util/run-report-render.js';
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
 * @param {object} [report] - Run report from `createRunReport`; per-sheet
 *     decisions and the media-file deletion count are recorded onto it.
 *
 * @returns {Promise<void>} Resolves once every sheet's icon has been removed, or the app has
 *     no sheets.
 *
 * @throws {CloudError} When any sheet's icon could not be removed. Other sheets are still
 *     attempted first and the engine session is always released.
 * @throws {Error} Whatever the engine or media API threw, if the session itself was lost.
 */
/**
 * Best-effort app-name lookup for the run report.
 *
 * The name is decorative - the board row and the plan fall back to the app
 * id - so a failed lookup must never fail the app: a transient 429/5xx on
 * this read while the engine is healthy would otherwise mark an app failed
 * with nothing attempted, on the one command with no undo. One helper for
 * the planner and the real remover, so the two cannot drift on how the name
 * is fetched or how its absence is handled.
 *
 * @param {import('./cloud-test-connection.js').QlikSaasInstance} saasInstance - QlikSaas object.
 * @param {string} appId - The app to name.
 *
 * @returns {Promise<string|null>} The app name, or null when the lookup
 *     failed or the metadata carries no name.
 */
const fetchCloudAppName = async (saasInstance, appId) => {
    try {
        const appMetadata = await saasInstance.Get(`apps/${appId}`);

        return appMetadata?.attributes?.name ?? null;
    } catch (err) {
        logger.verbose(`Could not read app name for ${appId}: ${err?.message ?? err}`);

        return null;
    }
};

const removeSheetIconsCloudApp = async (appId, saasInstance, options, report = null) => {
    let sheetRun;
    let appEntry = null;

    try {
        // App name for the report - the board's per-app rows (issue #1074)
        // render on real runs too, and a row naming only a clipped GUID
        // cannot be recognised by the operator it exists for, least of all
        // on the one command with no undo.
        const appName = report ? await fetchCloudAppName(saasInstance, appId) : null;

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
                logger.verbose(`Opened app ${appId}`);

                // Get list of app sheets
                const sheets = await getSheetList(app, SHEET_LIST_FIELDS_EXTENDED);

                logger.info(`  ${sheets.length} sheet(s)`);

                if (report) {
                    appEntry = addAppToReport(report, {
                        id: appId,
                        name: appName ?? undefined,
                        sheetCount: sheets.length,
                    });
                }

                if (sheets.length > 0) {
                    // Sort sheets
                    sortSheetsByRank(sheets);

                    sheetRun = await clearSheetIcons(app, sheets, {
                        logPrefix: 'CLOUD REMOVE SHEET ICONS',
                        appId,
                        ErrorClass: CloudError,
                        appEntry,
                    });
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
        let mediaFilesDeleted = 0;

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
                    mediaFilesDeleted += 1;
                }
            }
        }

        if (appEntry) {
            appEntry.mediaFilesDeleted = mediaFilesDeleted;
        }
        logger.info(
            `  deleted ${mediaFilesDeleted} thumbnail media file(s) from the app media library`
        );

        // The run card's verdict now closes the run; this line stays for
        // anyone debugging at verbose.
        logger.verbose(`Done processing app ${appId}`);
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
 * Reads the same sheet list in the same order and makes the same per-sheet
 * engine reads the real run makes - `getObject` then `getProperties` - so the
 * plan fails on exactly the sheets the run would fail on, and reports which
 * sheets actually carry an icon from the same property the run reads. Also
 * counts the thumbnail media files the real run would delete afterwards. Writes
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
    // GUIDs cannot be recognised by the operator it exists for. Best-effort
    // via the same helper the real remover uses: a failed name lookup
    // degrades the plan to the app id rather than failing the app's plan.
    const appName = await fetchCloudAppName(saasInstance, appId);

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
            logger.verbose(`Opened app ${appId}`);

            const sheets = await getSheetList(app, SHEET_LIST_FIELDS_EXTENDED);
            // Through the shared renderer, with the id as the name fallback -
            // a missing name must not print "undefined".
            logger.info(
                appProgressLine({
                    name: appName ?? appId,
                    sheetCount: sheets.length,
                })
            );

            const appEntry = addAppToReport(report, {
                id: appId,
                name: appName ?? undefined,
                sheetCount: sheets.length,
            });

            sortSheetsByRank(sheets);

            // Through the shared loop, like the real run: one unreadable sheet
            // fails alone rather than aborting the remaining rows.
            const sheetRun = await planSheetIconRemoval(app, sheets, {
                logPrefix: 'CLOUD PLAN REMOVE ICONS',
                appId,
                ErrorClass: CloudError,
                appEntry,
            });

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

        // Emitted here rather than in the command handler: the wizard calls
        // this worker directly, and the header's rung must be decided from
        // the options the run actually uses - wizard answers included.
        const rung = emitRunHeader({
            version: appVersion,
            jobLabel: 'Qlik Sense Cloud sheet icon removal',
            options,
        });

        const dryRun = Boolean(options.dryRun);
        if (dryRun) {
            // Before anything connects - this command's real mode is the most
            // destructive in the CLI, so the log must not open like it.
            announceDryRun('qscloud remove-sheet-icons', rung);
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
            rung,
            ...selection,
            plan: {
                target: { platform: 'cloud', tenantUrl: options.tenanturl },
                // API key only: this command never drives a browser, so there
                // is no logon identity to report.
                auth: { apiKey: true },
                // mediaFiles: this platform also deletes the thumbnail files
                // from the app's media library; the QSEoW twin does not, so
                // the warning line renders from this flag, not the kind.
                writes: { kind: 'clear-icons', mediaFiles: true },
            },
            logPrefix: { plan: 'CLOUD PLAN REMOVE ICONS', process: 'CLOUD REMOVE SHEET ICONS' },
            emptySelectionHint: 'Check the --appid and --collectionid options.',
            planApp: (appId, report) =>
                planRemoveSheetIconsCloudApp(appId, saasInstance, options, report),
            processApp: (appId, report) =>
                removeSheetIconsCloudApp(appId, saasInstance, options, report),
        });
    } catch (err) {
        logError('CLOUD REMOVE THUMBNAILS 3', err);

        return false;
    }
};
