import { jest, describe, test, expect, beforeEach } from '@jest/globals';

const write = jest.fn().mockResolvedValue(undefined);
const blur = jest.fn(() => ({ write }));
const jimpRead = jest.fn().mockResolvedValue({ blur });

jest.unstable_mockModule('jimp', () => ({
    Jimp: { read: jimpRead },
}));

jest.unstable_mockModule('../../../globals.js', () => ({
    sleep: jest.fn().mockResolvedValue(undefined),
}));

const { sleep } = await import('../../../globals.js');
const { captureSheetImage, blurSheetImage } = await import('../sheet-screenshot.js');

const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
};

const APP_URL = 'https://sense.example.com/app/aaaa-bbbb';
const IMG_DIR = './img';
const APP_ID = 'aaaa-bbbb';
const SHEET = { qInfo: { qId: 'engine-sheet-1' }, qMeta: { title: 'Sales overview' } };
const PAGE_TIMEOUT = 90000;

const BASE_OPTIONS = { pagewait: 5, includesheetpart: '1', blurFactor: 5 };

/**
 * Builds a puppeteer page stub whose element handle records its screenshot calls.
 *
 * @returns {object} A page-shaped object with mocked `goto`, `waitForSelector` and `$`.
 */
const createPage = () => {
    const elementHandle = { screenshot: jest.fn().mockResolvedValue(undefined) };

    return {
        goto: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        $: jest.fn().mockResolvedValue(elementHandle),
        // Sheet-loading detection (#1119). Defaults to "not loading", so every existing
        // test here describes a sheet that had finished rendering.
        evaluate: jest.fn().mockResolvedValue(false),
        elementHandle,
    };
};

/**
 * Runs `captureSheetImage` with defaults for everything a test does not care about.
 *
 * @param {object} page - Page stub from `createPage`.
 * @param {object} [optionOverrides] - Fields to merge over the base options.
 *
 * @returns {Promise<object>} The captured-file descriptor the function returns.
 */
const capture = (page, optionOverrides = {}) =>
    captureSheetImage(
        page,
        APP_URL,
        IMG_DIR,
        APP_ID,
        SHEET,
        1,
        { ...BASE_OPTIONS, ...optionOverrides },
        mockLogger,
        PAGE_TIMEOUT
    );

/**
 * Runs `blurSheetImage` against the file name `capture` would have produced.
 *
 * @param {object} [optionOverrides] - Fields to merge over the base options.
 *
 * @returns {Promise<object>} The blurred-file descriptor the function returns.
 */
const blurIt = (optionOverrides = {}) =>
    blurSheetImage(
        `${IMG_DIR}/qseow/${APP_ID}/thumbnail-${APP_ID}-1.png`,
        IMG_DIR,
        APP_ID,
        1,
        { ...BASE_OPTIONS, ...optionOverrides },
        mockLogger
    );

beforeEach(() => {
    jest.clearAllMocks();
    write.mockResolvedValue(undefined);
    blur.mockImplementation(() => ({ write }));
    jimpRead.mockResolvedValue({ blur });
});

describe('captureSheetImage', () => {
    test('navigates to the sheet, using the configured page timeout', async () => {
        const page = createPage();
        await capture(page);

        expect(page.goto).toHaveBeenCalledWith(`${APP_URL}/sheet/engine-sheet-1`, {
            waitUntil: 'networkidle2',
            timeout: PAGE_TIMEOUT,
        });
    });

    test('waits for the configured page settle time', async () => {
        const page = createPage();
        await capture(page, { pagewait: 7 });

        expect(sleep).toHaveBeenCalledWith(7000);
    });

    test('screenshots the sheet element, not the whole viewport', async () => {
        const page = createPage();
        await capture(page);

        expect(page.elementHandle.screenshot).toHaveBeenCalledWith({
            path: `${IMG_DIR}/qseow/${APP_ID}/thumbnail-${APP_ID}-1.png`,
        });
        expect(page.screenshot).toBeUndefined();
    });

    describe('sheet part selection', () => {
        test('uses the grid selector for part 1', async () => {
            const page = createPage();
            await capture(page, { includesheetpart: '1' });

            expect(page.waitForSelector).toHaveBeenCalledWith('#grid-wrap');
        });

        test('uses the selection-bar selector for part 3', async () => {
            const page = createPage();
            await capture(page, { includesheetpart: '3' });

            expect(page.waitForSelector).toHaveBeenCalledWith('#qv-stage-container > div');
        });

        test('uses the page container selector for part 4', async () => {
            const page = createPage();
            await capture(page, { includesheetpart: '4' });

            expect(page.waitForSelector).toHaveBeenCalledWith('#qv-page-container');
        });
    });

    describe('return value', () => {
        test('names the file after the app and the sheet position', async () => {
            const page = createPage();
            const result = await capture(page);

            expect(result).toEqual({
                fileName: `${IMG_DIR}/qseow/${APP_ID}/thumbnail-${APP_ID}-1.png`,
                fileNameShort: `thumbnail-${APP_ID}-1.png`,
            });
        });
    });

    describe('error handling', () => {
        test('rejects when navigation fails', async () => {
            const page = createPage();
            page.goto.mockRejectedValue(new Error('net::ERR_CONNECTION_REFUSED'));

            await expect(capture(page)).rejects.toThrow('net::ERR_CONNECTION_REFUSED');
        });

        test('rejects when the sheet element never appears', async () => {
            const page = createPage();
            page.waitForSelector.mockRejectedValue(new Error('waiting for selector failed'));

            await expect(capture(page)).rejects.toThrow('waiting for selector failed');
        });
    });

    describe('a thumbnail captured while the sheet was still loading', () => {
        test('says so, naming the sheet and the option that fixes it', async () => {
            const page = createPage();
            page.evaluate.mockResolvedValue(true);

            await capture(page, { pagewait: 5 });

            expect(mockLogger.warn).toHaveBeenCalledTimes(1);
            const warning = mockLogger.warn.mock.calls[0][0];
            expect(warning).toContain('Sales overview');
            expect(warning).toContain('pagewait');
        });

        test('still captures the thumbnail rather than quietly dropping the sheet', async () => {
            const page = createPage();
            page.evaluate.mockResolvedValue(true);

            await capture(page);

            expect(page.elementHandle.screenshot).toHaveBeenCalledTimes(1);
        });
    });
});

describe('blurSheetImage', () => {
    test('writes a blurred copy alongside the screenshot', async () => {
        await blurIt();

        expect(jimpRead).toHaveBeenCalledWith(
            `${IMG_DIR}/qseow/${APP_ID}/thumbnail-${APP_ID}-1.png`
        );
        expect(write).toHaveBeenCalledWith(
            `${IMG_DIR}/qseow/${APP_ID}/thumbnail-${APP_ID}-1-blurred.png`
        );
    });

    test('applies the configured blur factor', async () => {
        await blurIt({ blurFactor: 12 });

        expect(blur).toHaveBeenCalledWith(12);
    });

    test('clamps a blur factor below 1 up to 1', async () => {
        await blurIt({ blurFactor: 0 });

        expect(blur).toHaveBeenCalledWith(1);
    });

    test('clamps a blur factor above 100 down to 100', async () => {
        await blurIt({ blurFactor: 250 });

        expect(blur).toHaveBeenCalledWith(100);
    });

    test('accepts a blur factor supplied as a string', async () => {
        await blurIt({ blurFactor: '8' });

        expect(blur).toHaveBeenCalledWith(8);
    });

    test('returns the blurred file basename', async () => {
        const result = await blurIt();

        expect(result).toEqual({ fileNameShortBlurred: `thumbnail-${APP_ID}-1-blurred.png` });
    });

    test('rejects when the blurred image cannot be produced', async () => {
        write.mockRejectedValue(new Error('disk full'));

        await expect(blurIt()).rejects.toThrow('disk full');
    });
});
