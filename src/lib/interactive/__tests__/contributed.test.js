import { describe, test, expect } from '@jest/globals';
import { Command, Option } from 'commander';

import { placeContributed, contributedGateKey } from '../contributed.js';
import { specsFromCommand } from '../option-introspect.js';
import { applyExtensions } from '../../extensions/apply.js';

/**
 * A command with two options of its own and whatever a description contributes to it, and the
 * specs the wizard would derive from it - contributed ones included, as they are on the live tree.
 *
 * @param {object[]} contributions - `extensions.options` entries, minus `path`, which is filled in.
 *
 * @returns {{specs: object[], byKey: object}} The derived specs and the same keyed by option name.
 */
const derive = (contributions) => {
    const program = new Command('bsi');
    const leaf = new Command('thing')
        .option('--host <host>', 'Host.')
        .option('--level <n>', 'Level.')
        .action(() => {});
    program.addCommand(leaf);
    applyExtensions(program, {
        seamVersion: 1,
        commands: [],
        options: contributions.map((entry) => ({ path: 'thing', ...entry })),
        hooks: {},
    });

    const specs = specsFromCommand(leaf, { env: {} });

    return { specs, byKey: Object.fromEntries(specs.map((spec) => [spec.key, spec])) };
};

const keysOf = (specs) => specs.map((spec) => spec.key);

describe('placeContributed', () => {
    test('leaves a wizard with no contributions exactly as refine() returned it', () => {
        const { specs } = derive([]);
        const refined = [specs[1], specs[0]];

        expect(placeContributed(refined, specs)).toBe(refined);
    });

    test("places a contributed question after the command's own, under its section, behind a gate", () => {
        const { specs } = derive([
            { option: new Option('--tile <t>', 'Tile.'), interactive: { section: 'Tiles' } },
        ]);
        // refine() knew nothing about it and left it where specsFromCommand put it: last, bare.
        const placed = placeContributed(specs, specs);

        expect(keysOf(placed)).toEqual(['host', 'level', contributedGateKey('Tiles'), 'tile']);
        expect(placed[2]).toMatchObject({
            type: 'confirm',
            message: 'Configure Tiles?',
            group: 'Tiles',
        });
        expect(placed[3]).toMatchObject({ key: 'tile', group: 'Tiles', perRun: true });
    });

    test('re-adds a contributed question that refine() dropped', () => {
        // The browser wizards return an explicit list; a contribution they never heard of would
        // otherwise vanish without a trace.
        const { specs, byKey } = derive([
            { option: new Option('--tile <t>', 'Tile.'), interactive: { section: 'Tiles' } },
        ]);
        const refined = [byKey.host];

        expect(keysOf(placeContributed(refined, specs))).toEqual([
            'host',
            contributedGateKey('Tiles'),
            'tile',
        ]);
    });

    test('takes a contributed question out of wherever refine() left it', () => {
        const { specs, byKey } = derive([
            { option: new Option('--tile <t>', 'Tile.'), interactive: { section: 'Tiles' } },
        ]);
        // A refine() that sorted it into the middle of its own questions.
        const refined = [byKey.host, byKey.tile, byKey.level];

        expect(keysOf(placeContributed(refined, specs))).toEqual([
            'host',
            'level',
            contributedGateKey('Tiles'),
            'tile',
        ]);
    });

    test('the gate governs the questions under it, and a supplied value opens them regardless', () => {
        const { specs } = derive([
            { option: new Option('--tile <t>', 'Tile.'), interactive: { section: 'Tiles' } },
        ]);
        const gate = contributedGateKey('Tiles');
        const [, , , tile] = placeContributed(specs, specs, {});
        const [, , , tileSupplied] = placeContributed(specs, specs, { tile: 'x' });

        expect(tile.when({ answers: { [gate]: true } })).toBe(true);
        expect(tile.when({ answers: { [gate]: false } })).toBe(false);
        expect(tileSupplied.when({ answers: { [gate]: false } })).toBe(true);
    });

    test('contributions sharing a section share one gate, in the order the section was first named', () => {
        const { specs } = derive([
            { option: new Option('--tile <t>', 'Tile.'), interactive: { section: 'Tiles' } },
            { option: new Option('--label <l>', 'Label.'), interactive: { section: 'Labels' } },
            { option: new Option('--icon <i>', 'Icon.'), interactive: { section: 'Tiles' } },
        ]);

        expect(keysOf(placeContributed(specs, specs))).toEqual([
            'host',
            'level',
            contributedGateKey('Tiles'),
            'tile',
            'icon',
            contributedGateKey('Labels'),
            'label',
        ]);
    });

    test('a contribution with no placement is appended last, ungated, not per run', () => {
        const { specs } = derive([
            { option: new Option('--tile <t>', 'Tile.'), interactive: { section: 'Tiles' } },
            { option: new Option('--plain <p>', 'Plain.') },
        ]);
        const placed = placeContributed(specs, specs);

        expect(keysOf(placed)).toEqual([
            'host',
            'level',
            contributedGateKey('Tiles'),
            'tile',
            'plain',
        ]);
        expect(placed.at(-1)).not.toHaveProperty('when');
        expect(placed.at(-1)).not.toHaveProperty('perRun');
        expect(placed.at(-1)).not.toHaveProperty('group');
    });

    test('perRun: false is honoured, and a gate with nothing left to ask is not asked', () => {
        const { specs } = derive([
            {
                option: new Option('--tile <t>', 'Tile.'),
                interactive: { section: 'Tiles', perRun: false },
            },
        ]);

        const notSupplied = placeContributed(specs, specs, {});
        expect(keysOf(notSupplied)).toEqual(['host', 'level', contributedGateKey('Tiles'), 'tile']);
        expect(notSupplied.at(-1)).not.toHaveProperty('perRun');

        // Supplied and not per run: the driver will not ask about it, so the gate goes too.
        const supplied = placeContributed(specs, specs, { tile: 'x' });
        expect(keysOf(supplied)).toEqual(['host', 'level', 'tile']);
    });

    test('uses the gate message the contribution gave', () => {
        const { specs } = derive([
            {
                option: new Option('--tile <t>', 'Tile.'),
                interactive: { section: 'Tiles', gate: 'Style the tiles?' },
            },
        ]);

        expect(placeContributed(specs, specs)[2].message).toBe('Style the tiles?');
    });
});

describe('contributedGateKey', () => {
    test('is synthetic, derived from the section, and stable', () => {
        expect(contributedGateKey('Tiles')).toBe('_contributed-tiles');
        expect(contributedGateKey('Sheet labels')).toBe('_contributed-sheet-labels');
        expect(contributedGateKey(' Odd / Name! ')).toBe('_contributed-odd-name');
        expect(contributedGateKey('Tiles')).toBe(contributedGateKey('Tiles'));
    });

    test("cannot collide with a wizard's own gates", () => {
        expect(contributedGateKey('filtering')).not.toBe('_filtering');
        expect(contributedGateKey('advanced')).not.toBe('_advanced');
    });
});
