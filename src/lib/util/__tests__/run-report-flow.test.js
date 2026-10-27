import { EventEmitter } from 'node:events';

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

/**
 * Flow tests for `runOverAppsWithReport` as extended by issue #1073: the plan
 * block must be emitted before the first per-app worker runs (ordering is the
 * safety property - the plan exists to be read before the first write), a
 * real run must close with a verdict, and failures must be counted on the
 * report before the verdict renders.
 *
 * The logger and the per-app workers write into one shared timeline array, so
 * ordering can be asserted rather than inferred.
 */

const timeline = [];

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn((line) => timeline.push(`LOG ${line}`)),
        verbose: jest.fn(),
        debug: jest.fn(),
        error: jest.fn((line) => timeline.push(`ERROR ${line}`)),
        warn: jest.fn(),
    },
    getLoggingLevel: jest.fn().mockReturnValue('info'),
    setLoggingLevel: jest.fn(),
}));

const { runOverAppsWithReport } = await import('../run-report.js');
const { getLoggingLevel, setLoggingLevel } = await import('../../../globals.js');
const { emitRunVerdictOnce, addAppToReport } = await import('../run-report.js');
const { markInterrupted, resetInterruptState, hasInterruptibleWork } =
    await import('../interrupt.js');
const { installSignalHandlers, resetSignalHandlerState } = await import('../signal-handlers.js');
const { withTemporaryAppOwner, planTemporaryAppOwner } = await import('../temporary-app-owner.js');
const { QseowError } = await import('../errors.js');

/**
 * A minimal but complete run argument bag.
 *
 * @param {object} overrides - Fields to override.
 *
 * @returns {object} Arguments for `runOverAppsWithReport`.
 */
const runArgs = (overrides = {}) => ({
    command: 'qseow create-sheet-thumbnails',
    dryRun: false,
    appIds: ['app-1', 'app-2'],
    namedAppIds: ['app-1', 'app-2'],
    selectorAppIds: [],
    selector: null,
    // The rung is a required argument (workers pass the one emitRunHeader
    // decided); these tests exercise plain-rung behavior explicitly.
    rung: 'plain',
    plan: {
        writes: { kind: 'thumbnails', contentLibrary: 'lib', publishedAppCount: 1 },
    },
    logPrefix: { plan: 'TEST PLAN', process: 'TEST PROCESS' },
    emptySelectionHint: 'hint',
    planApp: jest.fn(async (appId) => {
        timeline.push(`PLANAPP ${appId}`);
    }),
    processApp: jest.fn(async (appId) => {
        timeline.push(`PROCESS ${appId}`);
    }),
    ...overrides,
});

beforeEach(() => {
    timeline.length = 0;
    jest.clearAllMocks();
    // clearAllMocks clears call records but NOT return values, so a
    // mockReturnValue('warn') set in one describe would silently leak into
    // every later test without this reset.
    getLoggingLevel.mockReturnValue('info');
    // A BSI_OUTPUT inherited from the developer's shell would change which
    // rung the loop selects and route the blocks away from the logger these
    // assertions read. The board rung has its own flow test.
    delete process.env.BSI_OUTPUT;
    resetInterruptState();
});

afterEach(() => {
    resetInterruptState();
});

describe('runOverAppsWithReport - the plan renders before the first write', () => {
    test('on a real run, PLAN precedes every processApp call', async () => {
        await runOverAppsWithReport(runArgs());

        const planIndex = timeline.findIndex((entry) => entry === 'LOG PLAN');
        const firstProcess = timeline.findIndex((entry) => entry.startsWith('PROCESS'));

        expect(planIndex).toBeGreaterThan(-1);
        expect(firstProcess).toBeGreaterThan(-1);
        expect(planIndex).toBeLessThan(firstProcess);
    });

    test('on a dry run, PLAN precedes every planApp call', async () => {
        await runOverAppsWithReport(runArgs({ dryRun: true }));

        const planIndex = timeline.findIndex((entry) => entry === 'LOG PLAN');
        const firstPlanApp = timeline.findIndex((entry) => entry.startsWith('PLANAPP'));

        expect(planIndex).toBeGreaterThan(-1);
        expect(firstPlanApp).toBeGreaterThan(-1);
        expect(planIndex).toBeLessThan(firstPlanApp);
    });
});

describe('runOverAppsWithReport - the verdict', () => {
    test('a clean real run closes with RESULT ok after the last app', async () => {
        const result = await runOverAppsWithReport(runArgs());

        expect(result).toBe(true);
        const verdictIndex = timeline.findIndex((entry) => entry === 'LOG RESULT  ok');
        const lastProcess = timeline.map((e) => e.startsWith('PROCESS')).lastIndexOf(true);
        expect(verdictIndex).toBeGreaterThan(lastProcess);
        expect(timeline).toContain('LOG   apps          2 ok, 0 failed');
    });

    test('a failed app is counted on the report and fails the verdict', async () => {
        const args = runArgs({
            processApp: jest.fn(async (appId) => {
                if (appId === 'app-2') {
                    throw new Error('boom');
                }
                timeline.push(`PROCESS ${appId}`);
            }),
        });

        const result = await runOverAppsWithReport(args);

        expect(result).toBe(false);
        expect(timeline).toContain('LOG RESULT  FAILED');
        expect(timeline).toContain('LOG   apps          1 ok, 1 failed');
    });

    test('an empty real selection still gets a verdict naming the emptiness', async () => {
        const result = await runOverAppsWithReport(
            runArgs({ appIds: [], namedAppIds: [], selectorAppIds: [] })
        );

        expect(result).toBe(false);
        expect(timeline).toContain('LOG RESULT  FAILED');
        expect(timeline).toContain('LOG   apps          0 selected - nothing was done');
    });

    test('a dry run renders the dry-run report, never a RESULT block', async () => {
        await runOverAppsWithReport(runArgs({ dryRun: true }));

        expect(timeline.some((entry) => entry.startsWith('LOG RESULT'))).toBe(false);
        expect(timeline.some((entry) => entry.includes('DRY RUN of'))).toBe(true);
    });

    test('a planner that fails is marked on the dry-run report, and the apply invite is withheld', async () => {
        // A planner failure after (or before) its rows are recorded must not
        // render as a clean plan that invites re-running without --dry-run.
        const result = await runOverAppsWithReport(
            runArgs({
                dryRun: true,
                planApp: jest.fn(async (appId) => {
                    if (appId === 'app-2') {
                        throw new Error('media list read failed');
                    }
                    timeline.push(`PLANAPP ${appId}`);
                }),
            })
        );

        expect(result).toBe(false);
        expect(timeline.some((entry) => entry.includes('could not be fully planned'))).toBe(true);
        expect(
            timeline.some((entry) => entry.includes('Fix the errors above before applying'))
        ).toBe(true);
        expect(timeline.some((entry) => entry.includes('Re-run without --dry-run to apply'))).toBe(
            false
        );
    });
});

describe('runOverAppsWithReport - visibility at quiet log levels', () => {
    test('a dry run forces the plan visible at warn', async () => {
        getLoggingLevel.mockReturnValue('warn');

        await runOverAppsWithReport(runArgs({ dryRun: true }));

        expect(setLoggingLevel).toHaveBeenCalledWith('info');
        expect(setLoggingLevel).toHaveBeenCalledWith('warn');
    });

    test("a real run respects the operator's quiet level", async () => {
        // A real run at warn asked for a quiet log; the run card must not
        // override that the way the dry-run report deliberately does.
        getLoggingLevel.mockReturnValue('warn');

        await runOverAppsWithReport(runArgs());

        expect(setLoggingLevel).not.toHaveBeenCalled();
    });
});

describe('runOverAppsWithReport - countable app lines', () => {
    test('each app is announced as i/n before its worker runs', async () => {
        await runOverAppsWithReport(runArgs());

        const first = timeline.indexOf('LOG app 1/2  app-1');
        const firstProcess = timeline.indexOf('PROCESS app-1');
        expect(first).toBeGreaterThan(-1);
        expect(first).toBeLessThan(firstProcess);
        expect(timeline).toContain('LOG app 2/2  app-2');
    });

    test('a dry run keeps its verb in the app line', async () => {
        await runOverAppsWithReport(runArgs({ dryRun: true }));

        expect(timeline).toContain('LOG plan app 1/2  app-1');
    });
});

describe('runOverAppsWithReport - an interrupted run (issue #1107)', () => {
    /**
     * Everything the logger was given, joined.
     *
     * @returns {string} All log lines, newline separated.
     */
    const logged = () => timeline.filter((entry) => entry.startsWith('LOG ')).join('\n');

    test('emits a verdict covering the apps already completed', async () => {
        const processApp = jest.fn(async (appId) => {
            timeline.push(`PROCESS ${appId}`);
            if (appId === 'app-1') markInterrupted('SIGINT');
        });

        await runOverAppsWithReport(runArgs({ appIds: ['app-1', 'app-2', 'app-3'], processApp }));

        // The one thing an operator needs after a Ctrl-C: which apps were
        // already written, and how much is left to re-run.
        expect(logged()).toContain('RESULT  INTERRUPTED');
        expect(logged()).toContain('1 ok');
        expect(logged()).toContain('2 not started');
    });

    test('reports failure, whatever the app loop counted', async () => {
        // The loop can legitimately count zero failures - it stopped at a
        // boundary - and exiting 0 there would tell a scheduler the run did
        // its job.
        const processApp = jest.fn(async () => markInterrupted('SIGINT'));

        await expect(
            runOverAppsWithReport(runArgs({ appIds: ['app-1', 'app-2'], processApp }))
        ).resolves.toBe(false);
    });

    test('the app in flight is recorded as interrupted, not failed', async () => {
        const processApp = jest.fn(async () => {
            markInterrupted('SIGINT');
            throw new Error('Protocol error: Target closed');
        });

        await runOverAppsWithReport(runArgs({ appIds: ['app-1', 'app-2'], processApp }));

        expect(logged()).toContain('1 interrupted');
        expect(logged()).not.toContain('1 failed');
    });

    test('a genuine failure is still a failure when a later signal arrives', async () => {
        const processApp = jest.fn(async (appId) => {
            if (appId === 'app-1') throw new Error('server unreachable');
            markInterrupted('SIGINT');
        });

        await runOverAppsWithReport(runArgs({ appIds: ['app-1', 'app-2', 'app-3'], processApp }));

        expect(logged()).toContain('1 failed');
    });

    test('the verdict is emitted exactly once, whichever path reaches it first', async () => {
        const processApp = jest.fn(async () => markInterrupted('SIGINT'));

        await runOverAppsWithReport(runArgs({ appIds: ['app-1', 'app-2'], processApp }));

        const verdicts = timeline.filter((entry) => entry.includes('RESULT')).length;
        expect(verdicts).toBe(1);

        // The signal handler's second-signal and watchdog paths both call
        // this. Neither may print a second verdict.
        expect(emitRunVerdictOnce()).toBe(false);
        expect(timeline.filter((entry) => entry.includes('RESULT')).length).toBe(1);
    });

    test('the interruptible region is closed even when the loop throws', async () => {
        const planApp = jest.fn(async () => {
            throw new Error('planner exploded');
        });

        await runOverAppsWithReport(runArgs({ dryRun: true, planApp })).catch(() => {});

        // Left open, every later signal would wait eight seconds for a run
        // that had already finished.
        expect(hasInterruptibleWork()).toBe(false);
    });

    test('a dry run discards the pending verdict rather than printing two reports', async () => {
        await runOverAppsWithReport(runArgs({ dryRun: true }));

        expect(emitRunVerdictOnce()).toBe(false);
    });

    test('an uninterrupted run still says ok', async () => {
        await runOverAppsWithReport(runArgs());

        expect(logged()).toContain('RESULT  ok');
        expect(logged()).not.toContain('not started');
    });
});

describe('runOverAppsWithReport - --change-app-owner (issue #1209)', () => {
    const ANNA = { id: 'u-anna', label: 'ACME\\anna' };
    const JOE = { id: 'u-joe', label: 'ACME\\joe' };

    /**
     * A platform half whose restores always fail, keeping each app's owner in memory.
     *
     * @param {object} [behaviour] - How it behaves.
     * @param {boolean} [behaviour.restoreFails] - Whether giving an app back fails.
     *
     * @returns {object} The fake.
     */
    const fakeOwners = ({ restoreFails = false } = {}) => {
        const owners = new Map();

        return {
            inspect: async (appId) => ({
                appName: `App ${appId}`,
                owner: owners.get(appId) ?? ANNA,
                keepReason: null,
            }),
            currentOwnerId: async (appId) => (owners.get(appId) ?? ANNA).id,
            change: async (appId, owner) => {
                if (restoreFails && owner === ANNA) {
                    throw new Error('Received error code: 500::boom');
                }
                owners.set(appId, owner);
            },
            manualFix: (appId, owner) => `give ${appId} back to ${owner.label}`,
        };
    };

    /**
     * A platform half whose owner change moves objects, as QRS does, with one sheet of Joe's in
     * every app.
     *
     * @param {object} [behaviour] - How it behaves.
     * @param {boolean} [behaviour.giveBackFails] - Whether giving an object back fails.
     *
     * @returns {object} The fake.
     */
    const fakeObjectOwners = ({ giveBackFails = false } = {}) => {
        const base = fakeOwners();
        const sheetOwners = new Map();
        const sheetOwner = (appId) => sheetOwners.get(appId) ?? JOE;

        return {
            ...base,
            change: async (appId, owner) => {
                if (sheetOwner(appId) === (await base.inspect(appId)).owner) {
                    sheetOwners.set(appId, owner);
                }
                await base.change(appId, owner);
            },
            objectsOwnedBy: async (appId, ownerId) =>
                sheetOwner(appId).id === ownerId
                    ? [{ id: `${appId}-sheet`, name: "Joe's notes", objectType: 'sheet' }]
                    : [],
            changeObjectOwner: async (objectId, owner) => {
                if (giveBackFails) {
                    throw new Error('Received error code: 500::boom');
                }
                sheetOwners.set(objectId.replace(/-sheet$/, ''), owner);
            },
            manualObjectFix: (objectList, owner) => `give ${objectList} back to ${owner.label}`,
        };
    };

    const waits = { settle: async () => {}, pause: async () => {} };

    /**
     * The processApp a worker builds with the option on.
     *
     * @param {object} owners - The platform half.
     *
     * @returns {Function} processApp.
     */
    const processWithOwner = (owners) =>
        jest.fn((appId, report) =>
            withTemporaryAppOwner(
                {
                    appId,
                    owners,
                    target: JOE,
                    waitSeconds: 0,
                    report,
                    logPrefix: 'TEST OWNER',
                    ErrorClass: QseowError,
                },
                async () => timeline.push(`PROCESS ${appId}`),
                waits
            )
        );

    test('a failed restore stops the run, and the verdict says what was left undone', async () => {
        const processApp = processWithOwner(fakeOwners({ restoreFails: true }));

        const result = await runOverAppsWithReport(
            runArgs({
                appIds: ['app-1', 'app-2', 'app-3'],
                namedAppIds: ['app-1', 'app-2', 'app-3'],
                processApp,
            })
        );

        expect(result).toBe(false);
        expect(processApp).toHaveBeenCalledTimes(1);

        const log = timeline.join('\n');
        expect(log).toContain('RESULT  FAILED');
        expect(log).toContain('apps          0 ok, 1 failed, 2 not started');
        expect(log).toContain('stopped       an app owner could not be restored');
        expect(log).toContain(
            'NOT RESTORED  app app-1 "App app-1" may still be owned by ACME\\joe - its owner was ACME\\anna'
        );
    });

    test('a failed give-back of objects stops the run, and the verdict names them', async () => {
        const processApp = processWithOwner(fakeObjectOwners({ giveBackFails: true }));

        const result = await runOverAppsWithReport(
            runArgs({
                appIds: ['app-1', 'app-2'],
                namedAppIds: ['app-1', 'app-2'],
                processApp,
            })
        );

        expect(result).toBe(false);
        expect(processApp).toHaveBeenCalledTimes(1);

        const log = timeline.join('\n');
        expect(log).toContain('apps          0 ok, 1 failed, 1 not started');
        expect(log).toContain(
            'stopped       objects in an app could not be given back to their owner'
        );
        expect(log).toContain(
            `NOT RETURNED  app app-1 "App app-1": 1 object(s) ACME\\joe owned before the run may now be owned by the app's owner - sheet "Joe's notes"`
        );
    });

    test('a run that gave objects back counts them in the verdict', async () => {
        const result = await runOverAppsWithReport(
            runArgs({ processApp: processWithOwner(fakeObjectOwners()) })
        );

        expect(result).toBe(true);
        expect(timeline.join('\n')).toContain(
            'app owner     2 changed and restored, 2 object(s) given back to ACME\\joe'
        );
    });

    test('a dry run names the objects a real run would give back', async () => {
        const owners = fakeObjectOwners();
        const planApp = jest.fn((appId, report) =>
            planTemporaryAppOwner(
                { appId, owners, target: JOE, report, ErrorClass: QseowError },
                async () => {
                    report.apps.push({
                        id: appId,
                        name: `App ${appId}`,
                        sheetCount: null,
                        sheets: [],
                    });
                }
            )
        );

        await runOverAppsWithReport(runArgs({ dryRun: true, planApp }));

        expect(timeline.join('\n')).toContain(
            `ACME\\joe already owns 1 object(s) in the app, which the change back would move to ACME\\anna; they would be given back to ACME\\joe after: sheet "Joe's notes"`
        );
    });

    test('a run whose owners all came back says so and stays ok', async () => {
        const result = await runOverAppsWithReport(
            runArgs({ processApp: processWithOwner(fakeOwners()) })
        );

        expect(result).toBe(true);

        const log = timeline.join('\n');
        expect(log).toContain('RESULT  ok');
        expect(log).toContain('app owner     2 changed and restored');
    });

    test('a dry run shows each app owner and what would happen to it', async () => {
        const owners = fakeOwners();
        const planApp = jest.fn((appId, report) =>
            planTemporaryAppOwner(
                { appId, owners, target: JOE, report, ErrorClass: QseowError },
                async () => {
                    report.apps.push({
                        id: appId,
                        name: `App ${appId}`,
                        sheetCount: null,
                        sheets: [],
                    });
                }
            )
        );

        await runOverAppsWithReport(runArgs({ dryRun: true, planApp }));

        expect(timeline.join('\n')).toContain(
            'Owner: ACME\\anna would be changed to ACME\\joe while the app is processed, then restored'
        );
    });

    test('a second Ctrl-C mid-app still names the app left with the temporary owner', async () => {
        const owners = fakeOwners();
        const processApp = jest.fn((appId, report) =>
            withTemporaryAppOwner(
                {
                    appId,
                    owners,
                    target: JOE,
                    waitSeconds: 0,
                    report,
                    logPrefix: 'TEST OWNER',
                    ErrorClass: QseowError,
                },
                async () => {
                    // The process is about to be force-exited: the signal path renders the
                    // verdict while the app is still between its change and its restore.
                    markInterrupted('SIGINT');
                    emitRunVerdictOnce();
                },
                waits
            )
        );

        await runOverAppsWithReport(
            runArgs({ appIds: ['app-1'], namedAppIds: ['app-1'], processApp })
        );

        expect(timeline.join('\n')).toContain(
            'NOT RESTORED  app app-1 "App app-1" may still be owned by ACME\\joe - its owner was ACME\\anna'
        );
        // The app that line names was in flight, not untouched. Before issue #1211 the counts
        // beside it said `0 ok, 1 not started`.
        expect(timeline).toContain('LOG   apps          0 ok, 1 interrupted');
    });
});

describe('runOverAppsWithReport - a forced exit mid-app (issue #1211)', () => {
    /**
     * Installs the real signal handlers on a stand-in for `process`, so a test sends the signals
     * an operator would and the force-exit paths run for real - everything but the exit itself.
     *
     * @param {object} [overrides] - Dependency overrides, e.g. a short `watchdogMs`.
     *
     * @returns {{target: EventEmitter, flushAndExit: Function}} The emitter to signal, and the
     *     stand-in for the exit.
     */
    const installHandlers = (overrides = {}) => {
        const target = new EventEmitter();
        const flushAndExit = jest.fn();
        installSignalHandlers({
            target,
            flushAndExit,
            exit: jest.fn(),
            restoreTerminal: jest.fn(),
            stdout: { isTTY: false, write: jest.fn() },
            logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
            ...overrides,
        });

        return { target, flushAndExit };
    };

    /**
     * The `apps` line of every verdict printed - not the plan block's, which has one of its own -
     * so the counts and "exactly once" are asserted together.
     *
     * @returns {string[]} The lines.
     */
    const appsLines = () => timeline.filter((entry) => /^LOG {3}apps +\d+ ok/.test(entry));

    afterEach(() => {
        resetSignalHandlerState();
    });

    test.each([
        ['a second Ctrl-C', {}, (target) => target.emit('SIGINT')],
        [
            'the shutdown watchdog',
            { watchdogMs: 5 },
            () => new Promise((resolve) => setTimeout(resolve, 50)),
        ],
    ])(
        '%s counts the app in flight as interrupted, not ok',
        async (_label, overrides, forceExit) => {
            const { target, flushAndExit } = installHandlers(overrides);
            const processApp = jest.fn(async (appId, report) => {
                // Recorded the way the processors record it: after the app is open, well after the
                // loop marked it in flight.
                addAppToReport(report, { id: appId, name: `App ${appId}`, sheetCount: 3 });
                target.emit('SIGINT');
                await forceExit(target);
            });

            await runOverAppsWithReport(runArgs({ appIds: ['app-1', 'app-2'], processApp }));

            expect(appsLines()).toEqual(['LOG   apps          0 ok, 1 interrupted, 1 not started']);
            expect(flushAndExit.mock.calls[0][0]).toBe(130);
        }
    );

    test('an app caught before it recorded anything is counted as interrupted too', async () => {
        // Still reading the repository or opening the app - but on Qlik Cloud the app's old
        // thumbnails may already be deleted by then, and under --change-app-owner its owner
        // changed. `not started` would tell the operator it was never touched.
        const { target } = installHandlers();
        const processApp = jest.fn(async () => {
            target.emit('SIGINT');
            target.emit('SIGINT');
        });

        await runOverAppsWithReport(runArgs({ appIds: ['app-1', 'app-2'], processApp }));

        expect(appsLines()).toEqual(['LOG   apps          0 ok, 1 interrupted, 1 not started']);
    });

    test('an app that finished before the forced exit stays ok', async () => {
        const { target } = installHandlers();
        const processApp = jest.fn(async (appId, report) => {
            addAppToReport(report, { id: appId, name: `App ${appId}`, sheetCount: 1 });
            if (appId === 'app-2') {
                target.emit('SIGINT');
                target.emit('SIGINT');
            }
        });

        await runOverAppsWithReport(runArgs({ appIds: ['app-1', 'app-2', 'app-3'], processApp }));

        expect(appsLines()).toEqual(['LOG   apps          1 ok, 1 interrupted, 1 not started']);
    });
});
