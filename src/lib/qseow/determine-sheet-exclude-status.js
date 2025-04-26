/**
 * Determines whether a sheet should be excluded from updates based on various criteria.
 *
 * @param {Object} app - The Qlik Sense application object.
 * @param {Object} sheet - The sheet object containing metadata about the sheet.
 * @param {Object} options - Options object that may contain various exclusion criteria such as status, tag, number, and title.
 * @param {Array} tagSheetAppMetadata - Array of metadata objects used to determine if a sheet should be excluded via tags.
 * @param {number} iSheetNum - The index number of the sheet within the application.
 * @param {string} repoDbSheetId - The sheet ID in the repository database.
 * @param {string} engineSheetId - The sheet ID in the engine.
 * @param {Object} logger - Logger object used for logging verbose messages.
 *
 * @returns {Promise<Object>} - Returns true if the sheet should be excluded, false otherwise.
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

    // Should this sheet be excluded based on its published status?
    // Deal with public sheets first
    if (
        sheet.qMeta.approved === true &&
        sheet.qMeta.published === true &&
        options.excludeSheetStatus &&
        options.excludeSheetStatus.includes('public')
    ) {
        excludeSheet = true;
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
        logger.verbose(
            `Excluded sheet (status private): ${iSheetNum}: '${sheet.qMeta.title}', sheet id '${repoDbSheetId}', engine sheet id '${engineSheetId}', description '${sheet.qMeta.description}', approved ${sheet.qMeta.approved}, published ${sheet.qMeta.published}`
        );
    }

    // Is this sheet hidden?
    // Never process hidden sheets
    // Evaluate showCondition
    const showConditionCall = {
        qExpression: sheet?.qData?.showCondition,
    };

    const showConditionEval = await app.evaluateEx(showConditionCall);
    const sheetIsHidden =
        // eslint-disable-next-line no-unneeded-ternary
        sheet.qData.showCondition &&
        (sheet.qData.showCondition.toLowerCase() === 'false' ||
            (showConditionEval?.qIsNumeric === true && showConditionEval?.qNumber === 0))
            ? true
            : false;

    if (sheetIsHidden === true && excludeSheet === false) {
        excludeSheet = true;
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
        excludeSheet = tagSheetAppMetadata.some(
            (element) => element.engineObjectId === sheet.qInfo.qId
        );
        logger.verbose(
            `Excluded sheet (via tags): ${iSheetNum}: '${sheet.qMeta.title}', sheet id '${repoDbSheetId}', engine sheet id '${engineSheetId}', description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}', hidden '${sheetIsHidden}'`
        );
    }

    // Is this sheet on the exclude list via sheet number?
    if (options.excludeSheetNumber && excludeSheet === false) {
        // Does the sheet number match any of the numbers in options.excludeSheetNumber array?
        // Take into account that iSheetNum is an integer, so we need to convert it to a string
        if (options.excludeSheetNumber.includes(iSheetNum.toString())) {
            excludeSheet = true;
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
            logger.verbose(
                `Excluded sheet (via sheet title): ${iSheetNum}: '${sheet.qMeta.title}', sheet id '${repoDbSheetId}', engine sheet id '${engineSheetId}', description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}', hidden '${sheetIsHidden}'`
            );
        }
    }

    return { excludeSheet, sheetIsHidden };
};
