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
