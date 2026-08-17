import { getBorderCharacters } from 'table';
import { colours } from './colour.js';
import { getSymbols, tableBorderName } from '../interactive/symbols.js';
import { parseHeadlessOption } from './headless-option.js';
import {
    selectionParts,
    describeRules,
    verdictCounts,
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
 * Width of the app-name column on strip rows.
 */
const NAME_WIDTH = 24;

/**
 * Width of the sheet-strip column. An app with more sheets than this simply
 * overflows the column for its own row - truncating the strip would hide the
 * exact per-sheet signal the strip exists to show.
 */
const STRIP_WIDTH = 18;

/**
 * Width of the horizontal rules separating the board's sections.
 */
const RULE_WIDTH = 64;

/**
 * Display width of a string, counted in code points.
 *
 * Not `.length`, which counts UTF-16 code units and would make a surrogate
 * pair two columns. Deliberately not a full grapheme/East-Asian-width
 * measure either - every symbol this module emits is single-width by the
 * rules `symbols.js` enforces, and app names are user data rendered as-is,
 * matching the plain renderer's behaviour.
 *
 * @param {string} text - The text to measure.
 *
 * @returns {number} The width in columns.
 */
const width = (text) => [...text].length;

/**
 * Pad plain text to a target width. Never truncates.
 *
 * @param {string} text - Plain text, no ANSI codes.
 * @param {number} target - Target width in columns.
 *
 * @returns {string} The padded text.
 */
const padTo = (text, target) =>
    width(text) >= target ? text : text + ' '.repeat(target - width(text));

/**
 * Clip plain text to a maximum width, marking the cut with `...`.
 *
 * @param {string} text - Plain text, no ANSI codes.
 * @param {number} max - Maximum width in columns.
 *
 * @returns {string} The clipped text.
 */
const clip = (text, max) =>
    width(text) <= max ? text : `${[...text].slice(0, max - 3).join('')}...`;

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
    const name = 'BUTLER SHEET ICONS';
    const gap = Math.max(1, FRAME_INNER - 3 - width(name) - width(version) - 3);
    const label = clip(jobLabel, FRAME_INNER - 6);

    const interior = [
        empty,
        `   ${palette.bold(name)}${' '.repeat(gap)}${palette.dim(version)}   `,
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
 * @param {object} ctx - From {@link boardContext}.
 *
 * @returns {string} The separator.
 */
const dotSep = (ctx) => ` ${ctx.symbols.dot} `;

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
    const { writes } = report.plan;
    const appCount = report.selection?.total ?? report.apps.length;

    if (!writes || appCount === 0) {
        return null;
    }

    const verb = report.dryRun ? 'would' : 'will';
    let text;
    if (writes.kind === 'clear-icons') {
        text = `sheet icons and thumbnail media files ${verb} be removed from ${appCount} app(s)`;
    } else {
        const published =
            writes.publishedAppCount === null || writes.publishedAppCount === undefined
                ? ''
                : `, ${writes.publishedAppCount} of them published`;
        text = `sheet thumbnails ${verb} be overwritten in ${appCount} app(s)${published}`;
    }

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
 * The sheet strip for one app: one glyph per recorded sheet, in sheet order.
 *
 * A mistyped `--exclude-sheet-tag` shows as a row of solid blocks where the
 * operator expected gaps, and a mistyped `--blur-sheet-tag` as a row with no
 * blur glyph in it - per app, so a tag that matched in two apps and not the
 * other five is obvious at a glance.
 *
 * When the app failed with sheets unrecorded, the missing tail is filled with
 * the failed glyph: those sheets were not captured, and a shortened strip
 * would read as a smaller app rather than a broken run.
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
    const glyphFor = {
        update: { glyph: symbols.stripCaptured, kind: 'captured' },
        blur: { glyph: symbols.stripBlurred, kind: 'blurred' },
        skip: { glyph: symbols.stripExcluded, kind: 'excluded' },
        clear: { glyph: symbols.stripCaptured, kind: 'captured' },
    };

    const cells = appEntry.sheets.map(
        (sheet) => glyphFor[sheet.action] ?? { glyph: symbols.stripFailed, kind: 'failed' }
    );

    if (appEntry.failed && typeof appEntry.sheetCount === 'number') {
        while (cells.length < appEntry.sheetCount) {
            cells.push({ glyph: symbols.stripFailed, kind: 'failed' });
        }
    }

    return cells;
};

const STRIP_PAINT = Object.freeze({
    captured: (palette) => palette.green,
    blurred: (palette) => palette.yellow,
    excluded: (palette) => palette.dim,
    failed: (palette) => palette.red,
});

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
    const strip =
        cells.map(({ glyph, kind }) => STRIP_PAINT[kind](palette)(glyph)).join('') +
        ' '.repeat(Math.max(0, STRIP_WIDTH - cells.length));

    const counts = verdictCounts({ apps: [appEntry] });
    const sheetCount = appEntry.sheetCount ?? counts.seen;
    const summary = removal
        ? `${counts.cleared + counts.noIcon}/${sheetCount} cleared`
        : `${appEntry.sheetsUpdated ?? counts.captured}/${sheetCount} up`;
    const summaryPart = appEntry.failed ? palette.red(padTo('failed', 10)) : padTo(summary, 10);

    const elapsed =
        typeof appEntry.durationMs === 'number'
            ? `  ${palette.dim(formatElapsed(appEntry.durationMs))}`
            : '';

    return `  ${marker} ${counter}  ${name}  ${strip}  ${summaryPart}${elapsed}\n`;
};

/**
 * Sums a nullable per-app numeric field, returning null when never recorded.
 * Mirrors the plain verdict's rule: a number on the board is always a number
 * that happened.
 *
 * @param {object} report - The report.
 * @param {string} field - The per-app field name.
 *
 * @returns {number|null} The sum, or null.
 */
const sumAppField = (report, field) => {
    let sum = null;

    for (const app of report.apps) {
        if (typeof app[field] === 'number') {
            sum = (sum ?? 0) + app[field];
        }
    }

    return sum;
};

/**
 * The board's verdict block: what actually changed, and whether it worked.
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

    if ((report.selection?.total ?? 0) === 0 && report.apps.length === 0) {
        const lines = [
            '',
            sectionRule(ctx),
            '',
            `  ${symbols.cursor} ${palette.red('0 apps selected - nothing was done')}`,
            '',
        ];

        return `${lines.join('\n')}\n`;
    }

    const failedApps = report.apps.filter((app) => app.failed).length;
    const okApps = report.apps.length - failedApps;
    const removal = isRemovalReport(report);
    const counts = verdictCounts(report);

    const parts = [];
    if (report.succeeded) {
        parts.push(palette.green(elapsed ? `done in ${elapsed}` : 'done'));
    } else {
        parts.push(palette.red('FAILED') + (elapsed ? ` ${palette.dim(`after ${elapsed}`)}` : ''));
    }
    parts.push(`${okApps} app(s) ok`);
    if (failedApps > 0) {
        parts.push(palette.red(`${failedApps} failed`));
    }

    if (removal) {
        parts.push(`${counts.cleared} icon(s) cleared`);
    } else {
        const uploaded = sumAppField(report, 'sheetsUpdated');
        if (uploaded !== null) {
            parts.push(`${uploaded} thumbnails uploaded`);
        }
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
    if (failedApps > 0) {
        legendParts.push(legendEntry('failed', failedApps, 'app(s) failed'));
    }

    const lines = [
        '',
        sectionRule(ctx),
        '',
        `  ${symbols.cursor} ${parts.join(sep)}`,
        `    ${legendParts.join('   ')}`,
    ];

    const imagesKeptFiles = sumAppField(report, 'imagesKeptFiles');
    if (!removal && imagesKeptFiles !== null && report.plan?.output) {
        const bytes = sumAppField(report, 'imagesKeptBytes') ?? 0;
        lines.push(
            `    ${palette.dim(
                `images in ${report.plan.output.imageDir}/${report.plan.output.platformDir}${dotSep(ctx)}${imagesKeptFiles} file(s)${dotSep(ctx)}${formatBytes(bytes)}`
            )}`
        );
    }

    const mediaFilesDeleted = sumAppField(report, 'mediaFilesDeleted');
    if (removal && mediaFilesDeleted !== null) {
        lines.push(
            `    ${palette.dim(`${mediaFilesDeleted} thumbnail media file(s) deleted from app media libraries`)}`
        );
    }

    lines.push('');

    return `${lines.join('\n')}\n`;
};
