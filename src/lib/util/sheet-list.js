/**
 * Helpers for working with the sheet list returned by the Qlik engine's `SheetList`
 * session object, shared by the Qlik Sense Cloud and QSEoW code paths.
 */

import { logger } from '../../globals.js';
import { getErrorCategory } from './error-categorizer.js';

/**
 * The `qData` projection every caller needs: enough to place a sheet and see its thumbnail.
 */
export const SHEET_LIST_FIELDS = {
    thumbnail: '/thumbnail',
    rank: '/rank',
};

/**
 * The wider projection the icon-removal paths ask for. Kept as a distinct constant rather than
 * always requesting the superset, so no caller silently starts pulling fields it does not read.
 */
export const SHEET_LIST_FIELDS_EXTENDED = {
    title: '/qMetaDef/title',
    description: '/qMetaDef/description',
    thumbnail: '/thumbnail',
    cells: '/cells',
    rank: '/rank',
    columns: '/columns',
    rows: '/rows',
};

/**
 * What the screenshot paths ask for: the wider projection plus the sheet's show condition.
 *
 * Only these two callers evaluate show conditions, so the field is not folded into
 * {@link SHEET_LIST_FIELDS_EXTENDED} - spelled as an extension of it, because that is the
 * relationship, and a hand-copied superset is how the three variants drifted apart originally.
 */
export const SHEET_LIST_FIELDS_WITH_SHOW_CONDITION = {
    ...SHEET_LIST_FIELDS_EXTENDED,
    showCondition: '/showCondition',
};

/**
 * Fetches an app's sheets through a `SheetList` session object.
 *
 * The same ~15-line session-object literal was written out in all six modules that walk an app's
 * sheets, in two variants that differed only in which `qData` fields they asked for. Sonar
 * counted it as the largest duplicated block between the twins.
 *
 * @param {object} app - Open engine app handle.
 * @param {object} [qData] - The `qData` projection to request. Defaults to
 *     {@link SHEET_LIST_FIELDS}; the removal paths pass {@link SHEET_LIST_FIELDS_EXTENDED}.
 *
 * @returns {Promise<object[]>} The sheet list items, in the order the engine returned them.
 *     Sort with {@link sortSheetsByRank} before assigning sheet numbers.
 */
export const getSheetList = async (app, qData = SHEET_LIST_FIELDS) => {
    const genericListObj = await app.createSessionObject({
        qInfo: {
            qId: 'SheetList',
            qType: 'SheetList',
        },
        qAppObjectListDef: {
            qType: 'sheet',
            qData,
        },
    });
    const sheetListObj = await genericListObj.getLayout();

    return sheetListObj.qAppObjectList.qItems;
};

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
 * Decides whether a failure belongs to one sheet or to the whole app.
 *
 * Per-sheet isolation is right for a sheet that cannot be written - read-only, deleted
 * mid-run, owned by someone else. It is wrong for a dead engine session: every remaining
 * sheet then fails for the same reason, and the run reports "38 of 40 sheets failed" when
 * what actually happened is one dropped websocket.
 *
 * Net-level classification is delegated to `getErrorCategory`, which already knows about
 * refused connections, timeouts and resets. The message checks cover enigma.js and the
 * Chrome DevTools Protocol, whose session deaths carry no `code`. They are deliberately
 * whole phrases: matching a bare `websocket` also caught per-sheet engine errors that merely
 * mention the transport, aborting the loop on a session that was still alive.
 *
 * @param {Error|unknown} err - Error thrown by a per-sheet worker.
 *
 * @returns {boolean} `true` when the failure is session- or connection-level, so continuing
 *     to the next sheet would only repeat it.
 */
export const isSessionLevelFailure = (err) => {
    if (
        ['timeout', 'connection_refused', 'host_not_found', 'connection_reset'].includes(
            getErrorCategory(err)
        )
    ) {
        return true;
    }

    const message = typeof err?.message === 'string' ? err.message.toLowerCase() : '';

    return (
        message.includes('socket closed') ||
        message.includes('session closed') ||
        message.includes('connection closed') ||
        message.includes('target closed') ||
        message.includes('websocket connection') ||
        message.includes('websocket is not open')
    );
};

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
 * A session-level failure stops the loop rather than being isolated, and is re-thrown by
 * `assertAllProcessed()` unchanged - so the operator sees the dropped connection once,
 * rather than the same message repeated per remaining sheet under a count that blames the
 * sheets. The loop stops but does not throw immediately, so the caller still closes its
 * engine session first.
 *
 * The verdict is deliberately *not* thrown from here. Every caller has an engine session to
 * close first, so they call `assertAllProcessed()` on the result after closing. Returning a
 * bare count instead would put the same assertion at every call site - which is exactly the
 * duplication this helper exists to remove.
 *
 * @param {Array<object>} sheets - Sheets from `qAppObjectList.qItems`, already sorted.
 * @param {object} ctx - Logging and error context.
 * @param {string} ctx.logPrefix - Prefix for per-sheet failure lines, e.g. `'CLOUD UPDATE SHEETS'`.
 * @param {string} ctx.appId - App the sheets belong to.
 * @param {string} ctx.action - Verb for messages, e.g. `'update'` or `'remove icons for'`.
 * @param {new (message: string) => Error} ctx.ErrorClass - Platform error type to throw.
 * @param {boolean} [ctx.requireAttempt] - When true, finishing without attempting a single
 *     sheet is itself a failure. Callers set this when they know work was expected - the
 *     update paths pass it when thumbnails were created, since every sheet skipping means
 *     no icon was applied at all.
 * @param {(sheet: object, iSheetNum: number) => Promise<unknown>} processSheet - Worker
 *     invoked once per sheet, with the 1-based sheet number. Returns `SHEET_SKIPPED` to
 *     record that it did nothing for that sheet.
 *
 * @returns {Promise<{attempted: number, failed: number, skipped: number, changed: number, assertAllProcessed: () => void}>}
 *     The counts - `changed` being only the sheets the worker completed, so neither a failed
 *     sheet nor the one that killed the session is included - plus a check to call once the
 *     engine session has been released.
 */
export const runOverSheets = async (sheets, ctx, processSheet) => {
    const { logPrefix, appId, action, ErrorClass, requireAttempt = false } = ctx;
    let attempted = 0;
    let changed = 0;
    let failed = 0;
    let skipped = 0;
    let iSheetNum = 1;
    let sessionFailure;

    for (const sheet of sheets) {
        try {
            const outcome = await processSheet(sheet, iSheetNum);

            if (outcome === SHEET_SKIPPED) {
                skipped += 1;
            } else {
                attempted += 1;
                changed += 1;
            }
        } catch (err) {
            // A sheet that threw was attempted, whatever it was about to return.
            attempted += 1;

            if (isSessionLevelFailure(err)) {
                // Not this sheet's fault, and every sheet after it would fail identically.
                sessionFailure = err;
                logger.error(
                    `${logPrefix}: Lost the engine session while processing app ${appId} at sheet ${iSheetNum}, abandoning the remaining sheets: ${err?.message ?? err}`
                );
                break;
            }

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
        changed,
        assertAllProcessed: () => {
            // Surface the real cause, not a sheet count that would blame the sheets.
            if (sessionFailure) {
                throw sessionFailure;
            }

            if (failed > 0) {
                throw new ErrorClass(
                    `Failed to ${action} ${failed} of ${attempted} sheet(s) in app ${appId}`
                );
            }

            if (requireAttempt && attempted === 0) {
                throw new ErrorClass(
                    `No sheet in app ${appId} could be matched to a generated thumbnail, so no icon was ${action}d. All ${skipped} sheet(s) were skipped.`
                );
            }
        },
    };
};

/**
 * Persists an app, but only when a sheet was actually changed.
 *
 * `app.doSave()` used to be called once per sheet, from inside the loop. That wrote the app
 * N times for N sheets, and wrote it even when every sheet had been skipped - a run that
 * changed nothing still produced a new app version.
 *
 * The count is passed in rather than tracked here, so there is no way to end up with an
 * unbound placeholder in the message. An earlier attempt at this shipped a literal `{n}` to
 * operators in two of its four copies.
 *
 * Trade-off worth knowing: saving once at the end means a session lost mid-loop persists
 * nothing, where per-sheet saving left the sheets processed so far already written. That is
 * deliberate - it matches how a failed app is reported everywhere else here, all-or-nothing
 * with the old icons intact, rather than a mix of old and new nobody asked for.
 *
 * @param {object} app - Open engine app handle.
 * @param {object} ctx - Logging context.
 * @param {string} ctx.logPrefix - Prefix for the log line, e.g. `'CLOUD UPDATE SHEETS'`.
 * @param {string} ctx.appId - App being saved.
 * @param {number} changedCount - How many sheets had their properties written. Anything that
 *     is not a positive number suppresses the save, so an accidental `undefined` cannot
 *     write an app nothing touched.
 *
 * @returns {Promise<boolean>} `true` if the app was saved, `false` if there was nothing to save.
 */
export const saveIfChanged = async (app, { logPrefix, appId }, changedCount) => {
    if (!(changedCount > 0)) {
        logger.verbose(
            `${logPrefix}: No sheet in app ${appId} was changed, so the app was not saved`
        );
        return false;
    }

    await app.doSave();
    logger.verbose(`${logPrefix}: Saved app ${appId} after changing ${changedCount} sheet(s)`);

    return true;
};
