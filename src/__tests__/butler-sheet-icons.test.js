// filepath: /Users/goran/code/butler-sheet-icons/src/__tests__/butler-sheet-icons.test.js
import { test, expect, describe, jest, beforeEach, afterEach } from '@jest/globals';
import 'dotenv/config';
import {} from 'commander';
import {} from '../globals.js';
import childProcess from 'child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// Mock all the imported modules that are used in the main file
jest.mock('../globals.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
    },
    appVersion: '1.0.0-test',
}));

jest.mock('../lib/qseow/qseow-create-thumbnails.js', () => ({
    qseowCreateThumbnails: jest.fn().mockResolvedValue(true),
}));

jest.mock('../lib/cloud/cloud-create-thumbnails.js', () => ({
    qscloudCreateThumbnails: jest.fn().mockResolvedValue(true),
}));

jest.mock('../lib/cloud/cloud-collections.js', () => ({
    qscloudListCollections: jest.fn().mockResolvedValue(true),
}));

jest.mock('../lib/cloud/cloud-remove-sheet-icons.js', () => ({
    qscloudRemoveSheetIcons: jest.fn().mockResolvedValue(true),
}));

jest.mock('../lib/browser/browser-installed.js', () => ({
    browserInstalled: jest.fn().mockResolvedValue([]),
}));

jest.mock('../lib/browser/browser-uninstall.js', () => ({
    browserUninstall: jest.fn().mockResolvedValue(true),
    browserUninstallAll: jest.fn().mockResolvedValue(true),
}));

jest.mock('../lib/browser/browser-list-available.js', () => ({
    browserListAvailable: jest.fn().mockResolvedValue([]),
}));

/**
 * Runs the butler-sheet-icons CLI in a child process and returns the result.
 *
 * @param {string[]} [args] - CLI arguments to pass to the spawned process. Defaults to `[]`.
 *
 * @returns {import('child_process').SpawnSyncReturns<string>} The `spawnSync` result containing `status`, `stdout`, `stderr`, etc.
 */
const execCLI = (args = []) => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const cliPath = path.resolve(__dirname, '../butler-sheet-icons.js');

    // Execute the CLI script with the provided arguments
    const result = childProcess.spawnSync('node', [cliPath, ...args], {
        encoding: 'utf-8',
        env: process.env,
    });

    return result;
};

describe('butler-sheet-icons CLI', () => {
    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
    });

    test('should show version info', () => {
        const result = execCLI(['--version']);
        // We don't need to check the exact version, just that it doesn't error
        expect(result.status).toBe(0);
    });

    test('should show help info', () => {
        const result = execCLI(['--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('Usage:');
        expect(result.stdout).toContain('Options:');
        expect(result.stdout).toContain('Commands:');
    });

    test('should handle qseow create-sheet-thumbnails command', () => {
        // Since we don't want to actually run the command and we've mocked all the dependencies,
        // we'll test that the command is registered correctly
        const result = execCLI(['qseow', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('create-sheet-thumbnails');
    });

    test('should handle qscloud create-sheet-thumbnails command', () => {
        const result = execCLI(['qscloud', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('create-sheet-thumbnails');
    });

    test('should handle qscloud list-collections command', () => {
        const result = execCLI(['qscloud', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('list-collections');
    });

    test('should handle qscloud remove-sheet-icons command', () => {
        const result = execCLI(['qscloud', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('remove-sheet-icons');
    });

    test('should handle browser list-installed command', () => {
        const result = execCLI(['browser', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('list-installed');
    });

    test('should handle browser uninstall command', () => {
        const result = execCLI(['browser', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('uninstall');
    });

    test('should handle browser uninstall-all command', () => {
        const result = execCLI(['browser', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('uninstall-all');
    });

    test('should handle browser install command', () => {
        const result = execCLI(['browser', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('install');
    });

    test('should handle browser list-available command', () => {
        const result = execCLI(['browser', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('list-available');
    });
});

/** Printed by the child once the handlers are installed, to prove it got that far. */
const HANDLERS_READY = '__bsi_fatal_handlers_installed__';

describe('fatal error safety net, end to end (issue #946)', () => {
    // No mocks here: a real child process, the real handlers, the real crash
    // dump writer, and a real directory on disk. Measured against the handlers
    // as they were before the fix, this burst wrote 400 files.
    let dumpDir;

    beforeEach(() => {
        dumpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsi-fatal-e2e-'));
    });

    afterEach(() => {
        fs.rmSync(dumpDir, { recursive: true, force: true });
    });

    /**
     * Runs a child process that installs the real fatal handlers and then
     * emits a burst of unhandled rejections.
     *
     * @param {number} rejectionCount - How many rejections the child should produce.
     *
     * @returns {import('child_process').SpawnSyncReturns<string>} The `spawnSync` result.
     */
    const runFatalBurst = (rejectionCount) => {
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const handlersPath = path.resolve(__dirname, '../lib/util/fatal-handlers.js');
        // A bare Windows path is not a valid ESM specifier — `import 'C:\...'`
        // fails with ERR_UNSUPPORTED_ESM_URL_SCHEME. Feed the loader a file URL
        // on every platform.
        const handlersUrl = pathToFileURL(handlersPath).href;
        const source = [
            `import { installFatalHandlers } from ${JSON.stringify(handlersUrl)};`,
            'installFatalHandlers();',
            `console.log(${JSON.stringify(HANDLERS_READY)});`,
            `for (let i = 0; i < ${rejectionCount}; i += 1) Promise.reject(new Error('boom ' + i));`,
        ].join('\n');

        const result = childProcess.spawnSync('node', ['--input-type=module', '-e', source], {
            encoding: 'utf-8',
            timeout: 30000,
            env: {
                ...process.env,
                BSI_CRASH_DUMP_DIR: dumpDir,
                BSI_CRASH_DUMP_ENABLE: '1',
                BSI_CRASH_DUMP_CREATE_JSON: '1',
                BSI_CRASH_DUMP_CREATE_TEXT: '1',
            },
        });

        // A child that never got as far as installing the handlers would fail
        // every assertion below as "no crash dumps written", which points at
        // the wrong thing entirely. Fail here instead, quoting the child.
        if (!result.stdout?.includes(HANDLERS_READY)) {
            throw new Error(
                [
                    'The child process did not reach installFatalHandlers().',
                    `status: ${result.status}, signal: ${result.signal}`,
                    `stdout: ${result.stdout}`,
                    `stderr: ${result.stderr}`,
                ].join('\n')
            );
        }

        return result;
    };

    test('a burst of 200 unhandled rejections writes exactly one crash dump', () => {
        const result = runFatalBurst(200);

        const files = fs.readdirSync(dumpDir);
        expect(files.filter((f) => f.endsWith('.json'))).toHaveLength(1);
        expect(files.filter((f) => f.endsWith('.txt'))).toHaveLength(1);
        expect(files).toHaveLength(2);

        // Zero-byte dumps were the visible symptom in the issue. Both files
        // must have actually been written, not merely created.
        for (const file of files) {
            expect(fs.statSync(path.join(dumpDir, file)).size).toBeGreaterThan(0);
        }

        expect(result.status).toBe(1);
    });

    test('the process exits with code 1 rather than hanging', () => {
        const result = runFatalBurst(1);

        // `spawnSync` reports a timeout kill via `signal`, so a null signal is
        // the assertion that the process ended on its own.
        expect(result.signal).toBeNull();
        expect(result.status).toBe(1);
    });

    test('a single FATAL line is logged, naming the first failure only', () => {
        const result = runFatalBurst(200);

        // The winston console transport writes every level to stdout.
        const fatalLines = result.stdout
            .split('\n')
            .filter((line) => line.includes('FATAL: Unhandled promise rejection'));

        expect(fatalLines).toHaveLength(1);
        expect(fatalLines[0]).toContain('boom 0');
    });
});
