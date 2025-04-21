const { Jimp } = require('jimp');

const { sleep } = require('../../globals.js');

/**
 * Takes a screenshot of a sheet and creates a blurred version.
 *
 * @param {Object} page Puppeteer page instance.
 * @param {string} appUrl URL of the app.
 * @param {string} imgDir Directory to save images.
 * @param {string} appId App ID.
 * @param {Object} sheet Sheet object.
 * @param {number} iSheetNum Sheet number.
 * @param {Object} options Options object.
 * @param {Object} logger Logger instance.
 * @returns {Promise<Object>} Created file information.
 */
async function takeSheetScreenshot(page, appUrl, imgDir, appId, sheet, iSheetNum, options, logger) {
    const sheetUrl = `${appUrl}/sheet/${sheet.qInfo.qId}/state/analysis`;
    logger.debug(`Sheet URL: ${sheetUrl}`);

    await Promise.all([page.goto(sheetUrl, { waitUntil: 'networkidle2', timeout: 90000 })]);
    await sleep(options.pagewait * 1000);

    const fileName = `${imgDir}/cloud/${appId}/thumbnail-${iSheetNum}.png`;
    const fileNameShort = `thumbnail-${iSheetNum}.png`;
    let selector = '';

    if (options.includesheetpart === '1') {
        selector = '#grid-wrap';
    } else if (options.includesheetpart === '2') {
        selector = '#qs-page-container';
    } else if (options.includesheetpart === '4') {
        selector = '#qv-page-container';
    }

    await page.waitForSelector(selector);
    const sheetMainPart = await page.$(selector);
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
        logger.error(`Failed to create blurred image: ${err}`);
        if (err.message) {
            logger.error(`CREATE BLURRED IMAGE (message): ${err.message}`);
        }
        if (err.stack) {
            logger.error(`CREATE BLURRED IMAGE (stack): ${err.stack}`);
        }
        throw err;
    }
}

module.exports = { takeSheetScreenshot };
