import { describe, test, expect, beforeEach, jest } from '@jest/globals';

/**
 * Flow tests for `runOverAppsWithReport` as extended by issue #1073: the plan
 * block must be emitted before the first per-app worker runs (ordering is the
 * safety property - the plan exists to be read before the first write), a
 * real run must close with a verdict, and failures must be counted on the
 * report before the verdict renders.
 *
 * The logger and the per-app workers write into one shared timeline array, so
 * ordering can be asserted rather than inferred.
 */

const timeline = [];

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn((line) => timeline.push(`LOG ${line}`)),
        verbose: jest.fn(),
        debug: jest.fn(),
        error: jest.fn((line) => timeline.push(`ERROR ${line}`)),
        warn: jest.fn(),
    },
    getLoggingLevel: jest.fn().mockReturnValue('info'),
    setLoggingLevel: jest.fn(),
}));

const { runOverAppsWithReport } = await import('../run-report.js');
const { getLoggingLevel, setLoggingLevel } = await import('../../../globals.js');

/**
 * A minimal but complete run argument bag.
 *
 * @param {object} overrides - Fields to override.
 *
 * @returns {object} Arguments for `runOverAppsWithReport`.
 */
const runArgs = (overrides = {}) => ({
    command: 'qseow create-sheet-thumbnails',
    dryRun: false,
    appIds: ['app-1', 'app-2'],
    namedAppIds: ['app-1', 'app-2'],
    selectorAppIds: [],
    selector: null,
    plan: {
        writes: { kind: 'thumbnails', contentLibrary: 'lib', publishedAppCount: 1 },
    },
    logPrefix: { plan: 'TEST PLAN', process: 'TEST PROCESS' },
    emptySelectionHint: 'hint',
    planApp: jest.fn(async (appId) => {
        timeline.push(`PLANAPP ${appId}`);
    }),
    processApp: jest.fn(async (appId) => {
        timeline.push(`PROCESS ${appId}`);
    }),
    ...overrides,
});

beforeEach(() => {
    timeline.length = 0;
    jest.clearAllMocks();
    // clearAllMocks clears call records but NOT return values, so a
    // mockReturnValue('warn') set in one describe would silently leak into
    // every later test without this reset.
    getLoggingLevel.mockReturnValue('info');
    // A BSI_OUTPUT inherited from the developer's shell would change which
    // rung the loop selects and route the blocks away from the logger these
    // assertions read. The board rung has its own flow test.
    delete process.env.BSI_OUTPUT;
});

describe('runOverAppsWithReport - the plan renders before the first write', () => {
    test('on a real run, PLAN precedes every processApp call', async () => {
        await runOverAppsWithReport(runArgs());

        const planIndex = timeline.findIndex((entry) => entry === 'LOG PLAN');
        const firstProcess = timeline.findIndex((entry) => entry.startsWith('PROCESS'));

        expect(planIndex).toBeGreaterThan(-1);
        expect(firstProcess).toBeGreaterThan(-1);
        expect(planIndex).toBeLessThan(firstProcess);
    });

    test('on a dry run, PLAN precedes every planApp call', async () => {
        await runOverAppsWithReport(runArgs({ dryRun: true }));

        const planIndex = timeline.findIndex((entry) => entry === 'LOG PLAN');
        const firstPlanApp = timeline.findIndex((entry) => entry.startsWith('PLANAPP'));

        expect(planIndex).toBeGreaterThan(-1);
        expect(firstPlanApp).toBeGreaterThan(-1);
        expect(planIndex).toBeLessThan(firstPlanApp);
    });
});

describe('runOverAppsWithReport - the verdict', () => {
    test('a clean real run closes with RESULT ok after the last app', async () => {
        const result = await runOverAppsWithReport(runArgs());

        expect(result).toBe(true);
        const verdictIndex = timeline.findIndex((entry) => entry === 'LOG RESULT  ok');
        const lastProcess = timeline.map((e) => e.startsWith('PROCESS')).lastIndexOf(true);
        expect(verdictIndex).toBeGreaterThan(lastProcess);
        expect(timeline).toContain('LOG   apps          2 ok, 0 failed');
    });

    test('a failed app is counted on the report and fails the verdict', async () => {
        const args = runArgs({
            processApp: jest.fn(async (appId) => {
                if (appId === 'app-2') {
                    throw new Error('boom');
                }
                timeline.push(`PROCESS ${appId}`);
            }),
        });

        const result = await runOverAppsWithReport(args);

        expect(result).toBe(false);
        expect(timeline).toContain('LOG RESULT  FAILED');
        expect(timeline).toContain('LOG   apps          1 ok, 1 failed');
    });

    test('an empty real selection still gets a verdict naming the emptiness', async () => {
        const result = await runOverAppsWithReport(
            runArgs({ appIds: [], namedAppIds: [], selectorAppIds: [] })
        );

        expect(result).toBe(false);
        expect(timeline).toContain('LOG RESULT  FAILED');
        expect(timeline).toContain('LOG   apps          0 selected - nothing was done');
    });

    test('a dry run renders the dry-run report, never a RESULT block', async () => {
        await runOverAppsWithReport(runArgs({ dryRun: true }));

        expect(timeline.some((entry) => entry.startsWith('LOG RESULT'))).toBe(false);
        expect(timeline.some((entry) => entry.includes('DRY RUN of'))).toBe(true);
    });

    test('a planner that fails is marked on the dry-run report, and the apply invite is withheld', async () => {
        // A planner failure after (or before) its rows are recorded must not
        // render as a clean plan that invites re-running without --dry-run.
        const result = await runOverAppsWithReport(
            runArgs({
                dryRun: true,
                planApp: jest.fn(async (appId) => {
                    if (appId === 'app-2') {
                        throw new Error('media list read failed');
                    }
                    timeline.push(`PLANAPP ${appId}`);
                }),
            })
        );

        expect(result).toBe(false);
        expect(timeline.some((entry) => entry.includes('could not be fully planned'))).toBe(true);
        expect(
            timeline.some((entry) => entry.includes('Fix the errors above before applying'))
        ).toBe(true);
        expect(timeline.some((entry) => entry.includes('Re-run without --dry-run to apply'))).toBe(
            false
        );
    });
});

describe('runOverAppsWithReport - visibility at quiet log levels', () => {
    test('a dry run forces the plan visible at warn', async () => {
        getLoggingLevel.mockReturnValue('warn');

        await runOverAppsWithReport(runArgs({ dryRun: true }));

        expect(setLoggingLevel).toHaveBeenCalledWith('info');
        expect(setLoggingLevel).toHaveBeenCalledWith('warn');
    });

    test("a real run respects the operator's quiet level", async () => {
        // A real run at warn asked for a quiet log; the run card must not
        // override that the way the dry-run report deliberately does.
        getLoggingLevel.mockReturnValue('warn');

        await runOverAppsWithReport(runArgs());

        expect(setLoggingLevel).not.toHaveBeenCalled();
    });
});

describe('runOverAppsWithReport - countable app lines', () => {
    test('each app is announced as i/n before its worker runs', async () => {
        await runOverAppsWithReport(runArgs());

        const first = timeline.indexOf('LOG app 1/2  app-1');
        const firstProcess = timeline.indexOf('PROCESS app-1');
        expect(first).toBeGreaterThan(-1);
        expect(first).toBeLessThan(firstProcess);
        expect(timeline).toContain('LOG app 2/2  app-2');
    });

    test('a dry run keeps its verb in the app line', async () => {
        await runOverAppsWithReport(runArgs({ dryRun: true }));

        expect(timeline).toContain('LOG plan app 1/2  app-1');
    });
});
