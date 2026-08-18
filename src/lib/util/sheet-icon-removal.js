import { logger } from '../../globals.js';
import { runOverSheets, SHEET_SKIPPED } from './sheet-list.js';
import { recordSheetDecision } from './run-report.js';
import { sheetProgressLine } from './run-report-render.js';
import { CLEAR_REASON } from './sheet-decision-reasons.js';

/**
 * The per-sheet halves of `remove-sheet-icons`, shared by both platforms.
 *
 * Clearing an icon is the same operation on QSEoW and on Qlik Sense Cloud:
 * open the sheet, read its properties, blank `qStaticContentUrlDef.qUrl`,
 * save. Everything that genuinely differs between the platforms - the engine
 * connection, the app selection, the media-library cleanup Cloud performs and
 * QSEoW does not - lives in the workers. What is left is identical, and it was
 * duplicated: two copies of the same loop, which is the twin asymmetry this
 * repo keeps paying for and which the quality gate counts as duplicated lines.
 *
 * One copy also means the dry run and the real run can only disagree in one
 * place rather than four, which matters because they currently do disagree
 * (issue #1113): the real run treats a missing thumbnail *structure* as "no
 * icon" while the planner treats an empty *URL* that way, so a sheet a
 * previous removal already cleared is planned as a no-op and then written and
 * saved. Fixing that is now a change to `hasSheetIcon` below, applied to both
 * platforms at once.
 *
 * @param {object} properties - A sheet's properties, as `getProperties` returns them.
 *
 * @returns {boolean} Whether the sheet carries a thumbnail this run would clear.
 */
const hasSheetIcon = (properties) => Boolean(properties?.thumbnail?.qStaticContentUrlDef);

/**
 * Clears the icon on every sheet of an already-open app.
 *
 * @param {object} app - An opened enigma.js app (doc) handle.
 * @param {object[]} sheets - The app's sheets, already sorted into run order.
 * @param {object} ctx - Loop context.
 * @param {string} ctx.logPrefix - Prefix for this command's log lines.
 * @param {string} ctx.appId - The app being processed, for error messages.
 * @param {Function} ctx.ErrorClass - Platform error class `runOverSheets` throws.
 * @param {object|null} [ctx.appEntry] - Run-report app section; decisions are
 *     recorded onto it when present.
 *
 * @returns {Promise<object>} The `runOverSheets` result, for `assertAllProcessed`.
 */
export const clearSheetIcons = async (app, sheets, ctx) => {
    const { logPrefix, appId, ErrorClass, appEntry = null } = ctx;

    return runOverSheets(
        sheets,
        { logPrefix, appId, action: 'remove icons for', ErrorClass },
        async (sheet, iSheetNum) => {
            // Optional-chained like the planner's read of the same fields: a
            // sheet the engine returns without qMeta must not fail here, on a
            // log line, when the dry run planned it as a clean clear.
            logger.verbose(
                `Removing icon for sheet ${iSheetNum}: Name '${sheet?.qMeta?.title}', ID ${sheet?.qInfo?.qId}, description '${sheet?.qMeta?.description}'`
            );

            const sheetObj = await app.getObject(sheet.qInfo.qId);
            const sheetProperties = await sheetObj.getProperties();

            // A sheet without the thumbnail structure has no icon to clear -
            // failing the whole app over it turned a no-op into an error, and
            // made the dry run predict success for exactly the input that
            // broke the run.
            if (!hasSheetIcon(sheetProperties)) {
                if (appEntry) {
                    recordSheetDecision(appEntry, {
                        n: iSheetNum,
                        title: sheet?.qMeta?.title,
                        action: 'clear',
                        reason: CLEAR_REASON.NO_ICON,
                    });
                }
                logger.info(
                    sheetProgressLine({
                        n: iSheetNum,
                        total: sheets.length,
                        label: 'no icon',
                        title: sheet?.qMeta?.title,
                        reason: CLEAR_REASON.NO_ICON,
                    })
                );

                return SHEET_SKIPPED;
            }

            sheetProperties.thumbnail.qStaticContentUrlDef.qUrl = '';

            const res = await sheetObj.setProperties(sheetProperties);
            logger.debug(`Set thumbnail result: ${JSON.stringify(res, null, 2)}`);

            // Recorded only after the write went through, so the row states a
            // fact.
            if (appEntry) {
                recordSheetDecision(appEntry, {
                    n: iSheetNum,
                    title: sheet?.qMeta?.title,
                    action: 'clear',
                });
            }
            logger.info(
                sheetProgressLine({
                    n: iSheetNum,
                    total: sheets.length,
                    label: 'cleared',
                    title: sheet?.qMeta?.title,
                })
            );

            return undefined;
        }
    );
};

/**
 * Records what {@link clearSheetIcons} would do, without writing anything.
 *
 * Makes the same two engine calls per sheet the real run makes, in the same
 * order - not the cheaper read of the projected `qData.thumbnail`. The
 * projection answers the icon question correctly and still plans a clean
 * `clear` for a sheet the real run cannot open at all, which is the one
 * prediction a dry run must never get wrong: the run would clear and save the
 * sheets around it before failing the app.
 *
 * @param {object} app - An opened enigma.js app (doc) handle.
 * @param {object[]} sheets - The app's sheets, already sorted into run order.
 * @param {object} ctx - Loop context.
 * @param {string} ctx.logPrefix - Prefix for this command's log lines.
 * @param {string} ctx.appId - The app being planned, for error messages.
 * @param {Function} ctx.ErrorClass - Platform error class `runOverSheets` throws.
 * @param {object} ctx.appEntry - Run-report app section to record decisions onto.
 *
 * @returns {Promise<object>} The `runOverSheets` result, for `assertAllProcessed`.
 */
export const planSheetIconRemoval = async (app, sheets, ctx) => {
    const { logPrefix, appId, ErrorClass, appEntry } = ctx;

    return runOverSheets(
        sheets,
        { logPrefix, appId, action: 'plan icon removal for', ErrorClass },
        async (sheet, iSheetNum) => {
            const sheetObj = await app.getObject(sheet.qInfo.qId);
            const sheetProperties = await sheetObj.getProperties();
            const iconUrl = sheetProperties?.thumbnail?.qStaticContentUrlDef?.qUrl;

            // The real run clears every sheet unconditionally, so the action is
            // always `clear`; the reason column reports the sheets where that
            // clear is already a no-op.
            recordSheetDecision(appEntry, {
                n: iSheetNum,
                title: sheet?.qMeta?.title,
                action: 'clear',
                reason: iconUrl ? null : CLEAR_REASON.NO_ICON,
            });
        }
    );
};
