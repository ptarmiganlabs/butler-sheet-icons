import { setupEnigmaConnection } from './qseow-enigma.js';
import { logger, appVersion, setLoggingLevel, bsiExecutablePath, isSea } from '../../globals.js';
import { redactOptions } from '../util/redact-secrets.js';
import { qseowVerifyCertificatesExist } from './qseow-certificates.js';
import { QseowError } from '../util/errors.js';
import {
    sortSheetsByRank,
    saveIfChanged,
    getSheetList,
    SHEET_LIST_FIELDS_EXTENDED,
} from '../util/sheet-list.js';
import { clearSheetIcons, planSheetIconRemoval } from '../util/sheet-icon-removal.js';
import { listAppsByTag } from './qseow-app-lookup.js';
import { readQseowPlanFacts } from './qseow-tagged-sheets.js';
import { toAppIdList } from '../util/app-ids.js';
import { withEngineSession } from '../util/engine-session.js';
import {
    runOverAppsWithReport,
    announceDryRun,
    emitRunHeader,
    addAppToReport,
} from '../util/run-report.js';
import { appProgressLine } from '../util/run-report-render.js';
import { logError } from '../util/log-error.js';

/**
 * Best-effort app-name lookup for the run report, from the already-open app.
 *
 * The name is decorative - the board row and the plan fall back to the app
 * id - so a failed lookup must never fail the app: this is the one command
 * with no undo, and a cosmetic read failing an app that the engine is happy
 * to serve would be the wrong trade. Read from the engine layout rather than
 * QRS, on the session that is already open: the run makes at most one QRS
 * call (the plan's published-app count), and naming N apps must not turn that
 * into N more.
 *
 * One helper for the planner and the real remover, so the two cannot drift
 * on how the name is fetched or how its absence is handled.
 *
 * @param {object} app - An opened enigma.js app (doc) handle.
 *
 * @returns {Promise<string|null>} The app name, or null when the layout read
 *     failed or carries no title.
 */
const fetchQseowAppName = async (app) => {
    try {
        const layout = await app.getAppLayout();

        return layout?.qTitle ?? null;
    } catch (err) {
        logger.verbose(`Could not read app name: ${err?.message ?? err}`);

        return null;
    }
};

/**
 * Removes all sheet icons from a Qlik Sense Enterprise on Windows (QSEoW) application.
 *
 * Clears each sheet's thumbnail URL over the engine session and saves the app.
 * The image files a previous run uploaded to the content library are left in
 * place: their names are deterministic, so the next thumbnail run overwrites
 * them, and deleting shared library content over QRS would be a bigger write
 * than the one this command undoes.
 *
 * @param {string} appId - The ID of the QSEoW application to process.
 * @param {object} options - Configuration options for processing the application.
 * @param {string} options.host - Host address of the Qlik server.
 * @param {string} options.engineport - Engine port of the Qlik server.
 * @param {string} options.qrsport - Qlik Sense Repository Service (QRS) port of the Qlik server.
 * @param {object} [report] - Run report from `createRunReport`; per-sheet
 *     decisions are recorded onto it.
 *
 * @returns {Promise<void>} Resolves once every sheet's icon has been cleared, or the app has
 *     no sheets.
 *
 * @throws {QseowError} When any sheet's icon could not be cleared. Other sheets are still
 *     attempted first and the engine session is always released.
 * @throws {Error} Whatever the engine threw, if the session itself was lost.
 */
const removeSheetIconsQSEoWApp = async (appId, options, report = null) => {
    let sheetRun;
    let appEntry = null;

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
                logger.verbose(`Opened app ${appId}`);

                // App name for the report - the board's per-app rows (issue
                // #1074) render on real runs too, and a row naming only a
                // clipped GUID cannot be recognised by the operator it exists
                // for, least of all on the one command with no undo.
                const appName = report ? await fetchQseowAppName(app) : null;

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
                        logPrefix: 'QSEOW REMOVE SHEET ICONS',
                        appId,
                        ErrorClass: QseowError,
                        appEntry,
                    });
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

        // The run card's verdict now closes the run; this line stays for
        // anyone debugging at verbose.
        logger.verbose(`Done processing app ${appId}`);
    } catch (err) {
        logError('QSEOW REMOVE SHEET ICONS 1', err);
        // Rethrow so the app loop can count this app as failed. Logging and returning
        // normally made a run in which every app failed look exactly like a clean run.
        throw err;
    }

    sheetRun?.assertAllProcessed();
};

/**
 * Plans icon removal for one QSEoW app without changing anything: the dry-run
 * twin of `removeSheetIconsQSEoWApp`.
 *
 * Reads the same sheet list in the same order and makes the same per-sheet
 * engine reads the real run makes - `getObject` then `getProperties` - so the
 * plan fails on exactly the sheets the run would fail on, and reports which
 * sheets actually carry an icon from the same property the run reads. Writes
 * nothing: no `setProperties`, no save.
 *
 * @param {string} appId - The QSEoW app to plan.
 * @param {object} options - The same options bag the real run receives.
 * @param {object} report - Run report; one app section is recorded onto it.
 *
 * @returns {Promise<void>} Resolves when the app's plan is recorded.
 */
const planRemoveSheetIconsQSEoWApp = async (appId, options, report) => {
    const configEnigma = setupEnigmaConnection(appId, options);

    await withEngineSession(
        configEnigma,
        {
            logPrefix: 'QSEOW PLAN REMOVE ICONS',
            sessionLogLevel: 'info',
            loglevel: options.loglevel,
            connectionLabel: `server ${options.host}`,
        },
        async (global) => {
            const app = await global.openDoc(appId, '', '', '', false);
            logger.verbose(`Opened app ${appId}`);

            // Get app name - the report is the product here, and a plan
            // listing bare GUIDs cannot be recognised by the operator it
            // exists for. Best-effort via the same helper the real remover
            // uses: a failed name lookup degrades the plan to the app id
            // rather than failing the app's plan.
            const appName = await fetchQseowAppName(app);

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
                logPrefix: 'QSEOW PLAN REMOVE ICONS',
                appId,
                ErrorClass: QseowError,
                appEntry,
            });

            sheetRun.assertAllProcessed();
        }
    );

    logger.verbose(`Planned icon removal for QSEoW app ${appId} - no changes made`);
};

/**
 * Removes all sheet icons from one or more Qlik Sense Enterprise on Windows (QSEoW) applications.
 *
 * @param {object} options - Configuration options for the command.
 * @param {string} options.host - Host address of the Qlik server.
 * @param {string} options.engineport - Engine port of the Qlik server.
 * @param {string} options.qrsport - Qlik Sense Repository Service (QRS) port of the Qlik server.
 * @param {string[]} options.appid - IDs of the Qlik Sense Enterprise on Windows (QSEoW) applications
 *     to process. Added to whatever `qliksensetag` matches rather than replacing it.
 * @param {string} options.qliksensetag - The tag for which apps will be processed. If specified, all apps with this tag will be processed.
 * @param {string} options.loglevel - The level of logging to output. Valid values are 'error', 'warn', 'info', 'verbose', 'debug', 'silly'.
 *
 * @returns {Promise<boolean>} Resolves to `true` if the icons were removed successfully, `false` otherwise.
 */
export const qseowRemoveSheetIcons = async (options) => {
    try {
        setLoggingLevel(options.loglevel);

        // Emitted here rather than in the command handler: the wizard calls
        // workers directly, and the header's rung must be decided from the
        // options the run actually uses.
        const rung = emitRunHeader({
            version: appVersion,
            jobLabel: 'QSEoW sheet icon removal',
            options,
        });

        const dryRun = Boolean(options.dryRun);
        if (dryRun) {
            // Before anything connects - this command's real mode is the most
            // destructive on this platform, so the log must not open like it.
            announceDryRun('qseow remove-sheet-icons', rung);
        }

        logger.info('Starting removal of sheet icons for Qlik Sense Enterprise on Windows (QSEoW)');
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

        // Apps named directly. --appid is variadic, so this is a list.
        const namedAppIds = toAppIdList(options.appid);
        appIdsToProcess.push(...namedAppIds);

        // --appid and --qliksensetag are additive, not alternatives: apps named either
        // way are all processed. The app loop dedupes, so an app that is both named by
        // --appid and carries the tag is still processed once.
        let taggedAppIds = [];
        const useTag = Boolean(options.qliksensetag && options.qliksensetag.length > 0);
        if (useTag) {
            // Get all apps matching the tag in --qliksensetag. listAppsByTag returns
            // { id, name } so a picker can label them; only the ids matter here.
            const taggedApps = await listAppsByTag(options);
            taggedAppIds = taggedApps.map((app) => app.id);
            appIdsToProcess.push(...taggedAppIds);
        }

        // How many of the selected apps are published. On QSEoW that is the
        // number that matters most for a removal: clearing the icons happens
        // in memory and the app is then saved, and it is the save a published
        // app refuses - so a run over published apps fails after doing the
        // work, and the plan is the only place to say so beforehand. Same
        // read-only helper the thumbnail command uses, which degrades to
        // nulls rather than failing the run.
        const planFacts = await readQseowPlanFacts(options, appIdsToProcess);

        return await runOverAppsWithReport({
            command: 'qseow remove-sheet-icons',
            dryRun,
            rung,
            appIds: appIdsToProcess,
            namedAppIds,
            selectorAppIds: taggedAppIds,
            selector: useTag ? { option: 'qliksensetag', value: options.qliksensetag } : null,
            plan: {
                target: {
                    platform: 'qseow',
                    host: options.host,
                    // No --port here: this command never opens the web UI, so
                    // the hub port is not part of its target.
                    port: null,
                    secure: options.secure,
                    prefix: options.prefix ?? '',
                    enginePort: options.engineport,
                    qrsPort: options.qrsport,
                    schemaVersion: options.schemaversion,
                },
                // No logonUser: removal works over the engine session alone,
                // so there is no web UI logon identity to report.
                auth: {
                    apiUser: { directory: options.apiuserdir, userId: options.apiuserid },
                    certFile: options.certfile,
                },
                // mediaFiles: false - the content library files a thumbnail
                // run uploaded are left in place, unlike the Cloud twin which
                // also deletes from the app media library.
                writes: {
                    kind: 'clear-icons',
                    mediaFiles: false,
                    publishedAppCount: planFacts.publishedAppCount,
                },
            },
            logPrefix: { plan: 'QSEOW PLAN REMOVE ICONS', process: 'QSEOW REMOVE SHEET ICONS' },
            emptySelectionHint: 'Check the --appid and --qliksensetag options.',
            planApp: (appId, report) => planRemoveSheetIconsQSEoWApp(appId, options, report),
            processApp: (appId, report) => removeSheetIconsQSEoWApp(appId, options, report),
        });
    } catch (err) {
        logError('QSEOW REMOVE SHEET ICONS 2', err);

        return false;
    }
};
