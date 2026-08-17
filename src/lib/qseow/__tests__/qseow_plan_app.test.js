import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Executes the REAL qseowPlanApp - no planner mock. Cloud twin:
// cloud_plan_app.test.js.

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

jest.unstable_mockModule('../qseow-enigma.js', () => ({
    setupEnigmaConnection: jest.fn().mockReturnValue({ url: 'wss://sense' }),
}));

const readQseowAppContext = jest.fn();
jest.unstable_mockModule('../qseow-tagged-sheets.js', () => ({ readQseowAppContext }));

let fakeGlobal;
jest.unstable_mockModule('../../util/engine-session.js', () => ({
    withEngineSession: jest.fn(async (config, ctx, cb) => cb(fakeGlobal)),
}));

const { qseowPlanApp } = await import('../qseow-plan-app.js');
const { createRunReport } = await import('../../util/run-report.js');

const sheetItem = (qId, rank, { title = `Sheet ${qId}` } = {}) => ({
    qInfo: { qId },
    qMeta: { title, description: '', approved: false, published: false },
    qData: { rank, showCondition: null },
});

const wireApp = (items) => {
    const app = {
        createSessionObject: jest.fn().mockResolvedValue({
            getLayout: jest.fn().mockResolvedValue({
                qAppObjectList: { qItems: items },
            }),
        }),
        evaluateEx: jest.fn().mockResolvedValue({ qIsNumeric: false }),
    };

    fakeGlobal = { openDoc: jest.fn().mockResolvedValue(app) };

    return app;
};

const contextWith = ({ excludeTagged = [], blurTagged = [] } = {}) => ({
    appMetadata: [{ name: 'Sales Discovery', published: true }],
    tagSheetAppMetadata: excludeTagged,
    blurTagSheetAppMetadata: blurTagged,
    mapRepoEngineSheetId: new Map(),
});

const OPTIONS = { host: 'sense', loglevel: 'info' };

beforeEach(() => {
    jest.clearAllMocks();
    readQseowAppContext.mockResolvedValue(contextWith());
});

describe('qseowPlanApp', () => {
    test('records name, sheet count and one decision per sheet', async () => {
        wireApp([sheetItem('a', 1), sheetItem('b', 2)]);
        const report = createRunReport({ command: 'qseow create-sheet-thumbnails', dryRun: true });

        await qseowPlanApp('app-1', OPTIONS, report);

        expect(report.apps[0].name).toBe('Sales Discovery');
        expect(report.apps[0].sheetCount).toBe(2);
        expect(report.apps[0].sheets.map((sheet) => sheet.action)).toEqual(['update', 'update']);
    });

    test('the blur tag set reaches the blur rule, not the exclude rule', async () => {
        // The #840 trap: conflating the two tag sets blurs the sheets the
        // operator asked to skip. The planner must keep them apart exactly as
        // the real run does.
        readQseowAppContext.mockResolvedValue(
            contextWith({ blurTagged: [{ engineObjectId: 'b' }] })
        );
        wireApp([sheetItem('a', 1), sheetItem('b', 2)]);
        const report = createRunReport({ command: 'qseow create-sheet-thumbnails', dryRun: true });

        await qseowPlanApp('app-1', { ...OPTIONS, blurSheetTag: 'confidential' }, report);

        expect(report.apps[0].sheets).toEqual([
            { n: 1, title: 'Sheet a', action: 'update', reason: null },
            { n: 2, title: 'Sheet b', action: 'blur', reason: '--blur-sheet-tag' },
        ]);
    });

    test('exclude wins over blur, with the responsible option named', async () => {
        readQseowAppContext.mockResolvedValue(
            contextWith({ excludeTagged: [{ engineObjectId: 'a' }] })
        );
        wireApp([sheetItem('a', 1)]);
        const report = createRunReport({ command: 'qseow create-sheet-thumbnails', dryRun: true });

        await qseowPlanApp(
            'app-1',
            { ...OPTIONS, excludeSheetTag: 'no-thumbnail', blurSheetTitle: ['Sheet a'] },
            report
        );

        expect(report.apps[0].sheets).toEqual([
            { n: 1, title: 'Sheet a', action: 'skip', reason: '--exclude-sheet-tag' },
        ]);
    });
});
