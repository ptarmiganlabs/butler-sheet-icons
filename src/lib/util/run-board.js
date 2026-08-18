import { getBorderCharacters } from 'table';
import { colours } from './colour.js';
import { getSymbols, tableBorderName } from '../interactive/symbols.js';
import { parseHeadlessOption } from './headless-option.js';
import { CLEAR_REASON } from './sheet-decision-reasons.js';
import {
    selectionParts,
    describeRules,
    describeWrites,
    verdictCounts,
    verdictFacts,
    isRemovalReport,
    isOptionEnabled,
    formatElapsed,
    formatBytes,
} from './run-report-render.js';

/**
 * Rung B of the run-output ladder (issue #1074): the contact sheet.
 *
 * Static colour, written to `process.stdout` by the caller in one `write()`
 * per block - never through winston, which would prefix every row and break
 * every box. No cursor addressing, no frame timer, no repainting, so the
 * output survives being piped somewhere unexpected and there is no interrupt
 * path to get wrong.
 *
 * Every renderer here is a pure function from a run report (issue #1072) to a
 * string. The report is the single source of facts - a board that gathered
 * its own would eventually disagree with the run card underneath it, and the
 * disagreement would surface as a dry run that lies.
 *
 * Width discipline, learned from a running prototype: **pad the plain string
 * first, colour second.** The obvious `pad(colour(text))` counts ANSI escape
 * codes as width and collapses every column the moment colour is on - and it
 * passes every colour-off test, failing only on a real terminal.
 */

/**
 * Inner width of the wordmark frame, borders excluded. The frame is 410 x 270
 * in spirit - the real thumbnail size the code produces - but 52 terminal
 * columns wide in practice, inside the 72-column gate rung B is selected by.
 */
const FRAME_INNER = 50;

/**
 * Width of the label column on plan rows, after the bullet.
 */
const LABEL_WIDTH = 11;

/**
 * Width of the value column on plan rows that carry a dim detail after the
 * value; rows without a detail are not padded.
 */
const VALUE_WIDTH = 22;

/**
 * App-row column budgets. The row must fit the 72-column terminal the board
 * gate admits, in the WORST case the gate allows: the ASCII symbol set
 * (whose `[ok]`/`[!!]` markers are four columns) on exactly 72 columns.
 * The arithmetic, tested at the boundary:
 *
 *     indent 2 + marker 4 + space 1 + counter 5 ("99/99") + gap 2
 *     + name 20 + gap 2 + strip 12 + gap 2 + summary 12 + elapsed 8  = 70
 *
 * An app with more sheets than the strip column simply overflows its own
 * row - truncating the strip would hide the exact per-sheet signal it
 * exists to show - and a run of 100+ apps widens the counter; both are
 * accepted, budgeted overflows rather than silent wraps on every row.
 *
 * Exported for the live view (issue #1075): its animated app header clips
 * the same name this row will commit, and two widths meant the same app
 * appeared under two names one frame apart (issue #1110).
 */
export const NAME_WIDTH = 20;

const STRIP_WIDTH = 12;

/**
 * Width of the per-app summary column ("10/11 up", "12/12 cleared"): sized
 * for the removal vocabulary, which is the wider of the two.
 */
const SUMMARY_WIDTH = 12;

/**
 * Width of the horizontal rules separating the board's sections.
 */
const RULE_WIDTH = 64;

/**
 * Whether a code point renders two columns wide in a monospace terminal.
 *
 * The standard wcwidth East-Asian ranges: Hangul Jamo, CJK and its
 * punctuation/compatibility blocks, Hangul syllables, fullwidth forms, and
 * the supplementary ideographic planes. Implemented inline rather than
 * importing `string-width`: nothing in this epic may add a dependency (SEA
 * build), and `table`'s copy is a transitive dependency this module must not
 * reach into.
 *
 * @param {number} cp - The code point.
 *
 * @returns {boolean} True when terminals render it double-width.
 */
const isWideCodePoint = (cp) =>
    cp >= 0x1100 &&
    (cp <= 0x115f ||
        (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
        (cp >= 0xa960 && cp <= 0xa97f) ||
        (cp >= 0xac00 && cp <= 0xd7a3) ||
        (cp >= 0xf900 && cp <= 0xfaff) ||
        (cp >= 0xfe30 && cp <= 0xfe4f) ||
        (cp >= 0xff00 && cp <= 0xff60) ||
        (cp >= 0xffe0 && cp <= 0xffe6) ||
        (cp >= 0x20000 && cp <= 0x3fffd));

// Zero-width: combining marks, the zero-width space/joiner family and BOM,
// and - easy to miss - Hangul Jamo medial vowels and trailing consonants
// (U+1160-U+11FF): wcwidth renders them zero because they combine with the
// wide leading consonant, so a decomposed (NFD) Korean name must measure the
// same as its NFC form or its row's strip band drifts.
const ZERO_WIDTH = /\p{Mn}|\p{Me}|[\u1160-\u11ff\u200b-\u200f\ufeff]/u;

/**
 * Display width of a string in terminal columns.
 *
 * Counts East-Asian wide characters as two columns and combining marks as
 * zero, because this module - unlike the plain renderer, which never
 * column-aligns anything after a name - pads names into a column with the
 * sheet strip after it: a miscounted name shifts that row's entire strip
 * band, which is exactly the per-app comparison the board exists for.
 *
 * Exported for the live view (issue #1075), which pads its status markers
 * with the same width model so ASCII and Unicode symbol sets align alike.
 *
 * @param {string} text - The text to measure.
 *
 * @returns {number} The width in columns.
 */
export const width = (text) => {
    let columns = 0;

    for (const ch of text) {
        if (ZERO_WIDTH.test(ch)) {
            continue;
        }
        columns += isWideCodePoint(ch.codePointAt(0)) ? 2 : 1;
    }

    return columns;
};

/**
 * Pad plain text to a target width. Never truncates.
 *
 * Exported for the live view (issue #1075), which shares this width model so
 * its animated rows align with the board rows they commit next to.
 *
 * @param {string} text - Plain text, no ANSI codes.
 * @param {number} target - Target width in columns.
 *
 * @returns {string} The padded text.
 */
export const padTo = (text, target) =>
    width(text) >= target ? text : text + ' '.repeat(target - width(text));

/**
 * Clip plain text to a maximum width, marking the cut with `...`.
 *
 * Cuts by accumulated display columns, not code points, so a wide character
 * cannot smuggle two columns past the budget. The budget floor guards the
 * degenerate `max <= 3` case, where a negative slice index would return the
 * wrong end of the string; callers here use 20+.
 *
 * Exported for the live view (issue #1075) - same reasoning as {@link padTo}.
 *
 * @param {string} text - Plain text, no ANSI codes.
 * @param {number} max - Maximum width in columns.
 *
 * @returns {string} The clipped text.
 */
export const clip = (text, max) => {
    if (width(text) <= max) {
        return text;
    }

    const budget = Math.max(1, max - 3);
    let kept = '';
    for (const ch of text) {
        if (width(kept + ch) > budget) {
            break;
        }
        kept += ch;
    }

    return `${kept}...`;
};

/**
 * Build the rendering context the board renderers draw from.
 *
 * The context is an argument rather than module state so tests can render
 * both symbol sets and both palettes in one process. The defaults compose
 * the real detectors: the palette is the load-time `colours` (inert when
 * colour is off, so no renderer branches), the symbols follow
 * `BSI_ASCII_ONLY`, and the frame borders follow `tableBorderName()`'s
 * existing norc/ramac split.
 *
 * @param {object} [overrides] - Any of `palette`, `symbols`, `border`.
 *
 * @returns {{palette: object, symbols: object, border: object}} The context.
 */
export const boardContext = (overrides = {}) => ({
    palette: overrides.palette ?? colours,
    symbols: overrides.symbols ?? getSymbols(),
    border: overrides.border ?? getBorderCharacters(tableBorderName()),
});

/**
 * The wordmark frame: a 410 x 270 thumbnail frame, because the frame is the
 * thing the tool makes. Replaces the plain run header on the terminal; the
 * plain header still goes to the log underneath.
 *
 * @param {object} header - Header facts.
 * @param {string} header.version - The Butler Sheet Icons version.
 * @param {string} header.jobLabel - Short job description, e.g. `QSEoW sheet thumbnails`.
 * @param {object} ctx - From {@link boardContext}.
 *
 * @returns {string} The frame, newline-terminated.
 */
export const renderBoardHeader = ({ version, jobLabel }, ctx) => {
    const { palette, symbols, border } = ctx;

    const title = ` 410 ${symbols.times} 270 `;
    const top = `${border.topLeft}${border.topBody}${title}${border.topBody.repeat(
        Math.max(1, FRAME_INNER - 1 - width(title))
    )}${border.topRight}`;
    const bottom = `${border.bottomLeft}${border.bottomBody.repeat(FRAME_INNER)}${border.bottomRight}`;
    const empty = ' '.repeat(FRAME_INNER);

    // Padded plain, coloured after: the gap is computed from the unpainted
    // name and version so the right edge cannot drift when colour is on.
    // The version is clipped like the job label below it - release-please
    // versions are short, but a prerelease/build-metadata string must not
    // push the right border out of the frame.
    const name = 'BUTLER SHEET ICONS';
    const shownVersion = clip(version, FRAME_INNER - 6 - width(name) - 1);
    const gap = Math.max(1, FRAME_INNER - 3 - width(name) - width(shownVersion) - 3);
    const label = clip(jobLabel, FRAME_INNER - 6);

    const interior = [
        empty,
        `   ${palette.bold(name)}${' '.repeat(gap)}${palette.dim(shownVersion)}   `,
        `   ${palette.dim(padTo(label, FRAME_INNER - 6))}   `,
        empty,
    ];

    const edge = palette.dim(border.bodyLeft);
    const lines = [
        `  ${palette.dim(top)}`,
        ...interior.map((content) => `  ${edge}${content}${edge}`),
        `  ${palette.dim(bottom)}`,
    ];

    return `\n${lines.join('\n')}\n`;
};

/**
 * One plan row: bullet, label, value, optional dim detail.
 *
 * @param {object} ctx - From {@link boardContext}.
 * @param {object} row - The row.
 * @param {string} row.label - The label.
 * @param {string} row.value - The value, plain.
 * @param {string} [row.detail] - Detail rendered dim after the value.
 * @param {boolean} [row.passive] - Hollow bullet for rows that describe a
 *     side effect kept for the operator rather than an action taken.
 *
 * @returns {string} The row.
 */
const planRow = (ctx, { label, value, detail = '', passive = false }) => {
    const { palette, symbols } = ctx;
    const bullet = passive ? palette.dim(symbols.bulletOff) : palette.green(symbols.bulletOn);

    const paddedValue = detail === '' ? value : padTo(value, VALUE_WIDTH);
    const detailPart = detail === '' ? '' : `  ${palette.dim(detail)}`;

    return `  ${bullet} ${padTo(label, LABEL_WIDTH)} ${paddedValue}${detailPart}`;
};

/**
 * The separator the strip glyphs and rules join with: ` · ` on Unicode
 * terminals, ` - ` on ASCII ones.
 *
 * Exported for the live view (issue #1075), so the board rung and the live
 * rung separate details with one expression rather than two copies that
 * drift (issue #1110).
 *
 * @param {object} ctx - From {@link boardContext}.
 *
 * @returns {string} The separator.
 */
export const dotSep = (ctx) => ` ${ctx.symbols.dot} `;

/**
 * A dim horizontal rule separating the board's sections.
 *
 * @param {object} ctx - From {@link boardContext}.
 *
 * @returns {string} The rule line.
 */
const sectionRule = (ctx) => `  ${ctx.palette.dim(ctx.symbols.rule.repeat(RULE_WIDTH))}`;

/**
 * The writes warning: the one line on the board that names the part with no
 * undo. Same suppression rule as the plain renderer - an empty selection must
 * not warn about a write that was never possible.
 *
 * @param {object} report - The report.
 * @param {object} ctx - From {@link boardContext}.
 *
 * @returns {string|null} The warning line, or null when there is nothing to warn about.
 */
const warningLine = (report, ctx) => {
    // One decision tree with the plain renderer: only the casing and voice
    // are this renderer's own.
    const writes = describeWrites(report);

    if (!writes) {
        return null;
    }

    const verb = writes.would ? 'would' : 'will';
    const text =
        writes.kind === 'clear-icons'
            ? `sheet icons and thumbnail media files ${verb} be removed from ${writes.appCount} app(s)`
            : `sheet thumbnails ${verb} be overwritten in ${writes.appCount} app(s)${writes.published}`;

    return `  ${ctx.palette.yellow(`${ctx.symbols.warning}  ${text}`)}`;
};

/**
 * The board's plan block: what the run resolved, before the first write.
 *
 * The rows render from the report's structural plan sections - the same
 * object the plain plan block and the dry-run report read - restyled, never
 * re-derived. Rule rows keep the match counts (zeroes included), because a
 * zero next to a tag the operator typed is the cheapest possible "check your
 * spelling", and here it is visible before anything is touched.
 *
 * @param {object} report - A report whose `plan` section has been recorded.
 * @param {object} ctx - From {@link boardContext}.
 *
 * @returns {string} The block, newline-terminated; empty when the report carries no plan.
 */
export const renderBoardPlan = (report, ctx) => {
    const { plan, selection } = report;
    const { palette } = ctx;

    if (!plan) {
        return '';
    }

    const sep = dotSep(ctx);
    const rows = [];

    if (plan.target) {
        if (plan.target.platform === 'qseow') {
            const scheme = isOptionEnabled(plan.target.secure) ? 'https' : 'http';
            const hostPort = plan.target.port
                ? `${plan.target.host}:${plan.target.port}`
                : plan.target.host;
            const proxy = plan.target.prefix ? `${sep}proxy "${plan.target.prefix}"` : '';
            rows.push(
                planRow(ctx, {
                    label: 'server',
                    value: hostPort,
                    detail: `${scheme}${sep}engine ${plan.target.enginePort}${sep}qrs ${plan.target.qrsPort}${proxy}`,
                })
            );
        } else {
            rows.push(planRow(ctx, { label: 'tenant', value: plan.target.tenantUrl }));
        }
    }

    if (plan.auth) {
        if (plan.auth.apiUser) {
            rows.push(
                planRow(ctx, {
                    label: 'api user',
                    value: `${plan.auth.apiUser.directory}\\${plan.auth.apiUser.userId}`,
                    detail: `cert ${plan.auth.certFile}`,
                })
            );
            rows.push(
                planRow(ctx, {
                    label: 'logon user',
                    value: `${plan.auth.logonUser.directory}\\${plan.auth.logonUser.userId}`,
                })
            );
        } else {
            let detail = '';
            if (plan.auth.skipLogin) {
                detail = 'logon skipped (--skip-login)';
            } else if (plan.auth.logonUserId) {
                detail = `logon ${plan.auth.logonUserId}`;
            }
            rows.push(planRow(ctx, { label: 'auth', value: 'API key', detail }));
        }
    }

    if (selection) {
        rows.push(
            planRow(ctx, {
                label: 'apps',
                value: String(selection.total),
                detail: selectionParts(selection).join(sep),
            })
        );
    }

    if (plan.sheetPart) {
        rows.push(
            planRow(ctx, {
                label: 'sheet part',
                value: `${plan.sheetPart.value} of ${plan.sheetPart.max}`,
                detail: plan.sheetPart.label,
            })
        );
    }

    if (plan.rules) {
        const excluded = describeRules(plan.rules.exclude);
        const blurred = describeRules(plan.rules.blur);
        rows.push(
            planRow(ctx, { label: 'exclude', value: excluded, passive: excluded === 'none' })
        );
        rows.push(planRow(ctx, { label: 'blur', value: blurred, passive: blurred === 'none' }));
    }

    if (plan.browser) {
        const window = parseHeadlessOption(plan.browser.headless) ? 'headless' : 'visible window';
        rows.push(
            planRow(ctx, {
                label: 'browser',
                value: `${plan.browser.name} (${plan.browser.version})`,
                detail: `${window}${sep}${plan.browser.pageWaitSeconds}s per sheet`,
            })
        );
    }

    if (plan.output) {
        rows.push(
            planRow(ctx, {
                label: 'images',
                value: `${plan.output.imageDir}/${plan.output.platformDir}/<app-id>`,
                passive: true,
            })
        );
    }

    if (plan.writes && (report.selection?.total ?? report.apps.length) > 0) {
        if (plan.writes.contentLibrary) {
            rows.push(
                planRow(ctx, {
                    label: 'uploads to',
                    value: `content library "${plan.writes.contentLibrary}"`,
                })
            );
        } else if (plan.writes.kind === 'thumbnails') {
            rows.push(
                planRow(ctx, {
                    label: 'uploads to',
                    value: `each app's media library, "thumbnails" folder`,
                })
            );
        }
    }

    const heading = report.dryRun
        ? `  ${palette.bold('PLAN')}  ${report.command}  ${palette.dim('(dry run)')}`
        : `  ${palette.bold('PLAN')}  ${report.command}`;

    const lines = ['', heading, '', ...rows];

    const warning = warningLine(report, ctx);
    if (warning) {
        lines.push('', warning);
    }

    lines.push('', sectionRule(ctx), '');

    return `${lines.join('\n')}\n`;
};

/**
 * The 1-based strip position of a recorded sheet row.
 *
 * Placed by the recorded 1-based sheet position, never by array order: the
 * sheet loop survives a mid-app failure and keeps recording the later
 * sheets, so row i of the array is not sheet i of the app. A row without a
 * valid 1-based `n` (every in-repo recorder sets one) falls back to its
 * array position - the same fallback in the count and the placement, so a
 * synthetic `n: 0` can neither write off the left edge nor undercount the
 * strip.
 *
 * Exported for the live view (issue #1075), whose in-progress strip clips
 * at the last recorded position - one placement rule, not two copies that
 * can disagree about the same sheet (issue #1110).
 *
 * @param {object} sheet - A recorded sheet row.
 * @param {number} i - The row's array index.
 *
 * @returns {number} The 1-based strip position.
 */
export const positionOf = (sheet, i) =>
    typeof sheet.n === 'number' && sheet.n >= 1 ? sheet.n : i + 1;

/**
 * The sheet strip for one app: one glyph per sheet *position*, placed by the
 * recorded 1-based sheet number.
 *
 * A mistyped `--exclude-sheet-tag` shows as a row of solid blocks where the
 * operator expected gaps, and a mistyped `--blur-sheet-tag` as a row with no
 * blur glyph in it - per app, so a tag that matched in two apps and not the
 * other five is obvious at a glance.
 *
 * Every position no decision was recorded for renders as the failed glyph -
 * unconditionally, not only on failed apps: those sheets were not processed,
 * and a shortened or compacted strip would read as a smaller app rather than
 * a broken run. This covers a failed app's missing tail and, because the
 * sheet loop survives a mid-app failure and keeps recording later sheets,
 * gaps in the middle of the strip.
 *
 * Exported for the equal-width property test - the strip must be the same
 * width in both symbol sets, which is what `symbols.js` guarantees per glyph
 * and this function must not break in assembly.
 *
 * @param {object} appEntry - A per-app entry from the report.
 * @param {object} symbols - The symbol set in use.
 *
 * @returns {Array<{glyph: string, kind: string}>} One glyph per sheet, tagged
 *     with its kind for colouring.
 */
export const stripForApp = (appEntry, symbols) => {
    const failedCell = { glyph: symbols.stripFailed, kind: 'failed' };
    const capturedCell = { glyph: symbols.stripCaptured, kind: 'captured' };
    const excludedCell = { glyph: symbols.stripExcluded, kind: 'excluded' };
    const glyphFor = {
        update: capturedCell,
        blur: { glyph: symbols.stripBlurred, kind: 'blurred' },
        skip: excludedCell,
    };

    // A clear with nothing to clear is the removal run's "excluded":
    // rendering it as a solid block would show a wall of cleared icons for
    // an app that was mostly empty, and would contradict the verdict's
    // cleared count for the same run.
    const cellFor = (sheet) =>
        sheet.action === 'clear'
            ? sheet.reason === CLEAR_REASON.NO_ICON
                ? excludedCell
                : capturedCell
            : (glyphFor[sheet.action] ?? failedCell);

    const count = Math.max(
        typeof appEntry.sheetCount === 'number' ? appEntry.sheetCount : 0,
        appEntry.sheets.length,
        ...appEntry.sheets.map(positionOf)
    );

    const cells = Array.from({ length: count }, () => failedCell);
    appEntry.sheets.forEach((sheet, i) => {
        cells[positionOf(sheet, i) - 1] = cellFor(sheet);
    });

    return cells;
};

const STRIP_PAINT = Object.freeze({
    captured: (palette) => palette.green,
    blurred: (palette) => palette.yellow,
    excluded: (palette) => palette.dim,
    failed: (palette) => palette.red,
});

/**
 * Paint strip cells into one coloured string. The single place a cell's
 * `kind` meets its colour - both the committed board row and the live
 * view's animated strip go through here (issue #1110).
 *
 * @param {Array<{glyph: string, kind: string}>} cells - From {@link stripForApp}.
 * @param {object} palette - The palette in use.
 *
 * @returns {string} The painted strip.
 */
const paintCells = (cells, palette) =>
    cells.map(({ glyph, kind }) => STRIP_PAINT[kind](palette)(glyph)).join('');

/**
 * The coloured sheet strip for one app, unpadded.
 *
 * Extracted for the live view (issue #1075), whose per-app block shows the
 * same strip while the app is still running: one glyph function, so the
 * animated strip and the committed board row cannot colour the same sheet
 * two different ways.
 *
 * `limit` exists for that in-progress rendering: `stripForApp` gap-fills
 * every undecided position with the failed glyph, which is right at the end
 * of an app - those sheets were not processed - and wrong in the middle of
 * one, where the unreached tail is simply the future. The live view passes
 * the last recorded position, so interior gaps (a mid-app failure the sheet
 * loop survived) still show as failed while the tail stays unpainted.
 *
 * @param {object} appEntry - A per-app entry from the report.
 * @param {object} ctx - From {@link boardContext}.
 * @param {number} [limit] - Render only the first `limit` cells; all by default.
 *
 * @returns {string} The painted strip.
 */
export const renderSheetStrip = (appEntry, ctx, limit = Infinity) =>
    paintCells(stripForApp(appEntry, ctx.symbols).slice(0, limit), ctx.palette);

/**
 * One per-app strip row, appended to the board as the app finishes.
 *
 * Append-only by design (issue #1074's open question, resolved): one line per
 * app as it completes is still useful during a six-minute run, and it needs
 * no cursor addressing and repaints nothing.
 *
 * @param {object} appEntry - A per-app entry from the report.
 * @param {object} position - Where in the run this app sits.
 * @param {number} position.n - 1-based app number.
 * @param {number} position.total - Number of apps in the run.
 * @param {boolean} position.removal - Whether this is an icon-removal run.
 * @param {object} ctx - From {@link boardContext}.
 *
 * @returns {string} The row, newline-terminated.
 */
export const renderBoardAppRow = (appEntry, { n, total, removal }, ctx) => {
    const { palette, symbols } = ctx;

    const marker = appEntry.failed ? palette.red(symbols.failed) : palette.green(symbols.done);

    const counter = padTo(`${n}/${total}`, width(`${total}/${total}`));
    const name = padTo(clip(appEntry.name ?? appEntry.id ?? '', NAME_WIDTH), NAME_WIDTH);

    const cells = stripForApp(appEntry, symbols);
    const strip = paintCells(cells, palette) + ' '.repeat(Math.max(0, STRIP_WIDTH - cells.length));

    const counts = verdictCounts({ apps: [appEntry] });
    const sheetCount = appEntry.sheetCount ?? counts.seen;
    // Removal counts only the icons actually cleared - the same rule the
    // verdict applies - so the row and the verdict cannot state two
    // different numbers for one app; no-icon sheets show in the strip.
    const summary = removal
        ? `${counts.cleared}/${sheetCount} cleared`
        : `${appEntry.sheetsUpdated ?? counts.captured}/${sheetCount} up`;
    const summaryPart = appEntry.failed
        ? palette.red(padTo('failed', SUMMARY_WIDTH))
        : padTo(summary, SUMMARY_WIDTH);

    const elapsed =
        typeof appEntry.durationMs === 'number'
            ? `  ${palette.dim(formatElapsed(appEntry.durationMs))}`
            : '';

    return `  ${marker} ${counter}  ${name}  ${strip}  ${summaryPart}${elapsed}\n`;
};

/**
 * The board's verdict block: what actually changed, and whether it worked.
 *
 * All counts and sums come from {@link verdictFacts} and
 * {@link verdictCounts}, shared with the plain verdict, so the two cannot
 * describe different runs.
 *
 * @param {object} report - The report, after the app loop has finished and
 *     `succeeded`/`finishedAt` have been set on it.
 * @param {object} ctx - From {@link boardContext}.
 *
 * @returns {string} The block, newline-terminated.
 */
export const renderBoardVerdict = (report, ctx) => {
    const { palette, symbols } = ctx;
    const sep = `  ${palette.dim(symbols.dot)}  `;

    const elapsed =
        typeof report.startedAt === 'number' && typeof report.finishedAt === 'number'
            ? formatElapsed(report.finishedAt - report.startedAt)
            : null;

    const facts = verdictFacts(report);

    if (facts.emptySelection) {
        const lines = [
            '',
            sectionRule(ctx),
            '',
            `  ${symbols.cursor} ${palette.red('0 apps selected - nothing was done')}`,
            '',
        ];

        return `${lines.join('\n')}\n`;
    }

    const removal = isRemovalReport(report);
    const counts = verdictCounts(report);

    const parts = [];
    if (report.succeeded) {
        parts.push(palette.green(elapsed ? `done in ${elapsed}` : 'done'));
    } else {
        parts.push(palette.red('FAILED') + (elapsed ? ` ${palette.dim(`after ${elapsed}`)}` : ''));
    }
    parts.push(`${facts.okApps} app(s) ok`);
    if (facts.failedApps > 0) {
        parts.push(palette.red(`${facts.failedApps} failed`));
    }

    if (removal) {
        parts.push(`${counts.cleared} icon(s) cleared`);
    } else if (facts.sheetsUpdated !== null) {
        parts.push(`${facts.sheetsUpdated} thumbnails uploaded`);
    }

    const legendEntry = (kind, count, label) =>
        `${STRIP_PAINT[kind](palette)(symbols[`strip${kind[0].toUpperCase()}${kind.slice(1)}`])} ${count} ${label}`;

    const legendParts = removal
        ? [
              legendEntry('captured', counts.cleared, 'cleared'),
              legendEntry('excluded', counts.noIcon, 'had no icon'),
          ]
        : [
              legendEntry('captured', counts.captured, 'captured'),
              legendEntry('blurred', counts.blurred, 'blurred'),
              legendEntry('excluded', counts.excluded, 'excluded'),
          ];

    // The failed legend entry counts what the strips actually show - cells,
    // not apps: every other legend number equals its glyph's occurrences on
    // the strips, and this one must too or the legend disagrees with the
    // board it explains. The failed-app count is already on the line above.
    const failedCells = report.apps.reduce(
        (sum, app) =>
            sum + stripForApp(app, symbols).filter((cell) => cell.kind === 'failed').length,
        0
    );
    if (failedCells > 0) {
        legendParts.push(legendEntry('failed', failedCells, 'not processed'));
    } else if (facts.failedApps > 0) {
        // An app that failed before its sheets were even enumerated has an
        // empty strip - zero failed cells to count - but the failure must
        // not vanish from the legend, so this one shape falls back to the
        // app count.
        legendParts.push(legendEntry('failed', facts.failedApps, 'app(s) failed'));
    }

    const lines = [
        '',
        sectionRule(ctx),
        '',
        `  ${symbols.cursor} ${parts.join(sep)}`,
        `    ${legendParts.join('   ')}`,
    ];

    if (!removal && facts.imagesKeptFiles !== null && report.plan?.output) {
        lines.push(
            `    ${palette.dim(
                `images in ${report.plan.output.imageDir}/${report.plan.output.platformDir}${dotSep(ctx)}${facts.imagesKeptFiles} file(s)${dotSep(ctx)}${formatBytes(facts.imagesKeptBytes ?? 0)}`
            )}`
        );
    }

    if (removal && facts.mediaFilesDeleted !== null) {
        lines.push(
            `    ${palette.dim(`${facts.mediaFilesDeleted} thumbnail media file(s) deleted from app media libraries`)}`
        );
    }

    lines.push('');

    return `${lines.join('\n')}\n`;
};
