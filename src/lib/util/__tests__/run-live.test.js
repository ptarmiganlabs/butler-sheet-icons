import { describe, test, expect, afterEach, jest } from '@jest/globals';
import winston from 'winston';
import { createPalette } from '../colour.js';
import { UNICODE_SYMBOLS, ASCII_SYMBOLS } from '../../interactive/symbols.js';
import {
    createRunLiveView,
    activateLiveView,
    activeLiveView,
    restoreLiveTerminal,
    liveDownloadBar,
} from '../run-live.js';

/**
 * Tests for the live run view (rung C, issue #1075).
 *
 * Everything is injected - stream, palette, symbols, timer, logger - so the
 * assertions run identically on every CI runner regardless of what its
 * console claims to support. The stream is a fake TTY with fixed dimensions;
 * frames are the individual `write` calls it records.
 */

const ESC = String.fromCharCode(27);
const SHOW_CURSOR = `${ESC}[?25h`;
const HIDE_CURSOR = `${ESC}[?25l`;

/**
 * Strips every CSI sequence - colours and cursor movement alike.
 *
 * @param {string} text - Text possibly containing ANSI sequences.
 *
 * @returns {string} The text without them.
 */
const stripAnsi = (text) => text.replaceAll(new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]`, 'g'), '');

/**
 * A fake TTY stream that records each write as one frame.
 *
 * @param {object} [overrides] - Stream property overrides.
 *
 * @returns {{stream: object, writes: string[]}} The stream and its recording.
 */
const fakeTty = (overrides = {}) => {
    const writes = [];

    return {
        writes,
        stream: {
            isTTY: true,
            columns: 100,
            rows: 40,
            write: (chunk) => {
                writes.push(String(chunk));

                return true;
            },
            ...overrides,
        },
    };
};

/**
 * A manually driven frame timer, so spinner ticks happen exactly when the
 * test says so.
 *
 * @returns {{start: Function, stop: Function, tick: Function, stopped: boolean}} The timer.
 */
const manualTimer = () => {
    const timer = {
        fn: null,
        stopped: false,
        /**
         * Record the tick function instead of scheduling it.
         *
         * @param {Function} fn - Tick function.
         *
         * @returns {void}
         */
        start(fn) {
            timer.fn = fn;
        },
        /**
         * Mark the timer stopped.
         *
         * @returns {void}
         */
        stop() {
            timer.stopped = true;
        },
        /**
         * Run one tick.
         *
         * @returns {void}
         */
        tick() {
            timer.fn?.();
        },
    };

    return timer;
};

const uniCtx = () => ({ palette: createPalette(false), symbols: UNICODE_SYMBOLS });
const asciiCtx = () => ({ palette: createPalette(false), symbols: ASCII_SYMBOLS });

/**
 * A minimal report app entry of the shape `addAppToReport` produces.
 *
 * @param {object} [overrides] - Field overrides.
 *
 * @returns {object} The entry.
 */
const appEntry = (overrides = {}) => ({
    id: 'app-1',
    name: 'Executive KPIs',
    sheetCount: 3,
    sheets: [],
    failed: false,
    ...overrides,
});

afterEach(() => {
    // No test may leave a view in the process-wide registry.
    restoreLiveTerminal();
});

describe('the docker-logs regression gate', () => {
    test('a non-TTY stream gets no view and no frames, whatever the rung said', () => {
        const { stream, writes } = fakeTty({ isTTY: false });

        const view = createRunLiveView({ stream, ctx: uniCtx(), timer: manualTimer() });

        expect(view).toBeNull();
        expect(writes).toHaveLength(0);
    });

    test('a missing stream gets no view rather than a crash', () => {
        expect(createRunLiveView({ stream: undefined, ctx: uniCtx() })).toBeNull();
    });
});

describe('frames on a real TTY', () => {
    test('starting hides the cursor before anything else is written', () => {
        const { stream, writes } = fakeTty();

        createRunLiveView({ stream, ctx: uniCtx(), timer: manualTimer() });

        expect(writes[0]).toBe(HIDE_CURSOR);
    });

    test('a preflight step animates, then commits with the done glyph and its detail', () => {
        const { stream, writes } = fakeTty();
        const view = createRunLiveView({ stream, ctx: uniCtx(), timer: manualTimer() });

        view.beginStep('certificates');
        expect(writes.at(-1)).toContain('certificates');
        expect(writes.at(-1)).toContain(UNICODE_SYMBOLS.spinnerFrames[0]);

        view.stepDone('certificates', 'client.pem');
        const committed = writes.at(-1);
        expect(committed).toContain(UNICODE_SYMBOLS.done);
        expect(committed).toContain('certificates');
        expect(committed).toContain('client.pem');
    });

    test('the spinner advances on timer ticks between events', () => {
        const { stream, writes } = fakeTty();
        const timer = manualTimer();
        const view = createRunLiveView({ stream, ctx: uniCtx(), timer });

        view.beginStep('app list');
        const before = writes.at(-1);
        timer.tick();
        const after = writes.at(-1);

        expect(before).toContain(UNICODE_SYMBOLS.spinnerFrames[0]);
        expect(after).toContain(UNICODE_SYMBOLS.spinnerFrames[1]);
        expect(after).not.toBe(before);
    });

    test('a step that failed commits with the failed glyph', () => {
        const { stream, writes } = fakeTty();
        const view = createRunLiveView({ stream, ctx: uniCtx(), timer: manualTimer() });

        view.beginStep('content library');
        view.stepFailed('content library', '"missing"');

        expect(writes.at(-1)).toContain(UNICODE_SYMBOLS.failed);
        expect(writes.at(-1)).toContain('"missing"');
    });

    test('a committed step never re-animates - later begin/done calls for it are no-ops', () => {
        const { stream, writes } = fakeTty();
        const view = createRunLiveView({ stream, ctx: uniCtx(), timer: manualTimer() });

        view.beginStep('browser');
        view.stepDone('browser', 'chrome 131');
        const frameCount = writes.length;

        view.beginStep('browser');
        view.stepDone('browser', 'chrome 132');

        expect(writes).toHaveLength(frameCount);
    });
});

describe('the per-app block', () => {
    test('renders the id, then the name and sheet count once the entry is attached', () => {
        const { stream, writes } = fakeTty();
        const view = createRunLiveView({ stream, ctx: uniCtx(), timer: manualTimer() });

        view.appStarted({ n: 1, total: 2, id: 'app-1' });
        expect(stripAnsi(writes.at(-1))).toContain('app 1/2');
        expect(stripAnsi(writes.at(-1))).toContain('app-1');

        view.appOpened(appEntry());
        expect(stripAnsi(writes.at(-1))).toContain('Executive KPIs');
        expect(stripAnsi(writes.at(-1))).toContain('3 sheets');
    });

    test('shows the phase labels before the sheet loop starts', () => {
        const { stream, writes } = fakeTty();
        const view = createRunLiveView({ stream, ctx: uniCtx(), timer: manualTimer() });

        view.appStarted({ n: 1, total: 1, id: 'app-1' });
        expect(stripAnsi(writes.at(-1))).toContain('opening app');

        view.appOpened(appEntry());
        view.appPhase('browser');
        expect(stripAnsi(writes.at(-1))).toContain('launching browser');

        view.appPhase('signin');
        expect(stripAnsi(writes.at(-1))).toContain('signing in');
    });

    test('the bar and strip render from the entry the verdict counts from', () => {
        const { stream, writes } = fakeTty();
        const view = createRunLiveView({ stream, ctx: uniCtx(), timer: manualTimer() });
        const entry = appEntry();

        view.appStarted({ n: 1, total: 1, id: 'app-1' });
        view.appOpened(entry);
        view.appPhase('sheets');

        entry.sheets.push({ n: 1, title: 'Overview', action: 'update', reason: null });
        view.sheetRecorded(entry);
        entry.sheets.push({ n: 2, title: 'Board pack', action: 'blur', reason: null });
        view.sheetRecorded(entry);

        const frame = stripAnsi(writes.at(-1));
        expect(frame).toContain('2/3');
        expect(frame).toContain("'Board pack'");
        // The in-progress strip stops at the last recorded position: the
        // unreached third sheet is the future, not a failure.
        expect(frame).toContain(`${UNICODE_SYMBOLS.stripCaptured}${UNICODE_SYMBOLS.stripBlurred}`);
        expect(frame).not.toContain(UNICODE_SYMBOLS.stripFailed);
    });

    test('the in-progress strip is capped at the terminal width so it can never wrap', () => {
        // A wrapped region line breaks the cursor-up erase arithmetic for
        // every following frame - the docker-logs regression's interactive
        // cousin. 80 columns is the narrowest terminal the live rung admits.
        const { stream, writes } = fakeTty({ columns: 80 });
        const view = createRunLiveView({ stream, ctx: uniCtx(), timer: manualTimer() });
        const entry = appEntry({ sheetCount: 100 });

        view.appStarted({ n: 1, total: 1, id: 'app-1' });
        view.appOpened(entry);
        view.appPhase('sheets');
        for (let n = 1; n <= 90; n += 1) {
            entry.sheets.push({ n, title: `S${n}`, action: 'update', reason: null });
        }
        view.sheetRecorded(entry);

        const longest = Math.max(
            ...stripAnsi(writes.at(-1))
                .split('\n')
                .map((line) => line.length)
        );
        expect(longest).toBeLessThan(80);
    });

    test('an interior gap in the recorded sheets keeps the failed glyph mid-run', () => {
        const { stream, writes } = fakeTty();
        const view = createRunLiveView({ stream, ctx: uniCtx(), timer: manualTimer() });
        const entry = appEntry();

        view.appStarted({ n: 1, total: 1, id: 'app-1' });
        view.appOpened(entry);
        view.appPhase('sheets');

        // Sheet 2 never recorded - the loop survived a mid-app failure.
        entry.sheets.push({ n: 1, title: 'One', action: 'update', reason: null });
        entry.sheets.push({ n: 3, title: 'Three', action: 'update', reason: null });
        view.sheetRecorded(entry);

        expect(stripAnsi(writes.at(-1))).toContain(
            `${UNICODE_SYMBOLS.stripCaptured}${UNICODE_SYMBOLS.stripFailed}${UNICODE_SYMBOLS.stripCaptured}`
        );
    });

    test('finishing an app commits its board row and clears the block', () => {
        const { stream, writes } = fakeTty();
        const view = createRunLiveView({ stream, ctx: uniCtx(), timer: manualTimer() });
        const entry = appEntry();

        view.appStarted({ n: 1, total: 1, id: 'app-1' });
        view.appOpened(entry);
        view.appFinished(entry, 'BOARD APP ROW\n');

        const last = writes.at(-1);
        expect(last).toContain('BOARD APP ROW');
        // The region is empty after the commit: nothing re-painted below it.
        expect(last.endsWith('BOARD APP ROW\n')).toBe(true);
    });

    test('a failed app drops its pending step so a later app can still resolve the row', () => {
        // Committing the row as failed would latch it run-wide and
        // misattribute one app's timeout to the step itself (issue #1110);
        // the app's own red board row already carries the failure.
        const { stream, writes } = fakeTty();
        const view = createRunLiveView({ stream, ctx: uniCtx(), timer: manualTimer() });
        const entry = appEntry({ failed: true });

        view.appStarted({ n: 1, total: 2, id: 'app-1' });
        view.beginStep('signed in');
        view.appFinished(entry, 'FAILED ROW\n');

        expect(writes.join('')).not.toContain(`${UNICODE_SYMBOLS.failed} signed in`);
        expect(writes.join('')).toContain('FAILED ROW');

        // App 2 signs in fine and the row resolves honestly.
        view.appStarted({ n: 2, total: 2, id: 'app-2' });
        view.beginStep('signed in');
        view.stepDone('signed in', 'LAB\\user');

        expect(writes.join('')).toContain(`${UNICODE_SYMBOLS.done} signed in`);
    });
});

describe('download progress (the two-writers hazard)', () => {
    test('replaces the phase label while a download is reported, and clears after', () => {
        const { stream, writes } = fakeTty();
        const view = createRunLiveView({ stream, ctx: uniCtx(), timer: manualTimer() });

        view.appStarted({ n: 1, total: 1, id: 'app-1' });
        view.appPhase('browser');
        view.downloadProgress(42);
        expect(stripAnsi(writes.at(-1))).toContain('downloading browser 42%');

        view.downloadProgress(null);
        expect(stripAnsi(writes.at(-1))).toContain('launching browser');
    });

    test('shows the percentage on a pending browser preflight row too', () => {
        const { stream, writes } = fakeTty();
        const view = createRunLiveView({ stream, ctx: uniCtx(), timer: manualTimer() });

        view.beginStep('browser');
        view.downloadProgress(97.4);

        expect(stripAnsi(writes.at(-1))).toContain('downloading 97%');
    });

    test('a non-finite percentage falls back to the plain phase label, never NaN%', () => {
        // A download response without a Content-Length yields NaN, which the
        // suppressed cli-progress bar guards against - the view must too
        // (issue #1110).
        const { stream, writes } = fakeTty();
        const view = createRunLiveView({ stream, ctx: uniCtx(), timer: manualTimer() });

        view.appStarted({ n: 1, total: 1, id: 'app-1' });
        view.appPhase('browser');
        view.downloadProgress(NaN);

        const frame = stripAnsi(writes.at(-1));
        expect(frame).not.toContain('NaN');
        expect(frame).toContain('launching browser');
    });

    test('a repaint whose rendered frame is unchanged writes nothing', () => {
        // The per-chunk download callbacks and the frame timer otherwise
        // rewrite an identical region hundreds of times a second - on
        // conhost each one a blocking console write (issue #1110).
        const { stream, writes } = fakeTty();
        const timer = manualTimer();
        const view = createRunLiveView({ stream, ctx: uniCtx(), timer });
        const entry = appEntry();

        view.appStarted({ n: 1, total: 1, id: 'app-1' });
        view.appOpened(entry);
        view.appPhase('sheets');
        entry.sheets.push({ n: 1, title: 'One', action: 'update', reason: null });
        view.sheetRecorded(entry);

        // The sheets-phase frame has no spinner, so ticks change nothing.
        const frameCount = writes.length;
        timer.tick();
        timer.tick();
        expect(writes).toHaveLength(frameCount);

        // Same rounded percentage: one write, not one per chunk.
        view.appPhase('browser');
        view.downloadProgress(42.2);
        const afterFirstPct = writes.length;
        view.downloadProgress(42.4);
        expect(writes).toHaveLength(afterFirstPct);
    });

    test('liveDownloadBar adapts the cli-progress surface onto the view', () => {
        const view = { downloadProgress: jest.fn() };
        const bar = liveDownloadBar(view);

        bar.start(100, 0);
        bar.update(55);
        bar.stop();

        expect(view.downloadProgress.mock.calls).toEqual([[0], [55], [null]]);
    });
});

describe('terminal restore', () => {
    test('stop erases the region, shows the cursor, and is idempotent', () => {
        const { stream, writes } = fakeTty();
        const view = createRunLiveView({ stream, ctx: uniCtx(), timer: manualTimer() });

        view.beginStep('certificates');
        view.stop();

        expect(writes.at(-1)).toContain(SHOW_CURSOR);

        const frameCount = writes.length;
        view.stop();
        view.beginStep('late');
        view.appStarted({ n: 1, total: 1, id: 'x' });

        // Nothing is written after stop - not by a second stop, not by
        // late events from an in-flight promise.
        expect(writes).toHaveLength(frameCount);
    });

    test('stop stops the spinner timer', () => {
        const { stream } = fakeTty();
        const timer = manualTimer();
        const view = createRunLiveView({ stream, ctx: uniCtx(), timer });

        view.stop();

        expect(timer.stopped).toBe(true);
    });

    test('restoreLiveTerminal emits the restore sequence on the throw path', () => {
        const { stream, writes } = fakeTty();
        const view = createRunLiveView({ stream, ctx: uniCtx(), timer: manualTimer() });
        activateLiveView(view);
        view.beginStep('signed in');

        // Simulating a worker catch block: no orderly stop happened.
        restoreLiveTerminal();

        expect(writes.at(-1)).toContain(SHOW_CURSOR);
        expect(activeLiveView()).toBeNull();
    });

    test('restoreLiveTerminal never throws, even over a view whose stop throws', () => {
        activateLiveView({
            stop: () => {
                throw new Error('stream already gone');
            },
        });

        expect(() => restoreLiveTerminal()).not.toThrow();
        expect(activeLiveView()).toBeNull();
    });

    test('a view stream that throws on write still restores the console side', () => {
        const consoleTransport = { name: 'console', silent: false };
        const log = {
            transports: [consoleTransport],
            add: jest.fn(),
            remove: jest.fn(),
        };
        const { stream } = fakeTty();
        const view = createRunLiveView({ stream, ctx: uniCtx(), log, timer: manualTimer() });

        stream.write = () => {
            throw new Error('EPIPE');
        };

        expect(() => view.stop()).not.toThrow();
        expect(consoleTransport.silent).toBe(false);
        expect(log.remove).toHaveBeenCalled();
    });

    test('activating a second view stops the first - two views can never share the cursor', () => {
        const first = { stop: jest.fn() };
        const second = { stop: jest.fn() };

        activateLiveView(first);
        activateLiveView(second);

        expect(first.stop).toHaveBeenCalled();
        expect(activeLiveView()).toBe(second);
    });
});

describe('committed log lines', () => {
    test('a multi-line message commits in one write, with the timestamp on the first line only', () => {
        const { stream, writes } = fakeTty();
        const view = createRunLiveView({ stream, ctx: uniCtx(), timer: manualTimer() });

        const frameCount = writes.length;
        view.commitLogLine('error', 'boom\n  at somewhere\n  at elsewhere', '2026-08-18T09:00:00Z');

        expect(writes).toHaveLength(frameCount + 1);
        const text = stripAnsi(writes.at(-1));
        expect(text).toContain('2026-08-18T09:00:00Z error: boom');
        expect(text).toContain('at somewhere');
        // The stamp appears once, not once per line.
        expect(text.match(/2026-08-18T09:00:00Z/g)).toHaveLength(1);
    });

    test('a newline-terminated message commits no stray bare level line', () => {
        const { stream, writes } = fakeTty();
        const view = createRunLiveView({ stream, ctx: uniCtx(), timer: manualTimer() });

        view.commitLogLine('error', 'boom\n');

        const lines = stripAnsi(writes.at(-1)).split('\n');
        expect(lines.filter((line) => line.trim() === 'error:')).toHaveLength(0);
    });
});

describe('console routing through a real winston logger', () => {
    test('silences the console transport, commits warn and error lines, drops info, restores on stop', () => {
        const consoleTransport = new winston.transports.Console({ level: 'info' });
        consoleTransport.name = 'console';
        const log = winston.createLogger({
            level: 'silly',
            format: winston.format.printf((info) => String(info.message)),
            transports: [consoleTransport],
        });

        const { stream, writes } = fakeTty();
        const view = createRunLiveView({ stream, ctx: uniCtx(), log, timer: manualTimer() });

        expect(consoleTransport.silent).toBe(true);

        log.warn('tag not supported here');
        log.error('sheet 4 failed');
        log.info('routine progress line');

        const joined = stripAnsi(writes.join(''));
        expect(joined).toContain('warn: tag not supported here');
        expect(joined).toContain('error: sheet 4 failed');
        expect(joined).not.toContain('routine progress line');

        view.stop();
        expect(consoleTransport.silent).toBe(false);
        // The private routing transport is gone again.
        expect(log.transports).toHaveLength(1);
    });
});

describe('the ASCII symbol set', () => {
    test('pending and committed step rows share a label column despite marker widths', () => {
        // ASCII spinner frames are 1 column while [ok]/[!!] are 4; without
        // marker padding a row jumped three columns when it resolved
        // (issue #1110).
        const { stream, writes } = fakeTty();
        const view = createRunLiveView({ stream, ctx: asciiCtx(), timer: manualTimer() });

        view.beginStep('certificates');
        const pendingCol = stripAnsi(writes.at(-1)).indexOf('certificates');
        view.stepDone('certificates', 'client.pem');
        const committedCol = stripAnsi(writes.at(-1)).indexOf('certificates');

        expect(pendingCol).toBeGreaterThan(0);
        expect(committedCol).toBe(pendingCol);
    });

    test('a full flow emits only ASCII outside the control sequences', () => {
        const { stream, writes } = fakeTty();
        const view = createRunLiveView({ stream, ctx: asciiCtx(), timer: manualTimer() });
        const entry = appEntry();

        view.beginStep('certificates');
        view.stepDone('certificates', 'client.pem');
        view.appStarted({ n: 1, total: 1, id: 'app-1' });
        view.appOpened(entry);
        view.appPhase('sheets');
        entry.sheets.push({ n: 1, title: 'Overview', action: 'update', reason: null });
        view.sheetRecorded(entry);
        view.appFinished(entry, 'ROW\n');
        view.stop();

        const text = stripAnsi(writes.join(''));
        for (const ch of text) {
            expect(ch.codePointAt(0)).toBeLessThan(128);
        }
    });
});
