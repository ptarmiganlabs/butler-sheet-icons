/**
 * Which part of a sheet `--includesheetpart` captures on Qlik Sense Cloud.
 *
 * The keys are the option's allowed values and the values are the CSS selectors the screenshot is
 * taken from, so the set of values BSI accepts is by construction the set it can actually render.
 * The `Option` declaration in `src/lib/commands/qscloud/create-sheet-thumbnails.js`, the guard in
 * `cloud-create-thumbnails.js` and the screenshot code in `sheet-screenshot.js` all derive from
 * this one map rather than restating the list: a value accepted somewhere but missing a selector
 * here reaches `page.waitForSelector()` with nothing to wait for, and fails with an error that
 * says nothing about the option that caused it.
 *
 * `3` is absent on purpose. On QSEoW it means "include the selection bar", and Cloud has no
 * equivalent, so the value sets legitimately differ between the two platforms rather than one
 * having drifted from the other. See issue #891 and `src/lib/qseow/sheet-parts.js`.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const CLOUD_SHEET_PART_SELECTORS = Object.freeze({
    // Only the chart part of the sheet (no sheet title, selections or app info)
    1: '#grid-wrap',
    // Include the sheet title
    2: '#qs-page-container',
    // The full screen
    4: '#qv-page-container',
});

/**
 * Values `--includesheetpart` accepts on Qlik Sense Cloud, in ascending order. Frozen.
 *
 * Passed to Commander's `.choices()`, which both validates and makes the values discoverable in
 * `--help` and to anything reading the option metadata. Commander copies the array via `slice()`,
 * so freezing it here does not stop it being used as choices.
 *
 * @type {string[]}
 */
export const CLOUD_SHEET_PARTS = Object.freeze(Object.keys(CLOUD_SHEET_PART_SELECTORS));
