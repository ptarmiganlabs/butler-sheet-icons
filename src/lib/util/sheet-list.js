/**
 * Helpers for working with the sheet list returned by the Qlik engine's `SheetList`
 * session object, shared by the Qlik Sense Cloud and QSEoW code paths.
 */

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
/**
 * Fails the app when any of its sheets could not be processed.
 *
 * Per-sheet isolation exists so one bad sheet does not abandon the ones after it. Without
 * this check that isolation also swallowed the outcome: an app in which every single sheet
 * failed resolved normally, the app loop counted it as a success, and the run exited 0.
 *
 * Call it after the sheet loop and after the engine session has been closed, so a failing
 * app still releases its session.
 *
 * @param {number} failed - How many sheets failed.
 * @param {number} total - How many sheets were attempted.
 * @param {object} ctx - Message context.
 * @param {string} ctx.appId - App the sheets belong to.
 * @param {string} ctx.action - Verb for the message, e.g. `'update'` or `'remove icons for'`.
 * @param {new (message: string) => Error} ctx.ErrorClass - Platform error type to throw.
 *
 * @returns {void}
 *
 * @throws {Error} An instance of `ErrorClass` when `failed` is non-zero.
 */
export const assertAllSheetsProcessed = (failed, total, { appId, action, ErrorClass }) => {
    if (failed === 0) {
        return;
    }

    throw new ErrorClass(`Failed to ${action} ${failed} of ${total} sheet(s) in app ${appId}`);
};

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
