import { logger, getLoggingLevel, setLoggingLevel } from '../../globals.js';
import { runOverApps } from './run-over-apps.js';
import {
    RUN_FRAME,
    renderRunPlanLines,
    renderRunVerdictLines,
    verdictCounts,
    isRemovalReport,
    logRunHeader,
} from './run-report-render.js';
import { selectRung, rendersAsBoard, RUNG } from './select-rung.js';
import {
    boardContext,
    renderBoardHeader,
    renderBoardPlan,
    renderBoardAppRow,
    renderBoardVerdict,
} from './run-board.js';
import {
    createRunLiveView,
    activateLiveView,
    activeLiveView,
    restoreLiveTerminal,
    findConsoleTransport,
} from './run-live.js';
import { toOptionValueList } from './option-values.js';
import { measureImageFiles } from './image-dir.js';
import {
    isInterrupted,
    interruptSignal,
    beginInterruptibleRun,
    endInterruptibleRun,
} from './interrupt.js';
import { isAbortArtifact } from './abort-artifact.js';

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
    // The shared lookup from run-live.js, so this per-block silencing and
    // the live view's run-long silencing can never disagree about which
    // transport is the console. A missing transport (injected test loggers)
    // means "nothing to silence", not a crash.
    const consoleTransport = findConsoleTransport(logger);

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
    // The live view owns the cursor, so a block written straight to stdout
    // would tear through the animated region - it is committed above the
    // region instead. The console transport is already silenced for the
    // life of the view; the nested silence below is a harmless no-op.
    const live = activeLiveView();
    if (live) {
        withConsoleSilenced(plainEmit);
        live.commitBlock(renderBoardBlock());

        return;
    }

    if (rendersAsBoard(rung)) {
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
 * Start the live run view (rung C, issue #1075) when this run qualifies.
 *
 * The second composition seam next to {@link decideRung}: the only place the
 * live view meets the real `process.stdout`, the real board context and the
 * real logger. Called by the run workers straight after `emitRunHeader`, so
 * the static header has already been written before the view takes the
 * cursor.
 *
 * Only real runs on the `live` rung get a view. A dry run finishes in
 * seconds, has no browser and its product is the report text - animating it
 * would add risk for nothing - so dry runs on the live rung keep the board
 * rendering via the `rendersAsBoard` fallback, as does any worker that never
 * calls this. Returns null in every declined case, and callers treat null as
 * "not live" throughout.
 *
 * @param {object} run - The run.
 * @param {string} run.rung - The rung returned by {@link emitRunHeader}.
 * @param {boolean} [run.dryRun] - Whether this run stops before the writes.
 *
 * @returns {object|null} The active live view, or null.
 */
export const startLiveRunView = ({ rung, dryRun = false }) => {
    // Any stale view is stopped before this run decides anything - even on
    // the declined paths. Creating a new view while an old one still held
    // the console would make the new one capture "silenced" as the state to
    // restore, permanently silencing the transport when it stops (issue
    // #1110). No production flow leaves a view active here; this makes that
    // a guarantee instead of an observation.
    restoreLiveTerminal();

    if (rung !== RUNG.LIVE || dryRun) {
        return null;
    }

    const view = createRunLiveView({
        stream: process.stdout,
        ctx: boardContext(),
        log: logger,
    });

    if (view) {
        activateLiveView(view);
    }

    return view;
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
 * The rung is required, not defaulted: a permissive default here would let a
 * future worker forget the threading and silently print the `=`-framed plain
 * banner into the middle of board output - the exact divergence the
 * rung-threading exists to make impossible.
 *
 * @param {string} command - The command being planned, e.g. `qseow create-sheet-thumbnails`.
 * @param {string} rung - The rung returned by {@link emitRunHeader}.
 *
 * @returns {void}
 */
export const announceDryRun = (command, rung) => {
    if (!rung) {
        // Loud, not lenient: a defaulted rung here would print the plain
        // banner under a board header - divergence with no failing test.
        throw new Error('announceDryRun requires the rung returned by emitRunHeader');
    }

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
 * Mark the app that was in flight when the signal arrived (issue #1107).
 *
 * Not the same as failing it, and the distinction is the point. Shutdown works
 * by closing the browser under the run, so the app's last await rejects and it
 * arrives in the same catch a genuinely broken app would - identical from
 * there, and counted identically unless something says otherwise. An operator
 * reading `1 failed` after pressing Ctrl-C would go looking for a problem with
 * that app, and there is none: it was abandoned, and on both platforms an
 * abandoned app is left exactly as it was, because every write happens after
 * the capture loop the interrupt cut short.
 *
 * `remove-sheet-icons` is the exception worth knowing about: it writes per
 * sheet, so an app interrupted there is genuinely part-cleared. It is still
 * `interrupted` rather than `failed` - nothing went wrong - and the verdict's
 * cleared count says how far it got.
 *
 * @param {object} report - The report.
 * @param {string} appId - The app that was abandoned.
 *
 * @returns {void}
 */
const markAppInterrupted = (report, appId) => {
    const entry = report.apps.find((app) => app.id === appId);

    if (entry) {
        entry.interrupted = true;
    } else {
        addAppToReport(report, { id: appId }).interrupted = true;
    }
};

/**
 * Mark the app the loop is currently inside, and clear it on the way out.
 *
 * The report needs to know which app was in flight when a signal landed, and
 * only the loop can say: by the time `stampInterruptOutcome` runs, on the
 * watchdog and second-signal paths, the worker has not returned and no other
 * field distinguishes "still running" from "finished". Inferring it from a
 * timing field is what this replaced, and that inference was wrong for dry
 * runs and one refactor away from being wrong for real ones (issue #1107).
 *
 * A no-op until the processor has created the entry. That is not a gap: an app
 * abandoned before it recorded anything has nothing to report about either, and
 * `appsNotStarted` accounts for it.
 *
 * @param {object} report - The report.
 * @param {string} appId - The app now being processed.
 *
 * @returns {void}
 */
const markAppInFlight = (report, appId) => {
    const entry = report.apps.find((app) => app.id === appId);

    if (entry) {
        entry.inFlight = true;
    }
};

/**
 * Clear the in-flight mark. Belongs in a `finally`.
 *
 * @param {object} report - The report.
 * @param {string} appId - The app that has finished, however it finished.
 *
 * @returns {void}
 */
const clearAppInFlight = (report, appId) => {
    const entry = report.apps.find((app) => app.id === appId);

    if (entry) {
        entry.inFlight = false;
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
    report.selection = {
        ...selectionCounts({ namedAppIds, selectorAppIds }),
        selector,
    };
};

/**
 * Deduplicated selection counts from the raw id lists.
 *
 * The one counting rule (issue #1110): `recordSelection` uses it for the
 * report, and the workers use it for the live `app list` row - previously
 * the workers counted raw list lengths, so a repeated `--appid` made the
 * live row and the plan block state different named-counts on one screen.
 *
 * @param {object} lists - The raw id lists.
 * @param {string[]} lists.namedAppIds - Apps named directly by `--appid`.
 * @param {string[]} lists.selectorAppIds - Apps contributed by the selector.
 *
 * @returns {{named: number, fromSelector: number, total: number}} The counts.
 */
export const selectionCounts = ({ namedAppIds, selectorAppIds }) => {
    const named = new Set(namedAppIds);
    const fromSelector = new Set(selectorAppIds);

    return {
        named: named.size,
        fromSelector: fromSelector.size,
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
        interrupted: false,
        inFlight: false,
    };
    report.apps.push(entry);

    // The live view (issue #1075) renders its per-app block from this same
    // entry, so handing it over here is what makes the bar structurally
    // unable to disagree with the verdict. No-op on every other rung.
    activeLiveView()?.appOpened(entry);

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

    // Repaint the live per-app block. The row was recorded first, so the
    // display can only ever show what the report already holds.
    activeLiveView()?.sheetRecorded(appEntry);
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

        // Counted by the same rule the real run's verdict uses, from the same
        // function (issue #1115). The summary used to bucket purely on
        // `sheet.action`, so a `{action: 'clear', reason: NO_ICON}` row - a
        // clear that is already a no-op - was counted among the icons that
        // would be cleared, contradicting both the row printed above it and
        // the verdict the real run prints for the identical input.
        const counts = verdictCounts(report);

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
            // The no-op clears are named rather than merely subtracted: with
            // them dropped from the cleared count and nowhere else, the
            // summary's numbers would no longer account for every sheet it
            // just listed. Same split and same order as the verdict's removal
            // line, so plan and run read against each other directly.
            const noIconNote = counts.noIcon > 0 ? `, ${counts.noIcon} with no icon` : '';
            log.info(
                `Summary: ${report.apps.length} app(s), ${counts.seen} sheets. ${counts.cleared} icon(s) would be cleared${noIconNote}, ${counts.excluded} skipped.`
            );
        } else {
            const blurNote = counts.blurred > 0 ? ` (${counts.blurred} blurred)` : '';
            log.info(
                `Summary: ${report.apps.length} app(s), ${counts.seen} sheets. ${counts.captured} would be updated${blurNote}, ${counts.excluded} skipped.`
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
 * Stamp the interrupt facts onto the report, if the run was interrupted.
 *
 * Called from {@link emitRunVerdictOnce} rather than only after the app loop,
 * because the loop is exactly what does not return on two of the three paths
 * that reach the verdict: a second signal and the shutdown watchdog both render
 * while the run is still in flight. Doing it in one place is what stops the
 * watchdog's report saying `FAILED` and counting the app it caught mid-flight
 * as `ok` - which is what it did before this moved here.
 *
 * Idempotent, so the ordinary path calling it before the verdict and a signal
 * path calling it again cannot double-count.
 *
 * @param {object} report - The report.
 * @param {number} totalApps - Size of the deduplicated selection the loop walked.
 *
 * @returns {void}
 */
const stampInterruptOutcome = (report, totalApps) => {
    if (!isInterrupted() || report.interrupted) {
        return;
    }

    // Read from the flag the loop sets and clears around each app, not
    // inferred. This used to test `typeof app.durationMs !== 'number'`, which
    // was wrong for dry runs - only the real-run worker stamps a duration, so
    // every fully-planned app looked like it was still in flight and an
    // interrupted dry run reported `0 ok, N interrupted`. It was fragile for
    // real runs too: the day anyone stamps `durationMs` at app *start* for a
    // live elapsed timer, every abandoned app would silently become `ok`.
    // The loop knows which app it is in; asking it is one line and cannot rot.
    for (const app of report.apps) {
        if (app.inFlight && !app.failed) {
            app.interrupted = true;
        }
    }

    report.interrupted = { signal: interruptSignal() };
    report.appsNotStarted = Math.max(0, (totalApps ?? report.apps.length) - report.apps.length);

    // Not a success whatever the loop counted: it broke off before reaching
    // the apps it was asked to process, and the exit code says 130/143.
    report.succeeded = false;
};

/**
 * The run whose verdict has not been emitted yet, and the rung and board
 * context it must be emitted on.
 *
 * A module-level registry, exactly like the active live view in `run-live.js`
 * and for the same reason: the signal handler has to reach the run report, and
 * it lives in a local inside `runOverAppsWithReport` fifteen frames below where
 * the signal arrives.
 *
 * @type {{report: object, rung: string, ctx: object|null}|null}
 */
let pendingVerdict = null;

/**
 * Emit the run verdict, at most once per run (issue #1107).
 *
 * Three paths can reach the end of an interrupted run, and exactly one verdict
 * must be printed whichever gets there first:
 *
 *   - the run unwinds normally and `runOverAppsWithReport` finishes;
 *   - the operator sends a second signal while it is still unwinding;
 *   - the shutdown watchdog fires because the unwinding stalled.
 *
 * The registry is cleared before the block is rendered, not after, so a render
 * that throws still cannot produce a second verdict on a later call.
 *
 * @returns {boolean} `true` if this call emitted the verdict.
 */
export const emitRunVerdictOnce = () => {
    const pending = pendingVerdict;

    if (!pending) {
        return false;
    }

    pendingVerdict = null;

    const { report, rung, ctx, totalApps } = pending;

    // The interrupt paths reach here with the run still in flight, so the
    // fields the renderers read may not have been stamped yet.
    report.finishedAt ??= Date.now();
    stampInterruptOutcome(report, totalApps);
    report.succeeded ??= false;

    // The animated region is erased and the cursor restored before the
    // verdict renders, so it goes to a quiet terminal through the ordinary
    // board path. A no-op when the signal handler already restored it.
    activeLiveView()?.stop();

    emitBlockOnRung({
        rung,
        plainEmit: () => {
            for (const line of renderRunVerdictLines(report)) {
                logger.info(line);
            }
        },
        renderBoardBlock: () => renderBoardVerdict(report, ctx),
    });

    return true;
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
 * @param {string} run.rung - The output rung returned by the worker's
 *     `emitRunHeader` call, so header and blocks share one decision. Required,
 *     not defaulted: a fallback deciding fresh here would quietly re-derive
 *     the rung from different inputs, recreating the header/blocks divergence
 *     the threading exists to eliminate. Callers without a header pass
 *     `RUNG.PLAIN` explicitly.
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
    rung,
    logPrefix,
    emptySelectionHint,
    planApp,
    processApp,
}) => {
    if (!rung) {
        // Loud, not lenient: re-deciding here from different inputs is the
        // header/blocks divergence the threading exists to eliminate, and a
        // silent plain fallback under a board header is the same bug.
        throw new Error('runOverAppsWithReport requires the rung returned by emitRunHeader');
    }

    const report = createRunReport({ command, dryRun });
    recordSelection(report, { namedAppIds, selectorAppIds, selector });
    report.plan = plan;

    // Decided once, at the start of the run (issue #1076): the worker's
    // emitRunHeader call decided the rung and passed it here, so the header
    // and the blocks cannot disagree even if the terminal changes between
    // them - structurally, because nothing here re-decides.
    const board = rendersAsBoard(rung);
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

    const removal = isRemovalReport(report);

    // One owner for "how many apps were selected", shared by the verdict
    // registration and the post-loop stamping below.
    const totalApps = new Set(appIds).size;

    // From here to the `finally` below, a signal shuts the run down
    // gracefully instead of exiting on the spot: there is work to unwind and a
    // report to render. Outside this region - the wizard, `browser install`,
    // `doctor` - the signal handler exits immediately, because waiting would
    // buy the operator nothing (issue #1107).
    beginInterruptibleRun();

    // Registered before the first app so that a signal arriving at any point
    // in the loop finds a verdict to emit, even from the watchdog.
    //
    // Real runs only. A dry run's product is `renderDryRunReport`, and a
    // verdict block is not something it may ever print: the counts come from
    // the planned-sheet rows, so an interrupted dry run would have announced
    // captures and thumbnails uploaded for a run that connected read-only and
    // changed nothing. Gating here rather than discarding after the loop is
    // what closes the window - a discard can only run if the loop returns, and
    // the signal paths reach the verdict while it is still going.
    if (!dryRun) {
        pendingVerdict = { report, rung, ctx, totalApps };
    }

    let result;
    try {
        result = await runOverApps(
            appIds,
            {
                logPrefix: dryRun ? logPrefix.plan : logPrefix.process,
                action: dryRun ? 'plan' : 'process',
                emptySelectionHint,
            },
            dryRun
                ? async (appId) => {
                      markAppInFlight(report, appId);
                      try {
                          return await planApp(appId, report);
                      } catch (err) {
                          // A planner that failed after recording its rows would
                          // otherwise render as a clean, fully-planned app - on
                          // the mode whose report is the entire product.
                          //
                          // Same three-way split as the real-run twin below: an
                          // app abandoned by a signal is not one whose planning
                          // broke, and telling a dry run's reader to "fix the
                          // errors above" when the only event was their own
                          // Ctrl-C is the confusion this change exists to remove.
                          if (isInterrupted() && isAbortArtifact(err)) {
                              markAppInterrupted(report, appId);
                          } else {
                              markAppFailed(report, appId);
                          }
                          throw err;
                      } finally {
                          clearAppInFlight(report, appId);
                      }
                  }
                : async (appId, position) => {
                      const appStartedAt = Date.now();
                      // The loop's own position, not a re-count: one owner for
                      // the number the log line, the live block and the committed
                      // row all state (issue #1110).
                      activeLiveView()?.appStarted({
                          n: position.n,
                          total: position.total,
                          id: appId,
                      });
                      markAppInFlight(report, appId);
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
                          //
                          // An app that was in flight when the signal arrived
                          // arrives here too - shutdown closes the browser under
                          // it, so its last await rejects like any other failure.
                          // The flag is the only thing that can tell the two
                          // apart from inside this catch (issue #1107).
                          // Same test the app loop applies, so the report's
                          // classification and the loop's counts cannot
                          // disagree about one app.
                          if (isInterrupted() && isAbortArtifact(err)) {
                              markAppInterrupted(report, appId);
                          } else {
                              markAppFailed(report, appId);
                          }
                          throw err;
                      } finally {
                          // Both paths above guarantee the entry exists by now.
                          // Stamped by the loop, not the processors: one clock
                          // for both platform twins.
                          const entry = report.apps.find((app) => app.id === appId);
                          if (entry) {
                              entry.inFlight = false;
                              entry.durationMs = Date.now() - appStartedAt;
                              if (board) {
                                  // Appended as each app finishes. With a live
                                  // view active the identical row is committed
                                  // above the animated region instead of being
                                  // appended raw - one renderer, two carriers.
                                  const row = renderBoardAppRow(
                                      entry,
                                      { n: position.n, total: position.total, removal },
                                      ctx
                                  );
                                  const live = activeLiveView();
                                  if (live) {
                                      live.appFinished(entry, row);
                                  } else {
                                      process.stdout.write(row);
                                  }
                              }
                          }
                      }
                  }
        );
    } finally {
        endInterruptibleRun();
    }

    report.finishedAt = Date.now();

    if (isInterrupted()) {
        // Through the same helper the signal paths use, so the three routes to
        // a verdict cannot describe the same run differently.
        stampInterruptOutcome(report, totalApps);
    } else {
        report.succeeded = result;
    }

    // The collapse (issue #1075): the animated region is erased and the
    // cursor restored *before* the verdict renders, so the verdict below
    // goes to a quiet terminal through the ordinary board path - the
    // active-view check in emitBlockOnRung finds nothing and falls through.
    activeLiveView()?.stop();

    // Rendered even when some apps failed to plan: the decisions that were
    // reached belong next to the per-app error lines already logged, and the
    // renderer itself marks incomplete and unplanned apps.
    if (dryRun) {
        // The report is the entire product of a dry run, so no rung - `off`
        // included - suppresses it. On the board rung the plan block above
        // already rendered as a board; the per-sheet decisions stay in the
        // log, where their reasons are. Nothing to discard: a dry run never
        // registered a verdict in the first place.
        renderDryRunReport(report);
    } else {
        // Through the once-only seam, not inline: a second signal or the
        // shutdown watchdog can reach the same verdict from the signal
        // handler, and the operator must see it exactly once (issue #1107).
        emitRunVerdictOnce();
    }

    return isInterrupted() ? false : result;
};
