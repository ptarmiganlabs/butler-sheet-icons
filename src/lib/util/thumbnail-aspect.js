/**
 * Keeps captured sheet thumbnails at the 3:2 shape the hub displays them in (issue #1246).
 *
 * Both hubs - QSEoW and Qlik Cloud - draw a sheet thumbnail in a fixed 3:2 box with
 * `object-fit: fill` (150 x 100 in the app overview, 200 x 132 in the sheet navigator), so an
 * image of any other shape is stretched to fit. The capture screenshots one element of the sheet,
 * chosen by `--includesheetpart`, and that element is the browser viewport minus whatever Qlik
 * draws around it, so its shape depends on the platform, the tenant and the sheet part rather than
 * on the viewport alone.
 *
 * The fix is to resize the browser, not to crop or pad the image: measure the element once the
 * sheet has loaded, change the viewport height by however far the element is from 3:2, and let
 * the page lay itself out again. The new viewport stays on the page, so later sheets of the same
 * app are already the right shape and are not resized again. An element whose height does not
 * follow the viewport cannot be fixed this way; it is captured as it is, with a warning.
 *
 * This module holds the shape and its arithmetic only, and imports nothing, so the plan renderer
 * and the page sessions can use it freely. The browser step that applies it is in
 * `thumbnail-aspect-fit.js`.
 */

/**
 * Viewport the browser opens each app at. Only the height is changed later, to make the captured
 * sheet part 3:2, so the width is also the width of a sheet part that spans the window.
 */
export const CAPTURE_VIEWPORT = Object.freeze({ width: 1230, height: 810 });

/** Width divided by height of the box the hub draws a sheet thumbnail in. */
export const THUMBNAIL_ASPECT_RATIO = 1.5;

/**
 * How far, in pixels, an element's height may be from its width / 1.5 and still count as 3:2.
 * Element boxes are fractional and the screenshot rounds them, so an exact match is not reachable.
 */
export const THUMBNAIL_ASPECT_TOLERANCE_PX = 1;

/** Viewport heights outside this range are refused rather than set. */
export const MIN_VIEWPORT_HEIGHT = 200;
export const MAX_VIEWPORT_HEIGHT = 4000;
/**
 * The height a 3:2 element of the given width has, in whole pixels.
 *
 * @param {number} width - Element width in CSS pixels.
 *
 * @returns {number} The matching height.
 */
export const thumbnailHeightForWidth = (width) => Math.round(width / THUMBNAIL_ASPECT_RATIO);

/**
 * Whether a box is 3:2 within {@link THUMBNAIL_ASPECT_TOLERANCE_PX}.
 *
 * @param {{ width: number, height: number }} box - Element size in CSS pixels.
 *
 * @returns {boolean} True when the box is 3:2.
 */
export const isThumbnailAspect = (box) =>
    Math.abs(box.height - box.width / THUMBNAIL_ASPECT_RATIO) <= THUMBNAIL_ASPECT_TOLERANCE_PX;

/**
 * The viewport height that makes an element 3:2, assuming its height follows the viewport's
 * one for one and its width does not change.
 *
 * @param {number} viewportHeight - Current viewport height.
 * @param {{ width: number, height: number }} box - Current element size.
 *
 * @returns {number} The viewport height to set.
 */
export const viewportHeightForThumbnailAspect = (viewportHeight, box) =>
    viewportHeight + thumbnailHeightForWidth(box.width) - Math.round(box.height);

/**
 * Formats a box as `W x H` in whole pixels, for log lines.
 *
 * @param {{ width: number, height: number }} box - Size to format.
 *
 * @returns {string} The formatted size.
 */
export const formatSize = (box) => `${Math.round(box.width)}x${Math.round(box.height)}`;
