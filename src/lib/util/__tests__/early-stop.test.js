import { describe, test, expect } from '@jest/globals';
import { Command } from 'commander';

import { createVersionNotice, stampCommandErrors, versionStampLine } from '../early-stop.js';
import { describeVersion } from '../version-report.js';

/**
 * An announcer's writers, recording what reached them in order.
 *
 * @returns {{out: string[], writeRaw: (text: string) => void, writeLine: (line: string) => void}}
 *     The recorded output and the two writers.
 */
const recorder = () => {
    const out = [];

    return {
        out,
        writeRaw: (text) => out.push(text),
        writeLine: (line) => out.push(`${line}\n`),
    };
};

describe('versionStampLine', () => {
    test('a stock build is its headline', () => {
        expect(
            versionStampLine(describeVersion({ name: 'butler-sheet-icons', version: '5.3.1' }))
        ).toBe('butler-sheet-icons 5.3.1');
    });

    test('a variant build folds its details onto the one line', () => {
        const described = describeVersion({
            name: 'butler-sheet-icons',
            version: '5.1.0',
            variant: 'acme',
            variantVersion: '2.1.0',
            buildDate: '2026-09-14',
        });

        expect(versionStampLine(described)).toBe(
            'butler-sheet-icons 5.1.0 (acme) - core 5.1.0, acme 2.1.0, built 2026-09-14'
        );
    });
});

describe('announceEarlyStop', () => {
    test('writes the stamp, with a blank line ahead of it on a terminal', () => {
        const { announceEarlyStop } = createVersionNotice();
        const { out, writeRaw, writeLine } = recorder();

        announceEarlyStop({ stamp: 'bsi 1.0.0', isTerminal: true, writeRaw, writeLine });

        expect(out.join('')).toBe('\nbsi 1.0.0\n');
    });

    // A redirected log, a scheduler transcript and a test runner get the stamp and nothing else.
    test('writes no blank line when the destination is not a terminal', () => {
        const { announceEarlyStop } = createVersionNotice();
        const { out, writeRaw, writeLine } = recorder();

        announceEarlyStop({ stamp: 'bsi 1.0.0', isTerminal: false, writeRaw, writeLine });

        expect(out.join('')).toBe('bsi 1.0.0\n');
    });

    test('says nothing once a header has shown the version', () => {
        const { announceEarlyStop, noteVersionShown } = createVersionNotice();
        const { out, writeRaw, writeLine } = recorder();

        noteVersionShown();
        announceEarlyStop({ stamp: 'bsi 1.0.0', isTerminal: true, writeRaw, writeLine });

        expect(out).toEqual([]);
    });

    test('stamps a run once, however many errors it reports', () => {
        const { announceEarlyStop } = createVersionNotice();
        const { out, writeRaw, writeLine } = recorder();

        announceEarlyStop({ stamp: 'bsi 1.0.0', isTerminal: false, writeRaw, writeLine });
        announceEarlyStop({ stamp: 'bsi 1.0.0', isTerminal: false, writeRaw, writeLine });

        expect(out.join('')).toBe('bsi 1.0.0\n');
    });
});

describe('stampCommandErrors', () => {
    /**
     * A small tree attached the way the CLI attaches its own - with `addCommand`, which is the case
     * Commander does not pass output settings down for.
     *
     * @param {string[]} written - Receives everything written to the error stream.
     *
     * @returns {Command} The root.
     */
    const buildTree = (written) => {
        const leaf = new Command('create-sheet-thumbnails')
            .requiredOption('--host <host>', 'server')
            .action(() => {});
        const group = new Command('qseow').addCommand(leaf);
        const root = new Command('bsi').addCommand(group);

        // Recorded rather than printed, and thrown rather than exited, so the parse can be asserted.
        for (const command of [root, group, leaf]) {
            command.exitOverride().configureOutput({ writeErr: (text) => written.push(text) });
        }

        return root;
    };

    test('a refusal deep in the tree is stamped ahead of its error', () => {
        const written = [];
        const root = buildTree(written);

        stampCommandErrors(root, {
            stamp: 'bsi 1.0.0',
            isTerminal: () => false,
            announce: createVersionNotice().announceEarlyStop,
        });

        expect(() => root.parse(['qseow', 'create-sheet-thumbnails'], { from: 'user' })).toThrow();
        expect(written.join('')).toBe(
            "bsi 1.0.0\nerror: required option '--host <host>' not specified\n"
        );
    });

    test('leaves the error alone once the version has been shown', () => {
        const written = [];
        const root = buildTree(written);
        const { announceEarlyStop, noteVersionShown } = createVersionNotice();

        stampCommandErrors(root, {
            stamp: 'bsi 1.0.0',
            isTerminal: () => true,
            announce: announceEarlyStop,
        });
        noteVersionShown();

        expect(() => root.parse(['qseow', 'create-sheet-thumbnails'], { from: 'user' })).toThrow();
        expect(written.join('')).toBe("error: required option '--host <host>' not specified\n");
    });
});
