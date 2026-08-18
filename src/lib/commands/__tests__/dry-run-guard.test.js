import { describe, test, expect } from '@jest/globals';
import { everyLeafCommand } from '../../interactive/command-tree.js';
import { isDryRunOption, DRY_RUN_OPTION_ATTRIBUTE } from '../dry-run-option.js';

// The guard behind issue #993's rule: a command that changes something gets
// --dry-run. Every leaf command must appear in exactly one of the two lists
// below, so a new mutating command cannot ship without someone consciously
// deciding which side it is on - the same net registry.test.js provides for
// the interactive flag.

/** Commands that change something and therefore declare --dry-run. */
const DRY_RUN_COMMANDS = [
    'qseow create-sheet-thumbnails',
    'qseow remove-sheet-icons',
    'qscloud create-sheet-thumbnails',
    'qscloud remove-sheet-icons',
];

/**
 * Commands that do not declare --dry-run, each with the reason on record.
 * An entry here is a decision, not an omission.
 */
const NO_DRY_RUN = [
    // Read-only: a dry-run flag that is always a no-op teaches people it
    // might be a no-op elsewhere too (#993).
    'qscloud list-collections',
    'browser list-installed',
    'browser list-available',
    'browser check',
    'doctor check',
    // Mutating, deferred: the useful dry-run output for browser install is
    // "which build would 'latest' resolve to, and is it cached" - #993 open
    // question 5 says to settle that shape together with the air-gapped work
    // in #929-#933 rather than design it twice. The uninstall pair follows
    // install so the browser command family lands as one piece.
    'browser install',
    'browser uninstall',
    'browser uninstall-all',
];

describe('every leaf command has decided about --dry-run', () => {
    const leaves = everyLeafCommand();

    test('the two lists cover every leaf command exactly once', () => {
        const classified = [...DRY_RUN_COMMANDS, ...NO_DRY_RUN].sort();
        const actual = leaves.map((leaf) => leaf.path).sort();

        // A new command failing here is the guard working: add it to one of
        // the two lists above, consciously.
        expect(actual).toEqual(classified);
    });

    test.each(DRY_RUN_COMMANDS)('%s declares --dry-run', (path) => {
        const leaf = leaves.find((entry) => entry.path === path);

        expect(leaf.command.options.some((option) => isDryRunOption(option))).toBe(true);
    });

    test.each(NO_DRY_RUN)('%s does not declare --dry-run', (path) => {
        const leaf = leaves.find((entry) => entry.path === path);

        expect(leaf.command.options.some((option) => isDryRunOption(option))).toBe(false);
    });

    test('the description only promises rules the command actually declares', () => {
        // The text is generated from the command's own option set, so a
        // command without --exclude-sheet-*/--blur-sheet-* must not advertise
        // them. The single fixed string this replaced was published verbatim
        // into the doc site's generated option table, on a page whose prose
        // said the command has no such rules.
        for (const path of DRY_RUN_COMMANDS) {
            const leaf = leaves.find((entry) => entry.path === path);
            const option = leaf.command.options.find((entry) => isDryRunOption(entry));
            const hasRules = leaf.command.options.some(
                (entry) =>
                    entry.long?.startsWith('--exclude-sheet-') ||
                    entry.long?.startsWith('--blur-sheet-')
            );

            expect(option.description.includes('exclude and blur rule')).toBe(hasRules);
        }
    });

    test('both removal commands describe a dry run without exclude or blur rules', () => {
        // Named explicitly rather than only derived above, so the pair that
        // shipped the wrong text stays pinned by name.
        for (const path of ['qseow remove-sheet-icons', 'qscloud remove-sheet-icons']) {
            const leaf = leaves.find((entry) => entry.path === path);
            const option = leaf.command.options.find((entry) => isDryRunOption(entry));

            expect(option.description).toContain('connect, resolve apps, list sheets - but');
            expect(option.description).not.toContain('exclude');
            expect(option.description).not.toContain('blur');
        }
    });

    test('Commander stores the flag under the attribute the handlers read', () => {
        // The #890 regression net: a hyphenated long flag camel-cases, and a
        // handler reading options.dryrun would silently never see it.
        const leaf = leaves.find((entry) => entry.path === DRY_RUN_COMMANDS[0]);
        const option = leaf.command.options.find((entry) => isDryRunOption(entry));

        expect(option.attributeName()).toBe(DRY_RUN_OPTION_ATTRIBUTE);
    });
});
