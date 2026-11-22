/**
 * The browser step that brings a captured sheet part to 3:2 (issue #1246). The shape and its
 * arithmetic are in `thumbnail-aspect.js`, which explains why the browser is resized rather than
 * the image cropped or padded.
 */

import { sleep } from '../../globals.js';
import {
    MAX_VIEWPORT_HEIGHT,
    MIN_VIEWPORT_HEIGHT,
    formatSize,
    isThumbnailAspect,
    viewportHeightForThumbnailAspect,
} from './thumbnail-aspect.js';

/** How long to wait for the page to lay itself out again after a resize. */
const RELAYOUT_TIMEOUT_MS = 5000;
const RELAYOUT_POLL_MS = 100;

/** After the layout has settled, how long the network must be quiet before the capture. */
const NETWORK_IDLE_MS = 500;
const NETWORK_IDLE_TIMEOUT_MS = 10000;

/**
 * Pages whose viewport this module has already resized. A page is resized at most once: after
 * that, later sheets either already fit, or belong to a sheet part whose height does not follow
 * the window, and resizing again would only grow the window sheet after sheet.
 *
 * @type {WeakSet<object>}
 */
const resizedPages = new WeakSet();

/**
 * Measures an element by selector. Queried afresh each time, because Qlik may replace the
 * element when it lays the sheet out again.
 *
 * @param {object} page - Puppeteer page.
 * @param {string} selector - CSS selector of the sheet part.
 *
 * @returns {Promise<{ element: object|null, box: object|null }>} The element and its box, or nulls.
 */
const measure = async (page, selector) => {
    const element = await page.$(selector);
    const box = element ? await element.boundingBox() : null;
    return { element, box };
};

/**
 * Waits for the page to settle after a viewport change: first until the element is 3:2 or the
 * layout timeout passes, then for the network to go quiet, since resized charts may fetch data.
 *
 * @param {object} page - Puppeteer page.
 * @param {string} selector - CSS selector of the sheet part.
 *
 * @returns {Promise<{ element: object|null, box: object|null }>} The last measurement.
 */
const waitForRelayout = async (page, selector) => {
    // Counted polls rather than a clock deadline, so the wait is the same however slow each
    // measurement is, and a test with `sleep` mocked does not spin for the whole timeout.
    let measured = await measure(page, selector);

    for (
        let poll = 0;
        poll < RELAYOUT_TIMEOUT_MS / RELAYOUT_POLL_MS &&
        !(measured.box && isThumbnailAspect(measured.box));
        poll += 1
    ) {
        await sleep(RELAYOUT_POLL_MS);
        measured = await measure(page, selector);
    }

    if (typeof page.waitForNetworkIdle === 'function') {
        try {
            await page.waitForNetworkIdle({
                idleTime: NETWORK_IDLE_MS,
                timeout: NETWORK_IDLE_TIMEOUT_MS,
            });
        } catch {
            // A sheet that keeps polling never goes idle. The layout check above is what matters;
            // the idle wait only gives redrawn charts a chance to finish.
        }
        measured = await measure(page, selector);
    }

    return measured;
};

/**
 * Brings the captured sheet part to 3:2 by resizing the browser viewport, if it is not already.
 *
 * Call it after the sheet has loaded and before the screenshot, and capture the element it
 * returns: the element can be replaced during the new layout.
 *
 * @param {object} page - Puppeteer page.
 * @param {string} selector - CSS selector of the sheet part being captured.
 * @param {object} context - What the log lines need.
 * @param {object} context.logger - Logger instance.
 * @param {string} context.logPrefix - Prefix for log lines, e.g. `QSEOW APP`.
 * @param {string} context.sheetPart - The `--includesheetpart` value, for the warning.
 *
 * @returns {Promise<{ element: object, box: object|null, resized: boolean, fits: boolean }>}
 *     The element to capture, its final size, whether the viewport was changed, and whether the
 *     element is 3:2.
 */
export async function fitSheetPartToThumbnailAspect(
    page,
    selector,
    { logger, logPrefix, sheetPart }
) {
    const first = await measure(page, selector);

    const warnAsIs = (box, why) => {
        logger.warn(
            `${logPrefix}: The captured sheet part (--includesheetpart ${sheetPart}) is ${
                box ? formatSize(box) : 'not measurable'
            }, not 3:2, ${why}. It is captured as it is, and the hub will stretch it to fit its 3:2 thumbnail box.`
        );
    };

    if (!first.box || first.box.width <= 0 || first.box.height <= 0) {
        warnAsIs(first.box, 'because it has no size on the page');
        return { element: first.element, box: first.box, resized: false, fits: false };
    }

    if (isThumbnailAspect(first.box)) {
        logger.debug(`${logPrefix}: Sheet part is ${formatSize(first.box)}, already 3:2.`);
        return { element: first.element, box: first.box, resized: false, fits: true };
    }

    if (resizedPages.has(page)) {
        warnAsIs(first.box, 'and the browser window was already resized once for this app');
        return { element: first.element, box: first.box, resized: false, fits: false };
    }

    const viewport = page.viewport();
    if (!viewport) {
        warnAsIs(first.box, 'and the browser viewport size is not known');
        return { element: first.element, box: first.box, resized: false, fits: false };
    }
    const newHeight = viewportHeightForThumbnailAspect(viewport.height, first.box);

    if (newHeight < MIN_VIEWPORT_HEIGHT || newHeight > MAX_VIEWPORT_HEIGHT) {
        warnAsIs(
            first.box,
            `and the browser window would have to be ${newHeight} pixels tall to change that`
        );
        return { element: first.element, box: first.box, resized: false, fits: false };
    }

    resizedPages.add(page);
    await page.setViewport({ ...viewport, height: newHeight });
    logger.verbose(
        `${logPrefix}: Resized the browser viewport from ${viewport.width}x${viewport.height} to ${viewport.width}x${newHeight}, so the captured sheet part (${formatSize(first.box)}) becomes 3:2.`
    );

    const after = await waitForRelayout(page, selector);

    if (after.box && isThumbnailAspect(after.box)) {
        logger.verbose(`${logPrefix}: Sheet part is now ${formatSize(after.box)}.`);
        return { element: after.element, box: after.box, resized: true, fits: true };
    }

    warnAsIs(
        after.box,
        'even after resizing the browser window, so its height does not follow the window'
    );
    return {
        element: after.element ?? first.element,
        box: after.box,
        resized: true,
        fits: false,
    };
}
