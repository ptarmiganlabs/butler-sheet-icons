import { describe, test, expect, jest } from '@jest/globals';
import {
    createRunReport,
    recordSelection,
    addAppToReport,
    recordSheetDecision,
    reportTotals,
    renderDryRunReport,
} from '../run-report.js';
import { renderRunPlanLines } from '../run-report-render.js';
import { EXCLUDE_REASON, BLUR_REASON } from '../sheet-decision-reasons.js';

const fakeLogger = () => {
    const lines = [];

    return {
        lines,
        info: jest.fn((line) => lines.push(String(line))),
        text: () => lines.join('\n'),
    };
};

/**
 * A report with one app and one of every decision kind.
 *
 * @returns {object} The report.
 */
const sampleReport = () => {
    const report = createRunReport({ command: 'qseow create-sheet-thumbnails', dryRun: true });
    recordSelection(report, {
        namedAppIds: ['app-1', 'app-7'],
        selectorAppIds: ['app-1', 'app-2', 'app-3', 'app-4', 'app-5', 'app-6'],
        selector: { option: 'qliksensetag', value: 'sheet-thumbnails' },
    });

    const app = addAppToReport(report, { id: 'app-1', name: 'Finance operations', sheetCount: 4 });
    recordSheetDecision(app, { n: 1, title: 'Overview', action: 'update' });
    recordSheetDecision(app, {
        n: 2,
        title: 'Sales detail',
        action: 'blur',
        reason: BLUR_REASON.STATUS_PUBLISHED,
    });
    recordSheetDecision(app, {
        n: 3,
        title: 'Scratch',
        action: 'skip',
        reason: EXCLUDE_REASON.STATUS_PRIVATE,
    });
    recordSheetDecision(app, {
        n: 4,
        title: 'KPI summary',
        action: 'skip',
        reason: EXCLUDE_REASON.HIDDEN,
    });

    return report;
};

describe('reportTotals', () => {
    test('totals are derived from the rows, one per action kind', () => {
        expect(reportTotals(sampleReport())).toEqual({
            apps: 1,
            sheets: 4,
            update: 1,
            blur: 1,
            skip: 2,
            clear: 0,
        });
    });

    test('an empty report totals to zeroes', () => {
        expect(reportTotals(createRunReport({ command: 'x', dryRun: true }))).toEqual({
            apps: 0,
            sheets: 0,
            update: 0,
            blur: 0,
            skip: 0,
            clear: 0,
        });
    });
});

describe('renderDryRunReport', () => {
    test('names the responsible option next to every non-default decision', () => {
        const log = fakeLogger();
        renderDryRunReport(sampleReport(), log);

        const text = log.text();
        expect(text).toContain(
            'DRY RUN of qseow create-sheet-thumbnails - nothing will be changed'
        );
        expect(text).toContain('(--blur-sheet-status published)');
        expect(text).toContain('(--exclude-sheet-status private)');
        expect(text).toContain('(hidden by show condition)');
        // The default action carries no parenthetical - a reason on every row
        // would bury the ones that matter.
        expect(text).toMatch(/Overview\s+update\n/);
    });

    test('the selection provenance lives in the plan block, not the dry-run report', () => {
        // Moved with #1073: the PLAN block renders the provenance before the
        // app loop, and the dry-run report must not state it a second time.
        const report = sampleReport();
        report.plan = {};

        expect(renderRunPlanLines(report).join('\n')).toContain(
            'apps          7   2 named by --appid, 6 matched by --qliksensetag "sheet-thumbnails", 1 selected twice'
        );

        const log = fakeLogger();
        renderDryRunReport(report, log);
        expect(log.text()).not.toContain('App selection:');
    });

    test('summarises and says how to apply when every selected app was planned', () => {
        // The invite to apply is only earned by a complete plan, so this
        // report's selection matches its planned apps exactly.
        const report = sampleReport();
        recordSelection(report, { namedAppIds: ['app-1'], selectorAppIds: [], selector: null });

        const log = fakeLogger();
        renderDryRunReport(report, log);

        const text = log.text();
        expect(text).toContain(
            'Summary: 1 app(s), 4 sheets. 2 would be updated (1 blurred), 2 skipped.'
        );
        expect(text).toContain('Nothing was changed. Re-run without --dry-run to apply.');
    });

    test('an incomplete plan withholds the apply invite', () => {
        // sampleReport's selection names 7 apps but only one was planned -
        // the report must say so and must not invite applying it.
        const log = fakeLogger();
        renderDryRunReport(sampleReport(), log);

        const text = log.text();
        expect(text).toContain('6 app(s) could not be fully planned');
        expect(text).toContain('Fix the errors above before applying');
        expect(text).not.toContain('Re-run without --dry-run to apply.');
    });

    test('clear-mode reports cleared icons instead of updates', () => {
        const report = createRunReport({ command: 'qscloud remove-sheet-icons', dryRun: true });
        const app = addAppToReport(report, { id: 'app-2', sheetCount: 2 });
        recordSheetDecision(app, { n: 1, title: 'Main', action: 'clear' });
        recordSheetDecision(app, {
            n: 2,
            title: 'Notes',
            action: 'clear',
            reason: 'no icon currently set',
        });

        const log = fakeLogger();
        renderDryRunReport(report, log);

        const text = log.text();
        expect(text).toContain('2 icon(s) would be cleared');
        expect(text).toContain('(no icon currently set)');
    });

    test('output is plain ASCII so it survives any console', () => {
        const log = fakeLogger();
        renderDryRunReport(sampleReport(), log);

        expect(/^[\x20-\x7e\n]*$/.test(log.text())).toBe(true);
    });
});
