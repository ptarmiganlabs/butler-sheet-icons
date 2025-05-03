export const shouldProcessSheet = (sheet, iSheetNum, options, appIsPublished, logger) => {
    let excludeSheet = false;

    // Get published and approved status of sheet
    const sheetPublished = sheet.qMeta?.published || false;
    const sheetApproved = sheet.qMeta?.approved || false;

    // Exclude based on status
    if (appIsPublished) {
        if (sheetApproved && sheetPublished && options.excludeSheetStatus?.includes('public')) {
            excludeSheet = true;
            logger.verbose(`Excluded sheet (status public): ${iSheetNum}: '${sheet.qMeta?.title}'`);
        } else if (
            !sheetApproved &&
            sheetPublished &&
            options.excludeSheetStatus?.includes('published')
        ) {
            excludeSheet = true;
            logger.verbose(
                `Excluded sheet (status published): ${iSheetNum}: '${sheet.qMeta?.title}'`
            );
        }
    } else if (!sheetApproved && sheetPublished && options.excludeSheetStatus?.includes('public')) {
        excludeSheet = true;
        logger.verbose(`Excluded sheet (status public): ${iSheetNum}: '${sheet.qMeta?.title}'`);
    }

    if (!sheetApproved && !sheetPublished && options.excludeSheetStatus?.includes('private')) {
        excludeSheet = true;
        logger.verbose(`Excluded sheet (status private): ${iSheetNum}: '${sheet.qMeta?.title}'`);
    }

    // Exclude hidden sheets
    const showConditionEval = sheet.qData.showCondition?.toLowerCase() === 'false';
    if (showConditionEval && !excludeSheet) {
        excludeSheet = true;
        logger.verbose(`Excluded sheet (hidden): ${iSheetNum}: '${sheet.qMeta?.title}'`);
    }

    // Exclude based on number or title
    if (options.excludeSheetNumber?.includes(iSheetNum.toString()) && !excludeSheet) {
        excludeSheet = true;
        logger.verbose(`Excluded sheet (via sheet number): ${iSheetNum}: '${sheet.qMeta?.title}'`);
    }

    if (options.excludeSheetTitle?.includes(sheet.qMeta?.title) && !excludeSheet) {
        excludeSheet = true;
        logger.verbose(`Excluded sheet (via sheet title): ${iSheetNum}: '${sheet.qMeta?.title}'`);
    }

    return !excludeSheet;
};
