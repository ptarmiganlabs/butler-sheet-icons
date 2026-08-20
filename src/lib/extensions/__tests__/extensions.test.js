import { describe, test, expect } from '@jest/globals';
import { extensions } from '#extensions';
import { SEAM_VERSION, assertSeamVersion } from '../version.js';

// The import above is the point of this file as much as any assertion in it: it goes through the
// `#extensions` specifier rather than a relative path, so it exercises the `package.json` `imports`
// map under plain Jest, with no build step and no conditional wiring. Remove the map and this
// suite fails to load.

describe('the committed extensions module', () => {
    test('describes nothing', () => {
        expect(extensions).toEqual({
            seamVersion: SEAM_VERSION,
            commands: [],
            options: [],
            hooks: {},
        });
    });

    test('carries all three contribution properties, so consumers need no defaulting', () => {
        expect(Array.isArray(extensions.commands)).toBe(true);
        expect(Array.isArray(extensions.options)).toBe(true);
        expect(extensions.hooks).toEqual({});
    });

    // The claim §3.6 of the design rests on when it rules out a runtime check: the committed
    // default cannot disagree with the version this tree implements. Asserted here so it stays
    // true rather than being true by anyone's recollection.
    test('matches the contract version this source tree implements', () => {
        expect(() => assertSeamVersion(extensions, 'the committed default')).not.toThrow();
    });
});

describe('assertSeamVersion', () => {
    test('passes a description targeting this version', () => {
        expect(() => assertSeamVersion({ seamVersion: SEAM_VERSION }, 'test')).not.toThrow();
    });

    test('rejects a description targeting an older version, naming both', () => {
        expect(() => assertSeamVersion({ seamVersion: SEAM_VERSION - 1 }, '/tmp/other.js')).toThrow(
            new RegExp(
                `/tmp/other\\.js targets seamVersion ${SEAM_VERSION - 1}.*implements ${SEAM_VERSION}`
            )
        );
    });

    test('rejects a description targeting a newer version', () => {
        expect(() => assertSeamVersion({ seamVersion: SEAM_VERSION + 1 }, 'newer')).toThrow(
            /Extension contract mismatch/
        );
    });

    // A module that exports the wrong thing, or nothing, reaches this the same way a version
    // mismatch does - and stopping the build is the right answer to both.
    test.each([
        ['a description with no version', {}],
        ['a description that is not an object', undefined],
        ['a version that is a string', { seamVersion: String(SEAM_VERSION) }],
    ])('rejects %s', (_name, description) => {
        expect(() => assertSeamVersion(description, 'test')).toThrow(/Extension contract mismatch/);
    });
});
