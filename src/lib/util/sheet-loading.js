/**
 * Detection of the Qlik Sense "still opening the sheet" overlay.
 *
 * A thumbnail is a screenshot of a sheet, taken `--pagewait` seconds after navigating to it.
 * The wait is a fixed sleep, not a readiness check: `page.waitForSelector()` before the
 * screenshot only proves the sheet-part *container* exists, and Qlik Sense renders its loading
 * screen inside that container. So on a short wait the screenshot can catch the loading screen,
 * and that image is then uploaded and pointed at from the sheet exactly as a real thumbnail
 * would be. Nothing in the run distinguishes the two - the run card counts the sheet as
 * captured and exits 0 (issue #1119).
 *
 * This does not change what is captured. It reports what was on screen when the shutter fell,
 * so a wrong thumbnail stops being silent.
 */

/**
 * Class fragments Qlik Sense puts on the elements that make up its sheet loading screen.
 *
 * Taken from a live client-managed Qlik Sense 12.2759.8 client, sampled from navigation until
 * well after the sheet had rendered. Both of these are visible on arrival and gone within about
 * half a second of the sheet being drawn.
 *
 * `senseloader-block-ui` looked like a third candidate - it is visible on every mid-load sample -
 * but it is **not** a loading indicator: it stays visible indefinitely on a fully rendered sheet
 * (still present 20 seconds in, with the sheet's charts drawn and the other two gone). Including
 * it made the check report every sheet of every run as still loading. It is listed here only so
 * the next person does not rediscover it and add it back.
 *
 * Matched as substrings of the class attribute rather than as exact class names, because the
 * animation classes around them change between frames (`qv-fade-in`, `ng-animate`,
 * `qv-loader-huge-add-active`) and between Sense versions.
 *
 * @type {readonly string[]}
 */
export const SENSE_LOADING_CLASS_FRAGMENTS = Object.freeze([
    'qv-loader-container',
    'qv-loader-text',
]);

/**
 * Reports whether Qlik Sense's loading screen was visible on the page.
 *
 * Visibility, not presence: the loader elements stay in the DOM after the sheet has rendered,
 * so `document.querySelector()` finding one says nothing. Only an element with a non-zero box
 * is actually covering the sheet.
 *
 * Never throws. This runs on the capture path of a working run, and a thumbnail that was
 * produced correctly must not be lost to a failure in the code that checks it - the caller
 * gets `false` and the run proceeds exactly as it did before this existed.
 *
 * @param {object} page - Puppeteer page positioned on the sheet.
 * @param {object} [logger] - Logger, used only to record why detection was skipped.
 *
 * @returns {Promise<boolean>} `true` when the loading screen was covering the sheet.
 */
export const sheetWasStillLoading = async (page, logger) => {
    try {
        return await page.evaluate(
            (fragments) => {
                const isVisible = (element) => element.offsetWidth > 0 && element.offsetHeight > 0;

                // `globalThis.document`, not a bare `document`: this callback is serialised
                // and run inside the page, where a document exists, but it is linted as Node
                // source, where it does not. Qualifying it keeps the file honest about that
                // without suppressing the rule or adding browser globals project-wide.
                return fragments.some((fragment) =>
                    [...globalThis.document.querySelectorAll(`[class*="${fragment}"]`)].some(
                        isVisible
                    )
                );
            },
            [...SENSE_LOADING_CLASS_FRAGMENTS]
        );
    } catch (err) {
        logger?.debug?.(`Could not check whether the sheet was still loading: ${err}`);
        return false;
    }
};

/**
 * The warning text for a thumbnail captured mid-load.
 *
 * One place so both platforms say the same thing, and so the advice stays attached to the
 * observation: the reader needs to know which sheet, what the image actually shows, and the
 * one option that changes it.
 *
 * @param {string} logPrefix - Platform log prefix, e.g. `QSEOW APP`.
 * @param {number} iSheetNum - Sheet number within the run.
 * @param {string} sheetTitle - Sheet title, for an operator who does not count sheets.
 * @param {number|string} pagewait - The `--pagewait` value in force.
 *
 * @returns {string} The warning line.
 */
export const stillLoadingWarning = (logPrefix, iSheetNum, sheetTitle, pagewait) =>
    `${logPrefix}: Sheet ${iSheetNum} ('${sheetTitle}') was still opening when its thumbnail was captured, so the image shows Qlik Sense's loading screen rather than the sheet. It was uploaded and assigned anyway. Raise --pagewait (currently ${pagewait}) and run again.`;
