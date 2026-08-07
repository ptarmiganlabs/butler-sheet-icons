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
const { takeSheetScreenshot } = await import('../sheet-screenshot.js');

const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
};

const APP_URL = 'https://tenant.eu.qlikcloud.com/sense/app/test-app-id';
const IMG_DIR = './img';
const APP_ID = 'test-app-id';
const SHEET = { qInfo: { qId: 'engine-sheet-1' } };

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
        elementHandle,
    };
};

/**
 * Runs `takeSheetScreenshot` with defaults for everything a test does not care about.
 *
 * @param {object} page - Page stub from `createPage`.
 * @param {object} [optionOverrides] - Fields to merge over the base options.
 *
 * @returns {Promise<object>} The created-file descriptor the function returns.
 */
const run = (page, optionOverrides = {}) =>
    takeSheetScreenshot(
        page,
        APP_URL,
        IMG_DIR,
        APP_ID,
        SHEET,
        1,
        {
            ...BASE_OPTIONS,
            ...optionOverrides,
        },
        mockLogger
    );

beforeEach(() => {
    jest.clearAllMocks();
    write.mockResolvedValue(undefined);
    blur.mockImplementation(() => ({ write }));
    jimpRead.mockResolvedValue({ blur });
});

describe('takeSheetScreenshot', () => {
    test('navigates to the sheet in analysis mode', async () => {
        const page = createPage();

        await run(page);

        expect(page.goto).toHaveBeenCalledWith(
            `${APP_URL}/sheet/engine-sheet-1/state/analysis`,
            expect.objectContaining({ waitUntil: 'networkidle2' })
        );
    });

    test('waits for the configured page settle time', async () => {
        const page = createPage();

        await run(page, { pagewait: 3 });

        expect(sleep).toHaveBeenCalledWith(3000);
    });

    test('screenshots the sheet element, not the whole viewport', async () => {
        const page = createPage();

        await run(page);

        expect(page.elementHandle.screenshot).toHaveBeenCalledWith({
            path: `${IMG_DIR}/cloud/${APP_ID}/thumbnail-1.png`,
        });
    });

    describe('sheet part selection', () => {
        test('uses the grid selector for part 1', async () => {
            const page = createPage();

            await run(page, { includesheetpart: '1' });

            expect(page.waitForSelector).toHaveBeenCalledWith('#grid-wrap');
        });

        test('uses the page container selector for part 2', async () => {
            const page = createPage();

            await run(page, { includesheetpart: '2' });

            expect(page.waitForSelector).toHaveBeenCalledWith('#qs-page-container');
        });

        test('uses the qv page container selector for part 4', async () => {
            const page = createPage();

            await run(page, { includesheetpart: '4' });

            expect(page.waitForSelector).toHaveBeenCalledWith('#qv-page-container');
        });
    });

    describe('blurred variant', () => {
        test('writes a blurred copy alongside the screenshot', async () => {
            const page = createPage();

            await run(page);

            expect(jimpRead).toHaveBeenCalledWith(`${IMG_DIR}/cloud/${APP_ID}/thumbnail-1.png`);
            expect(write).toHaveBeenCalledWith(
                `${IMG_DIR}/cloud/${APP_ID}/thumbnail-1-blurred.png`
            );
        });

        test('applies the configured blur factor', async () => {
            const page = createPage();

            await run(page, { blurFactor: 12 });

            expect(blur).toHaveBeenCalledWith(12);
        });

        test('clamps a blur factor below 1 up to 1', async () => {
            const page = createPage();

            await run(page, { blurFactor: 0 });

            expect(blur).toHaveBeenCalledWith(1);
        });

        test('clamps a blur factor above 100 down to 100', async () => {
            const page = createPage();

            await run(page, { blurFactor: 250 });

            expect(blur).toHaveBeenCalledWith(100);
        });

        test('accepts a blur factor supplied as a string', async () => {
            const page = createPage();

            await run(page, { blurFactor: '7' });

            expect(blur).toHaveBeenCalledWith(7);
        });
    });

    describe('return value', () => {
        test('describes both the regular and the blurred file', async () => {
            const page = createPage();

            await expect(run(page)).resolves.toEqual({
                sheetPos: 1,
                fileNameShort: 'thumbnail-1.png',
                blurred: true,
                fileNameShortBlurred: 'thumbnail-1-blurred.png',
            });
        });

        test('numbers the files after the sheet position', async () => {
            const page = createPage();

            const created = await takeSheetScreenshot(
                page,
                APP_URL,
                IMG_DIR,
                APP_ID,
                SHEET,
                7,
                BASE_OPTIONS,
                mockLogger
            );

            expect(created).toMatchObject({
                sheetPos: 7,
                fileNameShort: 'thumbnail-7.png',
                fileNameShortBlurred: 'thumbnail-7-blurred.png',
            });
        });
    });

    describe('error handling', () => {
        test('rejects when the blurred image cannot be produced', async () => {
            jimpRead.mockRejectedValue(new Error('unsupported image format'));
            const page = createPage();

            await expect(run(page)).rejects.toThrow('unsupported image format');
        });

        test('logs before rethrowing a blur failure', async () => {
            jimpRead.mockRejectedValue(new Error('unsupported image format'));
            const page = createPage();

            await expect(run(page)).rejects.toThrow();

            expect(mockLogger.error).toHaveBeenCalled();
        });

        test('rejects when navigation fails', async () => {
            const page = createPage();
            page.goto.mockRejectedValue(new Error('net::ERR_CONNECTION_REFUSED'));

            await expect(run(page)).rejects.toThrow('net::ERR_CONNECTION_REFUSED');
        });

        test('rejects when the sheet element never appears', async () => {
            const page = createPage();
            page.waitForSelector.mockRejectedValue(new Error('Waiting for selector failed'));

            await expect(run(page)).rejects.toThrow('Waiting for selector failed');
        });
    });
});
