import { describe, test, expect } from '@jest/globals';
import { getBorderCharacters } from 'table';
import { createPalette } from '../colour.js';
import { UNICODE_SYMBOLS, ASCII_SYMBOLS } from '../../interactive/symbols.js';
import {
    renderBoardHeader,
    renderBoardPlan,
    renderBoardAppRow,
    renderBoardVerdict,
    stripForApp,
} from '../run-board.js';

/**
 * Tests for the contact-sheet renderer (issue #1074).
 *
 * Everything is injected - palette, symbols, borders, report - so the same
 * assertions run identically on every CI runner regardless of what its
 * console claims to support.
 */

const uniCtx = (colour = false) => ({
    palette: createPalette(colour),
    symbols: UNICODE_SYMBOLS,
    border: getBorderCharacters('norc'),
});

const asciiCtx = (colour = false) => ({
    palette: createPalette(colour),
    symbols: ASCII_SYMBOLS,
    border: getBorderCharacters('ramac'),
});

// Built from a char code rather than written as a literal, so the escape
// character does not appear in the source (no-control-regex) - same pattern
// as theme.test.js.
const ESC = String.fromCharCode(27);
const stripAnsi = (text) => text.replaceAll(new RegExp(`${ESC}\\[[0-9;]*m`, 'g'), '');

const ANSI = new RegExp(`${ESC}\\[`);

/**
 * A realistic thumbnail-run report: three apps, one with a blur match, one
 * with none, one failed halfway.
 *
 * @returns {object} The report.
 */
const makeReport = () => ({
    command: 'qseow create-sheet-thumbnails',
    dryRun: false,
    selection: {
        named: 1,
        fromSelector: 3,
        selector: { option: 'qliksensetag', value: 'updateSheetThumbnails' },
        total: 3,
    },
    plan: {
        target: {
            platform: 'qseow',
            host: 'sense.example.com',
            port: null,
            secure: true,
            prefix: '',
            enginePort: '4747',
            qrsPort: '4242',
            schemaVersion: '12.612.0',
        },
        auth: {
            apiUser: { directory: 'INTERNAL', userId: 'sa_api' },
            certFile: './cert/client.pem',
            logonUser: { directory: 'COMPANY', userId: 'svc_bsi' },
        },
        sheetPart: { value: '2', max: '4', label: 'objects + sheet title' },
        rules: {
            exclude: [
                { option: 'exclude-sheet-tag', values: ['no-thumbnail'], matchedSheetCount: 1 },
            ],
            blur: [{ option: 'blur-sheet-tag', values: ['confidential'], matchedSheetCount: 2 }],
        },
        browser: { name: 'chrome', version: 'recommended', headless: true, pageWaitSeconds: 5 },
        output: { imageDir: './img', platformDir: 'qseow' },
        writes: {
            kind: 'thumbnails',
            contentLibrary: 'Butler sheet thumbnails',
            publishedAppCount: 2,
        },
    },
    apps: [
        {
            id: 'app-1',
            name: 'Sales Discovery',
            sheetCount: 4,
            sheets: [
                { n: 1, title: 'Overview', action: 'update', reason: null },
                { n: 2, title: 'Secrets', action: 'blur', reason: 'blur-sheet-tag' },
                { n: 3, title: 'Old', action: 'skip', reason: 'exclude-sheet-tag' },
                { n: 4, title: 'Trends', action: 'update', reason: null },
            ],
            mediaFilesToDelete: null,
            failed: false,
            sheetsUpdated: 3,
            imagesKeptFiles: 3,
            imagesKeptBytes: 200000,
            durationMs: 52000,
        },
        {
            id: 'app-2',
            name: 'Operations Monitor',
            sheetCount: 2,
            sheets: [
                { n: 1, title: 'Board', action: 'update', reason: null },
                { n: 2, title: 'Detail', action: 'update', reason: null },
            ],
            mediaFilesToDelete: null,
            failed: false,
            sheetsUpdated: 2,
            imagesKeptFiles: 2,
            imagesKeptBytes: 150000,
            durationMs: 41000,
        },
        {
            id: 'app-3',
            name: 'Broken App',
            sheetCount: 3,
            sheets: [{ n: 1, title: 'Only', action: 'update', reason: null }],
            mediaFilesToDelete: null,
            failed: true,
            durationMs: 12000,
        },
    ],
    startedAt: 0,
    finishedAt: 372000,
    succeeded: false,
});

const renderWholeBoard = (report, ctx) =>
    renderBoardHeader({ version: '9.9.9-test', jobLabel: 'QSEoW sheet thumbnails' }, ctx) +
    renderBoardPlan(report, ctx) +
    report.apps
        .map((app, i) =>
            renderBoardAppRow(app, { n: i + 1, total: report.apps.length, removal: false }, ctx)
        )
        .join('') +
    renderBoardVerdict(report, ctx);

describe('the sheet strip', () => {
    test('every strip glyph is exactly one column in both symbol sets', () => {
        for (const symbols of [UNICODE_SYMBOLS, ASCII_SYMBOLS]) {
            for (const name of ['stripCaptured', 'stripBlurred', 'stripExcluded', 'stripFailed']) {
                expect(`${name}: ${[...symbols[name]].length}`).toBe(`${name}: 1`);
            }
        }
    });

    test('the strip has the same display width in both symbol sets, per app', () => {
        // The property that breaks columns when it regresses (issue #1074).
        for (const app of makeReport().apps) {
            const uni = stripForApp(app, UNICODE_SYMBOLS);
            const ascii = stripForApp(app, ASCII_SYMBOLS);

            expect([...uni.map((cell) => cell.glyph).join('')]).toHaveLength(
                [...ascii.map((cell) => cell.glyph).join('')].length
            );
        }
    });

    test('a zero-match blur tag produces a strip with no blur glyph - per app, not only in totals', () => {
        const report = makeReport();

        for (const [i, app] of report.apps.entries()) {
            const hasBlurDecision = app.sheets.some((sheet) => sheet.action === 'blur');
            for (const ctx of [uniCtx(), asciiCtx()]) {
                const row = renderBoardAppRow(
                    app,
                    { n: i + 1, total: report.apps.length, removal: false },
                    ctx
                );

                expect(`app ${app.id}: ${row.includes(ctx.symbols.stripBlurred)}`).toBe(
                    `app ${app.id}: ${hasBlurDecision}`
                );
            }
        }
    });

    test('a failed app pads the unrecorded tail of its strip with the failed glyph', () => {
        const failed = makeReport().apps[2];
        const cells = stripForApp(failed, UNICODE_SYMBOLS);

        expect(cells).toHaveLength(3);
        expect(cells.map((cell) => cell.kind)).toEqual(['captured', 'failed', 'failed']);
    });
});

describe('colour discipline', () => {
    test('an inert palette produces no ANSI codes anywhere on the board', () => {
        for (const ctx of [uniCtx(false), asciiCtx(false)]) {
            expect(ANSI.test(renderWholeBoard(makeReport(), ctx))).toBe(false);
        }
    });

    test('colour changes nothing but the codes: stripping ANSI restores the plain render', () => {
        // This is the pad-the-plain-string-first property. A renderer that
        // padded after colouring would count escape codes as width, and the
        // difference shows up here as shifted columns.
        expect(stripAnsi(renderWholeBoard(makeReport(), uniCtx(true)))).toBe(
            renderWholeBoard(makeReport(), uniCtx(false))
        );
        expect(stripAnsi(renderWholeBoard(makeReport(), asciiCtx(true)))).toBe(
            renderWholeBoard(makeReport(), asciiCtx(false))
        );
    });

    test('the ASCII set with an inert palette is pure ASCII end to end', () => {
        // The frame, bullets, strip and separators must all degrade; app
        // names are user data, and this fixture keeps them ASCII on purpose
        // so one stray box-drawing character cannot hide behind them.
        expect(renderWholeBoard(makeReport(), asciiCtx(false))).toMatch(/^[\x20-\x7e\n]*$/);
    });
});

describe('the wordmark frame', () => {
    test('carries the version and the job label inside the frame', () => {
        const frame = renderBoardHeader(
            { version: '9.9.9-test', jobLabel: 'QSEoW sheet thumbnails' },
            uniCtx()
        );

        expect(frame).toContain('BUTLER SHEET ICONS');
        expect(frame).toContain('9.9.9-test');
        expect(frame).toContain('QSEoW sheet thumbnails');
        expect(frame).toContain('410 × 270');
    });

    test('every frame line is the same width, both sets, colour on or off', () => {
        for (const ctx of [uniCtx(true), uniCtx(false), asciiCtx(true), asciiCtx(false)]) {
            const lines = stripAnsi(
                renderBoardHeader(
                    { version: '9.9.9-test', jobLabel: 'QSEoW sheet thumbnails' },
                    ctx
                )
            )
                .split('\n')
                .filter((line) => line.trim() !== '');

            const widths = new Set(lines.map((line) => [...line].length));
            expect([...widths]).toHaveLength(1);
        }
    });
});

describe('the plan block', () => {
    test('renders nothing without a plan, mirroring the plain renderer', () => {
        expect(renderBoardPlan({ plan: null, selection: null, apps: [] }, uniCtx())).toBe('');
    });

    test('states the rules with their match counts, zeroes included', () => {
        const report = makeReport();
        report.plan.rules.blur = [
            { option: 'blur-sheet-tag', values: ['confidential'], matchedSheetCount: 0 },
        ];

        const plan = renderBoardPlan(report, uniCtx());

        expect(plan).toContain('tag "no-thumbnail" (1 sheets)');
        expect(plan).toContain('tag "confidential" (0 sheets)');
    });

    test('warns about the writes, published count included, and marks a dry run', () => {
        const real = renderBoardPlan(makeReport(), uniCtx());
        expect(real).toContain(
            'sheet thumbnails will be overwritten in 3 app(s), 2 of them published'
        );

        const dry = { ...makeReport(), dryRun: true };
        const dryPlan = renderBoardPlan(dry, uniCtx());
        expect(dryPlan).toContain('(dry run)');
        expect(dryPlan).toContain('would be overwritten');
    });

    test('suppresses the writes warning for an empty selection', () => {
        const report = makeReport();
        report.selection = { named: 0, fromSelector: 0, selector: null, total: 0 };
        report.apps = [];

        expect(renderBoardPlan(report, uniCtx())).not.toContain('overwritten');
    });
});

describe('the verdict block', () => {
    test('counts from the recorded sheets and names the failure', () => {
        const verdict = stripAnsi(renderBoardVerdict(makeReport(), uniCtx()));

        expect(verdict).toContain('FAILED');
        expect(verdict).toContain('2 app(s) ok');
        expect(verdict).toContain('1 failed');
        expect(verdict).toContain('5 thumbnails uploaded');
        expect(verdict).toContain('6 captured');
        expect(verdict).toContain('1 blurred');
        expect(verdict).toContain('1 excluded');
        expect(verdict).toContain('images in ./img/qseow');
    });

    test('a clean run reads done with its elapsed time', () => {
        const report = makeReport();
        report.apps = report.apps.slice(0, 2);
        report.succeeded = true;

        const verdict = stripAnsi(renderBoardVerdict(report, uniCtx()));

        expect(verdict).toContain('done in 6m 12s');
        expect(verdict).not.toContain('FAILED');
    });

    test('an empty selection is a red flag, not a summary', () => {
        const report = makeReport();
        report.selection = { named: 0, fromSelector: 0, selector: null, total: 0 };
        report.apps = [];

        expect(stripAnsi(renderBoardVerdict(report, uniCtx()))).toContain(
            '0 apps selected - nothing was done'
        );
    });

    test('a removal run speaks remove vocabulary', () => {
        const report = makeReport();
        report.command = 'qscloud remove-sheet-icons';
        report.apps = [
            {
                id: 'app-1',
                name: 'Cleaned App',
                sheetCount: 2,
                sheets: [
                    { n: 1, title: 'One', action: 'clear', reason: null },
                    { n: 2, title: 'Two', action: 'clear', reason: 'no icon currently set' },
                ],
                mediaFilesToDelete: null,
                failed: false,
                durationMs: 9000,
            },
        ];
        report.succeeded = true;

        const verdict = stripAnsi(renderBoardVerdict(report, uniCtx()));

        expect(verdict).toContain('icon(s) cleared');
        expect(verdict).not.toContain('thumbnails uploaded');
    });
});
