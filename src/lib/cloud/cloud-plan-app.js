import { logger } from '../../globals.js';
import { setupEnigmaConnection } from './cloud-enigma.js';
import { determineSheetExcludeStatus } from './determine-sheet-exclude-status.js';
import { determineSheetBlurStatus } from './determine-sheet-blur-status.js';
import { withEngineSession } from '../util/engine-session.js';
import {
    getSheetList,
    sortSheetsByRank,
    runOverSheets,
    SHEET_LIST_FIELDS_WITH_SHOW_CONDITION,
} from '../util/sheet-list.js';
import { CloudError } from '../util/errors.js';
import { addAppToReport, recordPlannedSheet } from '../util/run-report.js';

/**
 * Plans one Qlik Sense Cloud app without changing anything: the dry-run twin
 * of `processCloudApp`, and the Cloud twin of `qseowPlanApp`.
 *
 * Performs the same reads, in the same order, through the same functions - the
 * app metadata lookup, the published check, the engine session, the sheet
 * list, the rank sort, and the exclude and blur rules - and records a decision
 * per sheet instead of acting on it.
 *
 * What it deliberately does not do is longer here than on QSEoW, because
 * `processCloudApp` performs a write surprisingly early: it deletes the app's
 * existing thumbnail media files before opening the engine session. A dry run
 * must not - so this function never touches `apps/{id}/media` beyond the
 * metadata read, never creates the image directory, and never launches a
 * browser, captures, uploads, or updates sheets.
 *
 * @param {string} appId - The Cloud app to plan.
 * @param {import('./cloud-test-connection.js').QlikSaasInstance} saasInstance - QlikSaas object.
 * @param {object} options - The same options bag the real run receives.
 * @param {object} report - Run report from `createRunReport`; one app section
 *     and one decision per sheet are recorded onto it.
 *
 * @returns {Promise<void>} Resolves when the app's plan is recorded.
 */
export const cloudPlanApp = async (appId, saasInstance, options, report) => {
    // Get app name - same read, same endpoint as the real run.
    const appMetadata = await saasInstance.Get(`apps/${appId}`);

    // If empty the app is not published
    const appIsPublished = !!appMetadata.attributes.publishTime;

    const configEnigma = setupEnigmaConnection(appId, options);

    await withEngineSession(
        configEnigma,
        {
            logPrefix: 'CLOUD PLAN APP',
            loglevel: options.loglevel,
            connectionLabel: `Qlik Sense Cloud tenant ${options.tenanturl}`,
            sessionLogLevel: 'info',
        },
        async (global) => {
            const app = await global.openDoc(appId, '', '', '', false);
            logger.info(`Opened app ${appId}`);
            logger.info(`App name: "${appMetadata.attributes.name}"`);
            logger.info(`App is published: ${appIsPublished}`);

            const sheets = await getSheetList(app, SHEET_LIST_FIELDS_WITH_SHOW_CONDITION);
            logger.info(`Number of sheets in app: ${sheets.length}`);

            const appEntry = addAppToReport(report, {
                id: appId,
                name: appMetadata.attributes.name,
                sheetCount: sheets.length,
            });

            // Same order the real run processes in - the number rules count
            // positions in this order, not the engine's.
            sortSheetsByRank(sheets);

            // Through runOverSheets, exactly like the real run: one sheet whose
            // show condition the engine rejects must fail alone, not abort the
            // remaining sheets' plan. The report marks the app "plan incomplete"
            // when rows are missing.
            const sheetRun = await runOverSheets(
                sheets,
                {
                    logPrefix: 'CLOUD PLAN APP',
                    appId,
                    action: 'plan',
                    ErrorClass: CloudError,
                },
                async (sheet, iSheetNum) => {
                    const { excludeSheet, excludeReason } = await determineSheetExcludeStatus(
                        app,
                        sheet,
                        options,
                        appIsPublished,
                        iSheetNum,
                        logger
                    );

                    const { blurSheet, blurReason } = excludeSheet
                        ? { blurSheet: false, blurReason: null }
                        : determineSheetBlurStatus(sheet, options, iSheetNum, logger);

                    recordPlannedSheet(appEntry, {
                        n: iSheetNum,
                        title: sheet?.qMeta?.title,
                        excludeSheet,
                        excludeReason,
                        blurSheet,
                        blurReason,
                    });
                }
            );

            // Same failure semantics as the real run: a sheet that could not be
            // planned fails the app after every other sheet was still planned.
            sheetRun.assertAllProcessed();
        }
    );

    logger.verbose(`Planned Qlik Sense Cloud app ${appId} - no changes made`);
};
