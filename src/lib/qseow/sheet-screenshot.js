import { Jimp } from 'jimp';

import { sleep } from '../../globals.js';
import { QSEOW_SHEET_PART_SELECTORS } from './sheet-parts.js';
import { sheetWasStillLoading, stillLoadingWarning } from '../util/sheet-loading.js';

/**
 * Navigates to a sheet and captures it to disk.
 *
 * Split from the blur step below rather than folded into one function as the Cloud twin does
 * (`../cloud/sheet-screenshot.js`), because the two failures mean different things on QSEoW and
 * that difference is load-bearing: a capture failure fails the whole run, while a blur failure
 * drops the one sheet, is counted, and lets the run continue. Cloud treats both the same way.
 * Reconciling that is #1091 step 4's job, not this extraction's - this step is behaviour-preserving.
 *
 * @param {object} page - Puppeteer page instance.
 * @param {string} appUrl - URL of the app.
 * @param {string} imgDir - Directory to save images.
 * @param {string} appId - App ID.
 * @param {object} sheet - Sheet object.
 * @param {number} iSheetNum - Sheet number.
 * @param {object} options - Options object.
 * @param {object} logger - Logger instance.
 * @param {number} pageTimeout - Navigation timeout in milliseconds.
 *
 * @returns {Promise<{ fileName: string, fileNameShort: string }>} The captured file, full path and
 *     basename. The basename is what the upload and update steps carry.
 */
export async function captureSheetImage(
    page,
    appUrl,
    imgDir,
    appId,
    sheet,
    iSheetNum,
    options,
    logger,
    pageTimeout
) {
    // Build URL to current sheet
    const sheetUrl = `${appUrl}/sheet/${sheet.qInfo.qId}`;
    logger.debug(`Sheet URL: ${sheetUrl}`);

    // Open sheet in browser, then take screen shot
    await Promise.all([
        page.goto(sheetUrl, {
            waitUntil: 'networkidle2',
            timeout: pageTimeout,
        }),
    ]);

    await sleep(options.pagewait * 1000);

    const fileName = `${imgDir}/qseow/${appId}/thumbnail-${appId}-${iSheetNum}.png`;
    const fileNameShort = `thumbnail-${appId}-${iSheetNum}.png`;

    // Which part of the sheet to capture. The map is the single source
    // of truth for the values --includesheetpart accepts - see
    // sheet-parts.js.
    const selector = QSEOW_SHEET_PART_SELECTORS[options.includesheetpart];

    // Ensure that the element we're interested in is loaded
    await page.waitForSelector(selector);
    const sheetMainPart = await page.$(selector);

    // Checked before the shutter rather than after: the two are
    // milliseconds apart, and of the two ways to be wrong, a
    // spurious warning is far cheaper than staying silent about a
    // thumbnail that shows the loading screen.
    if (await sheetWasStillLoading(page, logger)) {
        logger.warn(
            stillLoadingWarning('QSEOW APP', iSheetNum, sheet?.qMeta?.title, options.pagewait)
        );
    }

    await sheetMainPart.screenshot({
        path: fileName,
    });

    return { fileName, fileNameShort };
}

/**
 * Creates a blurred copy of an already-captured sheet image.
 *
 * Loads the image from disk, blurs it, and writes it back under a new name. Throws on failure and
 * leaves the decision about what that means to the caller - see the note on
 * {@link captureSheetImage}.
 *
 * @param {string} fileName - Full path of the already-captured image.
 * @param {string} imgDir - Directory to save images.
 * @param {string} appId - App ID.
 * @param {number} iSheetNum - Sheet number.
 * @param {object} options - Options object.
 * @param {object} logger - Logger instance.
 *
 * @returns {Promise<{ fileNameShortBlurred: string }>} Basename of the blurred file.
 *
 * @throws {Error} Whatever Jimp throws when the image cannot be read, blurred or written.
 */
export async function blurSheetImage(fileName, imgDir, appId, iSheetNum, options, logger) {
    const fileNameBlurred = `${imgDir}/qseow/${appId}/thumbnail-${appId}-${iSheetNum}-blurred.png`;
    const fileNameShortBlurred = `thumbnail-${appId}-${iSheetNum}-blurred.png`;

    let blurFactor;

    // Blur factor should be between 1 and 100
    if (options?.blurFactor < 1) {
        blurFactor = 1; // Min blur value
    } else if (options?.blurFactor > 100) {
        blurFactor = 100; // Max blur value
    } else {
        blurFactor = parseInt(options?.blurFactor, 10);
    }

    // Use Jimp instead of Sharp
    const image = await Jimp.read(fileName);
    await image.blur(blurFactor).write(fileNameBlurred);

    logger.verbose(`Created blurred image: ${fileNameBlurred}`);

    return { fileNameShortBlurred };
}
