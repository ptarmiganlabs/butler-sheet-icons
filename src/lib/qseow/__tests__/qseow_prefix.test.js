import { describe, test, expect } from '@jest/globals';

import { normalizeVirtualProxyPrefix } from '../qseow-prefix.js';

describe('normalizeVirtualProxyPrefix', () => {
    // The reported bug: BSI_QSEOW_CST_PREFIX='/form' built https://host//form/sense/app/<id>,
    // which authenticated fine and then timed out 90s later waiting for #qv-page-container.
    test('strips the leading slash an admin copies out of a URL', () => {
        expect(normalizeVirtualProxyPrefix('/form')).toBe('form');
    });

    test.each([
        ['already clean', 'form', 'form'],
        ['trailing slash', 'form/', 'form'],
        ['both ends', '/form/', 'form'],
        ['repeated slashes', '//form//', 'form'],
        ['surrounding whitespace', '  form  ', 'form'],
        ['whitespace outside slashes', ' /form/ ', 'form'],
    ])('%s: %j -> %j', (_label, input, expected) => {
        expect(normalizeVirtualProxyPrefix(input)).toBe(expected);
    });

    // '' is what the CLI defaults to and what callers read as "no virtual proxy", so every
    // no-prefix spelling has to collapse to exactly that rather than to a slash or undefined.
    test.each([
        ['empty string', ''],
        ['a lone slash', '/'],
        ['only slashes', '///'],
        ['only whitespace', '   '],
        ['undefined', undefined],
        ['null', null],
        ['a non-string', 42],
    ])('%s yields the empty prefix', (_label, input) => {
        expect(normalizeVirtualProxyPrefix(input)).toBe('');
    });

    // Only the ends are touched; a prefix is a single path segment, but if a deployment ever
    // uses a nested one, the separator inside it must survive.
    test('leaves interior slashes alone', () => {
        expect(normalizeVirtualProxyPrefix('/a/b/')).toBe('a/b');
    });
});
