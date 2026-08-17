/**
 * The reasons a sheet can be excluded from processing or given a blurred
 * thumbnail, shared by both platform twins.
 *
 * One vocabulary rather than per-twin strings, because the dry-run report
 * prints these verbatim and the two platforms must describe the same decision
 * with the same words. Each value names the CLI option responsible - the whole
 * point of the report is that a decision nobody asked for (or the absence of
 * one somebody did ask for) is traceable to the option that caused it. See
 * issue #993: a misspelled `--blur-sheet-tag` used to produce a run
 * byte-identical to one where the option was never passed.
 *
 * `HIDDEN` is the one reason with no option behind it: sheets hidden by a show
 * condition are always skipped, so it names the mechanism instead.
 */
export const EXCLUDE_REASON = Object.freeze({
    STATUS_PUBLIC: '--exclude-sheet-status public',
    STATUS_PUBLISHED: '--exclude-sheet-status published',
    STATUS_PRIVATE: '--exclude-sheet-status private',
    HIDDEN: 'hidden by show condition',
    TAG: '--exclude-sheet-tag',
    NUMBER: '--exclude-sheet-number',
    TITLE: '--exclude-sheet-title',
});

export const BLUR_REASON = Object.freeze({
    STATUS_PUBLIC: '--blur-sheet-status public',
    STATUS_PUBLISHED: '--blur-sheet-status published',
    TAG: '--blur-sheet-tag',
    NUMBER: '--blur-sheet-number',
    TITLE: '--blur-sheet-title',
});

/**
 * Reasons specific to icon removal. `NO_ICON` marks a clear that is already a
 * no-op - informational, not an option's doing.
 */
export const CLEAR_REASON = Object.freeze({
    NO_ICON: 'no icon currently set',
});
