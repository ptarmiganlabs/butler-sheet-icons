/**
 * Which part of a sheet `--includesheetpart` captures on Qlik Sense Enterprise on Windows.
 *
 * The keys are the option's allowed values and the values are the CSS selectors the screenshot is
 * taken from, so the set of values BSI accepts is by construction the set it can actually render.
 * The `Option` declaration in `src/lib/commands/qseow/index.js`, the guard in
 * `qseow-create-thumbnails.js` and the screenshot code in `qseow-process-app.js` all derive from
 * this one map rather than restating the list: a value accepted somewhere but missing a selector
 * here reaches `page.waitForSelector()` with nothing to wait for, and fails with an error that
 * says nothing about the option that caused it.
 *
 * Qlik Sense Cloud has its own map with a different value set - see `src/lib/cloud/sheet-parts.js`.
 * The two are deliberately not unified: `3` has no Cloud equivalent, because Cloud has no
 * selection bar to include. See issue #891.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const QSEOW_SHEET_PART_SELECTORS = Object.freeze({
    // Only the chart part of the sheet (no sheet title, selections or app info)
    1: '#grid-wrap',
    // Include the sheet title (no selections or app info)
    2: '#qv-stage-container > div > div.qv-panel-content.flex-row',
    // Include the sheet title and selection bar (no app info)
    3: '#qv-stage-container > div',
    // The entire sheet, including sheet title, top menu and status bars
    4: '#qv-page-container',
});

/**
 * Human-readable descriptions of the QSEoW sheet parts, keyed like the
 * selector map above so the two cannot list different values. Shown in the
 * run card's PLAN block, where a bare `2` would send the operator to the docs.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const QSEOW_SHEET_PART_LABELS = Object.freeze({
    1: 'sheet objects only',
    2: 'objects + sheet title',
    3: 'objects + title + selection bar',
    4: 'entire sheet incl. menus',
});

/**
 * Values `--includesheetpart` accepts on QSEoW, in ascending order. Frozen.
 *
 * Passed to Commander's `.choices()`, which both validates and makes the values discoverable in
 * `--help` and to anything reading the option metadata. Commander copies the array via `slice()`,
 * so freezing it here does not stop it being used as choices.
 *
 * @type {string[]}
 */
export const QSEOW_SHEET_PARTS = Object.freeze(Object.keys(QSEOW_SHEET_PART_SELECTORS));
