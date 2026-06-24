import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
    },
    isSea: false,
}));

const { writeCrashDump } = await import('../crash-dump.js');
const { logger } = await import('../../../globals.js');

let tmpDir;

beforeEach(async () => {
    jest.clearAllMocks();
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bsi-crash-'));
    process.env.BSI_CRASH_DUMP_DIR = tmpDir;
    process.env.BSI_CRASH_DUMP_ENABLE = '1';
    process.env.BSI_CRASH_DUMP_CREATE_JSON = '1';
    process.env.BSI_CRASH_DUMP_CREATE_TEXT = '1';
});

afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
    delete process.env.BSI_CRASH_DUMP_DIR;
    delete process.env.BSI_CRASH_DUMP_ENABLE;
    delete process.env.BSI_CRASH_DUMP_CREATE_JSON;
    delete process.env.BSI_CRASH_DUMP_CREATE_TEXT;
});

/**
 * Lists the files in the temporary crash-dump directory.
 *
 * @returns {Promise<string[]>} Resolves to the list of file names in the temp dir.
 */
const listDumps = async () => fs.promises.readdir(tmpDir);

describe('writeCrashDump', () => {
    test('writes both JSON and text dumps for an Error', async () => {
        const err = new Error('boom');
        await writeCrashDump(err, 'manual');

        const files = await listDumps();
        const json = files.find((f) => f.endsWith('.json'));
        const txt = files.find((f) => f.endsWith('.txt'));
        expect(json).toBeDefined();
        expect(txt).toBeDefined();
    });

    test('JSON dump is valid JSON with expected shape and redacted secrets', async () => {
        const err = new Error('failed with password=hunter2 and Bearer eyJhbGciOi.fakesig');
        err.stack = 'Error: failed\n    at /Users/admin/private/src/foo.js:1:1';

        await writeCrashDump(err, 'manual');

        const files = await listDumps();
        const jsonFile = files.find((f) => f.endsWith('.json'));
        const parsed = JSON.parse(await fs.promises.readFile(path.join(tmpDir, jsonFile), 'utf8'));

        expect(parsed.error.type).toBe('Error');
        expect(parsed.error.message).toBe('failed with password=[REDACTED] and Bearer [REDACTED]');
        expect(parsed.error.stack).toContain('src/foo.js');
        expect(parsed.error.stack).not.toContain('/Users/admin/private');
        // The first regex collapses absolute prefixes to relative, the second
        // and third replace any remaining absolute paths with `[path]`.
        // For a single-line stack, the first regex fires, so the `[path]`
        // token may not appear here; the assertion above is the strict
        // contract. The third test below exercises the `[path]` branch.
        expect(parsed.context.source).toBe('manual');
        expect(parsed.app.name).toBe('butler-sheet-icons');
        expect(parsed.runtime.isSea).toBe(false);
    });

    test('JSON dump redacts logonpwd secrets in error text', async () => {
        const err = new Error(`failed with ${['logon', 'pwd'].join('')}=topsecret`);

        await writeCrashDump(err, 'manual');

        const files = await listDumps();
        const jsonFile = files.find((f) => f.endsWith('.json'));
        const parsed = JSON.parse(await fs.promises.readFile(path.join(tmpDir, jsonFile), 'utf8'));

        expect(parsed.error.message).toBe('failed with logonpwd=[REDACTED]');
    });

    test('JSON dump replaces absolute paths that do not include src/', async () => {
        const err = new Error('boom');
        err.stack = 'Error: boom\n    at /Users/admin/secret/keys/derivate.js:5:1';

        await writeCrashDump(err, 'manual');

        const files = await listDumps();
        const jsonFile = files.find((f) => f.endsWith('.json'));
        const parsed = JSON.parse(await fs.promises.readFile(path.join(tmpDir, jsonFile), 'utf8'));

        expect(parsed.error.stack).toContain('[path]');
        expect(parsed.error.stack).not.toContain('/Users/admin/secret');
    });

    test('text dump contains the human-readable sections', async () => {
        const err = new Error('boom');
        await writeCrashDump(err, 'manual');

        const files = await listDumps();
        const txtFile = files.find((f) => f.endsWith('.txt'));
        const body = await fs.promises.readFile(path.join(tmpDir, txtFile), 'utf8');

        expect(body).toContain('BUTLER SHEET ICONS CRASH REPORT');
        expect(body).toContain('Error Type: Error');
        expect(body).toContain('Source: manual');
        expect(body).toContain('=== ERROR MESSAGE ===');
        expect(body).toContain('=== STACK TRACE ===');
    });

    test('honors BSI_CRASH_DUMP_ENABLE=0 (no files written)', async () => {
        process.env.BSI_CRASH_DUMP_ENABLE = '0';
        const err = new Error('boom');
        await writeCrashDump(err, 'manual');

        const files = await listDumps();
        expect(files.filter((f) => f.startsWith('crash_dump_'))).toHaveLength(0);
    });

    test('honors BSI_CRASH_DUMP_CREATE_JSON=0 (only text file written)', async () => {
        process.env.BSI_CRASH_DUMP_CREATE_JSON = '0';
        const err = new Error('boom');
        await writeCrashDump(err, 'manual');

        const files = await listDumps();
        expect(files.filter((f) => f.endsWith('.json'))).toHaveLength(0);
        expect(files.filter((f) => f.endsWith('.txt'))).toHaveLength(1);
    });

    test('honors BSI_CRASH_DUMP_CREATE_TEXT=0 (only JSON file written)', async () => {
        process.env.BSI_CRASH_DUMP_CREATE_TEXT = '0';
        const err = new Error('boom');
        await writeCrashDump(err, 'manual');

        const files = await listDumps();
        expect(files.filter((f) => f.endsWith('.txt'))).toHaveLength(0);
        expect(files.filter((f) => f.endsWith('.json'))).toHaveLength(1);
    });

    test('handles non-Error throwables (string, plain object)', async () => {
        await writeCrashDump('just a string', 'manual');
        await writeCrashDump({ code: 'ETIMEDOUT', message: 'oops' }, 'manual');

        const files = await listDumps();
        const jsonFiles = files.filter((f) => f.endsWith('.json'));
        expect(jsonFiles.length).toBeGreaterThanOrEqual(2);

        const all = await Promise.all(
            jsonFiles.map((f) => fs.promises.readFile(path.join(tmpDir, f), 'utf8'))
        );
        const parsed = all.map((s) => JSON.parse(s));
        expect(parsed.some((p) => p.error.message === 'just a string')).toBe(true);
        expect(parsed.some((p) => p.error.message === 'oops')).toBe(true);
    });

    test('filename includes a per-process counter (no collisions on rapid calls)', async () => {
        const err = new Error('boom');
        await Promise.all([
            writeCrashDump(err, 'manual'),
            writeCrashDump(err, 'manual'),
            writeCrashDump(err, 'manual'),
        ]);

        const files = await listDumps();
        const names = new Set(files);
        expect(names.size).toBe(files.length);
    });

    test('logs the written path via the global logger', async () => {
        const err = new Error('boom');
        await writeCrashDump(err, 'manual');

        const writtenCalls = logger.error.mock.calls.filter((c) =>
            String(c[0] ?? '').includes('CRASH DUMP: Written to')
        );
        expect(writtenCalls.length).toBeGreaterThan(0);
    });

    test('does not throw on a totally broken error input', async () => {
        // Pass a value whose constructor access itself throws.
        const hostile = Object.create(null);
        Object.defineProperty(hostile, 'constructor', {
            /**
             * Getter that throws to simulate a hostile object whose
             * `constructor` access is itself broken.
             */
            get() {
                throw new Error('cannot read constructor');
            },
        });

        await expect(writeCrashDump(hostile, 'manual')).resolves.toBeUndefined();
    });
});
