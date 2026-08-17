import { BLUR_REASON } from '../util/sheet-decision-reasons.js';

/**
 * Determines whether a Qlik Sense Cloud sheet's thumbnail should be blurred.
 *
 * Extracted verbatim from `qscloudUpdateSheetThumbnails`, where the rules lived
 * inside the write step - which meant a dry run could not report the blur plan
 * without performing the writes (issue #993). The QSEoW twin lives in
 * `src/lib/qseow/determine-sheet-blur-status.js` with the same name and return
 * shape. The twins differ where the platforms do: Cloud has no blur-by-tag on
 * this path, and reads the approved/published flags through undefined-safe
 * normalisation because the Cloud engine omits them on some sheets.
 *
 * Rule order matches the original: both status rules evaluated, then number
 * and title, each only consulted while no earlier rule matched. `blurReason`
 * names the FIRST rule that matched - it is what the dry-run report prints.
 *
 * @param {object} sheet - Sheet from `qAppObjectList.qItems`.
 * @param {object} options - Blur options.
 * @param {string[]} [options.blurSheetStatus] - Statuses to blur: `published`, `public`.
 * @param {string[]} [options.blurSheetNumber] - Sheet numbers to blur, as strings.
 * @param {string[]} [options.blurSheetTitle] - Sheet titles to blur.
 * @param {number} iSheetNum - 1-based position of the sheet within the app.
 * @param {object} log - Logger; verbose output explains which rule matched.
 *
 * @returns {{blurSheet: boolean, blurReason: string|null}} Whether to blur, and
 *     the responsible option when so.
 */
export const determineSheetBlurStatus = (sheet, options, iSheetNum, log) => {
    let blurSheet = false;
    let blurReason = null;

    // Get published status of sheet
    const sheetPublished = !(
        sheet.qMeta?.published === undefined || sheet.qMeta.published === false
    );

    // Get approved status of sheet
    const sheetApproved = !(sheet.qMeta?.approved === undefined || sheet.qMeta.approved === false);

    const sheetLabel = `${iSheetNum}: '${sheet?.qMeta?.title}', ID ${sheet?.qInfo?.qId}, description '${sheet?.qMeta?.description}', approved '${sheet?.qMeta?.approved}', published '${sheet?.qMeta?.published}'`;

    // Should this sheet be blurred based on its published status?
    // Public sheets
    if (
        sheetApproved === true &&
        sheetPublished === true &&
        options.blurSheetStatus &&
        options.blurSheetStatus.includes('public')
    ) {
        blurSheet = true;
        blurReason ??= BLUR_REASON.STATUS_PUBLIC;
        log.verbose(`Blurred sheet thumbnail (status public): ${sheetLabel}`);
    }

    // Published sheets
    if (
        sheetApproved === false &&
        sheetPublished === true &&
        options.blurSheetStatus &&
        options.blurSheetStatus.includes('published')
    ) {
        blurSheet = true;
        blurReason ??= BLUR_REASON.STATUS_PUBLISHED;
        log.verbose(`Blurred sheet thumbnail (status published): ${sheetLabel}`);
    }

    // Should this sheet be blurred based on its position/sheet number?
    if (options.blurSheetNumber && blurSheet === false) {
        if (options.blurSheetNumber.includes(iSheetNum.toString())) {
            blurSheet = true;
            blurReason = BLUR_REASON.NUMBER;
            log.verbose(`Blurred sheet thumbnail (via sheet number): ${sheetLabel}`);
        }
    }

    // Should this sheet be blurred based on its title?
    if (options.blurSheetTitle && blurSheet === false) {
        if (options.blurSheetTitle.includes(sheet?.qMeta?.title)) {
            blurSheet = true;
            blurReason = BLUR_REASON.TITLE;
            log.verbose(`Blurred sheet thumbnail (via sheet title): ${sheetLabel}`);
        }
    }

    return { blurSheet, blurReason };
};
