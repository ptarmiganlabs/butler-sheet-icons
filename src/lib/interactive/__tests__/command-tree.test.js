import { describe, test, expect } from '@jest/globals';
import { Command } from 'commander';

import { leafCommandIn, leafCommandAt } from '../command-tree.js';

/**
 * A small live tree: `bsi ns leaf`, with an alias on the namespace.
 *
 * @returns {{root: Command, leaf: Command}} The root and the leaf.
 */
const tree = () => {
    const root = new Command('bsi');
    const ns = new Command('ns').alias('n');
    const leaf = new Command('leaf').action(() => {});
    ns.addCommand(leaf);
    root.addCommand(ns);

    return { root, leaf };
};

describe('leafCommandIn', () => {
    test('finds the registered command, not a copy', () => {
        const { root, leaf } = tree();

        expect(leafCommandIn(root, 'ns leaf')).toBe(leaf);
    });

    test('matches a segment on an alias, as Commander would', () => {
        const { root, leaf } = tree();

        expect(leafCommandIn(root, 'n leaf')).toBe(leaf);
    });

    test('tolerates stray whitespace in the path', () => {
        const { root, leaf } = tree();

        expect(leafCommandIn(root, '  ns   leaf ')).toBe(leaf);
    });

    test('names the segment that is missing', () => {
        const { root } = tree();

        expect(() => leafCommandIn(root, 'ns missing')).toThrow(
            '"missing" is not a command of "ns"'
        );
    });

    test('sees an option added to the live tree after it was built, which the builders cannot', () => {
        // The reason this function exists (issue #1159).
        const { root } = tree();
        leafCommandIn(root, 'ns leaf').option('--added <x>', 'Added after the build.');

        expect(leafCommandIn(root, 'ns leaf').options.map((option) => option.long)).toContain(
            '--added'
        );
    });
});

describe('leafCommandAt', () => {
    test('still walks the builders, for callers asking what core declares', () => {
        expect(leafCommandAt('browser install').name()).toBe('install');
    });
});
