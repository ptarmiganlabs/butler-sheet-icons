import { Jimp } from 'jimp';

import { sleep } from '../../globals.js';
import { CLOUD_SHEET_PART_SELECTORS } from './sheet-parts.js';
import { sheetWasStillLoading, stillLoadingWarning } from '../util/sheet-loading.js';

/**
 * Takes a screenshot of a sheet and creates a blurred version.
 *
 * @param {object} page - Puppeteer page instance.
 * @param {string} appUrl - URL of the app.
 * @param {string} imgDir - Directory to save images.
 * @param {string} appId - App ID.
 * @param {object} sheet - Sheet object.
 * @param {number} iSheetNum - Sheet number.
 * @param {object} options - Options object.
 * @param {object} logger - Logger instance.
 *
 * @returns {Promise<{ sheetPos: number, fileNameShort: string, blurred: boolean, fileNameShortBlurred: string }>} Created file information.
 */
export async function takeSheetScreenshot(
    page,
    appUrl,
    imgDir,
    appId,
    sheet,
    iSheetNum,
    options,
    logger
) {
    const sheetUrl = `${appUrl}/sheet/${sheet.qInfo.qId}/state/analysis`;
    logger.debug(`Sheet URL: ${sheetUrl}`);

    await Promise.all([page.goto(sheetUrl, { waitUntil: 'networkidle2', timeout: 90000 })]);
    await sleep(options.pagewait * 1000);

    const fileName = `${imgDir}/cloud/${appId}/thumbnail-${iSheetNum}.png`;
    const fileNameShort = `thumbnail-${iSheetNum}.png`;
    // Which part of the sheet to capture. The map is the single source of truth for the values
    // --includesheetpart accepts - see sheet-parts.js.
    const selector = CLOUD_SHEET_PART_SELECTORS[options.includesheetpart];

    await page.waitForSelector(selector);
    const sheetMainPart = await page.$(selector);

    // Checked before the shutter rather than after: the two are milliseconds apart, and of the
    // two ways to be wrong, a spurious warning is far cheaper than staying silent about a
    // thumbnail that shows the loading screen.
    if (await sheetWasStillLoading(page, logger)) {
        logger.warn(
            stillLoadingWarning('CLOUD APP', iSheetNum, sheet?.qMeta?.title, options.pagewait)
        );
    }

    await sheetMainPart.screenshot({ path: fileName });

    logger.verbose(`Saved image: ${fileName}`);

    const fileNameBlurred = `${imgDir}/cloud/${appId}/thumbnail-${iSheetNum}-blurred.png`;
    const fileNameShortBlurred = `thumbnail-${iSheetNum}-blurred.png`;

    try {
        let blurFactor;
        if (options?.blurFactor < 1) {
            blurFactor = 1;
        } else if (options?.blurFactor > 100) {
            blurFactor = 100;
        } else {
            blurFactor = parseInt(options?.blurFactor, 10);
        }

        const image = await Jimp.read(fileName);
        await image.blur(blurFactor).write(fileNameBlurred);

        logger.verbose(`Saved blurred image: ${fileNameBlurred}`);

        return {
            sheetPos: iSheetNum,
            fileNameShort,
            blurred: true,
            fileNameShortBlurred,
        };
    } catch (err) {
        // Applies the same split as `logError` in ../util/log-error.js, but through the logger
        // this function is given rather than the global one. The injected logger is this
        // function's contract with its caller, so the shared helper is deliberately not used.
        logger.error(
            `CREATE BLURRED IMAGE: Failed to create blurred image: ${err?.message ?? err}`
        );
        if (err?.stack) {
            logger.debug(err.stack);
        }

        // Fail the sheet rather than fall back to the unblurred screenshot. --blur-sheet-*
        // is a redaction control: publishing the plain image because blurring failed would
        // silently defeat it. Rethrowing leaves this sheet out of createdFiles, so it keeps
        // whatever icon it already had and the app is reported as failed.
        throw err;
    }
}
