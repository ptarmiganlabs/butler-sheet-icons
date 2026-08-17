import { logger, getLoggingLevel, setLoggingLevel } from '../../globals.js';

/**
 * The run report: one object holding what a run resolved and decided, read by
 * every renderer.
 *
 * This exists to keep the dry-run report and the real run from drifting apart
 * (issue #1072). The dry run is "do every read, perform no writes, report the
 * decisions" (issue #993) - so the decisions must come from one place, filled
 * in by the same code path both modes execute. A dry run that gathered its own
 * facts could report a selection the real run does not make, which is worse
 * than no dry run: confidently wrong about the one thing it exists to check.
 *
 * The report is created by the command worker and passed explicitly down
 * through the per-app processors - never held in module state. A singleton
 * would leak decisions across commands in a process that runs several (the
 * test suite does; a future API consumer might).
 *
 * Today the object carries the selection and the per-sheet decisions; the
 * fuller plan sections issue #1072 sketches (target, rules, browser, output)
 * arrive with the run-output work in #1073 and are additive to this shape.
 */

/**
 * Ensure a block of output is visible even when the console level is quieter
 * than `info`.
 *
 * The dry-run report and its banner are the entire product of a `--dry-run`
 * invocation, and the docs tell operators to reuse their real command line -
 * which in schedulers routinely carries `--log-level warn`. Without this, such
 * a dry run connects, plans everything, prints nothing and exits 0. Verbose
 * and debug levels already show `info`, so only `warn`/`error` are raised.
 *
 * @param {Function} emit - Function that writes the block through the logger.
 *
 * @returns {void}
 */
const withReportVisible = (emit) => {
    const level = getLoggingLevel();
    const quiet = level === 'warn' || level === 'error';

    if (quiet) {
        setLoggingLevel('info');
    }
    try {
        emit();
    } finally {
        if (quiet) {
            setLoggingLevel(level);
        }
    }
};

/**
 * Announce, before any connection is made, that this run is a dry run.
 *
 * Without this line the log of a dry run opens exactly like a real run -
 * "Starting removal of sheet icons", "About to process app ..." - and the one
 * line saying nothing was changed arrives only after the last app. An operator
 * watching a destructive-looking scroll for two minutes has no reason to wait
 * for it.
 *
 * @param {string} command - The command being planned, e.g. `qseow create-sheet-thumbnails`.
 *
 * @returns {void}
 */
export const announceDryRun = (command) => {
    withReportVisible(() => {
        logger.info('==================================================');
        logger.info(`DRY RUN of ${command}: planning only - NOTHING WILL BE CHANGED`);
        logger.info('==================================================');
    });
};

/**
 * Create a run report.
 *
 * @param {object} plan - What the run intends to do, resolved before the first write.
 * @param {string} plan.command - The command, e.g. `qseow create-sheet-thumbnails`.
 * @param {boolean} plan.dryRun - Whether this run will stop before the writes.
 *
 * @returns {object} The report, to be threaded through the run.
 */
export const createRunReport = ({ command, dryRun }) => ({
    command,
    dryRun,
    selection: null,
    apps: [],
});

/**
 * Record how the app selection resolved.
 *
 * The provenance counts are the cheap line #993 asks for: "the tag matched 40
 * apps, not 4" is the other silent surprise besides the sheet rules. Counts
 * are derived here from the id arrays - callers hand over what they resolved,
 * not numbers they computed by their own rules - and each list is deduplicated
 * first, so a repeated `--appid` is not misreported as selector overlap.
 *
 * The selector is stored structurally (`option` + `value`), not as rendered
 * text: a future renderer on the #1071 ladder - a JSON report especially -
 * must not have to un-bake CLI quoting from a display string.
 *
 * @param {object} report - The report.
 * @param {object} selection - Selection facts.
 * @param {string[]} selection.namedAppIds - Apps named directly by `--appid`, raw.
 * @param {string[]} selection.selectorAppIds - Apps contributed by the tag/collection selector, raw.
 * @param {{option: string, value: string}|null} selection.selector - The selector
 *     option (long-flag name without dashes) and its value, or null when not used.
 *
 * @returns {void}
 */
export const recordSelection = (report, { namedAppIds, selectorAppIds, selector }) => {
    const named = new Set(namedAppIds);
    const fromSelector = new Set(selectorAppIds);

    report.selection = {
        named: named.size,
        fromSelector: fromSelector.size,
        selector,
        total: new Set([...named, ...fromSelector]).size,
    };
};

/**
 * Open a per-app section in the report.
 *
 * @param {object} report - The report.
 * @param {object} app - App facts.
 * @param {string} app.id - App id.
 * @param {string} [app.name] - App name, when known.
 * @param {number} [app.sheetCount] - Number of sheets found.
 *
 * @returns {object} The app entry; pass it to {@link recordSheetDecision}.
 */
export const addAppToReport = (report, { id, name, sheetCount }) => {
    const entry = {
        id,
        name: name ?? null,
        sheetCount: sheetCount ?? null,
        sheets: [],
        mediaFilesToDelete: null,
    };
    report.apps.push(entry);

    return entry;
};

/**
 * Record one sheet's decision.
 *
 * @param {object} appEntry - From {@link addAppToReport}.
 * @param {object} decision - The decision.
 * @param {number} decision.n - 1-based sheet position (after rank sort).
 * @param {string} decision.title - Sheet title.
 * @param {'update'|'blur'|'skip'|'clear'} decision.action - What the run would do:
 *     `update` a regular thumbnail, `blur` it, `skip` the sheet, or `clear` an
 *     existing icon (remove-sheet-icons).
 * @param {string|null} [decision.reason] - The responsible option, from
 *     `sheet-decision-reasons.js`, or null for the default action.
 *
 * @returns {void}
 */
export const recordSheetDecision = (appEntry, { n, title, action, reason = null }) => {
    appEntry.sheets.push({ n, title, action, reason });
};

/**
 * Totals over every recorded decision.
 *
 * Derived at render time rather than kept as counters, so the totals cannot
 * disagree with the rows they summarise.
 *
 * @param {object} report - The report.
 *
 * @returns {{apps: number, sheets: number, update: number, blur: number, skip: number, clear: number}} Totals.
 */
export const reportTotals = (report) => {
    const totals = { apps: report.apps.length, sheets: 0, update: 0, blur: 0, skip: 0, clear: 0 };

    for (const app of report.apps) {
        for (const sheet of app.sheets) {
            totals.sheets += 1;
            if (Object.hasOwn(totals, sheet.action)) {
                totals[sheet.action] += 1;
            }
        }
    }

    return totals;
};

const ACTION_LABEL = Object.freeze({
    update: 'update',
    blur: 'update, blurred',
    skip: 'skip',
    clear: 'clear icon',
});

/**
 * Whether the report describes an icon-removal command.
 *
 * Decided from `report.command`, never sniffed from the recorded rows: a
 * remove run over zero sheets must still summarise in remove vocabulary.
 *
 * @param {object} report - The report.
 *
 * @returns {boolean} True for remove-sheet-icons reports.
 */
const isRemovalReport = (report) => (report.command ?? '').includes('remove-sheet-icons');

/**
 * Render the dry-run report through the logger.
 *
 * Through winston at `info` rather than straight to stdout (issue #993 open
 * question 1): the report belongs in the same captured log as the run a
 * scheduler would perform. Plain aligned text, no box drawing - this must
 * survive any console. `withReportVisible` guarantees the block appears even
 * under `--log-level warn`.
 *
 * @param {object} report - The report to render.
 * @param {object} [log] - Logger. Defaults to the shared winston logger.
 *
 * @returns {void}
 */
export const renderDryRunReport = (report, log = logger) => {
    const emit = () => {
        // A selection that matched nothing is a failure the operator must not
        // read past: the run exits 1, and a success-shaped report ending in
        // "re-run without --dry-run" would invite re-running a command that
        // just selected nothing.
        if (report.apps.length === 0 && (report.selection?.total ?? 0) === 0) {
            log.info('');
            log.info(
                `DRY RUN of ${report.command}: no apps were selected - there is nothing to plan.`
            );
            log.info('Check the app selection options named in the error above.');

            return;
        }

        log.info('');
        log.info(`DRY RUN of ${report.command} - nothing will be changed`);
        log.info('');

        if (report.selection) {
            const s = report.selection;
            const parts = [`${s.named} named by --appid`];
            if (s.selector) {
                parts.push(
                    `${s.fromSelector} matched by --${s.selector.option} "${s.selector.value}"`
                );
            }
            const overlap = s.named + s.fromSelector - s.total;
            if (overlap > 0) {
                parts.push(`${overlap} selected twice`);
            }
            log.info(`App selection: ${s.total} app(s) - ${parts.join(', ')}`);
            log.info('');
        }

        const width = report.apps.reduce(
            (max, app) =>
                app.sheets.reduce((m, sheet) => Math.max(m, sheet.title?.length ?? 0), max),
            20
        );

        report.apps.forEach((app, i) => {
            log.info(`App ${i + 1}/${report.apps.length}: "${app.name ?? app.id}" (${app.id})`);
            if (app.sheetCount !== null) {
                log.info(`  ${app.sheetCount} sheets`);
            }
            log.info('');
            log.info(`   #  ${'Sheet'.padEnd(width)}  Would do`);

            for (const sheet of app.sheets) {
                const action = ACTION_LABEL[sheet.action] ?? sheet.action;
                const reason = sheet.reason ? `  (${sheet.reason})` : '';
                log.info(
                    `  ${String(sheet.n).padStart(2)}  ${(sheet.title ?? '').padEnd(width)}  ${action}${reason}`
                );
            }

            // A truncated plan must say so: the app section opened claiming
            // sheetCount sheets, and fewer rows means the planner failed
            // mid-app. Silence here reads as "the remaining sheets are fine".
            if (app.sheetCount !== null && app.sheets.length < app.sheetCount) {
                log.info(
                    `  PLAN INCOMPLETE: only ${app.sheets.length} of ${app.sheetCount} sheets were planned - see the error above.`
                );
            }

            if (app.mediaFilesToDelete !== null && app.mediaFilesToDelete > 0) {
                log.info(
                    `  ${app.mediaFilesToDelete} thumbnail media file(s) would also be deleted from the app media library`
                );
            }
            log.info('');
        });

        const t = reportTotals(report);

        // Apps that failed before their section opened are invisible in the
        // rows, so the count mismatch with the selection is stated explicitly.
        const unplanned = (report.selection?.total ?? report.apps.length) - report.apps.length;
        if (unplanned > 0) {
            log.info(
                `${unplanned} app(s) could not be planned at all - see the errors above. They are not included in the summary.`
            );
        }

        if (isRemovalReport(report)) {
            log.info(
                `Summary: ${t.apps} app(s), ${t.sheets} sheets. ${t.clear} icon(s) would be cleared, ${t.skip} skipped.`
            );
        } else {
            const blurNote = t.blur > 0 ? ` (${t.blur} blurred)` : '';
            log.info(
                `Summary: ${t.apps} app(s), ${t.sheets} sheets. ${t.update + t.blur} would be updated${blurNote}, ${t.skip} skipped.`
            );
        }
        log.info('Nothing was changed. Re-run without --dry-run to apply.');
    };

    // Only force visibility on the real logger; an injected test logger has no
    // winston level to manage.
    if (log === logger) {
        withReportVisible(emit);
    } else {
        emit();
    }
};
