import { describe, test, expect } from '@jest/globals';
import { gate, gatedBy, inSections, SHEET_FILTER_KEYS } from '../spec-ops.js';
import { labelForApp, labelForCollection } from '../labels.js';

const spec = (key, overrides = {}) => ({
    key,
    type: 'input',
    message: `${key}?`,
    required: false,
    variadic: false,
    secret: false,
    ...overrides,
});

describe('gate', () => {
    test('builds a confirm that defaults to declining the block', () => {
        // Defaulting to yes would defeat the point: the gate exists so the
        // common case is short.
        const built = gate({ key: '_advanced', message: 'Advanced?' });

        expect(built.type).toBe('confirm');
        expect(built.default).toBe(false);
        expect(built.required).toBe(false);
    });

    test('can be told to offer the block by default', () => {
        expect(gate({ key: '_x', message: 'x?', default: true }).default).toBe(true);
    });

    test('refuses a key that would reach the options bag', () => {
        // `_` is what to-cli-options keys off to drop synthetic answers. A gate
        // named `advanced` would be emitted as `--advanced`, which no command
        // declares - so this fails loudly at build time rather than producing a
        // command line that cannot be run.
        expect(() => gate({ key: 'advanced', message: 'Advanced?' })).toThrow(/must start with/);
    });
});

describe('gatedBy', () => {
    test('hides the named questions behind the gate', () => {
        const hide = gatedBy('_advanced', ['pagewait']);
        const hidden = hide(spec('pagewait'));

        expect(hidden.when({ answers: { _advanced: true } })).toBe(true);
        expect(hidden.when({ answers: { _advanced: false } })).toBe(false);
    });

    test('treats an unanswered gate as declined', () => {
        const hidden = gatedBy('_advanced', ['pagewait'])(spec('pagewait'));

        expect(hidden.when({ answers: {} })).toBe(false);
    });

    test('leaves other questions untouched, identity included', () => {
        const untouched = spec('host');

        expect(gatedBy('_advanced', ['pagewait'])(untouched)).toBe(untouched);
    });

    test('accepts a Set as well as an array', () => {
        const hidden = gatedBy('_x', new Set(['a']))(spec('a'));

        expect(typeof hidden.when).toBe('function');
    });

    test('composes, so a question can only be behind one gate at a time', () => {
        // Applied in sequence by the wizards. The first gate to claim a key wins,
        // because the second mapper no longer matches it.
        const both = gatedBy('_filtering', ['blurFactor'])(
            gatedBy('_advanced', ['pagewait'])(spec('blurFactor'))
        );

        expect(both.when({ answers: { _filtering: true, _advanced: false } })).toBe(true);
    });
});

describe('inSections', () => {
    const SECTIONS = [
        ['Connection', ['host', 'apikey']],
        ['Apps', ['appid']],
    ];

    test('labels every question with its section', () => {
        const ordered = inSections([spec('appid'), spec('host')], SECTIONS);

        expect(ordered.map((s) => s.group)).toEqual(['Connection', 'Apps']);
    });

    test('orders by section, whatever order they arrived in', () => {
        const ordered = inSections([spec('appid'), spec('apikey'), spec('host')], SECTIONS);

        expect(ordered.map((s) => s.key)).toEqual(['apikey', 'host', 'appid']);
    });

    test('keeps the incoming order within a section', () => {
        // Load-bearing: the wizards build the connection block in the order they
        // want it asked, and rely on the sort not shuffling it.
        const ordered = inSections([spec('host'), spec('apikey')], SECTIONS);

        expect(ordered.map((s) => s.key)).toEqual(['host', 'apikey']);
    });

    test('respects a group a question already carries', () => {
        const ordered = inSections([spec('mystery', { group: 'Apps' })], SECTIONS);

        expect(ordered[0].group).toBe('Apps');
    });

    test('sorts an unplaced question last rather than first', () => {
        // A key nobody assigned to a section would otherwise sort to index -1 and
        // silently become the opening question of the wizard.
        const ordered = inSections([spec('stray'), spec('host')], SECTIONS);

        expect(ordered.map((s) => s.key)).toEqual(['host', 'stray']);
    });

    test('does not mutate the list it was given', () => {
        const input = [spec('appid'), spec('host')];
        inSections(input, SECTIONS);

        expect(input.map((s) => s.key)).toEqual(['appid', 'host']);
    });
});

describe('SHEET_FILTER_KEYS', () => {
    test('covers every exclude and blur option both platforms share', () => {
        expect([...SHEET_FILTER_KEYS].sort()).toEqual([
            'blurFactor',
            'blurSheetNumber',
            'blurSheetStatus',
            'blurSheetTag',
            'blurSheetTitle',
            'excludeSheetNumber',
            'excludeSheetStatus',
            'excludeSheetTag',
            'excludeSheetTitle',
        ]);
    });

    test('is frozen, so one wizard cannot reshape the other list', () => {
        expect(Object.isFrozen(SHEET_FILTER_KEYS)).toBe(true);
    });
});

describe('labels', () => {
    test('an app carries its full id, marked as an id', () => {
        const id = 'a1b2c3d4-1111-2222-3333-444455556666';

        expect(labelForApp({ id, name: 'Finance' })).toBe(`Finance  (id: ${id})`);
    });

    test('two apps sharing a name stay distinguishable', () => {
        // Not hypothetical: three names are shared by two apps each on the QSEoW
        // test server.
        expect(labelForApp({ id: 'a', name: 'Performance review' })).not.toBe(
            labelForApp({ id: 'b', name: 'Performance review' })
        );
    });

    test('a collection says how many items it holds', () => {
        expect(labelForCollection({ name: 'Finance', itemCount: 4 })).toBe('Finance  (4 items)');
    });

    test('a collection with no item count reads as empty rather than undefined', () => {
        expect(labelForCollection({ name: 'Finance' })).toBe('Finance  (0 items)');
    });
});
