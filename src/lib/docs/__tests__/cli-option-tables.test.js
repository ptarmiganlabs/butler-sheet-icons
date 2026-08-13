import { test, expect, describe } from '@jest/globals';
import { Command, Option } from 'commander';

import {
    BLOCK_CLOSE,
    BLOCK_OPEN_PREFIX,
    codeCell,
    commandAt,
    deriveExample,
    escapeCell,
    formatDefault,
    formatDescription,
    knownCommandPaths,
    optionRowsFor,
    renderBlock,
    renderOptionTable,
    renderTable,
    updateGeneratedBlocks,
} from '../cli-option-tables.js';

/**
 * Split a rendered markdown row into cells the way a markdown parser does: on pipes that are
 * not escaped.
 *
 * @param {string} row - One line of a rendered table.
 *
 * @returns {string[]} The cells, without the leading and trailing empties.
 */
const cellsOf = (row) =>
    row
        .split(/(?<!\\)\|/)
        .slice(1, -1)
        .map((cell) => cell.trim());

describe('escapeCell', () => {
    test('escapes a pipe so it cannot end the cell', () => {
        expect(escapeCell('a | b')).toBe('a \\| b');
    });

    test('turns newlines into <br> so a multi-line description stays in one row', () => {
        expect(escapeCell('first\nsecond')).toBe('first<br>second');
        expect(escapeCell('first\r\nsecond')).toBe('first<br>second');
    });

    test('escapes an asterisk, which always opens emphasis', () => {
        expect(escapeCell('BSI_* variables')).toBe('BSI\\_\\* variables');
    });

    test('escapes a backslash, which would otherwise pair with what follows it', () => {
        // Checked through VitePress: `C:\Users\.cache` renders as `C:\Users.cache`, because
        // `\.` reads as an escaped full stop and the backslash is consumed.
        expect(escapeCell('C:\\Users\\.cache')).toBe('C:\\\\Users\\\\.cache');
    });

    test('escapes the backslash before escaping anything else', () => {
        // If the order slipped, the backslash this function writes for the pipe would itself be
        // escaped on the next pass and the cell would show a stray backslash.
        expect(escapeCell('a\\|b')).toBe('a\\\\\\|b');
    });

    test('leaves an underscore between word characters alone', () => {
        // CommonMark does not start emphasis inside a word, so `stable_153.0.3` is already
        // literal. Escaping it would put a visible backslash on the page.
        expect(escapeCell('stable_153.0.3')).toBe('stable_153.0.3');
    });

    test('escapes an underscore that could open emphasis', () => {
        expect(escapeCell('_leading')).toBe('\\_leading');
        expect(escapeCell('trailing_')).toBe('trailing\\_');
        expect(escapeCell('a _ b')).toBe('a \\_ b');
    });
});

describe('codeCell', () => {
    test('wraps the value in backticks', () => {
        expect(codeCell('--browser')).toBe('`--browser`');
    });

    test('escapes a pipe even though a code span makes everything else literal', () => {
        // `qscloud list-collections` really declares this. Rendered unescaped through VitePress,
        // the cell splits, the code span is lost, and the row's last value is pushed off the
        // table and never displayed.
        expect(codeCell('--outputformat <table|json>')).toBe('`--outputformat <table\\|json>`');
    });

    test('leaves a backslash alone, unlike escapeCell', () => {
        // Inside a code span a backslash is already literal. Checked through VitePress:
        // `C:\Users` renders as typed, and escaping it to `C:\\Users` renders two backslashes.
        // This is why CodeQL's incomplete-sanitization alert does not apply to this function.
        expect(codeCell('C:\\Users')).toBe('`C:\\Users`');
    });
});

describe('formatDefault', () => {
    test('reports a mandatory option with no default as required', () => {
        expect(formatDefault({ mandatory: true, defaultValue: undefined })).toBe('**Required**');
    });

    // `.default(x).makeOptionMandatory()` is the shape of thirteen options on
    // `qseow create-sheet-thumbnails`. Commander satisfies the mandatory check from the default,
    // so the flag can be omitted - reporting it as required both overstates what the
    // administrator must supply and hides the value they came to look up.
    test('shows the default of a mandatory option that has one', () => {
        expect(formatDefault({ mandatory: true, defaultValue: '4242' })).toBe('`4242`');
        expect(formatDefault({ mandatory: true, defaultValue: true })).toBe('`true`');
    });

    test('renders a missing default as a dash', () => {
        expect(formatDefault({ mandatory: false, defaultValue: undefined })).toBe('-');
    });

    test('renders a scalar default as a code span', () => {
        expect(formatDefault({ mandatory: false, defaultValue: 'info' })).toBe('`info`');
        expect(formatDefault({ mandatory: false, defaultValue: false })).toBe('`false`');
    });

    test('renders an empty-string default visibly rather than as a blank code span', () => {
        expect(formatDefault({ mandatory: false, defaultValue: '' })).toBe('`""`');
    });

    test('joins an array default, and treats an empty array as no default', () => {
        expect(formatDefault({ mandatory: false, defaultValue: ['a', 'b'] })).toBe('`a, b`');
        expect(formatDefault({ mandatory: false, defaultValue: [] })).toBe('-');
    });
});

describe('formatDescription', () => {
    test('appends the accepted values in the shape --help prints them', () => {
        const option = new Option('--channel <channel>', 'Release channel to list').choices([
            'stable',
            'beta',
        ]);

        expect(formatDescription(option)).toBe('Release channel to list (choices: stable, beta)');
    });

    test('leaves a description without choices unchanged', () => {
        expect(formatDescription(new Option('--host <host>', 'Server host'))).toBe('Server host');
    });
});

describe('deriveExample', () => {
    test('prefers a value other than the default, which would demonstrate nothing', () => {
        const option = new Option('--channel <channel>', '')
            .choices(['stable', 'beta'])
            .default('stable');

        expect(deriveExample(option)).toBe('--channel beta');
    });

    test('falls back to the only choice when it is also the default', () => {
        const option = new Option('--browser <browser>', '').choices(['chrome']).default('chrome');

        expect(deriveExample(option)).toBe('--browser chrome');
    });

    test('derives nothing for a free-text option, where any example would be invented', () => {
        expect(deriveExample(new Option('--host <host>', 'Server host'))).toBeNull();
    });
});

describe('renderTable', () => {
    test('pads every cell so the columns line up', () => {
        const table = renderTable(['Option', 'Default'], [['`-a`', '`1`']]);

        expect(table).toBe(
            ['| Option | Default |', '| ------ | ------- |', '| `-a`   | `1`     |', ''].join('\n')
        );
    });

    test('writes at least three dashes in a narrow column', () => {
        const table = renderTable(['A'], [['b']]);

        expect(table.split('\n')[1]).toBe('| --- |');
    });
});

describe('optionRowsFor', () => {
    test('includes the help option Commander adds behind the scenes', () => {
        const command = new Command('demo');
        const flags = optionRowsFor(command).map((row) => row[0]);

        expect(flags).toContain('`-h, --help`');
    });

    test('omits hidden options', () => {
        const command = new Command('demo').addOption(
            new Option('--secret <value>', 'Internal').hideHelp()
        );
        const flags = optionRowsFor(command).map((row) => row[0]);

        expect(flags).not.toContain('`--secret <value>`');
    });

    test('prefers a hand-written example over a derived one', () => {
        const command = new Command('demo').addOption(
            new Option('--channel <channel>', '').choices(['stable', 'beta']).default('stable')
        );

        const [row] = optionRowsFor(command, {
            examples: { '--channel': '--channel beta@151' },
        });

        expect(row[4]).toBe('`--channel beta@151`');
    });

    test('skips the help row for a command that has disabled help', () => {
        const command = new Command('demo').helpOption(false);

        expect(optionRowsFor(command)).toEqual([]);
    });
});

describe('renderOptionTable', () => {
    test('drops the Example column when nothing can fill it', () => {
        const command = new Command('demo').helpOption(false).addOption(
            // Free text, so no example is derivable and the column would be all dashes.
            new Option('--host <host>', 'Server host')
        );

        const header = renderOptionTable(command).split('\n')[0];

        expect(cellsOf(header)).toEqual([
            'Option',
            'Environment Variable',
            'Description',
            'Default',
        ]);
    });

    test('keeps the Example column when at least one option can fill it', () => {
        const command = new Command('demo').addOption(
            new Option('--channel <channel>', '').choices(['stable', 'beta']).default('stable')
        );

        const header = renderOptionTable(command).split('\n')[0];

        expect(cellsOf(header)).toContain('Example');
    });
});

describe('every real command', () => {
    // The pipe in `--outputformat <table|json>` produced a table one column wider than its own
    // header, and it did so silently: the markdown was valid, just wrong. Asserting the shape
    // for every command catches the next option declared with a character that means something
    // to markdown, whichever command grows it.
    test.each(knownCommandPaths())('%s renders a rectangular table', (path) => {
        const lines = renderOptionTable(commandAt(path)).trim().split('\n');
        const columns = cellsOf(lines[0]).length;

        expect(columns).toBeGreaterThan(0);

        for (const line of lines) {
            expect(cellsOf(line)).toHaveLength(columns);
        }
    });

    test.each(knownCommandPaths())('%s pads every row to the same width', (path) => {
        const lines = renderOptionTable(commandAt(path)).trim().split('\n');
        const widths = new Set(lines.map((line) => line.length));

        expect(widths.size).toBe(1);
    });
});

describe('commandAt', () => {
    test('finds a command by the path a user would type', () => {
        expect(commandAt('browser install').name()).toBe('install');
    });

    test('names the known commands when asked for one that does not exist', () => {
        expect(() => commandAt('browser nope')).toThrow(/No CLI command "browser nope"/);
        expect(() => commandAt('browser nope')).toThrow(/browser install/);
    });
});

describe('updateGeneratedBlocks', () => {
    const documentWith = (body) =>
        [
            '# Page',
            '',
            'Hand-written prose that must survive.',
            '',
            `${BLOCK_OPEN_PREFIX}browser list-installed -->`,
            body,
            BLOCK_CLOSE,
            '',
            'More prose.',
            '',
        ].join('\n');

    test('replaces a stale block and reports it as changed', () => {
        const { content, blocks } = updateGeneratedBlocks(documentWith('| old | table |'));

        expect(blocks).toEqual([{ path: 'browser list-installed', changed: true }]);
        expect(content).toContain('BSI_BROWSER_LI_LOG_LEVEL');
        expect(content).not.toContain('| old | table |');
    });

    test('leaves the surrounding prose exactly as it was', () => {
        const { content } = updateGeneratedBlocks(documentWith('| old | table |'));

        expect(content).toContain('Hand-written prose that must survive.');
        expect(content).toContain('More prose.');
        expect(content.startsWith('# Page\n')).toBe(true);
    });

    test('reports an already-current block as unchanged, and is idempotent', () => {
        const once = updateGeneratedBlocks(documentWith('| old | table |')).content;
        const twice = updateGeneratedBlocks(once);

        expect(twice.blocks).toEqual([{ path: 'browser list-installed', changed: false }]);
        expect(twice.content).toBe(once);
    });

    test('handles several blocks in one document independently', () => {
        const document = [
            `${BLOCK_OPEN_PREFIX}browser install -->`,
            '| stale |',
            BLOCK_CLOSE,
            '',
            'Between.',
            '',
            `${BLOCK_OPEN_PREFIX}browser uninstall -->`,
            '| also stale |',
            BLOCK_CLOSE,
            '',
        ].join('\n');

        const { content, blocks } = updateGeneratedBlocks(document);

        expect(blocks.map((block) => block.path)).toEqual(['browser install', 'browser uninstall']);
        expect(content).toContain('Between.');
        expect(content).toContain('BSI_BROWSER_I_BROWSER_VERSION');
        expect(content).toContain('BSI_BROWSER_UI_BROWSER_VERSION');
    });

    test('reports no blocks for a document that has none', () => {
        const { content, blocks } = updateGeneratedBlocks('# Just prose\n');

        expect(blocks).toEqual([]);
        expect(content).toBe('# Just prose\n');
    });

    test('refuses a block naming a command that does not exist', () => {
        const document = `${BLOCK_OPEN_PREFIX}browser nope -->\n| x |\n${BLOCK_CLOSE}\n`;

        expect(() => updateGeneratedBlocks(document)).toThrow(/No CLI command "browser nope"/);
    });

    test('passes the examples for the right command through', () => {
        const document = `${BLOCK_OPEN_PREFIX}browser install -->\n\n${BLOCK_CLOSE}\n`;
        const { content } = updateGeneratedBlocks(document, {
            examples: {
                'browser install': { '--browser-version': '--browser-version 151.0.7922.77' },
            },
        });

        expect(content).toContain('`--browser-version 151.0.7922.77`');
    });
});

describe('renderBlock', () => {
    test('wraps the table in markers the updater can find again', () => {
        const block = renderBlock('browser list-installed');

        expect(block.startsWith(`${BLOCK_OPEN_PREFIX}browser list-installed -->`)).toBe(true);
        expect(block.trimEnd().endsWith(BLOCK_CLOSE)).toBe(true);

        // Round trip: what renderBlock emits must already be current, or --check would report a
        // freshly generated page as stale.
        expect(updateGeneratedBlocks(block).blocks).toEqual([
            { path: 'browser list-installed', changed: false },
        ]);
    });

    test('separates the markers from the table with blank lines', () => {
        const lines = renderBlock('browser list-installed').split('\n');

        expect(lines[1]).toBe('');
        expect(lines.at(-2)).toBe(BLOCK_CLOSE);
        expect(lines.at(-3)).toBe('');
    });
});

describe('knownCommandPaths', () => {
    test('lists the commands the doc site documents', () => {
        const paths = knownCommandPaths();

        expect(paths).toContain('browser install');
        expect(paths).toContain('qseow create-sheet-thumbnails');
        expect(paths).toContain('qscloud create-sheet-thumbnails');
    });
});
