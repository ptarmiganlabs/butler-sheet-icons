import { describe, test, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let logger;
let sleep;
let markInterrupted;
let resetInterruptState;
let originalWarningListeners;
let originalNoProcessWarnings;

beforeAll(async () => {
    originalWarningListeners = process.listeners('warning');
    originalNoProcessWarnings = process.noProcessWarnings;
    process.removeAllListeners('warning');

    ({ logger, sleep } = await import('../globals.js'));
    ({ markInterrupted, resetInterruptState } = await import('../lib/util/interrupt.js'));
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

describe('console line format (BSI_LOG_TIMESTAMPS default)', () => {
    // The default (stamped) shape is asserted in-process against the real transport rather
    // than by spawning the CLI - a child process costs ~3.5 s on the Windows runner. The
    // disabled branch cannot be tested this way (`consoleTimestamps` is fixed at module
    // load), so that one lives as a spawn test in butler-sheet-icons.test.js.
    test('console lines carry the ISO timestamp prefix by default', async () => {
        const { logger: realLogger } = await import('../globals.js');
        const transport = realLogger.transports.find((t) => t.name === 'console');

        // Mirror winston's real pipeline: the logger-level format runs first
        // (Logger._transform), then the transport's own format over the result
        // (winston-transport modern.js). The transport chain deliberately has no
        // timestamp() of its own - it relies on the logger-level stamp, which is
        // exactly what this test pins.
        const afterLogger = realLogger.format.transform(
            { level: 'info', message: 'App version: 0.0.0-test' },
            realLogger.format.options
        );
        const line = transport.format.transform({ ...afterLogger }, transport.format.options)[
            Symbol.for('message')
        ];

        expect(line).toMatch(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z info: App version: 0\.0\.0-test$/
        );
    });
});

describe('sendConsoleLogToStderr', () => {
    // Winston's Console transport writes *every* level to stdout unless given `stderrLevels`,
    // `error` included. That is easy to assume otherwise - the assumption is why a winston error
    // line could land in the middle of `doctor check --outputformat json` and make the document
    // unparseable, on the one machine the document exists to describe.
    //
    // Both halves are asserted against the real transport rather than a mock: that stdout is the
    // default, and that the call moves everything off it.
    test('the console writes errors to stdout by default', async () => {
        const { logger: realLogger } = await import('../globals.js');
        const transport = realLogger.transports.find((t) => t.name === 'console');

        expect(transport.stderrLevels.error).toBeFalsy();
    });

    test('routes every level to stderr once called, so a payload can own stdout', async () => {
        const { logger: realLogger, sendConsoleLogToStderr } = await import('../globals.js');
        const transport = realLogger.transports.find((t) => t.name === 'console');
        const before = transport.stderrLevels;

        try {
            sendConsoleLogToStderr();

            // Every level, not just error: in JSON mode the document is the whole of stdout, so
            // an `info` line would corrupt it exactly as an `error` line would.
            for (const level of ['error', 'warn', 'info', 'verbose', 'debug']) {
                expect({ level, toStderr: Boolean(transport.stderrLevels[level]) }).toEqual({
                    level,
                    toStderr: true,
                });
            }
        } finally {
            // Restored explicitly: the transport is module state shared by every suite in this
            // --runInBand process, and leaving it switched would silently change where later
            // suites' output goes.
            transport.stderrLevels = before;
        }
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

describe('sleep aborts when the run is interrupted (issue #1107)', () => {
    afterEach(() => {
        resetInterruptState();
    });

    test('resolves normally when nothing interrupts it', async () => {
        await expect(sleep(1)).resolves.toBeUndefined();
    });

    test('a pending sleep rejects the moment the signal arrives', async () => {
        // Closing the browser unblocks every in-flight Puppeteer call, but not
        // a sleep. Without this a shutdown waits out --pagewait, which
        // operators are told to set high enough for the slowest sheet - past
        // `docker stop`'s ten-second grace period.
        const started = Date.now();
        const pending = sleep(60_000);

        markInterrupted('SIGINT');

        await expect(pending).rejects.toThrow();
        expect(Date.now() - started).toBeLessThan(1000);
    });

    test('rejects rather than resolving early', async () => {
        // Resolving would let the caller carry on into work the operator has
        // just asked it to stop doing. Rejecting propagates through the
        // caller's existing error path, exactly as the browser close does.
        const pending = sleep(60_000);
        markInterrupted('SIGINT');

        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    });

    test('a sleep started after the interrupt rejects immediately', async () => {
        markInterrupted('SIGINT');

        await expect(sleep(60_000)).rejects.toThrow();
    });

    test('reads the abort signal per call, so a reset restores normal sleeping', async () => {
        markInterrupted('SIGINT');
        await expect(sleep(1)).rejects.toThrow();

        resetInterruptState();

        // A module that captured the signal at import time would hold the
        // aborted one, and every sleep for the rest of the process would
        // reject.
        await expect(sleep(1)).resolves.toBeUndefined();
    });
});
