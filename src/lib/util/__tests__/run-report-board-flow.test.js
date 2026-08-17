import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

/**
 * Flow tests for the board rung's wiring through `runOverAppsWithReport` and
 * `emitRunHeader` (issues #1074/#1076): on the board rung the board blocks go
 * to `process.stdout` (never through winston), the equivalent plain blocks
 * still go through the logger with the console transport silenced, and
 * `BSI_OUTPUT=off` suppresses the plan and verdict blocks without silencing
 * the run.
 *
 * The rung is forced with `BSI_OUTPUT=board` because jest's stdout is not a
 * TTY - which is itself the property that makes the forced override the only
 * way to reach the board here, exactly as on a real misdetected terminal.
 */

const timeline = [];

// The fake console transport records whether it was silent at the moment each
// line was logged - that is the observable half of "silence the console for
// the block's duration rather than emitting it twice".
const consoleTransport = { name: 'console', silent: false, level: 'info' };

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn((line) =>
            timeline.push(`LOG${consoleTransport.silent ? '(silent)' : ''} ${line}`)
        ),
        verbose: jest.fn(),
        debug: jest.fn(),
        error: jest.fn((line) => timeline.push(`ERROR ${line}`)),
        warn: jest.fn((line) => timeline.push(`WARN ${line}`)),
        transports: [consoleTransport],
    },
    getLoggingLevel: jest.fn().mockReturnValue('info'),
    setLoggingLevel: jest.fn(),
}));

const {
    runOverAppsWithReport,
    emitRunHeader,
    announceDryRun,
    addAppToReport,
    recordSheetDecision,
} = await import('../run-report.js');
const { logger } = await import('../../../globals.js');

const stdoutWrites = [];
let writeSpy;
let savedOutput;

beforeEach(() => {
    timeline.length = 0;
    stdoutWrites.length = 0;
    consoleTransport.silent = false;
    jest.clearAllMocks();
    savedOutput = process.env.BSI_OUTPUT;
    writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        stdoutWrites.push(String(chunk));

        return true;
    });
});

afterEach(() => {
    writeSpy.mockRestore();
    if (savedOutput === undefined) {
        delete process.env.BSI_OUTPUT;
    } else {
        process.env.BSI_OUTPUT = savedOutput;
    }
});

/**
 * A run over two apps whose processor records realistic entries.
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
        browser: { name: 'chrome', version: 'recommended', headless: true, pageWaitSeconds: 5 },
        writes: { kind: 'thumbnails', contentLibrary: 'lib', publishedAppCount: 1 },
    },
    logPrefix: { plan: 'TEST PLAN', process: 'TEST PROCESS' },
    emptySelectionHint: 'hint',
    planApp: jest.fn(async () => {}),
    processApp: jest.fn(async (appId, report) => {
        const entry = addAppToReport(report, { id: appId, name: `Named ${appId}`, sheetCount: 2 });
        recordSheetDecision(entry, { n: 1, title: 'One', action: 'update' });
        recordSheetDecision(entry, { n: 2, title: 'Two', action: 'update' });
    }),
    ...overrides,
});

describe('the board rung (BSI_OUTPUT=board)', () => {
    beforeEach(() => {
        process.env.BSI_OUTPUT = 'board';
    });

    test('board blocks go to stdout: plan, one strip row per app, verdict', async () => {
        await runOverAppsWithReport(runArgs());

        const joined = stdoutWrites.join('');
        expect(joined).toContain('PLAN');
        expect(joined).toContain('Named app-1');
        expect(joined).toContain('Named app-2');
        expect(joined).toContain('app(s) ok');

        // The strip rows stream as each app completes - separate writes, not
        // one buffered block at the end.
        expect(stdoutWrites.filter((chunk) => chunk.includes('Named app-')).length).toBe(2);
    });

    test('the plain blocks still go through the logger, console silenced, and the silence is lifted after', async () => {
        await runOverAppsWithReport(runArgs());

        // The plain PLAN block and verdict were logged for any file
        // transport, but with the console transport silent at that moment.
        expect(timeline).toContain('LOG(silent) PLAN');
        expect(timeline.some((line) => line.startsWith('LOG(silent) RESULT'))).toBe(true);

        // The per-app progress lines between the blocks stay audible.
        expect(consoleTransport.silent).toBe(false);
    });

    test('emitRunHeader writes the wordmark frame to stdout, logs the plain header silently, and returns the rung', () => {
        const rung = emitRunHeader({
            version: '9.9.9-test',
            jobLabel: 'QSEoW sheet thumbnails',
            options: {},
        });

        const joined = stdoutWrites.join('');
        expect(rung).toBe('board');
        expect(joined).toContain('BUTLER SHEET ICONS');
        expect(joined).toContain('9.9.9-test');
        expect(timeline.some((line) => line.startsWith('LOG(silent)'))).toBe(true);
        expect(consoleTransport.silent).toBe(false);
    });

    test('announceDryRun on the board rung sends one styled line to stdout, banner to the log silently', () => {
        announceDryRun('qseow create-sheet-thumbnails', 'board');

        // No rung-A `=` furniture on the terminal - one line, no frames.
        const joined = stdoutWrites.join('');
        expect(joined).toContain('DRY RUN of qseow create-sheet-thumbnails');
        expect(joined).not.toContain('====');
        expect(timeline.some((line) => line.startsWith('LOG(silent) ='))).toBe(true);
    });
});

describe('the off rung (BSI_OUTPUT=off)', () => {
    beforeEach(() => {
        process.env.BSI_OUTPUT = 'off';
    });

    test('suppresses the plan and verdict blocks entirely on a real run', async () => {
        await runOverAppsWithReport(runArgs());

        expect(stdoutWrites).toHaveLength(0);
        expect(timeline.some((line) => line.includes('PLAN'))).toBe(false);
        expect(timeline.some((line) => line.includes('RESULT'))).toBe(false);
    });

    test('never suppresses the dry-run report - it is the command product', async () => {
        await runOverAppsWithReport(
            runArgs({
                dryRun: true,
                planApp: jest.fn(async (appId, report) => {
                    const entry = addAppToReport(report, { id: appId, name: appId, sheetCount: 1 });
                    recordSheetDecision(entry, { n: 1, title: 'One', action: 'update' });
                }),
            })
        );

        expect(timeline.some((line) => line.includes('DRY RUN of'))).toBe(true);
    });

    test('never suppresses a dry run PLAN block - provenance and match counts live only there', async () => {
        await runOverAppsWithReport(
            runArgs({
                dryRun: true,
                planApp: jest.fn(async (appId, report) => {
                    const entry = addAppToReport(report, { id: appId, name: appId, sheetCount: 1 });
                    recordSheetDecision(entry, { n: 1, title: 'One', action: 'update' });
                }),
            })
        );

        expect(timeline).toContain('LOG PLAN');
    });

    test('keeps the plain run header - the version line is support material', () => {
        emitRunHeader({ version: '9.9.9-test', jobLabel: 'QSEoW sheet thumbnails', options: {} });

        expect(stdoutWrites).toHaveLength(0);
        expect(timeline.some((line) => line.includes('9.9.9-test'))).toBe(true);
        expect(timeline.some((line) => line.startsWith('LOG(silent)'))).toBe(false);
    });
});

describe('an unrecognised BSI_OUTPUT value', () => {
    test('warns once per process even though the rung is consulted repeatedly', async () => {
        process.env.BSI_OUTPUT = 'fancy';

        emitRunHeader({ version: '9.9.9-test', jobLabel: 'QSEoW sheet thumbnails', options: {} });
        await runOverAppsWithReport(runArgs());

        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(logger.warn.mock.calls[0][0]).toContain('BSI_OUTPUT="fancy"');

        // And selection fell back to automatic: no TTY under jest, so plain -
        // the blocks went through the logger, console audible.
        expect(timeline).toContain('LOG PLAN');
        expect(stdoutWrites).toHaveLength(0);
    });
});
