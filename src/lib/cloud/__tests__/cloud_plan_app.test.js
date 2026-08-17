import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Executes the REAL cloudPlanApp - no planner mock. The review found that the
// routing tests mock both sides, so no planner line ran under any test and a
// crash in the plan path shipped green. QSEoW twin: qseow_plan_app.test.js.

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
    },
    setLoggingLevel: jest.fn(),
    getLoggingLevel: jest.fn(() => 'info'),
    isSea: false,
}));

jest.unstable_mockModule('../cloud-enigma.js', () => ({
    setupEnigmaConnection: jest.fn().mockReturnValue({ url: 'wss://tenant' }),
}));

// The session helper is mocked at its seam: hand the callback a fake global.
let fakeGlobal;
jest.unstable_mockModule('../../util/engine-session.js', () => ({
    withEngineSession: jest.fn(async (config, ctx, cb) => cb(fakeGlobal)),
}));

const { cloudPlanApp } = await import('../cloud-plan-app.js');
const { createRunReport } = await import('../../util/run-report.js');

const sheetItem = (qId, rank, { title = `Sheet ${qId}`, qMeta, showCondition = null } = {}) => ({
    qInfo: { qId },
    ...(qMeta === null ? {} : { qMeta: qMeta ?? { title, description: '' } }),
    qData: { rank, showCondition },
});

const wireApp = (items, { evaluateEx } = {}) => {
    const app = {
        createSessionObject: jest.fn().mockResolvedValue({
            getLayout: jest.fn().mockResolvedValue({
                qAppObjectList: { qItems: items },
            }),
        }),
        evaluateEx: evaluateEx ?? jest.fn().mockResolvedValue({ qIsNumeric: false }),
    };

    fakeGlobal = { openDoc: jest.fn().mockResolvedValue(app) };

    return app;
};

const saasWithName = (name) => ({
    Get: jest.fn(async () => ({ attributes: { name, publishTime: '' } })),
});

const OPTIONS = { tenanturl: 'tenant', loglevel: 'info' };

beforeEach(() => {
    jest.clearAllMocks();
});

describe('cloudPlanApp', () => {
    test('records one decision per sheet, in rank order', async () => {
        wireApp([sheetItem('b', 2), sheetItem('a', 1)]);
        const report = createRunReport({
            command: 'qscloud create-sheet-thumbnails',
            dryRun: true,
        });

        await cloudPlanApp('app-1', saasWithName('Finance'), OPTIONS, report);

        expect(report.apps).toHaveLength(1);
        expect(report.apps[0].name).toBe('Finance');
        expect(report.apps[0].sheets.map((sheet) => [sheet.n, sheet.title, sheet.action])).toEqual([
            [1, 'Sheet a', 'update'],
            [2, 'Sheet b', 'update'],
        ]);
    });

    test('applies exclude and blur rules with reasons', async () => {
        wireApp([sheetItem('a', 1, { title: 'Keep' }), sheetItem('b', 2, { title: 'Blur me' })]);
        const report = createRunReport({
            command: 'qscloud create-sheet-thumbnails',
            dryRun: true,
        });

        await cloudPlanApp(
            'app-1',
            saasWithName('Finance'),
            { ...OPTIONS, excludeSheetTitle: ['Keep'], blurSheetTitle: ['Blur me'] },
            report
        );

        expect(report.apps[0].sheets).toEqual([
            { n: 1, title: 'Keep', action: 'skip', reason: '--exclude-sheet-title' },
            { n: 2, title: 'Blur me', action: 'blur', reason: '--blur-sheet-title' },
        ]);
    });

    test('a sheet the engine returned without qMeta is planned, not thrown on', async () => {
        wireApp([sheetItem('bare', 1, { qMeta: null })]);
        const report = createRunReport({
            command: 'qscloud create-sheet-thumbnails',
            dryRun: true,
        });

        await cloudPlanApp('app-1', saasWithName('Finance'), OPTIONS, report);

        expect(report.apps[0].sheets).toEqual([
            { n: 1, title: undefined, action: 'update', reason: null },
        ]);
    });

    test('one failing sheet does not abort the remaining rows', async () => {
        // Sheet 2 has a show condition whose evaluation the engine rejects. The
        // real run isolates it through runOverSheets - the planner must too.
        const evaluateEx = jest
            .fn()
            .mockRejectedValueOnce(new Error('bad expression'))
            .mockResolvedValue({ qIsNumeric: false });
        wireApp(
            [
                sheetItem('a', 1, { showCondition: '=broken(' }),
                sheetItem('b', 2),
                sheetItem('c', 3),
            ],
            { evaluateEx }
        );
        const report = createRunReport({
            command: 'qscloud create-sheet-thumbnails',
            dryRun: true,
        });

        // The app still fails overall - same semantics as the real run - but
        // every other sheet's decision was recorded first.
        await expect(
            cloudPlanApp('app-1', saasWithName('Finance'), OPTIONS, report)
        ).rejects.toThrow();

        expect(report.apps[0].sheets.map((sheet) => sheet.title)).toEqual(['Sheet b', 'Sheet c']);
        expect(report.apps[0].sheetCount).toBe(3);
    });
});
