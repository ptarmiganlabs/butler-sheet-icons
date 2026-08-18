import { describe, test, expect, jest } from '@jest/globals';
import {
    createRunReport,
    recordSelection,
    addAppToReport,
    recordSheetDecision,
    renderDryRunReport,
} from '../run-report.js';
import { renderRunPlanLines, renderRunVerdictLines } from '../run-report-render.js';
import { EXCLUDE_REASON, BLUR_REASON, CLEAR_REASON } from '../sheet-decision-reasons.js';

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

/**
 * A removal report over one app whose sheets carry icons, plus one that never
 * had one - the shape that made the two counting rules disagree (issue #1115).
 *
 * @returns {object} The report.
 */
const removalReport = () => {
    const report = createRunReport({ command: 'qseow remove-sheet-icons', dryRun: true });
    recordSelection(report, { namedAppIds: ['app-1'], selectorAppIds: [], selector: null });

    const app = addAppToReport(report, { id: 'app-1', name: 'Finance operations', sheetCount: 3 });
    recordSheetDecision(app, {
        n: 1,
        title: 'Never themed',
        action: 'clear',
        reason: CLEAR_REASON.NO_ICON,
    });
    recordSheetDecision(app, { n: 2, title: 'Overview', action: 'clear' });
    recordSheetDecision(app, { n: 3, title: 'Sales detail', action: 'clear' });

    return report;
};

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
            reason: CLEAR_REASON.NO_ICON,
        });

        const log = fakeLogger();
        renderDryRunReport(report, log);

        const text = log.text();
        expect(text).toContain('1 icon(s) would be cleared, 1 with no icon, 0 skipped.');
        expect(text).toContain('(no icon currently set)');
    });

    test('a no-op clear is not counted as an icon that would be cleared (issue #1115)', () => {
        // The summary used to bucket on sheet.action alone, so this report's
        // three rows summarised as "3 icon(s) would be cleared" - two lines
        // below a row that said the first sheet had no icon to clear.
        const log = fakeLogger();
        renderDryRunReport(removalReport(), log);

        const text = log.text();
        expect(text).toMatch(/Never themed\s+clear icon {2}\(no icon currently set\)/);
        expect(text).toContain(
            'Summary: 1 app(s), 3 sheets. 2 icon(s) would be cleared, 1 with no icon, 0 skipped.'
        );
    });

    test('the plan and the verdict split the same rows the same way (issue #1115)', () => {
        // The property the fix is really about: whatever the plan promises for
        // a set of rows, the run's verdict must report for those same rows.
        // Both now count through verdictCounts, so a future counting rule
        // added to one board reaches the other - and this test fails if a
        // second loop is ever reintroduced.
        const report = removalReport();

        const log = fakeLogger();
        renderDryRunReport(report, log);

        report.succeeded = true;
        const verdict = renderRunVerdictLines(report).join('\n');

        expect(log.text()).toContain('2 icon(s) would be cleared, 1 with no icon');
        expect(verdict).toContain('3 seen, 2 icon(s) cleared, 1 had no icon');
    });

    test('a removal with nothing left to clear says so rather than claiming a sweep', () => {
        // The state a second removal run finds (issue #1113): every row is a
        // no-op clear, and the summary must not promise a removal.
        const report = createRunReport({ command: 'qseow remove-sheet-icons', dryRun: true });
        recordSelection(report, { namedAppIds: ['app-1'], selectorAppIds: [], selector: null });
        const app = addAppToReport(report, { id: 'app-1', sheetCount: 2 });
        recordSheetDecision(app, {
            n: 1,
            title: 'Main',
            action: 'clear',
            reason: CLEAR_REASON.NO_ICON,
        });
        recordSheetDecision(app, {
            n: 2,
            title: 'Notes',
            action: 'clear',
            reason: CLEAR_REASON.NO_ICON,
        });

        const log = fakeLogger();
        renderDryRunReport(report, log);

        expect(log.text()).toContain(
            'Summary: 1 app(s), 2 sheets. 0 icon(s) would be cleared, 2 with no icon, 0 skipped.'
        );
    });

    test('output is plain ASCII so it survives any console', () => {
        const log = fakeLogger();
        renderDryRunReport(sampleReport(), log);

        expect(/^[\x20-\x7e\n]*$/.test(log.text())).toBe(true);
    });
});
