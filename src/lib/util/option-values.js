/**
 * Normalises a CLI option into the list of values actually supplied.
 *
 * Commander hands the same option over in several shapes: absent options
 * arrive as `undefined`, a variadic option set from an empty environment
 * variable arrives as `['']`, and a plain one arrives as a bare string. None
 * of the empty shapes name a real value, so they all collapse to an empty
 * list and let the caller skip whatever the values would have driven.
 *
 * One copy on purpose: the QRS filter builder and the run report both apply
 * these rules, and two forks of the subtle empty-shape handling had already
 * appeared before this module existed.
 *
 * @param {string|string[]|undefined} values - Raw option value.
 *
 * @returns {string[]} The values worth acting on, possibly empty.
 */
export const toOptionValueList = (values) =>
    (Array.isArray(values) ? values : [values]).filter(
        (value) => value !== undefined && value !== null && value !== ''
    );

/**
 * Whether a value was actually supplied, as opposed to left at nothing.
 *
 * An empty string is how both `--qliksensetag` and `--collectionid` say "none" -
 * it is their declared default - and a bare `BSI_..._LOGON_PWD=` line in a unit
 * file or `.env` means "unset" throughout this codebase, so blank has to read as
 * absent. Otherwise a wizard would offer to re-confirm a value nobody set, and
 * the logon-credential check would see a credential where there is none.
 *
 * One copy for both of those callers, so the wizard and the worker cannot
 * disagree about whether the same value was given.
 *
 * @param {unknown} value - The value to test.
 *
 * @returns {boolean} True when there is something there.
 */
export const isSupplied = (value) =>
    Array.isArray(value) ? value.length > 0 : String(value ?? '').trim().length > 0;
