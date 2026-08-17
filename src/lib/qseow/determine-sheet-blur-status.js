import { isSheetTagged } from '../util/sheet-list.js';
import { BLUR_REASON } from '../util/sheet-decision-reasons.js';

/**
 * Determines whether a QSEoW sheet's thumbnail should be blurred.
 *
 * Extracted verbatim from `qseowUpdateSheetThumbnails`, where the rules lived
 * inside the write step - which meant a dry run could not report the blur plan
 * without performing the writes (issue #993), and the function carried the
 * bulk of its cognitive-complexity flag (issue #842). The Cloud twin lives in
 * `src/lib/cloud/determine-sheet-blur-status.js` with the same name and return
 * shape; the platforms differ in how tag data is resolved, so the twins stay
 * separate the same way the exclude twins do.
 *
 * Rule order matches the original: the two status rules first (mutually
 * exclusive on the approved flag, so at most one fires), then tag, number and
 * title, each only consulted while no earlier rule matched. `blurReason`
 * names the rule that matched - it is what the dry-run report prints.
 *
 * @param {object} sheet - Sheet from `qAppObjectList.qItems`.
 * @param {object} options - Blur options.
 * @param {string[]} [options.blurSheetStatus] - Statuses to blur: `published`, `public`.
 * @param {string} [options.blurSheetTag] - Tag naming sheets to blur.
 * @param {string[]} [options.blurSheetNumber] - Sheet numbers to blur, as strings.
 * @param {string[]} [options.blurSheetTitle] - Sheet titles to blur.
 * @param {Array<object>} tagSheetAppMetadata - QRS metadata for sheets carrying the
 *     blur tag. The blur-tag set, never the exclude-tag one (issue #840).
 * @param {number} iSheetNum - 1-based position of the sheet within the app.
 * @param {object} log - Logger; verbose output explains which rule matched.
 *
 * @returns {{blurSheet: boolean, blurReason: string|null}} Whether to blur, and
 *     the responsible option when so.
 */
export const determineSheetBlurStatus = (sheet, options, tagSheetAppMetadata, iSheetNum, log) => {
    let blurSheet = false;
    let blurReason = null;

    const sheetLabel = `${iSheetNum}: '${sheet?.qMeta?.title}', ID ${sheet?.qInfo?.qId}, description '${sheet?.qMeta?.description}'`;

    // Should this sheet be blurred based on its published status?
    // Public sheets
    if (
        sheet?.qMeta?.approved === true &&
        sheet?.qMeta?.published === true &&
        options.blurSheetStatus &&
        options.blurSheetStatus.includes('public')
    ) {
        blurSheet = true;
        blurReason ??= BLUR_REASON.STATUS_PUBLIC;
        log.verbose(`Blurred sheet thumbnail (status public): ${sheetLabel}`);
    }

    // Published sheets
    if (
        sheet?.qMeta?.approved === false &&
        sheet?.qMeta?.published === true &&
        options.blurSheetStatus &&
        options.blurSheetStatus.includes('published')
    ) {
        blurSheet = true;
        blurReason ??= BLUR_REASON.STATUS_PUBLISHED;
        log.verbose(`Blurred sheet thumbnail (status published): ${sheetLabel}`);
    }

    // Should this sheet be blurred based on tags?
    // tagSheetAppMetadata is looked up by the caller against --blur-sheet-tag; it
    // arrives empty when no tag was given, so the rule matches nothing.
    if (options.blurSheetTag && blurSheet === false) {
        blurSheet = isSheetTagged(tagSheetAppMetadata, sheet);
        if (blurSheet) {
            blurReason = BLUR_REASON.TAG;
            log.verbose(`Blurred sheet thumbnail (via tags): ${sheetLabel}`);
        }
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
