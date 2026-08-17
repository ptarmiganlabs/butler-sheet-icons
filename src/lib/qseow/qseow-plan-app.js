import { logger } from '../../globals.js';
import { setupEnigmaConnection } from './qseow-enigma.js';
import { determineSheetExcludeStatus } from './determine-sheet-exclude-status.js';
import { determineSheetBlurStatus } from './determine-sheet-blur-status.js';
import { readQseowAppContext } from './qseow-tagged-sheets.js';
import { withEngineSession } from '../util/engine-session.js';
import {
    getSheetList,
    sortSheetsByRank,
    SHEET_LIST_FIELDS_WITH_SHOW_CONDITION,
} from '../util/sheet-list.js';
import { addAppToReport, recordSheetDecision } from '../util/run-report.js';

/**
 * Plans one QSEoW app without changing anything: the dry-run twin of
 * `qseowProcessApp`.
 *
 * Performs the same reads, in the same order, through the same functions - the
 * QRS metadata lookup, both tagged-sheet lookups, the engine session, the sheet
 * list, the rank sort, and the exclude and blur rules - and records a decision
 * per sheet instead of acting on it. What it deliberately does not do: create
 * the image directory, launch a browser, capture, upload, or update sheets.
 *
 * Kept as its own function rather than `if (dryRun)` guards inside
 * `qseowProcessApp` (issue #993): the real processor is ~500 lines in which a
 * missed guard is a write during a dry run - the one failure this feature can
 * never have. The shared decision logic lives in the `determineSheet*Status`
 * modules, so the two paths cannot disagree about a decision; what this
 * duplicates is only the read scaffolding around them.
 *
 * The sort matters: `--exclude-sheet-number` and `--blur-sheet-number` count
 * positions after `sortSheetsByRank`, so planning over the unsorted list would
 * report decisions the real run does not make.
 *
 * @param {string} appId - The QSEoW app to plan.
 * @param {object} options - The same options bag the real run receives.
 * @param {object} report - Run report from `createRunReport`; one app section
 *     and one decision per sheet are recorded onto it.
 *
 * @returns {Promise<void>} Resolves when the app's plan is recorded.
 *
 * @throws {Error} When the app does not exist in the repository (a `QseowError`
 *     from `readQseowAppContext`) - planning an app that cannot be read is a
 *     failure, exactly as running it would be.
 */
export const qseowPlanApp = async (appId, options, report) => {
    // The same QRS reads the real run makes, from the same function - the
    // planner cannot drift from the processor here by construction.
    const { appMetadata, tagSheetAppMetadata, blurTagSheetAppMetadata, mapRepoEngineSheetId } =
        await readQseowAppContext(appId, options);

    const configEnigma = setupEnigmaConnection(appId, options);

    await withEngineSession(
        configEnigma,
        {
            logPrefix: 'QSEOW PLAN APP',
            loglevel: options.loglevel,
            connectionLabel: `server ${options.host}`,
            sessionLogLevel: 'info',
        },
        async (global) => {
            const app = await global.openDoc(appId, '', '', '', false);
            logger.info(`Opened app ${appId}`);
            logger.info(`App name: "${appMetadata[0].name}"`);
            logger.info(`App is published: ${appMetadata[0].published}`);

            const sheets = await getSheetList(app, SHEET_LIST_FIELDS_WITH_SHOW_CONDITION);
            logger.info(`Number of sheets in app: ${sheets.length}`);

            const appEntry = addAppToReport(report, {
                id: appId,
                name: appMetadata[0].name,
                sheetCount: sheets.length,
            });

            // Same order the real run processes in - the number rules count
            // positions in this order, not the engine's.
            sortSheetsByRank(sheets);

            let iSheetNum = 1;
            for (const sheet of sheets) {
                const engineSheetId = sheet.qInfo.qId;
                const repoDbSheetId = mapRepoEngineSheetId.get(engineSheetId);

                const { excludeSheet, excludeReason } = await determineSheetExcludeStatus(
                    app,
                    sheet,
                    options,
                    tagSheetAppMetadata,
                    iSheetNum,
                    repoDbSheetId,
                    engineSheetId,
                    logger
                );

                if (excludeSheet === true) {
                    recordSheetDecision(appEntry, {
                        n: iSheetNum,
                        title: sheet.qMeta.title,
                        action: 'skip',
                        reason: excludeReason,
                    });
                } else {
                    const { blurSheet, blurReason } = determineSheetBlurStatus(
                        sheet,
                        options,
                        blurTagSheetAppMetadata,
                        iSheetNum,
                        logger
                    );

                    recordSheetDecision(appEntry, {
                        n: iSheetNum,
                        title: sheet.qMeta.title,
                        action: blurSheet ? 'blur' : 'update',
                        reason: blurReason,
                    });
                }

                iSheetNum += 1;
            }
        }
    );

    logger.verbose(`Planned QSEoW app ${appId} - no changes made`);
};
