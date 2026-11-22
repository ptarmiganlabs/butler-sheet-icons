import { jest, describe, test, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../globals.js', () => ({
    sleep: jest.fn().mockResolvedValue(undefined),
}));

const {
    THUMBNAIL_ASPECT_RATIO,
    thumbnailHeightForWidth,
    isThumbnailAspect,
    viewportHeightForThumbnailAspect,
} = await import('../thumbnail-aspect.js');
const { fitSheetPartToThumbnailAspect } = await import('../thumbnail-aspect-fit.js');
const { QSEOW_SHEET_PART_SELECTORS } = await import('../../qseow/sheet-parts.js');
const { CLOUD_SHEET_PART_SELECTORS } = await import('../../cloud/sheet-parts.js');

const logger = { warn: jest.fn(), verbose: jest.fn(), debug: jest.fn() };
const CONTEXT = { logger, logPrefix: 'TEST APP', sheetPart: '1' };

beforeEach(() => {
    jest.clearAllMocks();
});

/**
 * A page stub whose one element changes size with the viewport height.
 *
 * @param {object} spec - How the element behaves.
 * @param {number} spec.width - Element width.
 * @param {number} spec.chrome - Pixels Qlik draws above and below the element.
 * @param {number} [spec.follows] - How many element pixels one viewport pixel adds: 1 for a sheet
 *     part that fills the window, 0 for one whose height is fixed.
 * @param {number} [spec.fixedHeight] - The element's height when `follows` is 0.
 * @param {number} [spec.viewportHeight] - Starting viewport height.
 *
 * @returns {object} The page stub.
 */
const createPage = ({ width, chrome, follows = 1, fixedHeight = 0, viewportHeight = 810 }) => {
    let viewport = { width: 1230, height: viewportHeight, deviceScaleFactor: 1 };
    const element = {
        boundingBox: jest.fn(async () => ({
            x: 0,
            y: chrome,
            width,
            height: follows ? viewport.height - chrome : fixedHeight,
        })),
    };
    return {
        element,
        viewport: jest.fn(() => viewport),
        setViewport: jest.fn(async (next) => {
            viewport = next;
        }),
        $: jest.fn(async () => element),
        waitForNetworkIdle: jest.fn().mockResolvedValue(undefined),
    };
};

describe('the 3:2 arithmetic', () => {
    test('the target ratio is the hub thumbnail box, 150x100', () => {
        expect(THUMBNAIL_ASPECT_RATIO).toBe(150 / 100);
    });

    test('a 1230 px wide element is 3:2 at 820 px tall', () => {
        expect(thumbnailHeightForWidth(1230)).toBe(820);
    });

    test.each([
        [1230, 820, true],
        [1230, 821, true],
        [1230, 819, true],
        [1230, 820.6, true],
        [1230, 822, false],
        [1230, 681, false],
        [1230, 473, false],
        [600, 400, true],
    ])('%d x %d is 3:2: %s', (width, height, expected) => {
        expect(isThumbnailAspect({ width, height })).toBe(expected);
    });

    test.each([
        // The two shapes measured in #1246, from the 1230x810 viewport.
        ['QSEoW, part 1', 810, { width: 1230, height: 681 }, 949],
        ['Qlik Cloud trial, part 1', 810, { width: 1230, height: 473 }, 1157],
        // An element taller than 3:2 shrinks the viewport.
        ['too tall', 810, { width: 1230, height: 900 }, 730],
        ['already 3:2', 949, { width: 1230, height: 820 }, 949],
        // Fractional boxes are rounded the way the screenshot rounds them.
        ['fractional', 810, { width: 1230, height: 680.6 }, 949],
    ])('%s: viewport %d, element %o -> viewport height %d', (_label, vh, box, expected) => {
        expect(viewportHeightForThumbnailAspect(vh, box)).toBe(expected);
    });
});

describe('fitSheetPartToThumbnailAspect', () => {
    test('leaves an element that is already 3:2 alone', async () => {
        const page = createPage({ width: 1230, chrome: 0, viewportHeight: 820 });

        const result = await fitSheetPartToThumbnailAspect(page, '#grid-wrap', CONTEXT);

        expect(page.setViewport).not.toHaveBeenCalled();
        expect(result).toMatchObject({ resized: false, fits: true, element: page.element });
        expect(logger.warn).not.toHaveBeenCalled();
    });

    test('resizes the viewport height only, keeping the other viewport settings', async () => {
        const page = createPage({ width: 1230, chrome: 129 });

        const result = await fitSheetPartToThumbnailAspect(page, '#grid-wrap', CONTEXT);

        expect(page.setViewport).toHaveBeenCalledTimes(1);
        expect(page.setViewport).toHaveBeenCalledWith({
            width: 1230,
            height: 949,
            deviceScaleFactor: 1,
        });
        expect(result.box).toMatchObject({ width: 1230, height: 820 });
        expect(result).toMatchObject({ resized: true, fits: true });
        expect(logger.warn).not.toHaveBeenCalled();
    });

    test('lets redrawn charts settle on a quiet network before the capture', async () => {
        const page = createPage({ width: 1230, chrome: 129 });

        await fitSheetPartToThumbnailAspect(page, '#grid-wrap', CONTEXT);

        expect(page.waitForNetworkIdle).toHaveBeenCalledTimes(1);
    });

    test('a network that never goes quiet does not fail the capture', async () => {
        const page = createPage({ width: 1230, chrome: 129 });
        page.waitForNetworkIdle.mockRejectedValue(new Error('Timed out'));

        await expect(
            fitSheetPartToThumbnailAspect(page, '#grid-wrap', CONTEXT)
        ).resolves.toMatchObject({ fits: true });
    });

    test('waits for an element that takes a few frames to follow the new viewport', async () => {
        const page = createPage({ width: 1230, chrome: 129 });
        // The first two measurements after the resize still see the old layout.
        const stale = { x: 0, y: 129, width: 1230, height: 681 };
        page.element.boundingBox
            .mockResolvedValueOnce(stale)
            .mockResolvedValueOnce(stale)
            .mockResolvedValueOnce(stale);

        const result = await fitSheetPartToThumbnailAspect(page, '#grid-wrap', CONTEXT);

        expect(result).toMatchObject({ fits: true });
        expect(page.setViewport).toHaveBeenCalledTimes(1);
    });

    test('measures the element afresh after the resize, since Qlik may replace it', async () => {
        const page = createPage({ width: 1230, chrome: 129 });
        const replacement = {
            boundingBox: jest.fn().mockResolvedValue({ x: 0, y: 129, width: 1230, height: 820 }),
        };
        page.setViewport.mockImplementation(async () => {
            page.$.mockResolvedValue(replacement);
        });

        const result = await fitSheetPartToThumbnailAspect(page, '#grid-wrap', CONTEXT);

        expect(result.element).toBe(replacement);
    });

    describe('when the element cannot be brought to 3:2', () => {
        test('an element whose height does not follow the viewport is captured as it is, with a warning', async () => {
            const page = createPage({ width: 1230, chrome: 0, follows: 0, fixedHeight: 500 });

            const result = await fitSheetPartToThumbnailAspect(page, '#grid-wrap', CONTEXT);

            expect(result).toMatchObject({ resized: true, fits: false, element: page.element });
            expect(logger.warn).toHaveBeenCalledTimes(1);
            expect(logger.warn.mock.calls[0][0]).toMatch(
                /^TEST APP: The captured sheet part \(--includesheetpart 1\) is 1230x500, not 3:2, .*captured as it is/
            );
        });

        test('the page is resized at most once, so later sheets do not grow the window', async () => {
            const page = createPage({ width: 1230, chrome: 0, follows: 0, fixedHeight: 500 });

            await fitSheetPartToThumbnailAspect(page, '#grid-wrap', CONTEXT);
            await fitSheetPartToThumbnailAspect(page, '#grid-wrap', CONTEXT);
            await fitSheetPartToThumbnailAspect(page, '#grid-wrap', CONTEXT);

            expect(page.setViewport).toHaveBeenCalledTimes(1);
            expect(logger.warn).toHaveBeenCalledTimes(3);
        });

        test('a resize that would need an absurd window is not attempted', async () => {
            // A 6030 px wide element is 3:2 at 4020 px, which the window cannot reach.
            const page = createPage({ width: 6030, chrome: 0, viewportHeight: 810 });

            const result = await fitSheetPartToThumbnailAspect(page, '#grid-wrap', CONTEXT);

            expect(page.setViewport).not.toHaveBeenCalled();
            expect(result).toMatchObject({ resized: false, fits: false });
            expect(logger.warn.mock.calls[0][0]).toMatch(/would have to be 4020 pixels tall/);
        });

        test('an element with no size is captured as it is, with a warning', async () => {
            const page = createPage({ width: 1230, chrome: 0 });
            page.element.boundingBox.mockResolvedValue(null);

            const result = await fitSheetPartToThumbnailAspect(page, '#grid-wrap', CONTEXT);

            expect(page.setViewport).not.toHaveBeenCalled();
            expect(result).toMatchObject({ fits: false, element: page.element });
            expect(logger.warn.mock.calls[0][0]).toMatch(/is not measurable, not 3:2/);
        });

        test('an unknown viewport is not guessed at', async () => {
            const page = createPage({ width: 1230, chrome: 129 });
            page.viewport.mockReturnValue(null);

            const result = await fitSheetPartToThumbnailAspect(page, '#grid-wrap', CONTEXT);

            expect(page.setViewport).not.toHaveBeenCalled();
            expect(result).toMatchObject({ fits: false });
        });
    });

    // The fix is selector-generic, so every value --includesheetpart accepts gets it.
    describe.each([
        ['QSEoW', QSEOW_SHEET_PART_SELECTORS],
        ['Qlik Cloud', CLOUD_SHEET_PART_SELECTORS],
    ])('every %s sheet part', (_platform, selectors) => {
        test.each(Object.entries(selectors))(
            'part %s (%s) is brought to 3:2',
            async (part, selector) => {
                const page = createPage({ width: 1230, chrome: 200 });

                const result = await fitSheetPartToThumbnailAspect(page, selector, {
                    ...CONTEXT,
                    sheetPart: part,
                });

                expect(page.$).toHaveBeenCalledWith(selector);
                expect(result).toMatchObject({ resized: true, fits: true });
            }
        );
    });
});
