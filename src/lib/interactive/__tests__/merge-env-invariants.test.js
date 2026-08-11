import { describe, test, expect } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { mergeEnvContents } from '../merge-env-file.js';

/**
 * Two invariants decide whether a merge is correct, and they are worth stating
 * plainly because every bug this file has had broke one of them:
 *
 * 1. **Nothing we do not own changes.** Every key the merge was not asked about
 *    parses to exactly the value it had before.
 * 2. **Everything we do own ends up right.** Every key the merge was asked about
 *    parses to the new value afterwards.
 *
 * Checking these by parsing before and after - rather than asserting on the text
 * - is what makes the check independent of formatting decisions. A fixture can
 * use any quoting, spacing, ordering or line ending it likes, and the assertions
 * still mean the same thing.
 *
 * The corpus is deliberately awkward: comments, blank runs, `export`, duplicate
 * keys, values containing hashes and quotes, values spanning lines, an
 * unterminated quote, CRLF, mixed endings, a missing trailing newline, an empty
 * file, and a file with none of our keys at all.
 */

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'env');

const OWNED = [
    { name: 'BSI_QSCLOUD_CST_TENANTURL', line: "BSI_QSCLOUD_CST_TENANTURL='new.tenant'" },
    { name: 'BSI_QSCLOUD_CST_APP_ID', line: "BSI_QSCLOUD_CST_APP_ID='app-a,app-b'" },
];

const EXPECTED = {
    BSI_QSCLOUD_CST_TENANTURL: 'new.tenant',
    BSI_QSCLOUD_CST_APP_ID: 'app-a,app-b',
};

const ownedNames = new Set(OWNED.map((entry) => entry.name));

const fixtures = readdirSync(FIXTURES)
    .filter((name) => name.endsWith('.env'))
    .sort();

describe('every fixture keeps both invariants', () => {
    test('the corpus is actually being read, so an empty pass is not a false negative', () => {
        expect(fixtures.length).toBeGreaterThan(10);
    });

    test.each(fixtures)('%s', (name) => {
        const before = readFileSync(join(FIXTURES, name), 'utf8');
        const { contents } = mergeEnvContents(before, OWNED);

        const parsedBefore = dotenv.parse(Buffer.from(before));
        const parsedAfter = dotenv.parse(Buffer.from(contents));

        // 1. Nothing we do not own changed.
        for (const [key, value] of Object.entries(parsedBefore)) {
            if (!ownedNames.has(key)) {
                expect(`${name}: ${key}=${parsedAfter[key]}`).toBe(`${name}: ${key}=${value}`);
            }
        }

        // 2. Everything we own is now the new value.
        for (const [key, value] of Object.entries(EXPECTED)) {
            expect(`${name}: ${key}=${parsedAfter[key]}`).toBe(`${name}: ${key}=${value}`);
        }
    });

    test.each(fixtures)('%s survives being merged twice', (name) => {
        // Saving twice is ordinary, and it is where drift shows up: repeated
        // headers, growing blank runs, duplicated keys.
        const before = readFileSync(join(FIXTURES, name), 'utf8');
        const once = mergeEnvContents(before, OWNED).contents;
        const twice = mergeEnvContents(once, OWNED).contents;

        expect(twice).toBe(once);
    });

    test.each(fixtures.filter((name) => name.startsWith('crlf-')))(
        '%s keeps CRLF endings throughout',
        (name) => {
            const before = readFileSync(join(FIXTURES, name), 'utf8');
            const { contents } = mergeEnvContents(before, OWNED);

            // No LF that is not part of a CRLF pair.
            expect(contents).not.toMatch(/[^\r]\n/);
        }
    );
});

/**
 * Build a random but plausible `.env`.
 *
 * @param {() => number} rand - Source of randomness, seeded by the caller.
 *
 * @returns {string} File contents.
 */
const randomEnvFile = (rand) => {
    const pick = (list) => list[Math.floor(rand() * list.length)];
    const eol = pick(['\n', '\r\n']);
    const values = ['plain', 'two words', 'has#hash', "has'single", 'has"double', '  padded  ', ''];
    const keys = [
        'BSI_QSCLOUD_CST_TENANTURL',
        'BSI_QSCLOUD_CST_APP_ID',
        'UNRELATED',
        'OTHER',
        'THIRD',
    ];

    const lines = [];
    const count = 1 + Math.floor(rand() * 10);

    for (let i = 0; i < count; i += 1) {
        const roll = rand();

        if (roll < 0.15) {
            lines.push('# a comment');
        } else if (roll < 0.25) {
            lines.push('');
        } else if (roll < 0.4) {
            // A value spanning lines, and sometimes one whose quote never
            // closes. Without these the generator only ever produces single-line
            // assignments and never reaches the code where every bug in this
            // file has lived - verified by running the suite against the version
            // before the fixes, where 200 single-line seeds all passed.
            const key = pick(keys);
            const quote = pick(["'", '"']);
            const closes = rand() < 0.7;

            lines.push(`${key}=${quote}first line`);
            lines.push('continuation');

            if (closes) {
                lines.push(`last line${quote}`);
            }
        } else {
            const key = pick(keys);
            const value = pick(values);
            const quote = pick(["'", '"', '']);
            const prefix = rand() < 0.2 ? 'export ' : '';

            // An unquoted value containing a hash or quote is legal input even
            // though it parses oddly - the merge must still not lose anything.
            lines.push(`${prefix}${key}=${quote}${value}${quote}`);
        }
    }

    return lines.join(eol) + (rand() < 0.8 ? eol : '');
};

describe('the invariants hold for randomly generated files', () => {
    // A seeded generator, so a failure names a seed that reproduces it rather
    // than a run nobody can repeat.
    const seeded = (seed) => () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;

        return seed / 2147483648;
    };

    test.each([...Array.from({ length: 500 }, (_, index) => index)])('seed %i', (seed) => {
        const before = randomEnvFile(seeded(seed + 1));
        const { contents } = mergeEnvContents(before, OWNED);

        const parsedBefore = dotenv.parse(Buffer.from(before));
        const parsedAfter = dotenv.parse(Buffer.from(contents));

        for (const [key, value] of Object.entries(parsedBefore)) {
            if (!ownedNames.has(key)) {
                expect(`seed ${seed}: ${key}=${parsedAfter[key]}`).toBe(
                    `seed ${seed}: ${key}=${value}`
                );
            }
        }

        for (const [key, value] of Object.entries(EXPECTED)) {
            expect(`seed ${seed}: ${key}=${parsedAfter[key]}`).toBe(
                `seed ${seed}: ${key}=${value}`
            );
        }
    });
});
