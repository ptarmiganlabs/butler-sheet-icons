import { EXCLUDE_REASON } from '../util/sheet-decision-reasons.js';

/**
 * Determines whether a Qlik Sense Cloud sheet should be excluded from thumbnail updates.
 *
 * The QSEoW twin of this lives in `src/lib/qseow/determine-sheet-exclude-status.js`, with
 * the same name, the same return shape and the same rule order. The two cannot simply be
 * merged: QSEoW resolves exclude-by-tag through a QRS lookup that Cloud has no equivalent
 * for, and the two platforms decide "public" from different combinations of the approved
 * and published flags. Keeping them as recognisable twins is the next best thing.
 *
 * This logic previously sat inline in `processCloudApp`, where it dereferenced `qMeta`,
 * `qInfo` and `qData` unguarded thirteen times. A sheet the engine returned without that
 * metadata took the whole app down mid-loop.
 *
 * @param {object} app - Open engine app handle, used to evaluate the sheet's show condition.
 * @param {object} sheet - Sheet from `qAppObjectList.qItems`.
 * @param {object} options - Exclusion options.
 * @param {string[]} [options.excludeSheetStatus] - Statuses to exclude: `private`, `published`, `public`.
 * @param {string[]} [options.excludeSheetNumber] - Sheet numbers to exclude, as strings.
 * @param {string[]} [options.excludeSheetTitle] - Sheet titles to exclude.
 * @param {boolean} appIsPublished - Whether the parent app is published. Public sheets are
 *     identified differently in published and unpublished apps.
 * @param {number} iSheetNum - 1-based position of the sheet within the app.
 * @param {object} logger - Logger; verbose output explains which rule excluded the sheet.
 *
 * @returns {Promise<{excludeSheet: boolean, sheetIsHidden: boolean, excludeReason: string|null}>} Whether to skip the
 *     sheet, whether it was hidden - the caller logs the hidden flag either way - and
 *     `excludeReason` naming the first rule that matched (from `sheet-decision-reasons.js`), or null.
 */
export const determineSheetExcludeStatus = async (
    app,
    sheet,
    options,
    appIsPublished,
    iSheetNum,
    logger
) => {
    let excludeSheet = false;
    // First rule to exclude the sheet names the reason; ??= keeps the first writer.
    let excludeReason = null;

    // Get published status of sheet
    let sheetPublished;
    if (sheet?.qMeta?.published === undefined || sheet.qMeta.published === false) {
        sheetPublished = false;
    } else {
        sheetPublished = true;
    }

    // Get approved status of sheet
    let sheetApproved;
    if (sheet?.qMeta?.approved === undefined || sheet.qMeta.approved === false) {
        sheetApproved = false;
    } else {
        sheetApproved = true;
    }

    // Should this sheet be excluded based on its published status?
    // Deal with public sheets first. Published and unpublished apps need to be handled differently.
    if (appIsPublished === true) {
        // App is published
        if (
            sheetApproved === true &&
            sheetPublished === true &&
            options.excludeSheetStatus?.includes('public')
        ) {
            excludeSheet = true;
            excludeReason ??= EXCLUDE_REASON.STATUS_PUBLIC;
            logger.verbose(
                `Excluded sheet (status public): ${iSheetNum}: '${sheet?.qMeta?.title}', ID ${sheet?.qInfo?.qId}, description '${sheet?.qMeta?.description}', approved '${sheetApproved}', published '${sheetPublished}'`
            );
        }
    } else if (
        sheetApproved === false &&
        sheetPublished === true &&
        options.excludeSheetStatus &&
        options.excludeSheetStatus.includes('public')
    ) {
        // App is not published. Public sheets in this case have approved===false and published===true
        excludeSheet = true;
        excludeReason ??= EXCLUDE_REASON.STATUS_PUBLIC;
        logger.verbose(
            `Excluded sheet (status public): ${iSheetNum}: '${sheet?.qMeta?.title}', ID ${sheet?.qInfo?.qId}, description '${sheet?.qMeta?.description}', approved '${sheetApproved}', published '${sheetPublished}'`
        );
    }

    // Next check published sheets
    // Only applicable to published apps
    if (appIsPublished === true) {
        if (
            sheetApproved === false &&
            sheetPublished === true &&
            options.excludeSheetStatus &&
            options.excludeSheetStatus.includes('published')
        ) {
            excludeSheet = true;
            excludeReason ??= EXCLUDE_REASON.STATUS_PUBLISHED;
            logger.verbose(
                `Excluded sheet (status published): ${iSheetNum}: '${sheet?.qMeta?.title}', ID ${sheet?.qInfo?.qId}, description '${sheet?.qMeta?.description}', approved '${sheetApproved}', published '${sheetPublished}'`
            );
        }
    }

    // Next check private sheets
    // Handled the same way for both published and unpublished apps
    if (
        sheetApproved === false &&
        sheetPublished === false &&
        options.excludeSheetStatus &&
        options.excludeSheetStatus.includes('private')
    ) {
        excludeSheet = true;
        excludeReason ??= EXCLUDE_REASON.STATUS_PRIVATE;
        logger.verbose(
            `Excluded sheet (status private): ${iSheetNum}: '${sheet?.qMeta?.title}', ID ${sheet?.qInfo?.qId}, description '${sheet?.qMeta?.description}', approved '${sheetApproved}', published '${sheetPublished}'`
        );
    }

    // Is this sheet hidden?
    // Never process hidden sheets
    // Evaluate showCondition
    // The engine round trip only happens when there is a condition to evaluate
    // and the literal-'false' shortcut has not already answered it. In a dry
    // run this call is the entire per-sheet cost, and most sheets have no show
    // condition at all - the result is byte-identical either way.
    const showCondition = sheet?.qData?.showCondition;
    let sheetIsHidden = false;
    if (showCondition) {
        if (showCondition.toLowerCase() === 'false') {
            sheetIsHidden = true;
        } else {
            const showConditionEval = await app.evaluateEx({ qExpression: showCondition });
            sheetIsHidden =
                showConditionEval?.qIsNumeric === true && showConditionEval?.qNumber === 0;
        }
    }

    if (sheetIsHidden === true && excludeSheet === false) {
        excludeSheet = true;
        excludeReason = EXCLUDE_REASON.HIDDEN;
        logger.verbose(
            `Excluded sheet (hidden): ${iSheetNum}: '${sheet?.qMeta?.title}', ID ${sheet?.qInfo?.qId}, description '${sheet?.qMeta?.description}', approved '${sheetApproved}', published '${sheetPublished}', hidden '${sheetIsHidden}'`
        );
    }

    // Is this sheet on the exclude list via sheet number?
    if (options.excludeSheetNumber && excludeSheet === false) {
        // Does the sheet number match any of the numbers in options.excludeSheetNumber array?
        // Take into account that iSheetNum is an integer, so we need to convert it to a string
        if (options.excludeSheetNumber.includes(iSheetNum.toString())) {
            excludeSheet = true;
            excludeReason = EXCLUDE_REASON.NUMBER;
            logger.verbose(
                `Excluded sheet (via sheet number): ${iSheetNum}: '${sheet?.qMeta?.title}', ID ${sheet?.qInfo?.qId}, description '${sheet?.qMeta?.description}', approved '${sheet?.qMeta?.approved}', published '${sheet?.qMeta?.published}', hidden '${sheetIsHidden}'`
            );
        }
    }

    // Is this sheet on the exclude list via sheet title?
    if (options.excludeSheetTitle && excludeSheet === false) {
        // Does the sheet title match any of the titles options.excludeSheetTitle array?
        if (options.excludeSheetTitle.includes(sheet?.qMeta?.title)) {
            excludeSheet = true;
            excludeReason = EXCLUDE_REASON.TITLE;
            logger.verbose(
                `Excluded sheet (via sheet title): ${iSheetNum}: '${sheet?.qMeta?.title}', ID ${sheet?.qInfo?.qId}, description '${sheet?.qMeta?.description}', approved '${sheet?.qMeta?.approved}', published '${sheet?.qMeta?.published}', hidden '${sheetIsHidden}'`
            );
        }
    }

    return { excludeSheet, sheetIsHidden, excludeReason };
};
