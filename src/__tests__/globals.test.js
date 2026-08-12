import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let logger;
let originalWarningListeners;
let originalNoProcessWarnings;

beforeAll(async () => {
    originalWarningListeners = process.listeners('warning');
    originalNoProcessWarnings = process.noProcessWarnings;
    process.removeAllListeners('warning');

    ({ logger } = await import('../globals.js'));
});

afterAll(() => {
    process.removeAllListeners('warning');
    for (const listener of originalWarningListeners) {
        process.on('warning', listener);
    }

    try {
        process.noProcessWarnings = originalNoProcessWarnings;
    } catch {
        // Ignore: the property is read-only in some environments.
    }
});

describe('logger redaction', () => {
    test('redacts Error messages and stacks after winston materializes them', () => {
        const err = new Error('logonpwd=hunter2');
        const transformed = logger.format.transform(err, logger.format.options);

        expect(transformed.message).toBe('logonpwd=[REDACTED]');
        expect(transformed.stack).toContain('Error: logonpwd=[REDACTED]');
        expect(transformed.stack).not.toContain('hunter2');
    });

    test('redacts Symbol.for("splat") metadata values', () => {
        const splat = Symbol.for('splat');
        const transformed = logger.format.transform(
            {
                level: 'info',
                message: 'request failed',
                [splat]: [{ logonpwd: 'hunter2' }, '******'],
            },
            logger.format.options
        );

        expect(transformed[splat]).toEqual([{ logonpwd: '***redacted***' }, '******']);
    });
});

describe('library code does not read .env off disk (issue #1014)', () => {
    // globals.js used to `import 'dotenv/config'`, so importing it — which almost every unit
    // test does transitively — loaded whatever `.env` the developer had. Option declarations
    // bind `.env('BSI_…')`, so a variable in that file changes an option's *effective* default,
    // and a test asserting "this equals the default" then asserted something different locally
    // than in CI. Three tests were patched one at a time before the cause was found.
    //
    // The CLI entry point loads it instead, and integration tests load it themselves.

    /**
     * Reads a source file relative to the repository's `src` directory.
     *
     * @param {string} relativePath - Path under `src`, e.g. `'globals.js'`.
     *
     * @returns {string} The file contents.
     */
    const readSource = (relativePath) =>
        readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', relativePath), 'utf8');

    test('globals.js does not import dotenv', () => {
        expect(readSource('globals.js')).not.toMatch(/^\s*import\s+['"]dotenv/m);
    });

    test('no module under src/lib imports dotenv outside its tests', () => {
        // The same reasoning applies to any library module: reading a dotfile as a side effect
        // of being imported makes every consumer's behaviour depend on the filesystem.
        const offenders = [];
        const walk = (dir) => {
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
                const full = join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name !== '__tests__') walk(full);
                } else if (entry.name.endsWith('.js')) {
                    if (/^\s*import\s+['"]dotenv/m.test(readFileSync(full, 'utf8'))) {
                        offenders.push(full);
                    }
                }
            }
        };
        walk(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib'));

        expect(offenders).toEqual([]);
    });

    test('the CLI entry point still loads it, so .env keeps working for users', () => {
        // The other half of the fix. Without this the change would quietly remove a documented
        // feature: every option's `.env('BSI_…')` binding depends on `.env` being loaded first.
        expect(readSource('butler-sheet-icons.js')).toMatch(/^\s*import\s+['"]dotenv\/config['"]/m);
    });

    test('it is loaded before anything that reads the environment', () => {
        // Import order decides this: ESM executes imports in source order, so the dotenv import
        // has to come before the command builders that read process.env while being constructed.
        const source = readSource('butler-sheet-icons.js');
        const dotenvAt = source.search(/^\s*import\s+['"]dotenv\/config['"]/m);
        const firstOther = source.search(/^\s*import\s+(?!['"]dotenv)/m);

        expect(dotenvAt).toBeGreaterThanOrEqual(0);
        expect(dotenvAt).toBeLessThan(firstOther);
    });
});
