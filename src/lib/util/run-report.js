import { logger, getLoggingLevel, setLoggingLevel } from '../../globals.js';
import { runOverApps } from './run-over-apps.js';
import {
    RUN_FRAME,
    renderRunPlanLines,
    renderRunVerdictLines,
    isRemovalReport,
    logRunHeader,
} from './run-report-render.js';
import { selectRung, RUNG } from './select-rung.js';
import {
    boardContext,
    renderBoardHeader,
    renderBoardPlan,
    renderBoardAppRow,
    renderBoardVerdict,
} from './run-board.js';
import { toOptionValueList } from './option-values.js';
import { measureImageFiles } from './image-dir.js';

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
 * Warned once per process, not once per emitting call site: the header and
 * the report loop both consult the rung, and an unrecognised `BSI_OUTPUT`
 * is the same typo both times.
 */
let warnedAboutOutputOverride = false;

/**
 * The output rung for this process, from the real stream and environment.
 *
 * A thin composition seam over the pure {@link selectRung}: this is the only
 * place the real `process.stdout`, `process.env` and console log level are
 * read, so every renderer stays injectable. Called at run start - the stream
 * cannot become a terminal later - and deterministic for the life of the
 * run, so the header emitter and the report loop cannot disagree.
 *
 * @param {boolean|string} [headless] - The run's raw `--headless` value, when
 *     the command drives a browser.
 *
 * @returns {string} A value from {@link RUNG}.
 */
const decideRung = (headless) =>
    selectRung({
        stdout: process.stdout,
        env: process.env,
        options: { logLevel: getLoggingLevel(), headless },
        warn: (message) => {
            if (!warnedAboutOutputOverride) {
                warnedAboutOutputOverride = true;
                logger.warn(message);
            }
        },
    });

/**
 * Emit a block through the logger with the console transport silenced.
 *
 * This is how the board avoids printing the same facts twice: the plain
 * run-card block still goes through winston - so a file transport, if one is
 * ever configured, gets the log the schedulers rely on - while the terminal
 * gets the board block instead of both.
 *
 * @param {Function} emit - Function that writes the block through the logger.
 *
 * @returns {void}
 */
const withConsoleSilenced = (emit) => {
    // Optional chaining: injected test loggers have no transports array, and
    // a missing console transport must mean "nothing to silence", not a crash.
    const consoleTransport = logger.transports?.find((transport) => transport.name === 'console');

    if (!consoleTransport) {
        emit();

        return;
    }

    const previous = consoleTransport.silent;
    consoleTransport.silent = true;
    try {
        emit();
    } finally {
        consoleTransport.silent = previous;
    }
};

/**
 * Emit one output block on the selected rung.
 *
 * The single dispatch point for the rung trichotomy, used by the header, the
 * plan block and the verdict block - three call sites, one rule, and one
 * insertion point when rung C (issue #1075) arrives. On the board rung the
 * plain block still goes through the logger (console silenced, so the
 * terminal is not told the same facts twice) and the board block goes to
 * stdout in one write. `off` suppresses the block unless the caller marks it
 * part of the command's product.
 *
 * @param {object} block - The block.
 * @param {string} block.rung - From {@link selectRung}.
 * @param {Function} block.plainEmit - Writes the plain block through the logger.
 * @param {() => string} block.renderBoardBlock - Renders the board block.
 * @param {boolean} [block.forceVisible] - Raise the console level for the
 *     plain block (dry-run product semantics; see `withReportVisible`).
 * @param {boolean} [block.suppressOnOff] - Whether `BSI_OUTPUT=off` may
 *     suppress this block. False for blocks that are the command's product.
 *
 * @returns {void}
 */
const emitBlockOnRung = ({
    rung,
    plainEmit,
    renderBoardBlock,
    forceVisible = false,
    suppressOnOff = true,
}) => {
    if (rung === RUNG.BOARD || rung === RUNG.LIVE) {
        withConsoleSilenced(plainEmit);
        process.stdout.write(renderBoardBlock());

        return;
    }

    if (rung === RUNG.OFF && suppressOnOff) {
        return;
    }

    if (forceVisible) {
        withReportVisible(plainEmit);

        return;
    }

    plainEmit();
};

/**
 * Emit the run header on the rung the terminal gets, and hand the decision
 * back so the caller can thread it through the rest of the run.
 *
 * On the board rung the terminal shows the wordmark frame (issue #1074) and
 * the plain three-line header goes through the logger with the console
 * silenced - one branding block, not two. Everywhere else this is exactly
 * `logRunHeader`. `BSI_OUTPUT=off` keeps the plain header: it predates the
 * ladder, and the version line it carries is the first thing support asks
 * for.
 *
 * Called by the run *workers*, not the command handlers: the wizard invokes
 * workers directly, so a handler-level header would be skipped on wizard
 * runs and would be decided from pre-wizard options on `-i` runs. Returning
 * the rung lets the worker pass the same decision to `announceDryRun` and
 * `runOverAppsWithReport`, so the header and the blocks cannot disagree -
 * not by re-deriving the same inputs, but by deciding once.
 *
 * @param {object} run - The run.
 * @param {string} run.version - The Butler Sheet Icons version.
 * @param {string} run.jobLabel - Short job description, e.g. `QSEoW sheet thumbnails`.
 * @param {object} [run.options] - The command's options bag; `headless` is
 *     the only key read.
 *
 * @returns {string} The decided rung, from {@link RUNG}.
 */
export const emitRunHeader = ({ version, jobLabel, options = {} }) => {
    const rung = decideRung(options.headless);

    emitBlockOnRung({
        rung,
        plainEmit: () => logRunHeader(logger, version, jobLabel),
        renderBoardBlock: () => renderBoardHeader({ version, jobLabel }, boardContext()),
        // `off` keeps the plain header - the version line is support material.
        suppressOnOff: false,
    });

    return rung;
};

/**
 * Announce, before any connection is made, that this run is a dry run.
 *
 * Without this line the log of a dry run opens exactly like a real run -
 * "Starting removal of sheet icons", "app 1/3 ..." - and the one
 * line saying nothing was changed arrives only after the last app. An operator
 * watching a destructive-looking scroll for two minutes has no reason to wait
 * for it.
 *
 * Rung-aware: on the board rung the plain `=`-framed banner would land as
 * rung-A furniture between the wordmark frame and the board plan, so the
 * terminal gets a single board-styled line instead while the plain banner
 * still goes through the logger, console silenced - the same both-audiences
 * split as every other board block.
 *
 * @param {string} command - The command being planned, e.g. `qseow create-sheet-thumbnails`.
 * @param {string} [rung] - The rung from {@link emitRunHeader}. Callers
 *     without one get the plain banner.
 *
 * @returns {void}
 */
export const announceDryRun = (command, rung = RUNG.PLAIN) => {
    const emit = () => {
        logger.info(RUN_FRAME);
        logger.info(`DRY RUN of ${command}: planning only - NOTHING WILL BE CHANGED`);
        logger.info(RUN_FRAME);
    };

    emitBlockOnRung({
        rung,
        plainEmit: emit,
        renderBoardBlock: () => {
            const ctx = boardContext();

            return `\n  ${ctx.palette.yellow(
                `${ctx.symbols.warning}  DRY RUN of ${command}: planning only - nothing will be changed`
            )}\n`;
        },
        // The announcement is dry-run product: visible at warn/error, and
        // never suppressed by `off`.
        forceVisible: true,
        suppressOnOff: false,
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
    plan: null,
    apps: [],
    startedAt: Date.now(),
    finishedAt: null,
    succeeded: null,
});

/**
 * Build the plan's `rules` section from the command's options bag.
 *
 * One builder for both platform twins, so the two cannot disagree about which
 * options constitute a rule. Tag rules are included only where the platform
 * honours them - Qlik Sense Cloud cannot tag individual sheets, and a plan
 * listing a rule the run ignores would be the plan lying.
 *
 * @param {object} options - The command's options bag.
 * @param {object} [facts] - Server-side facts, where available.
 * @param {boolean} [facts.includeTagRules] - Whether tag rules apply on this platform.
 * @param {number|null} [facts.excludeTagSheetCount] - Sheets matched by the
 *     exclude tag(s) across the selected apps, or null when not counted.
 * @param {number|null} [facts.blurTagSheetCount] - Same for the blur tag(s).
 *
 * @returns {{exclude: Array<object>, blur: Array<object>}} The rules, each as
 *     `{option, values, matchedSheetCount}` - structural, never pre-rendered.
 */
export const buildSheetRules = (
    options,
    { includeTagRules = false, excludeTagSheetCount = null, blurTagSheetCount = null } = {}
) => {
    const rule = (option, values, matchedSheetCount = null) => ({
        option,
        values,
        matchedSheetCount,
    });

    const collect = (prefix, tagOption, tagCount) => {
        const rules = [];

        if (includeTagRules) {
            const tags = toOptionValueList(tagOption);
            if (tags.length > 0) {
                rules.push(rule(`${prefix}-sheet-tag`, tags, tagCount));
            }
        }
        for (const kind of ['number', 'title', 'status']) {
            const optionName = `${prefix}-sheet-${kind}`;
            const camel = `${prefix}Sheet${kind[0].toUpperCase()}${kind.slice(1)}`;
            const values = toOptionValueList(options[camel]).map(String);
            if (values.length > 0) {
                rules.push(rule(optionName, values));
            }
        }

        return rules;
    };

    return {
        exclude: collect('exclude', options.excludeSheetTag, excludeTagSheetCount),
        blur: collect('blur', options.blurSheetTag, blurTagSheetCount),
    };
};

/**
 * The plan's `sheetPart` section, from the option value and the platform's
 * label map. Shared by the twins so neither can render a value the other maps
 * differently.
 *
 * @param {string|number} value - The `--includesheetpart` value.
 * @param {Record<string, string>} labels - The platform's sheet-part labels.
 *
 * @returns {{value: string, max: string, label: string}} The section.
 */
export const buildSheetPartSection = (value, labels) => {
    const keys = Object.keys(labels);

    return {
        value: String(value),
        max: keys[keys.length - 1],
        label: labels[String(value)],
    };
};

/**
 * The plan's `browser` section, identical on both platforms.
 *
 * The version is the *requested* one - a keyword like `recommended` or a
 * pinned build - never a resolved build id: resolution happens at launch and
 * may involve the network, and the plan block must stay a pure read of what
 * was asked for. The launch still logs the build it actually uses.
 *
 * @param {object} options - The command's options bag.
 *
 * @returns {{name: string, version: string, headless: boolean|string, pageWaitSeconds: number|string}} The section.
 */
export const buildBrowserPlanSection = (options) => ({
    name: options.browser,
    version: options.browserVersion,
    headless: options.headless,
    pageWaitSeconds: options.pagewait,
});

/**
 * Mark an app as failed on the report.
 *
 * Called by the app loop when a processor or planner threw. The entry may
 * already exist (the app failed after opening its section) or not (it failed
 * before `openDoc` resolved); either way the verdict must count it.
 *
 * Not exported: recording failures is the loop's job, and an outside caller
 * mutating reports would bypass the one place ordering is guaranteed.
 *
 * @param {object} report - The report.
 * @param {string} appId - The app that failed.
 *
 * @returns {void}
 */
const markAppFailed = (report, appId) => {
    const entry = report.apps.find((app) => app.id === appId);

    if (entry) {
        entry.failed = true;
    } else {
        addAppToReport(report, { id: appId }).failed = true;
    }
};

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
 * Real runs additionally record outcome fields directly on the entry as they
 * happen: `sheetsUpdated`, `imagesKeptFiles`, `imagesKeptBytes`,
 * `mediaFilesDeleted`. They stay absent on entries that never reached that
 * step, and the verdict renderer sums only what was recorded - so a number in
 * the verdict is always a number that happened.
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
        failed: false,
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
 * Record a real run's per-app outcome: how many sheets were given new
 * thumbnails, and what the kept image files on disk amount to.
 *
 * One recorder for both platform twins - a future outcome field added here
 * reaches both verdicts, instead of landing in one processor's inline block
 * and silently missing from the other's.
 *
 * @param {object|null} appEntry - From {@link addAppToReport}, or null when
 *     the processor runs without a report.
 * @param {object} outcome - The outcome.
 * @param {number} outcome.sheetsUpdated - Sheets given a new thumbnail.
 * @param {string} outcome.imagesDir - The per-app image directory.
 * @param {string[]} outcome.imageFileNames - Image file names (no path) the run created.
 *
 * @returns {void}
 */
export const recordAppOutcome = (appEntry, { sheetsUpdated, imagesDir, imageFileNames }) => {
    if (!appEntry) {
        return;
    }

    appEntry.sheetsUpdated = sheetsUpdated;

    const kept = measureImageFiles(imagesDir, imageFileNames);
    appEntry.imagesKeptFiles = kept.files;
    appEntry.imagesKeptBytes = kept.bytes;
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

        // The app-selection provenance line that used to open this report now
        // lives in the PLAN block, which renders before the app loop - stating
        // it again here would be the "do not end up with both" mistake #1073
        // warns about for the version line.
        log.info('');
        log.info(`DRY RUN of ${report.command} - nothing will be changed`);
        log.info('');

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

            // A planner that failed after its rows were recorded (or before
            // any were) must not read as a clean plan: the row count alone
            // cannot tell "fully planned" from "failed on the step after the
            // last sheet".
            if (app.failed) {
                log.info(
                    `  PLANNING FAILED for this app - the rows above may be incomplete. See the errors above.`
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

        // Failed planners now always leave a marked entry, but the selection
        // count is still cross-checked so an app that vanished entirely (a
        // future recording bug) cannot pass silently.
        const failedApps = report.apps.filter((app) => app.failed).length;
        const unplanned =
            (report.selection?.total ?? report.apps.length) - report.apps.length + failedApps;
        if (unplanned > 0) {
            log.info(
                `${unplanned} app(s) could not be fully planned - see the errors above. Their rows are missing or incomplete.`
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

        // The invitation to apply is earned, not automatic: a dry run that
        // could not plan everything must send the operator to the errors, not
        // to the real run.
        if (unplanned > 0) {
            log.info(
                'Nothing was changed. Fix the errors above before applying - this plan is incomplete.'
            );
        } else {
            log.info('Nothing was changed. Re-run without --dry-run to apply.');
        }
    };

    // Only force visibility on the real logger; an injected test logger has no
    // winston level to manage.
    if (log === logger) {
        withReportVisible(emit);
    } else {
        emit();
    }
};

/**
 * Record one planned sheet from the pair of decisions the shared modules made.
 *
 * The if/else mapping from (exclude, blur) to a report row is identical in
 * every planner - this is that mapping, written once.
 *
 * @param {object} appEntry - From {@link addAppToReport}.
 * @param {object} planned - The sheet and its decisions.
 * @param {number} planned.n - 1-based sheet position.
 * @param {string} planned.title - Sheet title.
 * @param {boolean} planned.excludeSheet - Whether an exclude rule matched.
 * @param {string|null} planned.excludeReason - The responsible exclude rule.
 * @param {boolean} planned.blurSheet - Whether a blur rule matched.
 * @param {string|null} planned.blurReason - The responsible blur rule.
 *
 * @returns {void}
 */
export const recordPlannedSheet = (
    appEntry,
    { n, title, excludeSheet, excludeReason, blurSheet, blurReason }
) => {
    if (excludeSheet === true) {
        recordSheetDecision(appEntry, { n, title, action: 'skip', reason: excludeReason });
    } else {
        recordSheetDecision(appEntry, {
            n,
            title,
            action: blurSheet ? 'blur' : 'update',
            reason: blurReason,
        });
    }
};

/**
 * The report-carrying app loop every dry-run-capable worker shares: build the
 * report, record the selection and the plan, render the plan block, run the
 * loop against the planner or the processor, and render the verdict.
 *
 * One function rather than a block pasted into each worker - the three copies
 * had already been flagged by review and by the duplication gate, and a
 * report field added in one worker but not the others is exactly the drift
 * the report exists to prevent.
 *
 * The plan block renders here, before the loop starts, which is what makes
 * "the plan is emitted before any write" a structural property rather than a
 * convention: the first write any worker performs happens inside its per-app
 * processor, and the loop has not been entered yet.
 *
 * Visibility differs by mode on purpose. On a dry run the plan is the
 * command's product, so it is forced visible even at `--log-level warn`. On a
 * real run the plan and verdict log at plain `info`: an operator who chose
 * `warn` asked for a quiet run, and the run card respects that.
 *
 * @param {object} run - The run.
 * @param {string} run.command - The command, e.g. `qseow create-sheet-thumbnails`.
 * @param {boolean} run.dryRun - Whether this is a dry run.
 * @param {string[]} run.appIds - All selected app ids, in selection order.
 * @param {string[]} run.namedAppIds - The `--appid` subset.
 * @param {string[]} run.selectorAppIds - The tag/collection subset.
 * @param {{option: string, value: string}|null} run.selector - The selector used, if any.
 * @param {object} [run.plan] - Structural plan sections (target, auth, sheetPart,
 *     rules, browser, output, writes), assembled by the worker.
 * @param {string} [run.rung] - The output rung decided by the worker's
 *     `emitRunHeader` call, so header and blocks share one decision. Omitted
 *     by callers without a header; decided fresh then.
 * @param {{plan: string, process: string}} run.logPrefix - Per-mode log prefixes.
 * @param {string} run.emptySelectionHint - Guidance when nothing was selected.
 * @param {(appId: string, report: object) => Promise<void>} run.planApp - The per-app planner.
 * @param {(appId: string, report: object) => Promise<unknown>} run.processApp - The per-app processor.
 *
 * @returns {Promise<boolean>} The verdict from the app loop.
 */
export const runOverAppsWithReport = async ({
    command,
    dryRun,
    appIds,
    namedAppIds,
    selectorAppIds,
    selector,
    plan = null,
    rung: providedRung = null,
    logPrefix,
    emptySelectionHint,
    planApp,
    processApp,
}) => {
    const report = createRunReport({ command, dryRun });
    recordSelection(report, { namedAppIds, selectorAppIds, selector });
    report.plan = plan;

    // Decided once, at the start of the run (issue #1076): workers pass the
    // rung their `emitRunHeader` call decided, so the header and the blocks
    // cannot disagree even if the terminal changes between them. The
    // fallback decides fresh for callers without a header. `live` renders as
    // the board until rung C (issue #1075) exists.
    const rung = providedRung ?? decideRung(plan?.browser?.headless);
    const board = rung === RUNG.BOARD || rung === RUNG.LIVE;
    const ctx = board ? boardContext() : null;

    const emitPlan = () => {
        for (const line of renderRunPlanLines(report)) {
            logger.info(line);
        }
    };
    // On a dry run the plan block is half the command's product - the
    // selection provenance and rule match counts live only here - so
    // `BSI_OUTPUT=off` may suppress it on real runs only, and dry runs keep
    // the forced visibility rung A gave them.
    emitBlockOnRung({
        rung,
        plainEmit: emitPlan,
        renderBoardBlock: () => renderBoardPlan(report, ctx),
        forceVisible: dryRun,
        suppressOnOff: !dryRun,
    });

    const totalApps = new Set(appIds).size;
    const removal = isRemovalReport(report);

    const result = await runOverApps(
        appIds,
        {
            logPrefix: dryRun ? logPrefix.plan : logPrefix.process,
            action: dryRun ? 'plan' : 'process',
            emptySelectionHint,
        },
        dryRun
            ? async (appId) => {
                  try {
                      return await planApp(appId, report);
                  } catch (err) {
                      // A planner that failed after recording its rows would
                      // otherwise render as a clean, fully-planned app - on
                      // the mode whose report is the entire product.
                      markAppFailed(report, appId);
                      throw err;
                  }
              }
            : async (appId) => {
                  const appStartedAt = Date.now();
                  try {
                      const result = await processApp(appId, report);

                      // Every attempted app must have an entry, or the
                      // verdict's ok-count silently undercounts a processor
                      // that recorded nothing.
                      if (!report.apps.some((app) => app.id === appId)) {
                          addAppToReport(report, { id: appId });
                      }

                      return result;
                  } catch (err) {
                      // Recorded before the loop's own catch logs it, so the
                      // verdict's failed-app count cannot disagree with the
                      // error lines above it.
                      markAppFailed(report, appId);
                      throw err;
                  } finally {
                      // Both paths above guarantee the entry exists by now.
                      // Stamped by the loop, not the processors: one clock
                      // for both platform twins.
                      const entry = report.apps.find((app) => app.id === appId);
                      if (entry) {
                          entry.durationMs = Date.now() - appStartedAt;
                          if (board) {
                              // Appended as each app finishes - still no
                              // cursor addressing, nothing repainted.
                              process.stdout.write(
                                  renderBoardAppRow(
                                      entry,
                                      { n: report.apps.length, total: totalApps, removal },
                                      ctx
                                  )
                              );
                          }
                      }
                  }
              }
    );

    report.finishedAt = Date.now();
    report.succeeded = result;

    // Rendered even when some apps failed to plan: the decisions that were
    // reached belong next to the per-app error lines already logged, and the
    // renderer itself marks incomplete and unplanned apps.
    if (dryRun) {
        // The report is the entire product of a dry run, so no rung - `off`
        // included - suppresses it. On the board rung the plan block above
        // already rendered as a board; the per-sheet decisions stay in the
        // log, where their reasons are.
        renderDryRunReport(report);
    } else {
        emitBlockOnRung({
            rung,
            plainEmit: () => {
                for (const line of renderRunVerdictLines(report)) {
                    logger.info(line);
                }
            },
            renderBoardBlock: () => renderBoardVerdict(report, ctx),
        });
    }

    return result;
};
