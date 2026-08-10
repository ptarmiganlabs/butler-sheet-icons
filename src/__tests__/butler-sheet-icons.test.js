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
 * @param {object} [options] - Extra `spawnSync` options, merged over the defaults. Use `env` to override the environment and `input`/`timeout` to prove a command does not block.
 *
 * @returns {import('child_process').SpawnSyncReturns<string>} The `spawnSync` result containing `status`, `stdout`, `stderr`, etc.
 */
const execCLI = (args = [], options = {}) => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const cliPath = path.resolve(__dirname, '../butler-sheet-icons.js');

    // Execute the CLI script with the provided arguments
    const result = childProcess.spawnSync('node', [cliPath, ...args], {
        encoding: 'utf-8',
        env: process.env,
        ...options,
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

// The rows of the #900 verification matrix that a machine can check. The
// Windows console rows - code pages, PowerShell hosts, cursor redraw - need a
// human looking at a screen, but everything below runs unattended on both
// ubuntu-latest and windows-latest via pr-unit-tests.yaml, which is what stops
// these properties from silently regressing between manual passes.
describe('interactive mode without a terminal', () => {
    // spawnSync gives the child a pipe for stdin and stdout, so every run in
    // this block is non-TTY by construction - no pty harness needed.
    const NON_TTY_ENV = { ...process.env };
    delete NON_TTY_ENV.BSI_NO_INTERACTIVE;
    delete NON_TTY_ENV.BSI_ASCII_ONLY;
    delete NON_TTY_ENV.NO_COLOR;
    delete NON_TTY_ENV.FORCE_COLOR;

    const ESCAPE_CODE = new RegExp(`${String.fromCharCode(27)}\\[`);

    test('fails fast instead of hanging on a stdin that will never answer', () => {
        // The single most important property in the whole feature. A wizard
        // blocking on a closed stdin inside a scheduled container run is an
        // outage, not a cosmetic problem.
        const result = execCLI(['interactive'], {
            input: '',
            timeout: 20000,
            env: NON_TTY_ENV,
        });

        // spawnSync reports a timeout kill via `signal`, so a null signal is
        // the assertion that the process ended on its own rather than being
        // killed after blocking.
        expect(result.signal).toBeNull();
        expect(result.status).toBe(1);
    });

    test('explains why, and how to proceed, rather than just failing', () => {
        const result = execCLI(['interactive'], { input: '', timeout: 20000, env: NON_TTY_ENV });
        const output = result.stdout + result.stderr;

        expect(output).toContain('needs a terminal');
        expect(output).toContain('docker run -it');
    });

    test('the explanation carries no stack trace', () => {
        // The guidance is already a complete explanation. Issue #785 was about
        // exactly this kind of noise drowning the useful line.
        const result = execCLI(['interactive'], { input: '', timeout: 20000, env: NON_TTY_ENV });
        const output = result.stdout + result.stderr;

        expect(output).not.toContain('    at ');
    });

    test('BSI_NO_INTERACTIVE is honoured independently of terminal detection', () => {
        const result = execCLI(['interactive'], {
            input: '',
            timeout: 20000,
            env: { ...NON_TTY_ENV, BSI_NO_INTERACTIVE: '1' },
        });

        expect(result.signal).toBeNull();
        expect(result.status).toBe(1);
        expect(result.stdout + result.stderr).toContain('BSI_NO_INTERACTIVE');
    });

    test('redirected output carries no escape codes', () => {
        // False for the whole program until the console transport learned to
        // check isTTY, so this guards every command, not just this one.
        const result = execCLI(['interactive'], { input: '', timeout: 20000, env: NON_TTY_ENV });

        expect(result.stdout).not.toMatch(ESCAPE_CODE);
        expect(result.stderr).not.toMatch(ESCAPE_CODE);
    });

    test('NO_COLOR is honoured', () => {
        const result = execCLI(['browser', 'list-installed'], {
            timeout: 20000,
            env: { ...NON_TTY_ENV, NO_COLOR: '1' },
        });

        expect(result.stdout).not.toMatch(ESCAPE_CODE);
    });
});

describe('interactive --self-test', () => {
    const SELF_TEST_ENV = { ...process.env };
    delete SELF_TEST_ENV.BSI_ASCII_ONLY;
    delete SELF_TEST_ENV.BSI_NO_INTERACTIVE;

    const NON_ASCII_PATTERN = /[^\x20-\x7e\r\n\t]/;

    test('succeeds with no terminal, so it can run unattended', () => {
        // Exiting 0 here is what lets this be the CI check guarding the non-TTY
        // path. The capability report is complete and useful without prompts;
        // only the prompt gallery needs a terminal.
        const result = execCLI(['interactive', '--self-test'], {
            input: '',
            timeout: 30000,
            env: SELF_TEST_ENV,
        });

        expect(result.signal).toBeNull();
        expect(result.status).toBe(0);
    });

    test('reports the capabilities that decide how the wizard renders', () => {
        const result = execCLI(['interactive', '--self-test'], {
            input: '',
            timeout: 30000,
            env: SELF_TEST_ENV,
        });

        for (const row of [
            'stdin is a terminal',
            'typeof stdout.hasColors',
            'colour enabled',
            'unicode symbols in use',
            'table border set',
            'available',
        ]) {
            expect(result.stdout).toContain(row);
        }
    });

    test('skips the prompt gallery, saying why', () => {
        const result = execCLI(['interactive', '--self-test'], {
            input: '',
            timeout: 30000,
            env: SELF_TEST_ENV,
        });

        expect(result.stdout).toContain('skipped');
    });

    test('emits nothing outside printable ASCII when the fallback is forced', () => {
        // "No mojibake" as a mechanical assertion rather than a screenshot -
        // the only degradation criterion checkable without a human at a Windows
        // console.
        const result = execCLI(['interactive', '--self-test'], {
            input: '',
            timeout: 30000,
            env: { ...SELF_TEST_ENV, BSI_ASCII_ONLY: '1' },
        });

        expect(result.status).toBe(0);
        expect(result.stdout).not.toMatch(NON_ASCII_PATTERN);
    });
});

describe('adding interactive mode changes nothing that already worked', () => {
    test('bare invocation still prints help and exits 1', () => {
        const result = execCLI([]);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('Usage:');
    });

    test('the new command is discoverable from top-level help', () => {
        const result = execCLI(['--help']);

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('interactive');
    });

    test('--self-test stays out of help, being a diagnostic rather than a feature', () => {
        const result = execCLI(['interactive', '--help']);

        expect(result.status).toBe(0);
        expect(result.stdout).not.toContain('--self-test');
    });

    test('the browser commands are untouched', () => {
        const result = execCLI(['browser', '--help']);

        expect(result.status).toBe(0);
        for (const leaf of [
            'install',
            'uninstall',
            'uninstall-all',
            'list-installed',
            'list-available',
        ]) {
            expect(result.stdout).toContain(leaf);
        }
        expect(result.stdout).not.toContain('interactive');
    });
});
