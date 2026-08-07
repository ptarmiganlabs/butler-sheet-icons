import { jest, describe, test, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
    },
}));

const { logger } = await import('../../../globals.js');
const { runOverApps } = await import('../run-over-apps.js');

const CTX = { logPrefix: 'TEST PREFIX' };

/**
 * Joins everything logged at error level, for substring assertions.
 *
 * @returns {string} All error lines, newline separated.
 */
const errorLog = () => logger.error.mock.calls.map((call) => String(call[0])).join('\n');

beforeEach(() => {
    jest.clearAllMocks();
});

describe('runOverApps', () => {
    test('runs the worker once per app', async () => {
        const worker = jest.fn().mockResolvedValue(true);

        await runOverApps(['a', 'b', 'c'], CTX, worker);

        expect(worker.mock.calls.map((call) => call[0])).toEqual(['a', 'b', 'c']);
    });

    test('reports success when every app was processed', async () => {
        const result = await runOverApps(['a', 'b'], CTX, jest.fn().mockResolvedValue(true));

        expect(result).toBe(true);
    });

    test('processes an app named twice only once', async () => {
        // An app can be named by both --appid and a collection.
        const worker = jest.fn().mockResolvedValue(true);

        const result = await runOverApps(['a', 'b', 'a'], CTX, worker);

        expect(worker).toHaveBeenCalledTimes(2);
        expect(result).toBe(true);
    });

    test('counts the deduplicated apps, not the raw input, in the summary', async () => {
        // The summary line is the only place the count reaches the operator. Without a
        // failing app the line never fires, so a duplicate-only test cannot pin it - and
        // `uniqueAppIds.length` could silently become `appIds.length`.
        const worker = jest.fn(async (appId) => {
            if (appId === 'b') throw new Error('engine unreachable');
        });

        await runOverApps(['a', 'b', 'a'], CTX, worker);

        expect(errorLog()).toContain('Failed to process 1 of 2 app(s)');
    });

    describe('a failing app', () => {
        test('does not stop the apps after it', async () => {
            const worker = jest.fn(async (appId) => {
                if (appId === 'a') throw new Error('engine unreachable');
            });

            await runOverApps(['a', 'b', 'c'], CTX, worker);

            expect(worker).toHaveBeenCalledTimes(3);
        });

        test('is counted rather than ignored', async () => {
            // Nothing counted these before, so a run in which every app failed was
            // indistinguishable from a clean one.
            const worker = jest.fn(async (appId) => {
                if (appId !== 'b') throw new Error('engine unreachable');
            });

            const result = await runOverApps(['a', 'b', 'c'], CTX, worker);

            expect(result).toBe(false);
            expect(errorLog()).toContain('Failed to process 2 of 3 app(s)');
        });

        test('is named in the log, with the reason', async () => {
            const worker = jest.fn(async () => {
                throw new Error('engine unreachable');
            });

            await runOverApps(['app-a'], CTX, worker);

            expect(errorLog()).toContain('TEST PREFIX: Failed to process app app-a');
            expect(errorLog()).toContain('engine unreachable');
        });

        test('produces a summary naming the counts', async () => {
            const worker = jest.fn(async (appId) => {
                if (appId === 'b') throw new Error('engine unreachable');
            });

            await runOverApps(['a', 'b', 'c'], CTX, worker);

            expect(errorLog()).toContain('Failed to process 1 of 3 app(s)');
        });

        test('does not reject, so the caller decides what a failure means', async () => {
            const worker = jest.fn(async () => {
                throw new Error('engine unreachable');
            });

            await expect(runOverApps(['a'], CTX, worker)).resolves.toBe(false);
        });
    });

    describe('no apps at all', () => {
        test('never calls the worker', async () => {
            const worker = jest.fn();

            await runOverApps([], CTX, worker);

            expect(worker).not.toHaveBeenCalled();
        });

        test('is reported as an error, not as a clean run', async () => {
            // An unresolvable collection is not the same as "nothing to do".
            await runOverApps([], CTX, jest.fn());

            expect(errorLog()).toContain('No apps to process');
        });

        test('includes the caller-supplied hint about which options to check', async () => {
            await runOverApps(
                [],
                { ...CTX, emptySelectionHint: 'Check the --appid and --collectionid options.' },
                jest.fn()
            );

            expect(errorLog()).toContain('Check the --appid and --collectionid options.');
        });

        test('omits the hint cleanly when the caller supplied none', async () => {
            await runOverApps([], CTX, jest.fn());

            expect(errorLog()).toContain('No apps to process.');
            expect(errorLog()).not.toContain('undefined');
        });

        test('reports failure, not a vacuous success', async () => {
            // An empty selection resolves to false: the operator asked for apps and got
            // none, which must not be reported as a clean run.
            await expect(runOverApps([], CTX, jest.fn())).resolves.toBe(false);
        });
    });

    test('logs no failure summary when every app succeeded', async () => {
        await runOverApps(['a', 'b'], CTX, jest.fn().mockResolvedValue(true));

        expect(errorLog()).not.toContain('Failed to process');
    });

    test('survives a worker that throws a non-Error', async () => {
        const worker = jest.fn(async () => {
            throw 'just a string';
        });

        const result = await runOverApps(['a'], CTX, worker);

        expect(result).toBe(false);
        expect(errorLog()).toContain('just a string');
    });
});
