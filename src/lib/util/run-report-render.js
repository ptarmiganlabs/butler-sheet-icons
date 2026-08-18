import { CLEAR_REASON } from './sheet-decision-reasons.js';
import { parseHeadlessOption } from './headless-option.js';

/**
 * Rung A of the run-output ladder (issue #1073): the plain renderer.
 *
 * Pure functions from a run report to arrays of strings - no API calls, no
 * config reading, no I/O, no imports from globals. That is what makes every
 * block snapshot-testable, and it is also what keeps this module importable
 * from anywhere (leaf commands included) without dragging the logger's module
 * graph into sixty test mock factories.
 *
 * Everything this module itself emits - headings, rules, labels - is pure
 * ASCII, deliberately: this is the rung that has to survive a legacy Windows
 * console and a non-UTF-8 code page without `symbols.js` being consulted at
 * all. App and sheet *names* are user data and are passed through untouched;
 * ASCII-purifying them would corrupt the one thing the operator needs to
 * recognise (see the scope note on #1073).
 */

/**
 * The horizontal rule framing the header and closing the verdict.
 */
export const RUN_FRAME = '='.repeat(60);

/**
 * Width of the label column in the plan and verdict blocks. Two leading
 * spaces plus this padding puts every value in the same column.
 */
const LABEL_WIDTH = 14;

/**
 * One aligned `label value` line for the plan and verdict blocks.
 *
 * @param {string} label - Left-hand label, e.g. `apps`.
 * @param {string} value - The value text.
 *
 * @returns {string} The padded line.
 */
const row = (label, value) => `  ${label.padEnd(LABEL_WIDTH)}${value}`;

/**
 * The run header: what is running and on which platform.
 *
 * This subsumes the former `App version: x.y.z` line, which was logged from
 * eleven separate call sites - the version lives here now, next to what the
 * command is about to do, rather than as a bare number.
 *
 * @param {string} version - The Butler Sheet Icons version.
 * @param {string} jobLabel - Short job description, e.g. `QSEoW sheet thumbnails`.
 *
 * @returns {string[]} The header lines.
 */
export const renderRunHeaderLines = (version, jobLabel) => [
    RUN_FRAME,
    ` BUTLER SHEET ICONS ${version} -- ${jobLabel}`,
    RUN_FRAME,
];

/**
 * Emit the run header through a logger.
 *
 * The logger is a parameter, not an import: every call site already has one,
 * and taking it keeps this module free of the globals dependency.
 *
 * @param {object} log - Logger exposing `info`.
 * @param {string} version - The Butler Sheet Icons version.
 * @param {string} jobLabel - Short job description.
 *
 * @returns {void}
 */
export const logRunHeader = (log, version, jobLabel) => {
    for (const line of renderRunHeaderLines(version, jobLabel)) {
        log.info(line);
    }
};

/**
 * `true`/'true' handling for boolean-ish CLI options: Commander delivers a
 * boolean from a default and a string from the command line or an env var.
 *
 * Used for `secure`, whose connection-side consumer applies exactly this test
 * (`qseow-enigma.js`). NOT used for `headless`: the launch path interprets
 * unknown values as headless-on via `parseHeadlessOption`, and the plan must
 * describe what the launch will do, not apply its own rule.
 *
 * @param {boolean|string} value - The option value.
 *
 * @returns {boolean} Whether the option is on.
 */
export const isOptionEnabled = (value) => value === true || value === 'true';

/**
 * Whether the report describes an icon-removal command.
 *
 * Decided from `report.command`, never sniffed from recorded rows or from the
 * optional plan sections: a remove run over zero sheets - or one whose caller
 * supplied no plan at all - must still summarise in remove vocabulary.
 *
 * @param {object} report - The report.
 *
 * @returns {boolean} True for remove-sheet-icons reports.
 */
export const isRemovalReport = (report) => (report.command ?? '').includes('remove-sheet-icons');

/**
 * The provenance parts of the app-selection line, shared wording with the
 * pre-#1073 dry-run report: named count, selector count, overlap.
 *
 * Exported for the contact-sheet renderer (issue #1074), which states the
 * same provenance on its `apps` row - one wording, two layouts.
 *
 * @param {object} selection - `report.selection` from `recordSelection`.
 *
 * @returns {string[]} The parts, ready to join with `, `.
 */
export const selectionParts = (selection) => {
    const parts = [`${selection.named} named by --appid`];

    if (selection.selector) {
        parts.push(
            `${selection.fromSelector} matched by --${selection.selector.option} "${selection.selector.value}"`
        );
    }

    const overlap = selection.named + selection.fromSelector - selection.total;
    if (overlap > 0) {
        parts.push(`${overlap} selected twice`);
    }

    return parts;
};

/**
 * Renders one sheet rule for the plan block, e.g. `tag "confidential" (3 sheets)`.
 *
 * The match count is the anti-#840 payload: a tag rule always prints how many
 * sheets it matched across the selected apps, zero included - a zero next to a
 * tag the operator typed is the cheapest possible "check your spelling".
 *
 * @param {object} rule - A rule from the plan's `rules` section.
 * @param {string} rule.option - The long option name without dashes.
 * @param {string[]} rule.values - The rule's values.
 * @param {number|null} [rule.matchedSheetCount] - Sheets matched across the
 *     selected apps, when a cheap server-side count exists (QSEoW tags only).
 *
 * @returns {string} The rendered rule.
 */
const describeRule = ({ option, values, matchedSheetCount = null }) => {
    // The option name ends in the rule kind: exclude-sheet-tag -> tag.
    const kind = option.split('-').pop();
    const quoted = kind === 'tag' || kind === 'title';
    const list = quoted ? values.map((v) => `"${v}"`).join(', ') : values.join(', ');
    const count = matchedSheetCount === null ? '' : ` (${matchedSheetCount} sheets)`;

    return `${kind} ${list}${count}`;
};

/**
 * A rules line for the plan block: every rule, or an explicit `none`.
 *
 * `none` is printed rather than the line being omitted, because the absence
 * of a rule is exactly what an operator checking "did my exclude flag
 * register?" needs stated. Exported for the contact-sheet renderer, which
 * shows the same rules with the same match counts.
 *
 * @param {Array<object>} rules - Rules of one kind (exclude or blur).
 *
 * @returns {string} The joined rule descriptions.
 */
export const describeRules = (rules) =>
    rules.length === 0 ? 'none' : rules.map(describeRule).join(', ');

/**
 * The target lines: which server or tenant the run talks to.
 *
 * @param {object} target - The plan's `target` section.
 *
 * @returns {string[]} One line for Cloud, two for QSEoW.
 */
const renderTarget = (target) => {
    if (target.platform !== 'qseow') {
        return [row('tenant', target.tenantUrl)];
    }

    const scheme = isOptionEnabled(target.secure) ? 'https' : 'http';
    const hostPort = target.port ? `${target.host}:${target.port}` : target.host;
    const proxy = target.prefix ? `virtual proxy "${target.prefix}"` : 'no virtual proxy';

    return [
        row('server', `${hostPort}   ${scheme}, ${proxy}`),
        row(
            '',
            `engine ${target.enginePort}, qrs ${target.qrsPort}, schema ${target.schemaVersion}`
        ),
    ];
};

/**
 * The auth lines: which identities the run uses. Never a password or key value.
 *
 * @param {object} auth - The plan's `auth` section.
 *
 * @returns {string[]} The auth lines.
 */
const renderAuth = (auth) => {
    if (auth.apiUser) {
        const lines = [
            row(
                'api user',
                `${auth.apiUser.directory}\\${auth.apiUser.userId} via ${auth.certFile}`
            ),
        ];
        // Only when the run actually logs into the web UI: qseow
        // remove-sheet-icons works over the engine session alone, so it has
        // no logon identity to report and must not render one.
        if (auth.logonUser) {
            lines.push(row('logon user', `${auth.logonUser.directory}\\${auth.logonUser.userId}`));
        }

        return lines;
    }

    const lines = [row('auth', 'API key')];
    if (auth.skipLogin) {
        lines.push(row('logon', 'skipped (--skip-login)'));
    } else if (auth.logonUserId) {
        lines.push(row('logon user', auth.logonUserId));
    }

    return lines;
};

/**
 * The facts behind the writes warning, shared by the plain plan block and the
 * contact-sheet board (issue #1074): what kind of write, how many apps, the
 * dry-run tense, and the published-count suffix.
 *
 * One decision tree rather than two - the writes warning is the one line
 * both renderers exist to get right, and a new `writes.kind` or a changed
 * published-count rule must reach both from a single place. Each renderer
 * supplies only its own casing and voice.
 *
 * @param {object} report - The report.
 *
 * @returns {{kind: string, appCount: number, would: boolean, published: string}|null}
 *     The facts, or null when there is nothing to warn about - no writes
 *     section, or an empty selection whose write was never possible.
 */
export const describeWrites = (report) => {
    const writes = report.plan?.writes;
    const appCount = report.selection?.total ?? report.apps.length;

    if (!writes || appCount === 0) {
        return null;
    }

    const published =
        writes.publishedAppCount === null || writes.publishedAppCount === undefined
            ? ''
            : `, ${writes.publishedAppCount} of them published`;

    return {
        kind: writes.kind,
        appCount,
        would: Boolean(report.dryRun),
        published,
        // Whether the removal also deletes thumbnail files from app media
        // libraries. Cloud does; QSEoW clears the engine property only and
        // leaves the content library alone. The default is the narrower
        // claim, so a caller that forgets the flag understates rather than
        // promises a deletion that never happens.
        mediaFiles: Boolean(writes.mediaFiles),
    };
};

/**
 * The writes warning: the one line in the plan block written in capitals,
 * because it is the part with no undo.
 *
 * @param {object} report - The report; `dryRun` decides WILL vs WOULD.
 *
 * @returns {string} The warning line.
 */
const renderWrites = (report) => {
    const writes = describeWrites(report);

    // Null-safe by contract, not by the caller's guard: renderRunPlanLines
    // happens to pre-filter with the same predicate, but this function must
    // not crash the plan block if the two ever drift or a new caller skips
    // the guard - the board's warningLine already honours the null the same
    // way.
    if (!writes) {
        return '';
    }

    if (writes.kind === 'clear-icons') {
        const verb = writes.would ? 'WOULD REMOVE' : 'WILL REMOVE';
        const media = writes.mediaFiles ? ' and thumbnail media files' : '';

        // The published suffix belongs here as much as on the thumbnail
        // branch, and on QSEoW more so: a published app is the one whose save
        // the removal will be refused by.
        return `  ${verb} sheet icons${media} from ${writes.appCount} app(s)${writes.published}`;
    }

    const verb = writes.would ? 'WOULD OVERWRITE' : 'WILL OVERWRITE';

    return `  ${verb} existing sheet thumbnails in ${writes.appCount} app(s)${writes.published}`;
};

/**
 * The plan block: everything the run resolved, rendered before the first write.
 *
 * Sheet selection fails silently where connection problems fail loudly (issue
 * #993), so the app count with its provenance and the rule match counts -
 * zeroes included - are the safety content here; the rest is orientation.
 *
 * @param {object} report - A report whose `plan` section has been recorded.
 *
 * @returns {string[]} The block's lines, empty when the report carries no plan.
 */
export const renderRunPlanLines = (report) => {
    const { plan, selection } = report;

    if (!plan) {
        return [];
    }

    const lines = ['', 'PLAN'];

    if (plan.target) {
        lines.push(...renderTarget(plan.target));
    }
    if (plan.auth) {
        lines.push(...renderAuth(plan.auth));
    }
    if (selection) {
        lines.push(row('apps', `${selection.total}   ${selectionParts(selection).join(', ')}`));
    }
    if (plan.sheetPart) {
        lines.push(
            row(
                'sheet part',
                `${plan.sheetPart.value} of ${plan.sheetPart.max} -- ${plan.sheetPart.label}`
            )
        );
    }
    if (plan.rules) {
        lines.push(row('exclude', describeRules(plan.rules.exclude)));
        lines.push(row('blur', describeRules(plan.rules.blur)));
    }
    if (plan.browser) {
        // parseHeadlessOption, not isOptionEnabled: the label must match what
        // the launch will actually do, and the launch treats every value
        // except an explicit false as headless.
        const window = parseHeadlessOption(plan.browser.headless) ? 'headless' : 'visible window';
        lines.push(
            row(
                'browser',
                `${plan.browser.name} (version: ${plan.browser.version}), ${window}, ${plan.browser.pageWaitSeconds}s per sheet`
            )
        );
    }
    if (plan.output) {
        // No dimensions stated: the files on disk are the raw element
        // screenshots from a 1230x810 viewport, not the 410x270 the hub
        // displays them at - a size claim here would be wrong about the
        // artifacts the run leaves behind.
        lines.push(row('images', `${plan.output.imageDir}/${plan.output.platformDir}/<app-id>`));
    }
    // The writes warning is suppressed for an empty selection: "WILL
    // OVERWRITE ... 0 app(s)" in capitals right before the no-apps error
    // would describe a write that was never possible.
    if (plan.writes && (report.selection?.total ?? report.apps.length) > 0) {
        if (plan.writes.contentLibrary) {
            lines.push(row('uploads to', `content library "${plan.writes.contentLibrary}"`));
        } else if (plan.writes.kind === 'thumbnails') {
            lines.push(row('uploads to', `each app's media library, "thumbnails" folder`));
        }
        lines.push(renderWrites(report));
    }

    // No trailing blank: the app loop prints its own separator before each
    // `app i/n` line, and two blanks in a row read as an accident.
    return lines;
};

/**
 * The per-app progress line logged once an app's name and sheet count are
 * known, under the `app i/n` line the app loop already printed.
 *
 * @param {object} app - App facts.
 * @param {string} app.name - App name.
 * @param {number} app.sheetCount - Number of sheets.
 * @param {boolean} [app.published] - Whether the app is published, when known.
 *
 * @returns {string} The line.
 */
export const appProgressLine = ({ name, sheetCount, published }) => {
    const publishedNote =
        published === undefined || published === null
            ? ''
            : `, ${published ? 'published' : 'not published'}`;

    // A missing name must not print the literal "undefined" - callers fall
    // back to the app id where they have one; this is the last resort.
    return `  "${name ?? ''}" -- ${sheetCount} sheet(s)${publishedNote}`;
};

/**
 * The per-sheet progress line: countable, and short enough for a terminal.
 *
 * Replaces a ~230-column line; the sheet id, engine sheet id, description,
 * approved, published and hidden fields move to `verbose`, where they are
 * still available to anyone debugging.
 *
 * @param {object} sheet - Sheet facts.
 * @param {number} sheet.n - 1-based sheet number.
 * @param {number} sheet.total - Number of sheets in the app.
 * @param {string} sheet.label - What happened: `captured`, `blurred`, `excluded`, `cleared`, `no icon`.
 * @param {string} sheet.title - Sheet title, user data, passed through untouched.
 * @param {string|null} [sheet.reason] - The responsible option, when there is one.
 *
 * @returns {string} The line.
 */
export const sheetProgressLine = ({ n, total, label, title, reason = null }) =>
    // `title ?? ''`: a sheet with no qMeta prints empty quotes, never the
    // literal "undefined" - matching the dry-run renderer's guard.
    `  sheet ${String(n).padStart(2)}/${total}  ${label.padEnd(8)}  '${title ?? ''}'${reason ? `  (${reason})` : ''}`;

/**
 * Elapsed time as `1h 2m`, `6m 12s` or `45s`.
 *
 * @param {number} ms - Elapsed milliseconds.
 *
 * @returns {string} The human-readable duration.
 */
export const formatElapsed = (ms) => {
    const totalSeconds = Math.round(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }

    return `${seconds}s`;
};

/**
 * A byte count as `n B`, `n.n KB` or `n.n MB`.
 *
 * @param {number} bytes - The byte count.
 *
 * @returns {string} The human-readable size.
 */
export const formatBytes = (bytes) => {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Sums a nullable per-app numeric field, returning null when no app recorded it.
 *
 * @param {object} report - The report.
 * @param {string} field - The per-app field name.
 *
 * @returns {number|null} The sum, or null when the field was never recorded.
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
 * Totals over the per-sheet rows the processors recorded while each sheet
 * happened, in the vocabulary the verdict speaks.
 *
 * Extracted so the plain verdict and the contact-sheet verdict (issue #1074)
 * count from one place - two counting loops would be two chances for the
 * boards to disagree about the same run.
 *
 * @param {object} report - The report.
 *
 * @returns {{seen: number, captured: number, blurred: number, excluded: number,
 *     cleared: number, noIcon: number}} The counts.
 */
export const verdictCounts = (report) => {
    const counts = { seen: 0, captured: 0, blurred: 0, excluded: 0, cleared: 0, noIcon: 0 };

    for (const app of report.apps) {
        for (const sheet of app.sheets) {
            counts.seen += 1;
            if (sheet.action === 'skip') {
                counts.excluded += 1;
            } else if (sheet.action === 'blur') {
                counts.captured += 1;
                counts.blurred += 1;
            } else if (sheet.action === 'update') {
                counts.captured += 1;
            } else if (sheet.action === 'clear') {
                if (sheet.reason === CLEAR_REASON.NO_ICON) {
                    counts.noIcon += 1;
                } else {
                    counts.cleared += 1;
                }
            }
        }
    }

    return counts;
};

/**
 * The verdict's app-level and outcome facts, shared by the plain verdict and
 * the contact-sheet verdict (issue #1074).
 *
 * Extracted for the same reason as {@link verdictCounts}: these were derived
 * inline by both renderers, and a change to what counts as a failed app or
 * which apps contribute kept-image bytes must reach both verdicts or they
 * describe different runs. The sums follow the recorded-or-null rule - a
 * number in either verdict is always a number that happened.
 *
 * @param {object} report - The report.
 *
 * @returns {{okApps: number, failedApps: number, emptySelection: boolean,
 *     sheetsUpdated: number|null, imagesKeptFiles: number|null,
 *     imagesKeptBytes: number|null, mediaFilesDeleted: number|null}} The facts.
 */
export const verdictFacts = (report) => {
    const failedApps = report.apps.filter((app) => app.failed).length;

    return {
        okApps: report.apps.length - failedApps,
        failedApps,
        emptySelection: (report.selection?.total ?? 0) === 0 && report.apps.length === 0,
        sheetsUpdated: sumAppField(report, 'sheetsUpdated'),
        imagesKeptFiles: sumAppField(report, 'imagesKeptFiles'),
        imagesKeptBytes: sumAppField(report, 'imagesKeptBytes'),
        mediaFilesDeleted: sumAppField(report, 'mediaFilesDeleted'),
    };
};

/**
 * The verdict block: what actually changed, and whether the run worked.
 *
 * This is the part that does not exist at all today - a run in which 66
 * thumbnails were uploaded and a run in which a mistyped tag matched nothing
 * both used to end silently and identically. Rendered from the report alone,
 * so every number here is a number that was recorded while it happened.
 *
 * @param {object} report - The report, after the app loop has finished and
 *     `succeeded`/`finishedAt` have been set on it.
 *
 * @returns {string[]} The block's lines.
 */
export const renderRunVerdictLines = (report) => {
    const lines = ['', `RESULT  ${report.succeeded ? 'ok' : 'FAILED'}`];

    const facts = verdictFacts(report);

    if (facts.emptySelection) {
        lines.push(row('apps', '0 selected - nothing was done'));
        lines.push(RUN_FRAME);

        return lines;
    }

    lines.push(row('apps', `${facts.okApps} ok, ${facts.failedApps} failed`));

    const { seen, captured, blurred, excluded, cleared, noIcon } = verdictCounts(report);

    // Decided from report.command via isRemovalReport, never from the
    // optional plan sections: a removal run whose caller supplied no plan
    // must still summarise in remove vocabulary.
    if (isRemovalReport(report)) {
        const noIconNote = noIcon > 0 ? `, ${noIcon} had no icon` : '';
        lines.push(row('sheets', `${seen} seen, ${cleared} icon(s) cleared${noIconNote}`));

        if (facts.mediaFilesDeleted !== null) {
            lines.push(
                row(
                    'media',
                    `${facts.mediaFilesDeleted} thumbnail file(s) deleted from app media libraries`
                )
            );
        }
    } else {
        const blurNote = blurred > 0 ? ` (${blurred} blurred)` : '';
        lines.push(
            row('sheets', `${seen} seen, ${captured} captured${blurNote}, ${excluded} excluded`)
        );

        if (facts.sheetsUpdated !== null) {
            const destination = report.plan?.writes?.contentLibrary
                ? `content library "${report.plan.writes.contentLibrary}"`
                : 'app media libraries';
            lines.push(
                row(
                    'thumbnails',
                    `${facts.sheetsUpdated} sheet(s) given new thumbnails in ${destination}`
                )
            );
        }

        if (facts.imagesKeptFiles !== null && report.plan?.output) {
            lines.push(
                row(
                    'images kept',
                    `${report.plan.output.imageDir}/${report.plan.output.platformDir}   ${facts.imagesKeptFiles} file(s), ${formatBytes(facts.imagesKeptBytes ?? 0)}`
                )
            );
        }
    }

    if (typeof report.startedAt === 'number' && typeof report.finishedAt === 'number') {
        lines.push(row('elapsed', formatElapsed(report.finishedAt - report.startedAt)));
    }

    lines.push(RUN_FRAME);

    return lines;
};
