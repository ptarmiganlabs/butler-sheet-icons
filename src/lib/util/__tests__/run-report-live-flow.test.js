import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createPalette } from '../colour.js';
import { UNICODE_SYMBOLS } from '../../interactive/symbols.js';

/**
 * Flow tests for the live rung's wiring through `runOverAppsWithReport`
 * (issue #1075): with a live view active the plan block and app rows are
 * committed through the view onto its own stream, the view is stopped -
 * terminal restored - before the verdict, and the verdict then goes to
 * `process.stdout` through the ordinary board path. Without an active view
 * the `live` rung falls back to board rendering with zero cursor sequences,
 * which is the flow-level docker-logs regression gate.
 */

const timeline = [];

const consoleTransport = { name: 'console', silent: false, level: 'info' };

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn((line) =>
            timeline.push(`LOG${consoleTransport.silent ? '(silent)' : ''} ${line}`)
        ),
        verbose: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        transports: [consoleTransport],
    },
    getLoggingLevel: jest.fn().mockReturnValue('info'),
    setLoggingLevel: jest.fn(),
}));

const { runOverAppsWithReport, startLiveRunView, addAppToReport, recordSheetDecision } =
    await import('../run-report.js');
const { createRunLiveView, activateLiveView, activeLiveView, restoreLiveTerminal } =
    await import('../run-live.js');

const ESC = String.fromCharCode(27);
const SHOW_CURSOR = `${ESC}[?25h`;
const CURSOR_SEQUENCE = new RegExp(`${ESC}\\[[0-9;?]*[AJhl]`);

const stdoutWrites = [];
let writeSpy;

beforeEach(() => {
    timeline.length = 0;
    stdoutWrites.length = 0;
    consoleTransport.silent = false;
    jest.clearAllMocks();
    writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        stdoutWrites.push(String(chunk));

        return true;
    });
});

afterEach(() => {
    restoreLiveTerminal();
    writeSpy.mockRestore();
});

/**
 * A real live view on a fake TTY stream, registered as the active one.
 *
 * @returns {{view: object, writes: string[]}} The view and its frame recording.
 */
const activeFakeTtyView = () => {
    const writes = [];
    const view = createRunLiveView({
        stream: {
            isTTY: true,
            columns: 100,
            rows: 40,
            write: (chunk) => {
                writes.push(String(chunk));

                return true;
            },
        },
        ctx: { palette: createPalette(false), symbols: UNICODE_SYMBOLS },
        timer: { start: () => {}, stop: () => {} },
    });
    activateLiveView(view);

    return { view, writes };
};

/**
 * Arguments for a two-app live run whose processor records realistic entries.
 *
 * @param {object} [overrides] - Fields to override.
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
    rung: 'live',
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

describe('the live rung with an active view', () => {
    test('plan and app rows go through the view; the verdict goes to stdout after the collapse', async () => {
        const { writes } = activeFakeTtyView();

        await runOverAppsWithReport(runArgs());

        const frames = writes.join('');
        // The plan block and both committed board app rows landed on the
        // view's stream, not on process.stdout.
        expect(frames).toContain('PLAN');
        expect(frames).toContain('Named app-1');
        expect(frames).toContain('Named app-2');

        // The collapse: restore sequence emitted, registry empty, and only
        // then the verdict - on stdout, through the ordinary board path.
        expect(frames).toContain(SHOW_CURSOR);
        expect(activeLiveView()).toBeNull();
        const stdoutJoined = stdoutWrites.join('');
        expect(stdoutJoined).toContain('app(s) ok');
        expect(frames).not.toContain('app(s) ok');

        // The plain blocks still went through the logger with the console
        // silenced - the tee'd/shipped log stays readable.
        expect(timeline).toContain('LOG(silent) PLAN');
        expect(timeline.some((line) => line.startsWith('LOG(silent) RESULT'))).toBe(true);
    });

    test('a processor throw mid-run still restores the terminal and reaches the verdict', async () => {
        const { writes } = activeFakeTtyView();

        await runOverAppsWithReport(
            runArgs({
                processApp: jest.fn(async (appId, report) => {
                    if (appId === 'app-1') {
                        throw new Error('login never completed');
                    }
                    addAppToReport(report, { id: appId, name: appId, sheetCount: 1 });
                }),
            })
        );

        expect(writes.join('')).toContain(SHOW_CURSOR);
        expect(activeLiveView()).toBeNull();
        expect(stdoutWrites.join('')).toContain('1 failed');
    });
});

describe('the live rung without an active view (the fallback split)', () => {
    test('renders exactly as the board: blocks to stdout, zero cursor sequences', async () => {
        await runOverAppsWithReport(runArgs());

        const joined = stdoutWrites.join('');
        expect(joined).toContain('PLAN');
        expect(joined).toContain('Named app-1');
        expect(joined).toContain('app(s) ok');
        expect(joined).not.toMatch(CURSOR_SEQUENCE);
    });
});

describe('startLiveRunView', () => {
    test('declines dry runs and non-live rungs without touching the terminal', () => {
        // The TTY gate itself is covered in run-live.test.js; asserting it
        // here would depend on whether this jest run's stdout happens to be
        // a terminal, which differs between CI and a developer shell.
        expect(startLiveRunView({ rung: 'live', dryRun: true })).toBeNull();
        expect(startLiveRunView({ rung: 'board', dryRun: false })).toBeNull();
        expect(stdoutWrites).toHaveLength(0);
        expect(activeLiveView()).toBeNull();
    });
});
