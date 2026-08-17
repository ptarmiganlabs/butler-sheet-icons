import { isSheetTagged } from '../util/sheet-list.js';
import { EXCLUDE_REASON } from '../util/sheet-decision-reasons.js';

/**
 * Determines whether a sheet should be excluded from updates based on various criteria.
 *
 * @param {object} app - The Qlik Sense application object.
 * @param {object} sheet - The sheet object containing metadata about the sheet.
 * @param {object} options - Options object that may contain various exclusion criteria such as status, tag, number, and title.
 * @param {Array<object>} tagSheetAppMetadata - Array of metadata objects used to determine if a sheet should be excluded via tags.
 * @param {number} iSheetNum - The index number of the sheet within the application.
 * @param {string} repoDbSheetId - The sheet ID in the repository database.
 * @param {string} engineSheetId - The sheet ID in the engine.
 * @param {object} logger - Logger object used for logging verbose messages.
 *
 * @returns {Promise<{ excludeSheet: boolean, sheetIsHidden: boolean, excludeReason: string|null }>} Resolves with `excludeSheet` (true if the sheet should be excluded), `sheetIsHidden` (true if the sheet is hidden via showCondition), and `excludeReason` naming the first rule that matched (from `sheet-decision-reasons.js`), or null.
 */
export const determineSheetExcludeStatus = async (
    app,
    sheet,
    options,
    tagSheetAppMetadata,
    iSheetNum,
    repoDbSheetId,
    engineSheetId,
    logger
) => {
    let excludeSheet = false;
    // First rule to exclude the sheet names the reason; later rules are skipped or,
    // for the status trio, keep the first reason via ??=.
    let excludeReason = null;

    // Should this sheet be excluded based on its published status?
    // Deal with public sheets first
    if (
        sheet.qMeta.approved === true &&
        sheet.qMeta.published === true &&
        options.excludeSheetStatus &&
        options.excludeSheetStatus.includes('public')
    ) {
        excludeSheet = true;
        excludeReason ??= EXCLUDE_REASON.STATUS_PUBLIC;
        logger.verbose(
            `Excluded sheet (status public): ${iSheetNum}: '${sheet.qMeta.title}', sheet id '${repoDbSheetId}', engine sheet id '${engineSheetId}', description '${sheet.qMeta.description}', approved ${sheet.qMeta.approved}, published ${sheet.qMeta.published}`
        );
    }

    // Next check published sheets
    if (
        sheet.qMeta.approved === false &&
        sheet.qMeta.published === true &&
        options.excludeSheetStatus &&
        options.excludeSheetStatus.includes('published')
    ) {
        excludeSheet = true;
        excludeReason ??= EXCLUDE_REASON.STATUS_PUBLISHED;
        logger.verbose(
            `Excluded sheet (status published): ${iSheetNum}: '${sheet.qMeta.title}', sheet id '${repoDbSheetId}', engine sheet id '${engineSheetId}', description '${sheet.qMeta.description}', approved ${sheet.qMeta.approved}, published ${sheet.qMeta.published}`
        );
    }

    // Next check private sheets
    if (
        sheet.qMeta.approved === false &&
        sheet.qMeta.published === false &&
        options.excludeSheetStatus &&
        options.excludeSheetStatus.includes('private')
    ) {
        excludeSheet = true;
        excludeReason ??= EXCLUDE_REASON.STATUS_PRIVATE;
        logger.verbose(
            `Excluded sheet (status private): ${iSheetNum}: '${sheet.qMeta.title}', sheet id '${repoDbSheetId}', engine sheet id '${engineSheetId}', description '${sheet.qMeta.description}', approved ${sheet.qMeta.approved}, published ${sheet.qMeta.published}`
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
            `Excluded sheet (hidden): ${iSheetNum}: '${sheet.qMeta.title}', sheet id '${repoDbSheetId}', engine sheet id '${engineSheetId}', description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}', hidden '${sheetIsHidden}'`
        );
    }

    // Is this sheet on the exclude list via tags?
    // options.excludeSheetTag is an array of strings
    // tagSheetAppMetadata is an array of sheet objects, with the id property being the sheet id
    if (options.excludeSheetTag && excludeSheet === false) {
        // Does the sheet id match any of the ids in tagSheetAppMetadata array?
        // Set excludeSheet to true/false based on the result
        excludeSheet = isSheetTagged(tagSheetAppMetadata, sheet);
        // Only claim an exclusion that actually happened: this line used to be logged
        // whether or not the tag matched.
        if (excludeSheet === true) {
            excludeReason = EXCLUDE_REASON.TAG;
            logger.verbose(
                `Excluded sheet (via tags): ${iSheetNum}: '${sheet.qMeta.title}', sheet id '${repoDbSheetId}', engine sheet id '${engineSheetId}', description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}', hidden '${sheetIsHidden}'`
            );
        }
    }

    // Is this sheet on the exclude list via sheet number?
    if (options.excludeSheetNumber && excludeSheet === false) {
        // Does the sheet number match any of the numbers in options.excludeSheetNumber array?
        // Take into account that iSheetNum is an integer, so we need to convert it to a string
        if (options.excludeSheetNumber.includes(iSheetNum.toString())) {
            excludeSheet = true;
            excludeReason = EXCLUDE_REASON.NUMBER;
            logger.verbose(
                `Excluded sheet (via sheet number): ${iSheetNum}: '${sheet.qMeta.title}', sheet id '${repoDbSheetId}', engine sheet id '${engineSheetId}', description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}', hidden '${sheetIsHidden}'`
            );
        }
    }

    // Is this sheet on the exclude list via sheet title?
    if (options.excludeSheetTitle && excludeSheet === false) {
        // Does the sheet title match any of the titles options.excludeSheetTitle array?
        if (options.excludeSheetTitle.includes(sheet.qMeta.title)) {
            excludeSheet = true;
            excludeReason = EXCLUDE_REASON.TITLE;
            logger.verbose(
                `Excluded sheet (via sheet title): ${iSheetNum}: '${sheet.qMeta.title}', sheet id '${repoDbSheetId}', engine sheet id '${engineSheetId}', description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}', hidden '${sheetIsHidden}'`
            );
        }
    }

    return { excludeSheet, sheetIsHidden, excludeReason };
};
