import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { EXCLUDE_REASON } from '../../util/sheet-decision-reasons.js';

import { determineSheetExcludeStatus } from '../determine-sheet-exclude-status.js';

const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
};

/**
 * Builds a sheet of the shape the Cloud engine's `SheetList` returns.
 *
 * @param {object} [overrides] - Fields to override.
 * @param {boolean} [overrides.approved] - Value for `qMeta.approved`.
 * @param {boolean} [overrides.published] - Value for `qMeta.published`.
 * @param {string} [overrides.title] - Value for `qMeta.title`.
 * @param {string} [overrides.qId] - Value for `qInfo.qId`.
 * @param {string} [overrides.showCondition] - Value for `qData.showCondition`.
 *
 * @returns {object} A sheet object.
 */
const createSheet = ({
    approved = false,
    published = false,
    title = 'Test Sheet',
    qId = 'engine-sheet-1',
    showCondition = undefined,
} = {}) => ({
    qInfo: { qId },
    qMeta: { approved, published, title, description: 'a sheet' },
    qData: { showCondition },
});

/**
 * Builds a stub engine app whose `evaluateEx` resolves to the supplied value.
 *
 * @param {object} [evalResult] - What `app.evaluateEx` should resolve to.
 *
 * @returns {object} An app-shaped object.
 */
const createApp = (evalResult = {}) => ({
    evaluateEx: jest.fn().mockResolvedValue(evalResult),
});

/**
 * Calls the filter with defaults for the arguments a given test does not care about.
 *
 * @param {object} [args] - Overrides.
 * @param {object} [args.app] - App stub.
 * @param {object} [args.sheet] - Sheet object.
 * @param {object} [args.options] - Exclusion options.
 * @param {boolean} [args.appIsPublished] - Whether the parent app is published.
 * @param {number} [args.iSheetNum] - 1-based sheet index.
 *
 * @returns {Promise<{excludeSheet: boolean, sheetIsHidden: boolean}>} The result.
 */
const run = ({
    app = createApp(),
    sheet = createSheet(),
    options = {},
    appIsPublished = false,
    iSheetNum = 1,
} = {}) => determineSheetExcludeStatus(app, sheet, options, appIsPublished, iSheetNum, mockLogger);

beforeEach(() => {
    jest.clearAllMocks();
});

describe('determineSheetExcludeStatus (Cloud)', () => {
    test('processes a sheet when no exclusion options are set', async () => {
        await expect(run()).resolves.toEqual({
            excludeSheet: false,
            sheetIsHidden: false,
            excludeReason: null,
        });
    });

    describe('sheets with missing metadata', () => {
        test('does not throw for a sheet with no qMeta, qInfo or qData', async () => {
            // The inline version this replaced dereferenced all three unguarded, thirteen
            // times, and took the whole app down mid-loop.
            await expect(run({ sheet: {} })).resolves.toEqual({
                excludeSheet: false,
                sheetIsHidden: false,
                excludeReason: null,
            });
        });

        test('does not throw when every exclusion rule is active', async () => {
            await expect(
                run({
                    sheet: {},
                    options: {
                        excludeSheetStatus: ['private', 'published', 'public'],
                        excludeSheetNumber: ['1'],
                        excludeSheetTitle: ['Test Sheet'],
                    },
                })
            ).resolves.toMatchObject({ excludeSheet: true });
        });

        test('a sheet with no qMeta counts as private, not public', async () => {
            // Absent approved/published must read as false, matching the old inline logic.
            const result = await run({
                sheet: { qInfo: { qId: 'x' } },
                options: { excludeSheetStatus: ['private'] },
            });

            expect(result.excludeSheet).toBe(true);
        });
    });

    describe('hidden sheets', () => {
        test('treats a literal "false" showCondition as hidden', async () => {
            const result = await run({ sheet: createSheet({ showCondition: 'false' }) });

            expect(result).toEqual({
                excludeSheet: true,
                sheetIsHidden: true,
                excludeReason: EXCLUDE_REASON.HIDDEN,
            });
        });

        test('matches the "false" literal case-insensitively', async () => {
            const result = await run({ sheet: createSheet({ showCondition: 'FALSE' }) });

            expect(result.sheetIsHidden).toBe(true);
        });

        test('evaluates an expression show condition against the engine', async () => {
            // The dead helper this replaces only compared against the literal string
            // 'false', so `=1=2` read as visible and computed show conditions were
            // silently ignored.
            const app = createApp({ qIsNumeric: true, qNumber: 0 });
            const result = await run({ sheet: createSheet({ showCondition: '=1=2' }), app });

            expect(app.evaluateEx).toHaveBeenCalledWith({ qExpression: '=1=2' });
            expect(result).toEqual({
                excludeSheet: true,
                sheetIsHidden: true,
                excludeReason: EXCLUDE_REASON.HIDDEN,
            });
        });

        test('keeps a sheet whose show condition evaluates to numeric 1', async () => {
            const app = createApp({ qIsNumeric: true, qNumber: 1 });
            const result = await run({ sheet: createSheet({ showCondition: '=1=1' }), app });

            expect(result).toEqual({
                excludeSheet: false,
                sheetIsHidden: false,
                excludeReason: null,
            });
        });
    });

    describe('exclusion by sheet status', () => {
        test('excludes a public sheet of a published app', async () => {
            const result = await run({
                sheet: createSheet({ approved: true, published: true }),
                appIsPublished: true,
                options: { excludeSheetStatus: ['public'] },
            });

            expect(result.excludeSheet).toBe(true);
        });

        test('identifies a public sheet of an unpublished app by approved=false, published=true', async () => {
            const result = await run({
                sheet: createSheet({ approved: false, published: true }),
                appIsPublished: false,
                options: { excludeSheetStatus: ['public'] },
            });

            expect(result.excludeSheet).toBe(true);
        });

        test('excludes a published sheet only in a published app', async () => {
            const sheet = createSheet({ approved: false, published: true });
            const options = { excludeSheetStatus: ['published'] };

            await expect(run({ sheet, options, appIsPublished: true })).resolves.toMatchObject({
                excludeSheet: true,
            });
            await expect(run({ sheet, options, appIsPublished: false })).resolves.toMatchObject({
                excludeSheet: false,
            });
        });

        test('excludes a private sheet in either kind of app', async () => {
            const sheet = createSheet({ approved: false, published: false });
            const options = { excludeSheetStatus: ['private'] };

            await expect(run({ sheet, options, appIsPublished: true })).resolves.toMatchObject({
                excludeSheet: true,
            });
            await expect(run({ sheet, options, appIsPublished: false })).resolves.toMatchObject({
                excludeSheet: true,
            });
        });

        test('leaves a status that was not listed alone', async () => {
            const result = await run({
                sheet: createSheet({ approved: false, published: false }),
                options: { excludeSheetStatus: ['public'] },
            });

            expect(result.excludeSheet).toBe(false);
        });
    });

    describe('exclusion by sheet number', () => {
        test('excludes a listed sheet number', async () => {
            const result = await run({
                iSheetNum: 3,
                options: { excludeSheetNumber: ['1', '3'] },
            });

            expect(result.excludeSheet).toBe(true);
        });

        test('does not substring-match other sheet numbers', async () => {
            // The array must hold whole numbers; `'12'.includes('1')` was the original bug.
            const result = await run({ iSheetNum: 1, options: { excludeSheetNumber: ['12'] } });

            expect(result.excludeSheet).toBe(false);
        });
    });

    describe('exclusion by sheet title', () => {
        test('excludes a listed title', async () => {
            const result = await run({
                sheet: createSheet({ title: 'Secret sheet' }),
                options: { excludeSheetTitle: ['Secret sheet'] },
            });

            expect(result.excludeSheet).toBe(true);
        });

        test('leaves an unlisted title alone', async () => {
            const result = await run({
                sheet: createSheet({ title: 'Sales' }),
                options: { excludeSheetTitle: ['Secret sheet'] },
            });

            expect(result.excludeSheet).toBe(false);
        });
    });

    test('reports a hidden sheet as hidden even when another rule excluded it first', async () => {
        const result = await run({
            sheet: createSheet({ approved: false, published: false, showCondition: 'false' }),
            options: { excludeSheetStatus: ['private'] },
        });

        expect(result).toEqual({
            excludeSheet: true,
            sheetIsHidden: true,
            // Status ran first, so the reason names it - hidden did not overwrite it.
            excludeReason: EXCLUDE_REASON.STATUS_PRIVATE,
        });
    });
});
