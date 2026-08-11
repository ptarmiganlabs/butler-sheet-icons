import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { formatReviewTable, cellFor } from '../review-table.js';
import { specsFromCommand } from '../option-introspect.js';
import { leafCommandAt } from '../command-tree.js';
import { ASCII_ONLY_ENV } from '../symbols.js';

const specs = () => specsFromCommand(leafCommandAt('qscloud create-sheet-thumbnails'), { env: {} });

const render = (answers) => formatReviewTable(specs(), answers, { env: {} });

const ENV_SNAPSHOT = { ...process.env };

beforeEach(() => {
    delete process.env[ASCII_ONLY_ENV];
});

afterEach(() => {
    process.env = { ...ENV_SNAPSHOT };
});

describe('cellFor', () => {
    const spec = (overrides = {}) => ({ key: 'x', secret: false, ...overrides });

    test('renders a boolean as a word rather than true/false', () => {
        expect(cellFor(spec(), true)).toBe('yes');
        expect(cellFor(spec(), false)).toBe('no');
    });

    test('summarises a long list rather than printing a wall of GUIDs', () => {
        expect(cellFor(spec(), ['a', 'b', 'c'])).toBe('3 selected: a, …');
    });

    test('prints a short list in full', () => {
        expect(cellFor(spec(), ['a', 'b'])).toBe('a, b');
    });

    test('never shows a secret, however it was declared', () => {
        expect(cellFor(spec({ secret: true }), 'hunter2')).not.toContain('hunter2');
        expect(cellFor(spec({ key: 'apikey' }), 'hunter2')).not.toContain('hunter2');
    });

    test('shortens a very long value so it cannot break the layout', () => {
        expect(cellFor(spec(), 'x'.repeat(200)).length).toBeLessThan(60);
    });
});

describe('formatReviewTable', () => {
    test('shows what the run will use', () => {
        const out = render({ tenanturl: 'acme.eu.qlikcloud.com', imagedir: './shots' });

        expect(out).toContain('tenanturl');
        expect(out).toContain('acme.eu.qlikcloud.com');
        expect(out).toContain('./shots');
    });

    test('never prints a credential', () => {
        expect(render({ tenanturl: 't', apikey: 'super-secret-key' })).not.toContain(
            'super-secret-key'
        );
    });

    test('leaves out answers the run will ignore', () => {
        // Rows come from the same emissions the options bag does. A table built
        // from the raw answers would list things the run does not use, which is
        // worse than no table - it would be confidently wrong.
        const out = render({ tenanturl: 't', headless: true });

        expect(out).not.toContain('headless');
    });

    test('is empty when there is nothing worth showing', () => {
        expect(render({})).toBe('');
    });

    test('draws box borders when the terminal can take them', () => {
        expect(render({ tenanturl: 't' })).toContain('─');
    });

    test('falls back to pure ASCII when it cannot', () => {
        // The difference between a tidy summary and mojibake on a Windows
        // Server console.
        process.env[ASCII_ONLY_ENV] = '1';
        const out = render({ tenanturl: 't' });

        expect(out).toContain('+---');
        expect(out).not.toContain('─');
    });
});
