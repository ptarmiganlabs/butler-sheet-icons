import { describe, test, expect } from '@jest/globals';
import {
    RUN_FRAME,
    renderRunHeaderLines,
    logRunHeader,
    renderRunPlanLines,
    renderRunVerdictLines,
    appProgressLine,
    sheetProgressLine,
    formatElapsed,
    formatBytes,
    isOptionEnabled,
    verdictFacts,
    appCountSummary,
} from '../run-report-render.js';
import {
    createRunReport,
    recordSelection,
    addAppToReport,
    buildSheetRules,
} from '../run-report.js';
import { EXCLUDE_REASON, BLUR_REASON, CLEAR_REASON } from '../sheet-decision-reasons.js';

/**
 * The frame-only ASCII property from issue #1073, scoped per the comment on
 * that issue: everything the renderer itself emits must be plain ASCII, while
 * app and sheet names are user data and pass through untouched.
 */
const PURE_ASCII = /^[\x20-\x7e\n]*$/;

/**
 * A representative QSEoW create report, mirroring the shape the worker
 * assembles: tag rules with match counts (one of them zero - the anti-#840
 * number), a published-app count, and the content library destination.
 *
 * @param {object} [overrides] - Report fields to override.
 *
 * @returns {object} The report.
 */
const qseowReport = (overrides = {}) => {
    const report = createRunReport({ command: 'qseow create-sheet-thumbnails', dryRun: false });
    recordSelection(report, {
        namedAppIds: ['app-1', 'app-7'],
        selectorAppIds: ['app-1', 'app-2', 'app-3', 'app-4', 'app-5', 'app-6'],
        selector: { option: 'qliksensetag', value: 'sheet-thumbnails' },
    });
    report.plan = {
        target: {
            platform: 'qseow',
            host: 'qs-prod-1.company.com',
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
            logonUser: { directory: 'COMPANY', userId: 'bsi_svc' },
        },
        sheetPart: { value: '2', max: '4', label: 'objects + sheet title' },
        rules: {
            exclude: [
                { option: 'exclude-sheet-tag', values: ['no-thumbnail'], matchedSheetCount: 0 },
                { option: 'exclude-sheet-number', values: ['1'], matchedSheetCount: null },
            ],
            blur: [{ option: 'blur-sheet-tag', values: ['confidential'], matchedSheetCount: 3 }],
        },
        browser: {
            name: 'chrome',
            version: 'recommended',
            headless: true,
            pageWaitSeconds: 5,
        },
        output: { imageDir: './img', platformDir: 'qseow' },
        writes: {
            kind: 'thumbnails',
            contentLibrary: 'Butler sheet thumbnails',
            publishedAppCount: 6,
        },
    };

    return Object.assign(report, overrides);
};

describe('renderRunHeaderLines / logRunHeader', () => {
    test('frames the version and job label', () => {
        expect(renderRunHeaderLines('9.9.9', 'QSEoW sheet thumbnails')).toEqual([
            RUN_FRAME,
            ' BUTLER SHEET ICONS 9.9.9 -- QSEoW sheet thumbnails',
            RUN_FRAME,
        ]);
    });

    test('logRunHeader writes each line through the given logger at info', () => {
        const lines = [];
        logRunHeader({ info: (line) => lines.push(line) }, '9.9.9', 'browser install');

        expect(lines).toHaveLength(3);
        expect(lines[1]).toBe(' BUTLER SHEET ICONS 9.9.9 -- browser install');
    });
});

describe('renderRunPlanLines - QSEoW create', () => {
    test('renders every section of a representative plan', () => {
        expect(renderRunPlanLines(qseowReport())).toEqual([
            '',
            'PLAN',
            '  server        qs-prod-1.company.com   https, no virtual proxy',
            '                engine 4747, qrs 4242, schema 12.612.0',
            '  api user      INTERNAL\\sa_api via ./cert/client.pem',
            '  logon user    COMPANY\\bsi_svc',
            '  apps          7   2 named by --appid, 6 matched by --qliksensetag "sheet-thumbnails", 1 selected twice',
            '  sheet part    2 of 4 -- objects + sheet title',
            '  exclude       tag "no-thumbnail" (0 sheets), number 1',
            '  blur          tag "confidential" (3 sheets)',
            '  browser       chrome (version: recommended), headless, 5s per sheet',
            '  images        ./img/qseow/<app-id>',
            '  uploads to    content library "Butler sheet thumbnails"',
            '  WILL OVERWRITE existing sheet thumbnails in 7 app(s), 6 of them published',
        ]);
    });

    test('a zero-match tag count is printed, not omitted', () => {
        // The one number that matters most: a renderer that silently dropped
        // "(0 sheets)" would reintroduce the silent no-op from #840.
        expect(renderRunPlanLines(qseowReport()).join('\n')).toContain(
            'tag "no-thumbnail" (0 sheets)'
        );
    });

    test('a dry run says WOULD, a real run says WILL', () => {
        expect(renderRunPlanLines(qseowReport()).join('\n')).toContain('WILL OVERWRITE');
        expect(renderRunPlanLines(qseowReport({ dryRun: true })).join('\n')).toContain(
            'WOULD OVERWRITE'
        );
    });

    test('absent rules are stated as none rather than omitted', () => {
        const report = qseowReport();
        report.plan.rules = { exclude: [], blur: [] };

        const text = renderRunPlanLines(report).join('\n');
        expect(text).toContain('exclude       none');
        expect(text).toContain('blur          none');
    });

    test('a report without a plan renders nothing', () => {
        const report = createRunReport({ command: 'x', dryRun: false });

        expect(renderRunPlanLines(report)).toEqual([]);
    });

    test('port and virtual proxy render when set', () => {
        const report = qseowReport();
        report.plan.target.port = '8443';
        report.plan.target.prefix = 'form';

        expect(renderRunPlanLines(report).join('\n')).toContain(
            'qs-prod-1.company.com:8443   https, virtual proxy "form"'
        );
    });

    test('the headless label follows the launch semantics: unknown values mean headless', () => {
        // The launch path (parseHeadlessOption) treats everything except an
        // explicit false as headless. The plan must say what the launch will
        // do, not apply a stricter rule of its own.
        for (const value of ['1', 'yes', 'TRUE', '', undefined]) {
            const report = qseowReport();
            report.plan.browser.headless = value;
            expect(renderRunPlanLines(report).join('\n')).toContain('headless');
            expect(renderRunPlanLines(report).join('\n')).not.toContain('visible window');
        }

        const report = qseowReport();
        report.plan.browser.headless = 'false';
        expect(renderRunPlanLines(report).join('\n')).toContain('visible window');
    });

    test('an empty selection suppresses the overwrite warning', () => {
        // "WILL OVERWRITE ... 0 app(s)" in capitals right before the no-apps
        // error would describe a write that was never possible.
        const report = qseowReport();
        recordSelection(report, { namedAppIds: [], selectorAppIds: [], selector: null });

        const text = renderRunPlanLines(report).join('\n');
        expect(text).not.toContain('OVERWRITE');
        expect(text).not.toContain('uploads to');
    });
});

describe('renderRunPlanLines - Cloud', () => {
    test('renders tenant, API key auth and the media-library destination', () => {
        const report = createRunReport({
            command: 'qscloud create-sheet-thumbnails',
            dryRun: false,
        });
        recordSelection(report, {
            namedAppIds: ['app-a'],
            selectorAppIds: [],
            selector: null,
        });
        report.plan = {
            target: { platform: 'cloud', tenantUrl: 'tenant.eu.qlikcloud.com' },
            auth: { apiKey: true, logonUserId: 'bsi@company.com', skipLogin: false },
            sheetPart: { value: '1', max: '4', label: 'sheet objects only' },
            rules: buildSheetRules({ excludeSheetStatus: ['private'] }),
            browser: {
                name: 'chrome',
                version: 'recommended',
                headless: 'true',
                pageWaitSeconds: 5,
            },
            output: { imageDir: './img', platformDir: 'cloud' },
            writes: { kind: 'thumbnails', contentLibrary: null, publishedAppCount: null },
        };

        expect(renderRunPlanLines(report)).toEqual([
            '',
            'PLAN',
            '  tenant        tenant.eu.qlikcloud.com',
            '  auth          API key',
            '  logon user    bsi@company.com',
            '  apps          1   1 named by --appid',
            '  sheet part    1 of 4 -- sheet objects only',
            '  exclude       status private',
            '  blur          none',
            '  browser       chrome (version: recommended), headless, 5s per sheet',
            '  images        ./img/cloud/<app-id>',
            '  uploads to    each app\'s media library, "thumbnails" folder',
            '  WILL OVERWRITE existing sheet thumbnails in 1 app(s)',
        ]);
    });

    test('remove-sheet-icons plans the removal warning and skips the thumbnail sections', () => {
        const report = createRunReport({ command: 'qscloud remove-sheet-icons', dryRun: true });
        recordSelection(report, { namedAppIds: ['a', 'b'], selectorAppIds: [], selector: null });
        report.plan = {
            target: { platform: 'cloud', tenantUrl: 'tenant.eu.qlikcloud.com' },
            auth: { apiKey: true },
            writes: { kind: 'clear-icons', mediaFiles: true },
        };

        const text = renderRunPlanLines(report).join('\n');
        expect(text).toContain('WOULD REMOVE sheet icons and thumbnail media files from 2 app(s)');
        expect(text).not.toContain('sheet part');
        expect(text).not.toContain('browser');
        expect(text).not.toContain('uploads to');
    });

    test('a removal that leaves media files alone does not claim to delete them', () => {
        // The QSEoW twin clears the engine property only; the warning line
        // renders from the mediaFiles flag, not the kind, so the narrower
        // claim is also the default.
        const report = createRunReport({ command: 'qseow remove-sheet-icons', dryRun: true });
        recordSelection(report, { namedAppIds: ['a'], selectorAppIds: [], selector: null });
        report.plan = {
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
                apiUser: { directory: 'Internal', userId: 'sa_api' },
                certFile: './cert/client.pem',
            },
            writes: { kind: 'clear-icons' },
        };

        const text = renderRunPlanLines(report).join('\n');
        expect(text).toContain('WOULD REMOVE sheet icons from 1 app(s)');
        expect(text).not.toContain('thumbnail media files');
    });

    test('a removal names how many selected apps are published', () => {
        // On QSEoW the save is what a published app refuses, so a removal
        // over published apps fails after doing the work in memory. The plan
        // is the only place that can say so first.
        const report = createRunReport({ command: 'qseow remove-sheet-icons', dryRun: false });
        recordSelection(report, {
            namedAppIds: ['a', 'b', 'c'],
            selectorAppIds: [],
            selector: null,
        });
        report.plan = { writes: { kind: 'clear-icons', publishedAppCount: 2 } };

        const text = renderRunPlanLines(report).join('\n');
        expect(text).toContain('WILL REMOVE sheet icons from 3 app(s), 2 of them published');
    });

    test('an api user without a logon user renders one auth line, not a crash', () => {
        // qseow remove-sheet-icons works over the engine session alone: it
        // has an API identity but never logs into the web UI.
        const report = createRunReport({ command: 'qseow remove-sheet-icons', dryRun: true });
        recordSelection(report, { namedAppIds: ['a'], selectorAppIds: [], selector: null });
        report.plan = {
            auth: {
                apiUser: { directory: 'Internal', userId: 'sa_api' },
                certFile: './cert/client.pem',
            },
        };

        const text = renderRunPlanLines(report).join('\n');
        expect(text).toContain('Internal\\sa_api via ./cert/client.pem');
        expect(text).not.toContain('logon user');
    });
});

describe('renderRunVerdictLines', () => {
    /**
     * A finished two-app create run: one app fully processed, one failed
     * before its section opened.
     *
     * @returns {object} The report.
     */
    const finishedCreateReport = () => {
        const report = qseowReport();
        report.startedAt = 1_000_000;
        report.finishedAt = 1_000_000 + 6 * 60_000 + 12_000;
        report.succeeded = false;

        const app = addAppToReport(report, { id: 'app-1', name: 'Sales', sheetCount: 4 });
        app.sheets.push(
            { n: 1, title: 'Overview', action: 'update', reason: null },
            { n: 2, title: 'Board pack', action: 'blur', reason: BLUR_REASON.TAG },
            { n: 3, title: 'Scratch', action: 'skip', reason: EXCLUDE_REASON.NUMBER },
            { n: 4, title: 'Revenue', action: 'update', reason: null }
        );
        app.sheetsUpdated = 3;
        app.imagesKeptFiles = 6;
        app.imagesKeptBytes = 4_300_000;

        addAppToReport(report, { id: 'app-2' }).failed = true;

        return report;
    };

    test('renders the create verdict with counts, destination, images and elapsed time', () => {
        expect(renderRunVerdictLines(finishedCreateReport())).toEqual([
            '',
            'RESULT  FAILED',
            '  apps          1 ok, 1 failed',
            '  sheets        4 seen, 3 captured (1 blurred), 1 excluded',
            '  thumbnails    3 sheet(s) given new thumbnails in content library "Butler sheet thumbnails"',
            '  images kept   ./img/qseow   6 file(s), 4.1 MB',
            '  elapsed       6m 12s',
            RUN_FRAME,
        ]);
    });

    test('a clean run says ok', () => {
        const report = finishedCreateReport();
        report.succeeded = true;
        report.apps.pop();

        const lines = renderRunVerdictLines(report);
        expect(lines[1]).toBe('RESULT  ok');
        expect(lines).toContain('  apps          1 ok, 0 failed');
    });

    test('an empty selection is a failure that says nothing was done', () => {
        const report = createRunReport({ command: 'qseow create-sheet-thumbnails', dryRun: false });
        recordSelection(report, { namedAppIds: [], selectorAppIds: [], selector: null });
        report.succeeded = false;

        expect(renderRunVerdictLines(report)).toEqual([
            '',
            'RESULT  FAILED',
            '  apps          0 selected - nothing was done',
            RUN_FRAME,
        ]);
    });

    test('a removal run reports cleared icons, no-icon sheets and deleted media files', () => {
        const report = createRunReport({ command: 'qscloud remove-sheet-icons', dryRun: false });
        recordSelection(report, { namedAppIds: ['app-1'], selectorAppIds: [], selector: null });
        report.plan = { writes: { kind: 'clear-icons' } };
        report.succeeded = true;

        const app = addAppToReport(report, { id: 'app-1', sheetCount: 3 });
        app.sheets.push(
            { n: 1, title: 'Main', action: 'clear', reason: null },
            { n: 2, title: 'Notes', action: 'clear', reason: CLEAR_REASON.NO_ICON },
            { n: 3, title: 'KPI', action: 'clear', reason: null }
        );
        app.mediaFilesDeleted = 4;

        const text = renderRunVerdictLines(report).join('\n');
        expect(text).toContain('RESULT  ok');
        expect(text).toContain('3 seen, 2 icon(s) cleared, 1 had no icon');
        expect(text).toContain('4 thumbnail file(s) deleted from app media libraries');
    });

    test('a removal run keeps its vocabulary even with no plan on the report', () => {
        // The mode comes from report.command, never from the optional plan
        // sections - the next removal caller may legally supply no plan.
        const report = createRunReport({ command: 'qscloud remove-sheet-icons', dryRun: false });
        recordSelection(report, { namedAppIds: ['app-1'], selectorAppIds: [], selector: null });
        report.succeeded = true;

        const app = addAppToReport(report, { id: 'app-1', sheetCount: 1 });
        app.sheets.push({ n: 1, title: 'Main', action: 'clear', reason: null });

        const text = renderRunVerdictLines(report).join('\n');
        expect(text).toContain('1 icon(s) cleared');
        expect(text).not.toContain('captured');
    });

    test('sums recorded per-app fields and omits lines nothing recorded', () => {
        const report = qseowReport();
        report.succeeded = true;
        // Two apps that never reached the update step: no thumbnails line,
        // no images line, rather than a fabricated zero.
        addAppToReport(report, { id: 'a' });
        addAppToReport(report, { id: 'b' });

        const text = renderRunVerdictLines(report).join('\n');
        expect(text).not.toContain('thumbnails');
        expect(text).not.toContain('images kept');
    });
});

describe('the ASCII frame property (issue #1073)', () => {
    test('header, plan and verdict are pure ASCII when the content is', () => {
        const report = finishedAsciiReport();

        const everything = [
            ...renderRunHeaderLines('9.9.9', 'QSEoW sheet thumbnails'),
            ...renderRunPlanLines(report),
            ...renderRunVerdictLines(report),
        ].join('\n');

        expect(PURE_ASCII.test(everything)).toBe(true);
    });

    test('non-ASCII app and sheet names pass through untouched', () => {
        // User data is exempt from the ASCII rule and must never be
        // "purified" - the operator has to recognise their own app names.
        const line = sheetProgressLine({
            n: 3,
            total: 9,
            label: 'captured',
            title: 'Försäljning Södertälje',
        });
        expect(line).toContain('Försäljning Södertälje');

        const appLine = appProgressLine({
            name: 'Ekonomiöversikt',
            sheetCount: 9,
            published: true,
        });
        expect(appLine).toContain('Ekonomiöversikt');
    });

    /**
     * A finished report whose user data is all-ASCII, so any non-ASCII byte
     * in the output would have to come from the frame itself.
     *
     * @returns {object} The report.
     */
    function finishedAsciiReport() {
        const report = qseowReport();
        report.succeeded = true;
        report.finishedAt = report.startedAt + 45_000;
        const app = addAppToReport(report, { id: 'app-1', name: 'Sales', sheetCount: 1 });
        app.sheets.push({ n: 1, title: 'Overview', action: 'update', reason: null });
        app.sheetsUpdated = 1;
        app.imagesKeptFiles = 2;
        app.imagesKeptBytes = 1024;

        return report;
    }
});

describe('progress lines', () => {
    test('a missing title or name never prints the literal undefined', () => {
        expect(sheetProgressLine({ n: 2, total: 5, label: 'no icon', title: undefined })).toBe(
            "  sheet  2/5  no icon   ''"
        );
        expect(appProgressLine({ name: undefined, sheetCount: 3 })).toBe('  "" -- 3 sheet(s)');
    });

    test('sheet lines are countable and name the responsible option', () => {
        expect(
            sheetProgressLine({
                n: 2,
                total: 11,
                label: 'excluded',
                title: 'Scratch pad',
                reason: EXCLUDE_REASON.NUMBER,
            })
        ).toBe("  sheet  2/11  excluded  'Scratch pad'  (--exclude-sheet-number)");

        expect(sheetProgressLine({ n: 1, total: 11, label: 'captured', title: 'Overview' })).toBe(
            "  sheet  1/11  captured  'Overview'"
        );
    });

    test('app lines carry name, sheet count and publish state', () => {
        expect(appProgressLine({ name: 'Sales', sheetCount: 11, published: true })).toBe(
            '  "Sales" -- 11 sheet(s), published'
        );
        expect(appProgressLine({ name: 'Sales', sheetCount: 0 })).toBe('  "Sales" -- 0 sheet(s)');
    });
});

describe('formatters', () => {
    test('formatElapsed picks the right unit pair', () => {
        expect(formatElapsed(45_000)).toBe('45s');
        expect(formatElapsed(6 * 60_000 + 12_000)).toBe('6m 12s');
        expect(formatElapsed(3_600_000 + 2 * 60_000)).toBe('1h 2m');
    });

    test('formatBytes picks the right unit', () => {
        expect(formatBytes(512)).toBe('512 B');
        expect(formatBytes(2048)).toBe('2.0 KB');
        expect(formatBytes(4_300_000)).toBe('4.1 MB');
    });

    test('isOptionEnabled accepts boolean true and the string Commander delivers', () => {
        expect(isOptionEnabled(true)).toBe(true);
        expect(isOptionEnabled('true')).toBe(true);
        expect(isOptionEnabled(false)).toBe(false);
        expect(isOptionEnabled('false')).toBe(false);
    });
});

describe('the verdict of an interrupted run (issue #1107)', () => {
    /**
     * A report stopped mid-run: one app done, one abandoned in flight, two
     * never started.
     *
     * @returns {object} The report.
     */
    const interruptedReport = () => {
        const report = qseowReport();

        report.apps = [];
        addAppToReport(report, { id: 'app-1', name: 'Done', sheetCount: 2 }).sheetsUpdated = 2;
        addAppToReport(report, { id: 'app-2', name: 'Abandoned', sheetCount: 3 }).interrupted =
            true;

        report.interrupted = { signal: 'SIGINT' };
        report.appsNotStarted = 2;
        report.succeeded = false;
        report.finishedAt = report.startedAt + 4000;

        return report;
    };

    test('an abandoned app counts as neither ok nor failed', () => {
        const facts = verdictFacts(interruptedReport());

        expect(facts).toMatchObject({
            okApps: 1,
            failedApps: 0,
            interruptedApps: 1,
            notStartedApps: 2,
            interrupted: true,
        });
    });

    test('says INTERRUPTED, not FAILED', () => {
        const lines = renderRunVerdictLines(interruptedReport()).join('\n');

        // The two call for different responses: a failed run is something to
        // investigate, an interrupted one is something to re-run.
        expect(lines).toContain('RESULT  INTERRUPTED');
        expect(lines).not.toContain('FAILED');
    });

    test('states what is left to re-run', () => {
        const lines = renderRunVerdictLines(interruptedReport()).join('\n');

        expect(lines).toContain('1 ok, 1 interrupted, 2 not started');
    });

    test('stays pure ASCII, like every other renderer output', () => {
        const lines = renderRunVerdictLines(interruptedReport()).join('\n');

        expect(lines).toMatch(PURE_ASCII);
    });

    test('an ordinary run keeps its 0 failed, which operators grep for', () => {
        expect(
            appCountSummary({ okApps: 3, failedApps: 0, interruptedApps: 0, notStartedApps: 0 })
        ).toBe('3 ok, 0 failed');
    });

    test('a failed app is still reported alongside an interrupt', () => {
        expect(
            appCountSummary({
                okApps: 1,
                failedApps: 2,
                interruptedApps: 1,
                notStartedApps: 5,
                interrupted: true,
            })
        ).toBe('1 ok, 2 failed, 1 interrupted, 5 not started');
    });

    test('an uninterrupted report is unchanged', () => {
        const report = qseowReport();
        report.succeeded = true;

        const facts = verdictFacts(report);

        expect(facts.interrupted).toBe(false);
        expect(facts.interruptedApps).toBe(0);
        expect(facts.notStartedApps).toBe(0);
        expect(renderRunVerdictLines(report).join('\n')).toContain('RESULT  ok');
    });
});
