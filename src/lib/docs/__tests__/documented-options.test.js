import { describe, expect, test } from '@jest/globals';

import {
    codeLinesOf,
    declaredOptions,
    optionMentionsIn,
    undeclaredOptionsIn,
} from '../documented-options.js';

/**
 * A page made of the given lines.
 *
 * @param {...string} lines - The page, one line per argument.
 *
 * @returns {string} The markdown.
 */
const page = (...lines) => lines.join('\n');

/**
 * The options a page shows, as `option@line` strings, so an assertion reads like the page.
 *
 * @param {string} markdown - The page.
 *
 * @returns {string[]} Each mention, in page order.
 */
const shown = (markdown) =>
    optionMentionsIn(markdown).map(({ option, line }) => `${option}@${line}`);

describe('the options the CLI declares', () => {
    const declared = declaredOptions();

    test('include options from every namespace, and the interactive command', () => {
        expect(declared).toContain('--dry-run');
        expect(declared).toContain('--host');
        expect(declared).toContain('--tenanturl');
        expect(declared).toContain('--browser-version');
        expect(declared).toContain('--self-test');
    });

    test('include the two Commander adds itself, which no builder declares', () => {
        expect(declared).toContain('--help');
        expect(declared).toContain('--version');
    });

    test('are long options only', () => {
        for (const option of declared) {
            expect(option).toMatch(/^--[a-z]/);
        }
    });
});

describe('the options a page shows', () => {
    test('are the long options after the binary on a command line in a code block', () => {
        const markdown = page(
            '# Example',
            '',
            '```bash',
            'butler-sheet-icons qseow create-sheet-thumbnails --host sense.example.com --dry-run',
            '```'
        );

        expect(shown(markdown)).toEqual(['--host@4', '--dry-run@4']);
    });

    test('are read without their values', () => {
        expect(
            shown(
                page(
                    '```',
                    'butler-sheet-icons qseow create-sheet-thumbnails --log-level=debug',
                    '```'
                )
            )
        ).toEqual(['--log-level@2']);
    });

    test('include a command line in inline code', () => {
        expect(shown('Run `butler-sheet-icons browser check --made-up-option` first.')).toEqual([
            '--made-up-option@1',
        ]);
    });

    test.each([
        ['bash', ['butler-sheet-icons qseow create-sheet-thumbnails \\', '    --made-up-option x']],
        [
            'PowerShell',
            ['.\\butler-sheet-icons.exe qseow create-sheet-thumbnails `', '    --made-up-option x'],
        ],
        [
            'cmd',
            ['butler-sheet-icons.exe qseow create-sheet-thumbnails ^', '    --made-up-option x'],
        ],
    ])('follow a %s line continuation, keeping the line each option is on', (_shell, lines) => {
        expect(shown(page('```', ...lines, '```'))).toEqual(['--made-up-option@3']);
    });

    test.each([
        [
            'the Docker image',
            'docker run --rm ptarmiganlabs/butler-sheet-icons:latest qseow create-sheet-thumbnails --made-up-option',
        ],
        ['npx', 'npx butler-sheet-icons@latest qseow create-sheet-thumbnails --made-up-option'],
        ['a relative path', './butler-sheet-icons qseow create-sheet-thumbnails --made-up-option'],
        [
            'a quoted Windows path',
            '"C:\\Program Files\\BSI\\butler-sheet-icons.exe" qseow create-sheet-thumbnails --made-up-option',
        ],
    ])('include a command line that runs %s', (_how, line) => {
        expect(shown(page('```', line, '```'))).toEqual(['--made-up-option@2']);
    });

    test('ignore the options of another program on the same line, before the binary', () => {
        // Docker's own options come first; the binary is named twice, as the entrypoint and as
        // the image, and only what follows the last of them belongs to it.
        const markdown = page(
            '```',
            'docker run --rm --entrypoint butler-sheet-icons --network host ptarmiganlabs/butler-sheet-icons:latest --version',
            '```'
        );

        expect(shown(markdown)).toEqual(['--version@2']);
    });

    test('ignore a second command on the same line', () => {
        expect(
            shown(
                page(
                    '```',
                    'butler-sheet-icons --version && npm run docs:cli-tables -- --check',
                    '```'
                )
            )
        ).toEqual(['--version@2']);
    });

    test.each([
        ['an npm command', 'npm ci --omit=dev'],
        ['a git command', 'git mv --force a.md b.md'],
        [
            'the doc site repository',
            'npm run docs:cli-tables -- ../butler-sheet-icons-docs/docs/reference/browser.md --write',
        ],
    ])('ignore %s, which does not run the binary', (_what, line) => {
        expect(shown(page('```', line, '```'))).toEqual([]);
    });

    test('ignore prose and a lone option in inline code', () => {
        // Too easily another program's option to be checked without a command line around it.
        expect(shown('Pass --made-up-option, or `--made-up-option`, to docker.')).toEqual([]);
    });

    test('do not read a double hyphen inside a value as an option', () => {
        expect(
            shown(
                page(
                    '```',
                    'butler-sheet-icons qscloud list-collections --tenanturl https://a--b.example.com',
                    '```'
                )
            )
        ).toEqual(['--tenanturl@2']);
    });

    test.each([
        ['a tilde fence', ['~~~bash', 'butler-sheet-icons doctor check --made-up-option', '~~~']],
        ['a longer fence', ['````', 'butler-sheet-icons doctor check --made-up-option', '````']],
        [
            'a fence indented in a list item',
            [
                '1. Run:',
                '',
                '    ```bash',
                '    butler-sheet-icons doctor check --made-up-option',
                '    ```',
            ],
        ],
    ])('include %s', (_what, lines) => {
        expect(optionMentionsIn(page(...lines)).map((m) => m.option)).toEqual(['--made-up-option']);
    });

    test('include a block that was never closed, rather than letting it hide code', () => {
        expect(shown(page('```', 'butler-sheet-icons doctor check --made-up-option'))).toEqual([
            '--made-up-option@2',
        ]);
    });

    // A stray continuation on a block's last line leaves a command waiting for a line that never
    // comes. It is still a command line, and still read.
    test.each([
        [
            'before the closing fence',
            ['```', 'butler-sheet-icons doctor check --made-up-option \\', '```'],
        ],
        [
            'at the end of a block never closed',
            ['```', 'butler-sheet-icons doctor check --made-up-option \\'],
        ],
    ])('include a command left continued %s', (_where, lines) => {
        expect(shown(page(...lines))).toEqual(['--made-up-option@2']);
    });
});

describe('the code lines of a page', () => {
    test('keep a fence of the other character inside a block as code', () => {
        const lines = codeLinesOf(page('```', '~~~', 'butler-sheet-icons --version', '```'));

        expect(lines.map((parts) => parts.map((part) => part.text).join(' '))).toEqual([
            '~~~',
            'butler-sheet-icons --version',
        ]);
    });
});

describe('the options a page shows that the CLI does not have', () => {
    test('are only the undeclared ones, where they are', () => {
        const markdown = page(
            '```',
            'butler-sheet-icons qseow create-sheet-thumbnails --dry-run \\',
            '    --made-up-option x',
            '```'
        );

        expect(undeclaredOptionsIn(markdown)).toEqual([{ option: '--made-up-option', line: 3 }]);
    });

    test('are checked against the set given, when one is', () => {
        expect(
            undeclaredOptionsIn(page('```', 'butler-sheet-icons --dry-run', '```'), new Set())
        ).toEqual([{ option: '--dry-run', line: 2 }]);
    });
});
