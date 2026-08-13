import { describe, test, expect } from '@jest/globals';
import {
    gate,
    gatedBy,
    inSections,
    isSupplied,
    openingOn,
    assertAppSelectionNotEmpty,
    appSourceQuestion,
    APP_SOURCES,
    SHEET_FILTER_KEYS,
} from '../spec-ops.js';
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

    test('shows a supplied value whatever the gate says', () => {
        // Declining the gate means "nothing more", not "and forget what I set".
        const hidden = gatedBy('_advanced', ['pagewait'], { pagewait: '7' })(spec('pagewait'));

        expect(hidden.when({ answers: { _advanced: false } })).toBe(true);
    });

    test('an empty supplied value still respects the gate', () => {
        const hidden = gatedBy('_filtering', ['excludeSheetTag'], { excludeSheetTag: '' })(
            spec('excludeSheetTag')
        );

        expect(hidden.when({ answers: { _filtering: false } })).toBe(false);
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

describe('isSupplied', () => {
    test('an empty string is not supplied, because that is how both say "none"', () => {
        // --qliksensetag and --collectionid both declare '' as their default, so
        // treating it as a value would offer to re-confirm something nobody set.
        expect(isSupplied('')).toBe(false);
        expect(isSupplied('   ')).toBe(false);
        expect(isSupplied(undefined)).toBe(false);
        expect(isSupplied([])).toBe(false);
    });

    test('anything with something in it is supplied', () => {
        expect(isSupplied('BSI')).toBe(true);
        expect(isSupplied(['app-a'])).toBe(true);
    });
});

describe('openingOn', () => {
    test('a supplied value becomes the question default', () => {
        expect(openingOn(spec('appid'), ['app-a']).default).toEqual(['app-a']);
    });

    test('nothing supplied leaves the question exactly as it was', () => {
        const original = spec('appid', { default: 'from-the-option' });

        expect(openingOn(original, '')).toBe(original);
    });
});

describe('assertAppSelectionNotEmpty', () => {
    test('passes when apps are named', () => {
        expect(() =>
            assertAppSelectionNotEmpty(
                { appid: ['app-a'], qliksensetag: '' },
                'qliksensetag',
                'a tag'
            )
        ).not.toThrow();
    });

    test('passes on a tag alone, because the run is the union of the two', () => {
        expect(() =>
            assertAppSelectionNotEmpty({ appid: [], qliksensetag: 'BSI' }, 'qliksensetag', 'a tag')
        ).not.toThrow();
    });

    test('names only what can actually be done from this prompt', () => {
        // There is no way back to an earlier question, so advising one sends
        // the operator hunting for a key that does not exist.
        let thrown;

        try {
            assertAppSelectionNotEmpty({}, 'qliksensetag', 'a tag');
        } catch (err) {
            thrown = err;
        }

        expect(thrown.message).toContain('Ctrl+C');
        expect(thrown.message).not.toContain('go back');
    });

    test('throws when neither names anything', () => {
        // runOverApps would report this too, but only after every remaining
        // question has been answered and the run confirmed.
        expect(() =>
            assertAppSelectionNotEmpty(
                { appid: [], collectionid: '' },
                'collectionid',
                'a collection'
            )
        ).toThrow('No apps selected');
    });

    test('an unanswered appid counts as nothing, not as a crash', () => {
        expect(() => assertAppSelectionNotEmpty({}, 'qliksensetag', 'a tag')).toThrow(
            'No apps selected'
        );
    });
});

describe('appSourceQuestion', () => {
    test('claims both keys it leads to, so neither is silently skipped', () => {
        const question = appSourceQuestion({
            needs: ['logonpwd'],
            groupingKey: 'qliksensetag',
            groupingChoice: 'Update every app carrying a tag',
        });

        expect(question.replaces).toEqual(['appid', 'qliksensetag']);
        expect(question.choices.map((choice) => choice.value)).toEqual([
            APP_SOURCES.ALL,
            APP_SOURCES.GROUPED,
            APP_SOURCES.TYPED,
        ]);
    });
});
