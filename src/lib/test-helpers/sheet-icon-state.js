/**
 * Reads back the icon a live app's sheets actually carry.
 *
 * Test support for the two `remove-sheet-icons` round-trip integration suites, which are the
 * only place the removal commands are exercised against a real engine. Both platforms need the
 * identical read, and it is the assertion the suites are built on, so it lives here rather than
 * being written twice - the twin asymmetry this repo keeps paying for starts exactly this way.
 *
 * Lives under `test-helpers/` rather than beside the suites because Jest's default `testMatch`
 * treats every `.js` file under a `__tests__/` directory as a suite of its own, and a helper
 * placed there fails the run with "your test suite must contain at least one test".
 *
 * ## Why the properties, and not the projection
 *
 * `getSheetList` can project `/thumbnail` into `qData`, which would answer the whole app in one
 * engine call. It does not answer the question. Measured against QSEoW 12.2759.8 and Qlik Sense
 * Cloud engine 12.2881.0, the projection comes back as `{qStaticContentUrl: {}}` on **every**
 * sheet, including sheets whose properties carry a thumbnail URL: the list projects the evaluated
 * `qStaticContentUrl`, while what the commands write and read is the definition,
 * `qStaticContentUrlDef`. A read-back built on the projection would therefore report "no sheet
 * has an icon" for an app in the icons-applied state - and the removal assertion would pass
 * without the removal having run.
 *
 * The per-sheet `getObject` + `getProperties` pair is the read that answers truthfully, and it is
 * the same pair the production code reads and writes through. (This also answers question 3 of
 * issue #908, which asked which read is authoritative.)
 *
 * That the read path is shared with the code under test is deliberate rather than overlooked.
 * What these suites prove is **persistence**: the caller opens a fresh engine session after the
 * command has closed its own and saved the app, so what comes back is what the server kept, not
 * what the command believed it had done in memory. The QSEoW suite pairs this with a QRS
 * `modifiedDate` snapshot, which is genuinely independent of the engine.
 */

import { withEngineSession } from '../util/engine-session.js';
import { getSheetList, sortSheetsByRank, SHEET_LIST_FIELDS_EXTENDED } from '../util/sheet-list.js';

/**
 * @typedef {object} SheetIconState
 * @property {string} id - The sheet's engine object id.
 * @property {string} title - The sheet's title, for readable assertion failures.
 * @property {string} iconUrl - The sheet's thumbnail URL, or `''` when it carries no icon.
 *     Empty string rather than null/undefined so `Boolean(iconUrl)` is the single question
 *     asked, matching the `hasSheetIcon` predicate the removal paths use.
 */

/**
 * Opens an app over a fresh engine session and reports what icon each of its sheets carries.
 *
 * Sheets come back in the run order the commands use (`sortSheetsByRank`), so a failure message
 * lists them in the same order the run's own log lines did.
 *
 * @param {object} configEnigma - Fully-built enigma.js config, from the platform's own
 *     `setupEnigmaConnection`. Passed in rather than built here for the same reason
 *     `withEngineSession` takes one: the two platforms construct it differently, and the suite
 *     must read through exactly the connection its command wrote through.
 * @param {string} appId - The app to read.
 * @param {object} ctx - Logging context, forwarded to `withEngineSession`.
 * @param {string} ctx.logPrefix - Prefix for error output.
 * @param {string} ctx.loglevel - Active log level.
 * @param {string} ctx.connectionLabel - What is being connected to, for the session log line.
 *
 * @returns {Promise<SheetIconState[]>} One entry per sheet, in rank order.
 */
export const readSheetIconState = async (configEnigma, appId, ctx) =>
    withEngineSession(configEnigma, ctx, async (global) => {
        const app = await global.openDoc(appId, '', '', '', false);
        const sheets = await getSheetList(app, SHEET_LIST_FIELDS_EXTENDED);
        sortSheetsByRank(sheets);

        const state = [];
        // Sequentially, not through Promise.all: these suites run against shared servers, and a
        // fan-out of per-sheet engine calls is the kind of load that turns an assertion failure
        // into an argument about whether the server was busy.
        for (const sheet of sheets) {
            const sheetObj = await app.getObject(sheet.qInfo.qId);
            const properties = await sheetObj.getProperties();

            state.push({
                id: sheet.qInfo.qId,
                title: sheet?.qMeta?.title ?? '',
                iconUrl: properties?.thumbnail?.qStaticContentUrlDef?.qUrl ?? '',
            });
        }

        return state;
    });

/**
 * The ids of the sheets carrying an icon, sorted.
 *
 * Sorted ids rather than the raw state objects: an assertion that fails should say which sheets
 * differ, not print two lists of URLs that differ in every entry because the content library
 * changed. Sorting removes rank order from the comparison, which is what makes a before/after
 * pair comparable across a run that re-created the icons.
 *
 * @param {SheetIconState[]} state - Result of {@link readSheetIconState}.
 *
 * @returns {string[]} Sorted sheet ids, empty when no sheet carries an icon.
 */
export const sheetIdsWithIcon = (state) =>
    state
        .filter((sheet) => Boolean(sheet.iconUrl))
        .map((sheet) => sheet.id)
        .sort();

/**
 * The titles of the sheets carrying an icon, in rank order.
 *
 * Used only to make a failed "every icon is gone" assertion name the sheets that still have one.
 *
 * @param {SheetIconState[]} state - Result of {@link readSheetIconState}.
 *
 * @returns {string[]} Sheet titles, empty when no sheet carries an icon.
 */
export const sheetTitlesWithIcon = (state) =>
    state.filter((sheet) => Boolean(sheet.iconUrl)).map((sheet) => sheet.title);
