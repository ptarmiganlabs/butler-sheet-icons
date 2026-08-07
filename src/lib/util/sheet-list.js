/**
 * Helpers for working with the sheet list returned by the Qlik engine's `SheetList`
 * session object, shared by the Qlik Sense Cloud and QSEoW code paths.
 */

import { logger } from '../../globals.js';

/**
 * Sorts a list of app sheets by their engine rank, in place.
 *
 * Sheet order matters beyond presentation: it assigns each sheet its 1-based sheet
 * number, which names the thumbnail file and decides what `--exclude-sheet-number` and
 * `--blur-sheet-number` select.
 *
 * Two things are handled here that the six hand-written copies of this comparator did
 * not:
 *
 * 1. **Missing metadata no longer aborts the app.** Reading `sheet.qData.rank`
 *    unguarded throws `TypeError: Cannot read properties of undefined (reading 'rank')`
 *    on a sheet the engine returned without `qData`. Because sorting happens before the
 *    per-sheet try/catch blocks, a single such sheet took down the whole app before one
 *    icon had been touched.
 * 2. **The ordering is now total.** The previous comparator reported "equal" for any
 *    pair involving an absent rank, which is not transitive - so one rank-less sheet
 *    could perturb the relative order of the well-formed sheets around it, and with it
 *    their sheet numbers. Sheets without a usable rank are now placed after all sheets
 *    that have one, leaving the numbering of the well-formed sheets predictable.
 *
 * Ranks are compared with `<` / `>` on their raw values rather than being coerced, which
 * keeps the ordering of valid data identical to before. Equal ranks keep their original
 * relative order, as `Array.prototype.sort` is stable.
 *
 * @param {Array<object>} sheets - Sheets from `qAppObjectList.qItems`. Sorted in place.
 *
 * @returns {Array<object>} The same array, sorted, so the call can be chained.
 */
export const sortSheetsByRank = (sheets) =>
    sheets.sort((sheet1, sheet2) => {
        const rank1 = sheet1?.qData?.rank;
        const rank2 = sheet2?.qData?.rank;
        const hasRank1 = rank1 !== undefined && rank1 !== null;
        const hasRank2 = rank2 !== undefined && rank2 !== null;

        // Sheets with no usable rank sort after every sheet that has one, keeping their
        // own relative order.
        if (!hasRank1 && !hasRank2) return 0;
        if (!hasRank1) return 1;
        if (!hasRank2) return -1;

        if (rank1 < rank2) return -1;
        if (rank1 > rank2) return 1;
        return 0;
    });

/**
 * Reports whether a sheet appears in a list of sheets carrying some QRS tag.
 *
 * Both sides of the identity comparison are guarded, and that matters more than it looks.
 * `element.engineObjectId === sheet.qInfo.qId` throws when a sheet arrives without
 * `qInfo`; adding optional chaining to only the right-hand side replaces the crash with
 * `undefined === undefined`, which is `true` - so every sheet missing its id would match
 * the tag list and be silently excluded or blurred. A sheet with no id matches nothing.
 *
 * @param {Array<object>} taggedSheets - Sheets carrying the tag, each exposing
 *     `engineObjectId`. May be undefined or empty, in which case nothing matches.
 * @param {object} sheet - Sheet from `qAppObjectList.qItems`.
 *
 * @returns {boolean} `true` only when the sheet has an engine id and that id is present in
 *     the tagged list.
 */
export const isSheetTagged = (taggedSheets, sheet) => {
    const engineObjectId = sheet?.qInfo?.qId;

    if (engineObjectId === undefined || engineObjectId === null) {
        return false;
    }

    return (taggedSheets ?? []).some((element) => element?.engineObjectId === engineObjectId);
};

/**
 * Sentinel a `runOverSheets` worker returns to say it did no work for this sheet.
 *
 * A symbol rather than a falsy value on purpose: a worker that forgets to return anything
 * yields `undefined`, and treating that as "skipped" would silently report an app in which
 * every sheet was updated as one in which nothing was attempted. The safe default is to
 * count a sheet as attempted unless the worker says otherwise.
 */
export const SHEET_SKIPPED = Symbol('sheet skipped');

/**
 * Runs a per-sheet worker over an app's sheets, isolating each sheet from the others and
 * keeping count of the ones that failed.
 *
 * The counting is the point. Per-sheet isolation exists so one bad sheet does not abandon
 * the ones after it, but on its own it also swallows the outcome: an app in which every
 * sheet failed used to resolve normally and be counted a success.
 *
 * Counts are over sheets **attempted**, not sheets present. A worker that returns
 * `SHEET_SKIPPED` - the thumbnail-update paths do this for sheets no screenshot was taken
 * for - is not counted in either figure. Reporting "1 of 5" for an app where four sheets
 * were deliberately left alone and the fifth failed reads as mostly-fine when in fact
 * nothing succeeded.
 *
 * The verdict is deliberately *not* thrown from here. Every caller has an engine session to
 * close first, so they call `assertAllProcessed()` on the result after closing. Returning a
 * bare count instead would put the same five-line assertion at every call site - which is
 * exactly the duplication this helper exists to remove.
 *
 * @param {Array<object>} sheets - Sheets from `qAppObjectList.qItems`, already sorted.
 * @param {object} ctx - Logging and error context.
 * @param {string} ctx.logPrefix - Prefix for per-sheet failure lines, e.g. `'CLOUD UPDATE SHEETS'`.
 * @param {string} ctx.appId - App the sheets belong to.
 * @param {string} ctx.action - Verb for messages, e.g. `'update'` or `'remove icons for'`.
 * @param {new (message: string) => Error} ctx.ErrorClass - Platform error type to throw.
 * @param {(sheet: object, iSheetNum: number) => Promise<unknown>} processSheet - Worker
 *     invoked once per sheet, with the 1-based sheet number. Returns `SHEET_SKIPPED` to
 *     record that it did nothing for that sheet.
 *
 * @returns {Promise<{attempted: number, failed: number, skipped: number, assertAllProcessed: () => void}>}
 *     The counts, plus a check to call once the engine session has been released.
 */
export const runOverSheets = async (sheets, ctx, processSheet) => {
    const { logPrefix, appId, action, ErrorClass } = ctx;
    let attempted = 0;
    let failed = 0;
    let skipped = 0;
    let iSheetNum = 1;

    for (const sheet of sheets) {
        try {
            const outcome = await processSheet(sheet, iSheetNum);

            if (outcome === SHEET_SKIPPED) {
                skipped += 1;
            } else {
                attempted += 1;
            }
        } catch (err) {
            // A sheet that threw was attempted, whatever it was about to return.
            attempted += 1;
            failed += 1;
            logger.error(
                `${logPrefix}: Failed to ${action} sheet ${iSheetNum} ('${sheet?.qMeta?.title}', ID ${sheet?.qInfo?.qId}) in app ${appId}: ${err?.message ?? err}`
            );
        }

        iSheetNum += 1;
    }

    return {
        attempted,
        failed,
        skipped,
        assertAllProcessed: () => {
            if (failed === 0) {
                return;
            }

            throw new ErrorClass(
                `Failed to ${action} ${failed} of ${attempted} sheet(s) in app ${appId}`
            );
        },
    };
};
