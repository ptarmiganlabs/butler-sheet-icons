import { describe, expect, test } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Staged doc pages may only show options the CLI has. The extraction itself is covered in
// src/lib/docs/__tests__/documented-options.test.js; this covers the script pre-commit runs, and
// the hook that runs it.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = 'scripts/check-doc-options.mjs';

/**
 * Run the check, from the repository root, over the pages named.
 *
 * @param {string[]} pages - Pages to check. Empty means every pending page.
 *
 * @returns {{status: number, output: string}} Exit status and everything it printed.
 */
const check = (pages) => {
    const result = spawnSync(process.execPath, [SCRIPT, ...pages], {
        cwd: repoRoot,
        encoding: 'utf8',
    });

    return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
};

/**
 * Run the check over throwaway pages with the given contents.
 *
 * @param {Record<string, string>} pages - Page contents, keyed by file name.
 *
 * @returns {{status: number, output: string, dir: string}} The result, and where the pages were.
 */
const checkPages = (pages) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'doc-options-'));

    try {
        const paths = Object.entries(pages).map(([name, content]) => {
            const file = path.join(dir, name);

            writeFileSync(file, content);

            return file;
        });

        return { ...check(paths), dir };
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
};

describe('the doc page option check', () => {
    // The one that does real work on every CI run rather than only in a pre-commit hook: a pending
    // page committed with the hook skipped fails here, which is the backstop once a push has
    // happened.
    test('every pending page shows only options the CLI has', () => {
        const { status, output } = check([]);

        expect(output).toBe('');
        expect(status).toBe(0);
    });

    test('accepts a page whose command lines use real options', () => {
        const { status, output } = checkPages({
            'real.md': '```bash\nbutler-sheet-icons qseow create-sheet-thumbnails --dry-run\n```\n',
        });

        expect(output).toBe('');
        expect(status).toBe(0);
    });

    test('refuses a page that shows an option the CLI does not have, naming page, line and option', () => {
        const { status, output, dir } = checkPages({
            'made-up.md':
                '# Title\n\n```bash\nbutler-sheet-icons doctor check --made-up-option\n```\n',
        });

        expect(status).toBe(1);
        expect(output).toContain(`${path.join(dir, 'made-up.md')}:4  --made-up-option`);
    });

    test('reports every page and every option, not only the first', () => {
        const { status, output } = checkPages({
            'one.md': '`butler-sheet-icons doctor check --made-up-option`\n',
            'two.md':
                '```\nbutler-sheet-icons browser check --another-made-up-option --dry-run\n```\n',
        });

        expect(status).toBe(1);
        expect(output).toContain('one.md:1  --made-up-option');
        expect(output).toContain('two.md:2  --another-made-up-option');
        expect(output).not.toContain('--dry-run');
    });

    test('says what to do about it, so the check is not simply worked around', () => {
        const { output } = checkPages({
            'made-up.md': '`butler-sheet-icons doctor check --made-up-option`\n',
        });

        expect(output).toContain('--help');
        expect(output).toContain('together with the code that adds it');
    });
});

describe('the pre-commit hook that runs it', () => {
    const config = readFileSync(path.join(repoRoot, '.pre-commit-config.yaml'), 'utf8');
    const hook = config.slice(config.indexOf('- id: doc-options'));
    const end = hook.indexOf('- id:', 1);
    const block = end === -1 ? hook : hook.slice(0, end);

    // pre-commit matches these as Python regular expressions with `re.search`; for patterns this
    // plain, JavaScript reads them the same way.
    const files = new RegExp(/files: '([^']+)'/.exec(block)[1]);
    const exclude = new RegExp(/exclude: '([^']+)'/.exec(block)[1]);
    const runsOn = (file) => files.test(file) && !exclude.test(file);

    test('runs this script', () => {
        expect(block).toContain(`entry: node ${SCRIPT}`);
    });

    test.each(['docs/to-doc-site/interrupting-a-run.md', 'docs/to-doc-site/a-new-page.md'])(
        'checks a pending page: %s',
        (file) => {
            expect(runsOn(file)).toBe(true);
        }
    );

    test.each([
        ['the folder README', 'docs/to-doc-site/README.md'],
        ['a processed page', 'docs/to-doc-site/done/done_dry-run.md'],
        ['a page outside the folder', 'docs/README.gitnexus.md'],
        ['a non-markdown file', 'docs/to-doc-site/.gitkeep'],
    ])('leaves %s alone', (_what, file) => {
        expect(runsOn(file)).toBe(false);
    });
});
