import { jest, describe, test, expect, beforeEach } from '@jest/globals';

import { determineSheetExcludeStatus } from '../determine-sheet-exclude-status.js';

const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
};

/**
 * Builds a minimal Qlik sheet object of the shape `determineSheetExcludeStatus` reads.
 *
 * @param {object} [overrides] - Fields to override on the generated sheet.
 * @param {boolean} [overrides.approved] - Value for `qMeta.approved`. Defaults to `false`.
 * @param {boolean} [overrides.published] - Value for `qMeta.published`. Defaults to `false`.
 * @param {string} [overrides.title] - Value for `qMeta.title`. Defaults to `'Test Sheet'`.
 * @param {string} [overrides.qId] - Value for `qInfo.qId`. Defaults to `'engine-sheet-1'`.
 * @param {string} [overrides.showCondition] - Value for `qData.showCondition`. Defaults to `undefined`.
 *
 * @returns {object} A sheet-shaped object consumable by `determineSheetExcludeStatus`.
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
 * Builds a stub Qlik app whose `evaluateEx` resolves to the supplied value.
 *
 * @param {object} [evalResult] - Value `app.evaluateEx` should resolve to. Defaults to an empty object.
 *
 * @returns {object} An app-shaped object exposing a mocked `evaluateEx`.
 */
const createApp = (evalResult = {}) => ({
    evaluateEx: jest.fn().mockResolvedValue(evalResult),
});

/**
 * Calls `determineSheetExcludeStatus` with sensible defaults for the positional
 * arguments that individual tests do not care about.
 *
 * @param {object} [args] - Overrides for the call.
 * @param {object} [args.app] - App stub. Defaults to one whose `evaluateEx` resolves to `{}`.
 * @param {object} [args.sheet] - Sheet object. Defaults to a private, non-hidden sheet.
 * @param {object} [args.options] - Exclusion options. Defaults to `{}`.
 * @param {Array<object>} [args.tagSheetAppMetadata] - Tag metadata. Defaults to `[]`.
 * @param {number} [args.iSheetNum] - 1-based sheet index. Defaults to `1`.
 *
 * @returns {Promise<{excludeSheet: boolean, sheetIsHidden: boolean}>} The function's result.
 */
const run = ({
    app = createApp(),
    sheet = createSheet(),
    options = {},
    tagSheetAppMetadata = [],
    iSheetNum = 1,
} = {}) =>
    determineSheetExcludeStatus(
        app,
        sheet,
        options,
        tagSheetAppMetadata,
        iSheetNum,
        'repo-sheet-id',
        sheet.qInfo.qId,
        mockLogger
    );

beforeEach(() => {
    jest.clearAllMocks();
});

describe('determineSheetExcludeStatus', () => {
    describe('no exclusion options set', () => {
        test('keeps a plain private sheet', async () => {
            await expect(run()).resolves.toEqual({ excludeSheet: false, sheetIsHidden: false });
        });

        test('keeps a published sheet', async () => {
            const sheet = createSheet({ approved: false, published: true });

            await expect(run({ sheet })).resolves.toEqual({
                excludeSheet: false,
                sheetIsHidden: false,
            });
        });

        test('keeps a public sheet', async () => {
            const sheet = createSheet({ approved: true, published: true });

            await expect(run({ sheet })).resolves.toEqual({
                excludeSheet: false,
                sheetIsHidden: false,
            });
        });
    });

    describe('exclusion by sheet status', () => {
        test('excludes a public sheet when "public" is listed', async () => {
            const sheet = createSheet({ approved: true, published: true });
            const options = { excludeSheetStatus: ['public'] };

            const { excludeSheet } = await run({ sheet, options });

            expect(excludeSheet).toBe(true);
        });

        test('excludes a published sheet when "published" is listed', async () => {
            const sheet = createSheet({ approved: false, published: true });
            const options = { excludeSheetStatus: ['published'] };

            const { excludeSheet } = await run({ sheet, options });

            expect(excludeSheet).toBe(true);
        });

        test('excludes a private sheet when "private" is listed', async () => {
            const sheet = createSheet({ approved: false, published: false });
            const options = { excludeSheetStatus: ['private'] };

            const { excludeSheet } = await run({ sheet, options });

            expect(excludeSheet).toBe(true);
        });

        test('does not exclude a public sheet when only "private" is listed', async () => {
            const sheet = createSheet({ approved: true, published: true });
            const options = { excludeSheetStatus: ['private'] };

            const { excludeSheet } = await run({ sheet, options });

            expect(excludeSheet).toBe(false);
        });

        test('a public sheet is not caught by the "published" rule', async () => {
            // approved === true is what separates public from published; the published
            // rule requires approved === false, so it must not fire here.
            const sheet = createSheet({ approved: true, published: true });
            const options = { excludeSheetStatus: ['published'] };

            const { excludeSheet } = await run({ sheet, options });

            expect(excludeSheet).toBe(false);
        });

        test('honours several statuses listed at once', async () => {
            const options = { excludeSheetStatus: ['public', 'published', 'private'] };

            const results = await Promise.all([
                run({ sheet: createSheet({ approved: true, published: true }), options }),
                run({ sheet: createSheet({ approved: false, published: true }), options }),
                run({ sheet: createSheet({ approved: false, published: false }), options }),
            ]);

            expect(results.map((r) => r.excludeSheet)).toEqual([true, true, true]);
        });
    });

    describe('hidden sheets', () => {
        test('does not throw for a sheet the engine returned without qData', async () => {
            // The line above this read already used `sheet?.qData?.showCondition`, but the
            // hidden check itself did not - so a sheet with no qData threw
            // `TypeError: Cannot read properties of undefined (reading 'showCondition')`
            // and took the whole app down with it.
            const sheet = { qInfo: { qId: 'broken' }, qMeta: { title: 'Broken' } };

            await expect(run({ sheet })).resolves.toEqual({
                excludeSheet: false,
                sheetIsHidden: false,
            });
        });

        test('treats a literal "false" showCondition as hidden', async () => {
            const sheet = createSheet({ showCondition: 'false' });

            await expect(run({ sheet })).resolves.toEqual({
                excludeSheet: true,
                sheetIsHidden: true,
            });
        });

        test('matches the "false" literal case-insensitively', async () => {
            const sheet = createSheet({ showCondition: 'FALSE' });

            const { sheetIsHidden } = await run({ sheet });

            expect(sheetIsHidden).toBe(true);
        });

        test('treats a showCondition the engine evaluates to numeric 0 as hidden', async () => {
            const sheet = createSheet({ showCondition: '=1=2' });
            const app = createApp({ qIsNumeric: true, qNumber: 0 });

            await expect(run({ sheet, app })).resolves.toEqual({
                excludeSheet: true,
                sheetIsHidden: true,
            });
        });

        test('keeps a sheet whose showCondition evaluates to numeric 1', async () => {
            const sheet = createSheet({ showCondition: '=1=1' });
            const app = createApp({ qIsNumeric: true, qNumber: 1 });

            await expect(run({ sheet, app })).resolves.toEqual({
                excludeSheet: false,
                sheetIsHidden: false,
            });
        });

        test('a non-numeric evaluation result does not hide the sheet', async () => {
            const sheet = createSheet({ showCondition: '=SomeExpression' });
            const app = createApp({ qIsNumeric: false, qNumber: 0 });

            const { sheetIsHidden } = await run({ sheet, app });

            expect(sheetIsHidden).toBe(false);
        });

        test('a sheet with no showCondition is never hidden, whatever the engine returns', async () => {
            const app = createApp({ qIsNumeric: true, qNumber: 0 });

            const { sheetIsHidden } = await run({ app });

            expect(sheetIsHidden).toBe(false);
        });

        test('passes the showCondition to the engine as a qExpression', async () => {
            const sheet = createSheet({ showCondition: '=1=2' });
            const app = createApp({ qIsNumeric: true, qNumber: 0 });

            await run({ sheet, app });

            expect(app.evaluateEx).toHaveBeenCalledWith({ qExpression: '=1=2' });
        });

        test('reports sheetIsHidden even when the sheet was already excluded by status', async () => {
            // The two flags are independent: the caller logs `hidden` separately from the
            // exclusion reason, so a status-excluded sheet must still report it is hidden.
            const sheet = createSheet({
                approved: false,
                published: false,
                showCondition: 'false',
            });
            const options = { excludeSheetStatus: ['private'] };

            await expect(run({ sheet, options })).resolves.toEqual({
                excludeSheet: true,
                sheetIsHidden: true,
            });
        });
    });

    describe('exclusion by tag', () => {
        test('excludes a sheet whose engine object id is in the tag metadata', async () => {
            const sheet = createSheet({ qId: 'engine-sheet-7' });
            const options = { excludeSheetTag: 'some-tag' };

            const { excludeSheet } = await run({
                sheet,
                options,
                tagSheetAppMetadata: [{ engineObjectId: 'engine-sheet-7' }],
            });

            expect(excludeSheet).toBe(true);
        });

        test('keeps a sheet whose engine object id is absent from the tag metadata', async () => {
            const sheet = createSheet({ qId: 'engine-sheet-7' });
            const options = { excludeSheetTag: 'some-tag' };

            const { excludeSheet } = await run({
                sheet,
                options,
                tagSheetAppMetadata: [{ engineObjectId: 'a-different-sheet' }],
            });

            expect(excludeSheet).toBe(false);
        });

        test('only logs a tag exclusion when the tag actually matched', async () => {
            // The line used to fire whether or not the tag matched, telling the operator
            // sheets had been skipped when they had not.
            const sheet = createSheet({ qId: 'engine-sheet-7' });
            const options = { excludeSheetTag: 'some-tag' };

            await run({
                sheet,
                options,
                tagSheetAppMetadata: [{ engineObjectId: 'a-different-sheet' }],
            });

            const verbose = mockLogger.verbose.mock.calls.map((call) => String(call[0])).join('\n');

            expect(verbose).not.toContain('via tags');
        });

        test('logs the tag exclusion when the tag did match', async () => {
            const sheet = createSheet({ qId: 'engine-sheet-7' });
            const options = { excludeSheetTag: 'some-tag' };

            await run({
                sheet,
                options,
                tagSheetAppMetadata: [{ engineObjectId: 'engine-sheet-7' }],
            });

            const verbose = mockLogger.verbose.mock.calls.map((call) => String(call[0])).join('\n');

            expect(verbose).toContain('via tags');
        });

        test('ignores tag metadata entirely when --exclude-sheet-tag is not set', async () => {
            const sheet = createSheet({ qId: 'engine-sheet-7' });

            const { excludeSheet } = await run({
                sheet,
                tagSheetAppMetadata: [{ engineObjectId: 'engine-sheet-7' }],
            });

            expect(excludeSheet).toBe(false);
        });
    });

    describe('exclusion by sheet number', () => {
        test('excludes a listed sheet number', async () => {
            const options = { excludeSheetNumber: ['2', '4'] };

            const { excludeSheet } = await run({ options, iSheetNum: 2 });

            expect(excludeSheet).toBe(true);
        });

        test('keeps a sheet number that is not listed', async () => {
            const options = { excludeSheetNumber: ['2', '4'] };

            const { excludeSheet } = await run({ options, iSheetNum: 3 });

            expect(excludeSheet).toBe(false);
        });

        test('compares numbers as strings, so a numeric index still matches', async () => {
            // Sheet numbers arrive from commander as strings but iSheetNum is an integer.
            const options = { excludeSheetNumber: ['10'] };

            const { excludeSheet } = await run({ options, iSheetNum: 10 });

            expect(excludeSheet).toBe(true);
        });
    });

    describe('exclusion by sheet title', () => {
        test('excludes a listed title', async () => {
            const sheet = createSheet({ title: 'Sales overview' });
            const options = { excludeSheetTitle: ['Sales overview', 'Costs'] };

            const { excludeSheet } = await run({ sheet, options });

            expect(excludeSheet).toBe(true);
        });

        test('keeps a title that is not listed', async () => {
            const sheet = createSheet({ title: 'Margins' });
            const options = { excludeSheetTitle: ['Sales overview', 'Costs'] };

            const { excludeSheet } = await run({ sheet, options });

            expect(excludeSheet).toBe(false);
        });

        test('matches titles exactly, not as a substring', async () => {
            const sheet = createSheet({ title: 'Sales' });
            const options = { excludeSheetTitle: ['Sales overview'] };

            const { excludeSheet } = await run({ sheet, options });

            expect(excludeSheet).toBe(false);
        });
    });

    describe('interaction between rules', () => {
        test('a sheet already excluded by status stays excluded when a later rule does not match', async () => {
            // Each later rule is guarded by `excludeSheet === false`, so it must not be
            // able to un-exclude a sheet an earlier rule already ruled out.
            const sheet = createSheet({ approved: false, published: false, title: 'Margins' });
            const options = {
                excludeSheetStatus: ['private'],
                excludeSheetTag: 'some-tag',
                excludeSheetNumber: ['99'],
                excludeSheetTitle: ['A different title'],
            };

            const { excludeSheet } = await run({
                sheet,
                options,
                tagSheetAppMetadata: [{ engineObjectId: 'a-different-sheet' }],
                iSheetNum: 1,
            });

            expect(excludeSheet).toBe(true);
        });

        test('a hidden sheet stays excluded even when the tag rule finds no match', async () => {
            const sheet = createSheet({ showCondition: 'false', qId: 'engine-sheet-7' });
            const options = { excludeSheetTag: 'some-tag' };

            const { excludeSheet } = await run({
                sheet,
                options,
                tagSheetAppMetadata: [{ engineObjectId: 'a-different-sheet' }],
            });

            expect(excludeSheet).toBe(true);
        });

        test('any single matching rule is enough to exclude', async () => {
            const sheet = createSheet({ title: 'Margins' });
            const options = {
                excludeSheetStatus: ['public'],
                excludeSheetNumber: ['99'],
                excludeSheetTitle: ['Margins'],
            };

            const { excludeSheet } = await run({ sheet, options, iSheetNum: 1 });

            expect(excludeSheet).toBe(true);
        });
    });
});
