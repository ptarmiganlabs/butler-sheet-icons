/**
 * Helpers for building QRS (Qlik Sense Repository Service) filter queries safely.
 *
 * Two separate things have to be right, and getting either wrong fails silently or with an
 * unhelpful 400. Both behaviours below were verified against a live QSEoW 4242 endpoint
 * rather than inferred - the obvious guesses turned out to be wrong.
 *
 * 1. QRS filter syntax. Values sit inside single quotes, and a quote in the value ends the
 *    literal early. QRS escapes with a backslash: `name eq 'Q1\'25'`. The OData convention of
 *    doubling the quote (`''`) and the alternative of double-quoting the value are both
 *    rejected with `400::Cannot parse the expression`.
 *
 * 2. URL encoding. `qrs-interact` runs the query string through `encodeURI`, which leaves `&`
 *    alone - so a tag named `R&D` truncates the query string and QRS answers
 *    `400::Missing parameter value(s)`. Pre-encoding only the `&` does not help either:
 *    `decodeURI` does not decode reserved-character escapes, so the library's
 *    `stringToEncode == decodeURI(stringToEncode)` guard still passes and `encodeURI` turns the
 *    `%` of `%26` into `%2526`.
 *
 *    The way through is to encode the whole filter with `encodeURIComponent`. Spaces become
 *    `%20`, which `decodeURI` *does* decode, so the library's guard fails and it passes the
 *    query string along untouched. Hence `qrsPathWithFilter` - every filter must go through it,
 *    or the double-encoding comes back.
 */

/**
 * Escapes a value for use inside a single-quoted QRS filter literal.
 *
 * Backslashes are escaped first, so an existing backslash cannot combine with the escape
 * character added for a following quote.
 *
 * @param {string} value - Raw value, e.g. a tag or content library name.
 *
 * @returns {string} The value with `\` and `'` backslash-escaped, safe to place between quotes.
 */
export const qrsFilterValue = (value) => String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/**
 * Builds a filter term matching a field against any one of the supplied values.
 *
 * The result is always a parenthesised `or` group, even for a single value. The parentheses
 * matter: these terms get `and`-ed with others, and without them `a and b or c` binds the wrong
 * way. Parenthesising unconditionally costs nothing - a live QRS parses and matches
 * `(name eq 'x')` exactly as it does the bare term - and it keeps one output shape rather than
 * two.
 *
 * An empty list throws rather than producing a filter. There is no QRS expression meaning
 * "match none": the empty `or` group `()` is rejected with `400::Invalid expression`, and
 * anything that parses would match *everything*, which for the exclude-tag caller would silently
 * exclude every sheet in the app. Whether an absent list means "skip the query" is the caller's
 * decision, so this refuses to guess.
 *
 * @param {string} field - QRS field name, e.g. `'tags.name'`.
 * @param {string|string[]} values - One value, or a non-empty array of them. Variadic Commander
 *     options arrive as arrays; interpolating one directly produced `tags.name eq 'A,B'`, a
 *     single literal that matches no tag at all.
 *
 * @returns {string} A parenthesised QRS filter expression.
 *
 * @throws {Error} When `values` is an empty array.
 */
export const qrsFilterAnyOf = (field, values) => {
    const list = Array.isArray(values) ? values : [values];

    if (list.length === 0) {
        throw new Error(
            `qrsFilterAnyOf: no values supplied for '${field}'. An empty list has no QRS ` +
                `equivalent - the caller has to decide whether to skip the query instead.`
        );
    }

    const terms = list.map((value) => `${field} eq '${qrsFilterValue(value)}'`);

    return `(${terms.join(' or ')})`;
};

/**
 * Joins a QRS endpoint to a filter expression, encoding the filter so `qrs-interact` leaves it
 * alone.
 *
 * @param {string} endpoint - QRS endpoint, e.g. `'app/full'`.
 * @param {string} filter - Filter expression, built with the helpers above.
 *
 * @returns {string} Path ready to hand to `qrsInteract.Get`.
 */
export const qrsPathWithFilter = (endpoint, filter) =>
    `${endpoint}?filter=${encodeURIComponent(filter)}`;
