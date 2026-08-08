import { describe, test, expect } from '@jest/globals';

import {
    qrsFilterValue,
    qrsFilterAnyOf,
    qrsPathWithFilter,
    toFilterValueList,
} from '../qrs-filter.js';

/**
 * Replicates the query-string handling inside `qrs-interact`'s `getFullPath`, so the tests can
 * assert what QRS actually receives rather than what we handed the library.
 *
 * The library only encodes when the string looks un-encoded, and it uses `encodeURI`, which
 * leaves `&` alone. Both details are why `qrsPathWithFilter` has to pre-encode.
 *
 * @param {string} path - Path as handed to `qrsInteract.Get`.
 *
 * @returns {string} The path after the library's own encoding step.
 */
const throughQrsInteract = (path) => {
    const indexOfSlash = path.lastIndexOf('/');
    const indexOfQuery = path.lastIndexOf('?');
    if (indexOfQuery <= indexOfSlash) {
        return path;
    }

    const queryString = path.substr(indexOfQuery + 1);
    const encoded = queryString === decodeURI(queryString) ? encodeURI(queryString) : queryString;

    return `${path.substring(0, indexOfQuery + 1)}${encoded}`;
};

/**
 * Extracts what QRS parses: the `filter` parameter, after the URL layer has decoded it.
 *
 * @param {string} path - Path as it goes over the wire.
 *
 * @returns {string} The decoded filter expression.
 */
const filterAsQrsSeesIt = (path) => {
    const query = path.substring(path.lastIndexOf('?') + 1);
    const params = new URLSearchParams(query);

    return params.get('filter');
};

describe('qrsFilterValue', () => {
    test('leaves an ordinary value untouched', () => {
        expect(qrsFilterValue('Finance')).toBe('Finance');
    });

    test('backslash-escapes a single quote', () => {
        // Verified against a live QRS: `\'` parses, while the OData `''` and a double-quoted
        // value are both rejected with 400::Cannot parse the expression.
        expect(qrsFilterValue("Q1'25")).toBe("Q1\\'25");
    });

    test('escapes a backslash before escaping quotes', () => {
        // Naive quote-only escaping would turn `a\` + `'b` into `a\\'b`, where the backslash
        // added for the quote is itself swallowed by the pre-existing one.
        expect(qrsFilterValue("a\\'b")).toBe("a\\\\\\'b");
    });

    test('handles a value that is only quotes', () => {
        expect(qrsFilterValue("'''")).toBe("\\'\\'\\'");
    });

    test('coerces non-strings rather than throwing', () => {
        expect(qrsFilterValue(42)).toBe('42');
    });
});

describe('toFilterValueList', () => {
    test.each([
        ['absent option', undefined, []],
        ['null', null, []],
        ['empty string', '', []],
        ['empty array', [], []],
        ['blank entry from an empty env var', [''], []],
        ['single string', 'Finance', ['Finance']],
        ['single-element array', ['Finance'], ['Finance']],
        ['several values', ['Finance', 'HR'], ['Finance', 'HR']],
        ['drops only the blanks', ['Finance', '', 'HR'], ['Finance', 'HR']],
    ])('%s', (_label, input, expected) => {
        expect(toFilterValueList(input)).toEqual(expected);
    });

    test('keeps a value that is only whitespace', () => {
        // A tag cannot usefully be named ' ', but trimming here would silently change what the
        // operator asked for. Only genuinely empty values are dropped.
        expect(toFilterValueList([' '])).toEqual([' ']);
    });
});

describe('qrsFilterAnyOf', () => {
    test('single string produces a parenthesised term', () => {
        // Parenthesised even for one value: a live QRS parses and matches `(name eq 'x')`
        // identically, and one output shape is easier to compose with than two.
        expect(qrsFilterAnyOf('tags.name', 'Finance')).toBe("(tags.name eq 'Finance')");
    });

    test('single-element array produces the same as the bare string', () => {
        expect(qrsFilterAnyOf('tags.name', ['Finance'])).toBe("(tags.name eq 'Finance')");
    });

    test('throws on an empty list rather than emitting invalid QRS', () => {
        // The empty or-group `()` is rejected by QRS with 400::Invalid expression, and any
        // expression that did parse would match everything - which for the exclude-tag caller
        // would silently exclude every sheet in the app.
        expect(() => qrsFilterAnyOf('tags.name', [])).toThrow(/no values supplied/);
    });

    test('the empty-list guard names the field, so the caller is identifiable', () => {
        expect(() => qrsFilterAnyOf('tags.name', [])).toThrow(/tags\.name/);
    });

    test('multiple values become a parenthesised or-group', () => {
        // The parentheses are load-bearing: this gets `and`-ed with other terms, and without
        // them `a and b or c` binds the wrong way.
        expect(qrsFilterAnyOf('tags.name', ['Finance', 'HR'])).toBe(
            "(tags.name eq 'Finance' or tags.name eq 'HR')"
        );
    });

    test('does not collapse an array into one comma-joined literal', () => {
        // The bug this replaces: `${['Finance','HR']}` produced `tags.name eq 'Finance,HR'`,
        // a single literal that matches no tag, so nothing was ever excluded.
        expect(qrsFilterAnyOf('tags.name', ['Finance', 'HR'])).not.toContain("'Finance,HR'");
    });

    test('escapes each value in a multi-value group', () => {
        expect(qrsFilterAnyOf('tags.name', ["Q1'25", 'R&D'])).toBe(
            "(tags.name eq 'Q1\\'25' or tags.name eq 'R&D')"
        );
    });
});

describe('qrsPathWithFilter', () => {
    test('survives qrs-interact without being double-encoded', () => {
        const path = qrsPathWithFilter('app/full', qrsFilterAnyOf('tags.name', 'R&D'));

        // The library must pass it through untouched. Pre-encoding only the `&` would trip the
        // library's guard and turn `%26` into `%2526`.
        expect(throughQrsInteract(path)).toBe(path);
        expect(path).not.toContain('%2526');
    });

    test('QRS receives the ampersand as part of the value, not a new parameter', () => {
        // Unencoded, this is the reported bug: the `&` starts a new query parameter and QRS
        // answers 400::Missing parameter value(s).
        const path = qrsPathWithFilter('app/full', qrsFilterAnyOf('tags.name', 'R&D'));

        expect(filterAsQrsSeesIt(throughQrsInteract(path))).toBe("(tags.name eq 'R&D')");
    });

    test.each([
        ['ampersand', 'R&D'],
        ['plus', 'A+B'],
        ['hash', 'a#b'],
        ['question mark', 'a?b'],
        ['equals', 'a=b'],
        ['percent', 'a%b'],
        ['slash', 'a/b'],
        ['space', 'Sales Team'],
    ])('round-trips a value containing %s', (_label, value) => {
        const path = qrsPathWithFilter('app/full', qrsFilterAnyOf('tags.name', value));

        expect(filterAsQrsSeesIt(throughQrsInteract(path))).toBe(`(tags.name eq '${value}')`);
    });

    test('round-trips a quote as the backslash-escaped form QRS expects', () => {
        const path = qrsPathWithFilter('app/full', qrsFilterAnyOf('tags.name', "Q1'25"));

        expect(filterAsQrsSeesIt(throughQrsInteract(path))).toBe("(tags.name eq 'Q1\\'25')");
    });

    test('keeps a compound filter intact', () => {
        const appId = 'a3e0f5d2-000a-464f-998d-33d333b175d7';
        const filter = `objectType eq 'sheet' and app.id eq ${appId} and ${qrsFilterAnyOf(
            'tags.name',
            ['R&D', "Q1'25"]
        )}`;
        const path = qrsPathWithFilter('app/object/full', filter);

        expect(filterAsQrsSeesIt(throughQrsInteract(path))).toBe(filter);
    });

    test('preserves a leading slash in the endpoint', () => {
        const path = qrsPathWithFilter('/contentlibrary', qrsFilterAnyOf('name', 'Butler'));

        expect(path.startsWith('/contentlibrary?filter=')).toBe(true);
    });
});
