import { describe, test, expect } from '@jest/globals';

import { describeVersion } from '../version-report.js';

const NAME = 'butler-sheet-icons';

describe('a stock build', () => {
    // What every build in this repository produces, and what a source run produces too when no
    // define has been substituted.
    test('with nothing injected, reports the headline alone', () => {
        expect(describeVersion({ name: NAME, version: '5.0.0' })).toBe('butler-sheet-icons 5.0.0');
    });

    test('reports a build date when one was stamped in', () => {
        expect(describeVersion({ name: NAME, version: '5.0.0', buildDate: '2026-09-14' })).toBe(
            ['butler-sheet-icons 5.0.0', '  built   2026-09-14'].join('\n')
        );
    });

    // "core 5.0.0" under "butler-sheet-icons 5.0.0" would say the same thing twice. The split only
    // earns its place once there is a second version to distinguish core's from.
    test('does not split out a core line when there is nothing to distinguish it from', () => {
        expect(describeVersion({ name: NAME, version: '5.0.0' })).not.toContain('core');
    });
});

describe('a variant build', () => {
    test('names the variant in the headline and reports both versions', () => {
        expect(
            describeVersion({
                name: NAME,
                version: '5.1.0',
                variant: 'acme',
                variantVersion: '2.1.0',
                buildDate: '2026-09-14',
            })
        ).toBe(
            [
                'butler-sheet-icons 5.1.0 (acme)',
                '  core    5.1.0',
                '  acme    2.1.0',
                '  built   2026-09-14',
            ].join('\n')
        );
    });

    // The headline stays core's version, so a reader maps the binary onto a public release without
    // a lookup table. The variant's own version is a detail line, never the headline.
    test('the headline version is core’s, not the variant’s', () => {
        const out = describeVersion({
            name: NAME,
            version: '5.1.0',
            variant: 'acme',
            variantVersion: '2.1.0',
        });

        expect(out.split('\n')[0]).toBe('butler-sheet-icons 5.1.0 (acme)');
    });

    // A variant built from a tree with no manifest version: the module is still named, because that
    // is the fact worth having, and the version line is simply absent rather than `undefined`.
    test('omits the variant version line when it could not be derived', () => {
        const out = describeVersion({ name: NAME, version: '5.1.0', variant: 'acme' });

        expect(out).toBe(['butler-sheet-icons 5.1.0 (acme)', '  core    5.1.0'].join('\n'));
        expect(out).not.toContain('undefined');
    });

    test('reports the variant without a build date, for a source run', () => {
        expect(
            describeVersion({
                name: NAME,
                version: '5.1.0',
                variant: 'acme',
                variantVersion: '2.1.0',
            })
        ).not.toContain('built');
    });
});

describe('the detail block', () => {
    // The bug a fixed pad width hides: `padEnd` does not truncate, so a label as long as the column
    // was concatenated straight onto its value - `  enterprise2.1.0`, no separator. Every label in
    // the alignment test below is shorter than the floor, so only an explicitly long one catches it.
    test('keeps a separator when the variant name is longer than the column', () => {
        const line = describeVersion({
            name: NAME,
            version: '5.1.0',
            variant: 'enterprise',
            variantVersion: '2.1.0',
        })
            .split('\n')
            // Past the headline, which also names the variant - in parentheses, not as a label.
            .slice(1)
            .find((candidate) => candidate.includes('enterprise'));

        expect(line).toBe('  enterprise 2.1.0');
        expect(line).not.toContain('enterprise2.1.0');
    });

    test('still lines up when a long label widens the column', () => {
        const lines = describeVersion({
            name: NAME,
            version: '5.1.0',
            variant: 'a-very-long-variant-name',
            variantVersion: '2.1.0',
            buildDate: '2026-09-14',
        })
            .split('\n')
            .slice(1);

        expect(new Set(lines.map((line) => line.search(/\S+$/))).size).toBe(1);
    });

    // Short labels must not have moved: this is the output every existing build produces.
    test('leaves the ordinary case exactly as it was', () => {
        expect(describeVersion({ name: NAME, version: '5.0.0', buildDate: '2026-09-14' })).toBe(
            ['butler-sheet-icons 5.0.0', '  built   2026-09-14'].join('\n')
        );
    });

    test('lines up its values under each other', () => {
        const lines = describeVersion({
            name: NAME,
            version: '5.1.0',
            variant: 'a',
            variantVersion: '2.1.0',
            buildDate: '2026-09-14',
        })
            .split('\n')
            .slice(1);

        const columns = lines.map((line) => line.search(/\S+$/));

        expect(new Set(columns).size).toBe(1);
    });
});
