import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

/**
 * Tests for the platform-neutral half of `--change-app-owner` (issue #1209).
 *
 * The platform half is a fake that keeps one app's owner in memory, so every assertion about
 * "who owns the app now" reads the state a real server would be left in.
 */

const timeline = [];

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn((line) => timeline.push(`INFO ${line}`)),
        warn: jest.fn((line) => timeline.push(`WARN ${line}`)),
        error: jest.fn((line) => timeline.push(`ERROR ${line}`)),
        verbose: jest.fn(),
        debug: jest.fn(),
    },
    getLoggingLevel: jest.fn().mockReturnValue('info'),
    setLoggingLevel: jest.fn(),
}));

const { withTemporaryAppOwner, planTemporaryAppOwner, RESTORE_ATTEMPTS, RESTORE_BACKOFF_MS } =
    await import('../temporary-app-owner.js');
const { createRunReport } = await import('../run-report.js');
const { markInterrupted, resetInterruptState } = await import('../interrupt.js');
const { isAbortArtifact } = await import('../abort-artifact.js');
const { QseowError } = await import('../errors.js');

const APP = '2d3f0000-0000-4000-8000-000000000001';
const ANNA = { id: 'u-anna', label: 'ACME\\anna' };
const JOE = { id: 'u-joe', label: 'ACME\\joe' };
const OTHER = { id: 'u-other', label: 'ACME\\other' };

/**
 * A platform half keeping one app's owner in memory.
 *
 * @param {object} [setup] - Starting state.
 * @param {object} [setup.owner] - Who owns the app at the start.
 * @param {string|null} [setup.keepReason] - Why the owner must be left alone, if it must.
 *
 * @returns {{owners: object, state: {owner: object}}} The fake, and the state it keeps.
 */
const makeOwners = ({ owner = ANNA, keepReason = null } = {}) => {
    const state = { owner };
    const owners = {
        inspect: jest.fn(async () => ({ appName: 'Sales', owner: state.owner, keepReason })),
        currentOwnerId: jest.fn(async () => state.owner.id),
        change: jest.fn(async (appId, newOwner) => {
            timeline.push(`CHANGE ${newOwner.label}`);
            state.owner = newOwner;
        }),
        manualFix: jest.fn((appId, to) => `give app ${appId} back to ${to.label} by hand`),
    };

    return { owners, state };
};

/**
 * The parameters every call needs.
 *
 * @param {object} owners - The platform half.
 * @param {object} report - The run report.
 *
 * @returns {object} Parameters for `withTemporaryAppOwner`.
 */
const paramsFor = (owners, report) => ({
    appId: APP,
    owners,
    target: JOE,
    waitSeconds: 3,
    report,
    logPrefix: 'TEST OWNER',
    ErrorClass: QseowError,
});

/**
 * Waits that resolve at once, recorded.
 *
 * @returns {{settle: Function, pause: Function}} The test seams.
 */
const instantWaits = () => ({
    settle: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn().mockResolvedValue(undefined),
});

/**
 * The report's entry for the app.
 *
 * @param {object} report - The run report.
 *
 * @returns {object|undefined} The entry.
 */
const ownerEntry = (report) => report.appOwners.find((owner) => owner.appId === APP);

/**
 * The timeline, as lines containing a fragment.
 *
 * @param {string} fragment - What to look for.
 *
 * @returns {number} Index of the first line containing it, or -1.
 */
const indexOf = (fragment) => timeline.findIndex((line) => line.includes(fragment));

let report;

beforeEach(() => {
    jest.clearAllMocks();
    timeline.length = 0;
    resetInterruptState();
    report = createRunReport({ command: 'qseow create-sheet-thumbnails', dryRun: false });
});

afterEach(() => {
    resetInterruptState();
});

describe('withTemporaryAppOwner', () => {
    test('processes the app with the target as owner, then gives it back', async () => {
        const { owners, state } = makeOwners();
        const waits = instantWaits();
        let ownerDuringWork;

        const result = await withTemporaryAppOwner(
            paramsFor(owners, report),
            async () => {
                ownerDuringWork = state.owner;
                return 'processed';
            },
            waits
        );

        expect(result).toBe('processed');
        expect(ownerDuringWork).toBe(JOE);
        expect(state.owner).toBe(ANNA);
        expect(waits.settle).toHaveBeenCalledWith(3000);
        expect(ownerEntry(report)).toMatchObject({
            appName: 'Sales',
            from: 'ACME\\anna',
            to: 'ACME\\joe',
            state: 'restored',
        });
    });

    test('logs the original owner and the manual fix before changing anything', async () => {
        const { owners } = makeOwners();

        await withTemporaryAppOwner(paramsFor(owners, report), async () => {}, instantWaits());

        // The line is the only record left if the process dies before the restore, so it has
        // to exist before the change does.
        const logged = indexOf('from ACME\\anna to ACME\\joe');
        expect(logged).toBeGreaterThanOrEqual(0);
        expect(timeline[logged]).toContain(`give app ${APP} back to ACME\\anna by hand`);
        expect(logged).toBeLessThan(indexOf('CHANGE ACME\\joe'));
    });

    test('records the change as in progress before sending it', async () => {
        const { owners } = makeOwners();
        let stateWhenSent;
        owners.change.mockImplementationOnce(async () => {
            stateWhenSent = ownerEntry(report).state;
        });
        owners.currentOwnerId.mockResolvedValue(JOE.id);

        await withTemporaryAppOwner(paramsFor(owners, report), async () => {}, instantWaits());

        // A verdict rendered by a second signal at this moment must name the app.
        expect(stateWhenSent).toBe('changing');
    });

    test('leaves the owner alone when the target already owns the app', async () => {
        const { owners, state } = makeOwners({ owner: JOE });
        const work = jest.fn().mockResolvedValue('processed');

        await expect(
            withTemporaryAppOwner(paramsFor(owners, report), work, instantWaits())
        ).resolves.toBe('processed');

        expect(owners.change).not.toHaveBeenCalled();
        expect(work).toHaveBeenCalledTimes(1);
        expect(state.owner).toBe(JOE);
        expect(ownerEntry(report).state).toBe('unchanged');
    });

    test('leaves the owner alone, and still processes the app, when the platform says so', async () => {
        const { owners, state } = makeOwners({ keepReason: 'the app is published' });
        const work = jest.fn().mockResolvedValue('processed');

        await withTemporaryAppOwner(paramsFor(owners, report), work, instantWaits());

        expect(owners.change).not.toHaveBeenCalled();
        expect(work).toHaveBeenCalledTimes(1);
        expect(state.owner).toBe(ANNA);
        expect(ownerEntry(report)).toMatchObject({ state: 'kept', reason: 'the app is published' });
        expect(timeline[indexOf('left as ACME\\anna')]).toContain('the app is published');
    });

    test('fails the app without processing it when the owner cannot be read', async () => {
        const { owners } = makeOwners();
        const readError = new Error('QRS returned status 403 for "app/x"');
        owners.inspect.mockRejectedValueOnce(readError);
        const work = jest.fn();

        const err = await withTemporaryAppOwner(
            paramsFor(owners, report),
            work,
            instantWaits()
        ).catch((e) => e);

        expect(err).toBeInstanceOf(QseowError);
        expect(err.message).toContain(`Could not find out who owns app ${APP}`);
        expect(err.cause).toBe(readError);
        expect(err.stopsRun).toBeUndefined();
        expect(work).not.toHaveBeenCalled();
        expect(owners.change).not.toHaveBeenCalled();
    });

    test('fails the app without processing it when the change is refused', async () => {
        const { owners, state } = makeOwners();
        owners.change.mockRejectedValueOnce(new Error('Received error code: 403::Forbidden'));
        const work = jest.fn();

        const err = await withTemporaryAppOwner(
            paramsFor(owners, report),
            work,
            instantWaits()
        ).catch((e) => e);

        expect(err.message).toContain(`Could not make ACME\\joe the owner of app ${APP}`);
        expect(err.stopsRun).toBeUndefined();
        expect(work).not.toHaveBeenCalled();
        expect(state.owner).toBe(ANNA);
        expect(ownerEntry(report).state).toBe('change-failed');
    });

    test('gives the app back when a change reported as failed landed after all', async () => {
        // A timeout says nothing about whether the server applied the change.
        const { owners, state } = makeOwners();
        owners.change.mockImplementationOnce(async (appId, newOwner) => {
            state.owner = newOwner;
            throw new Error('socket hang up');
        });

        await expect(
            withTemporaryAppOwner(paramsFor(owners, report), jest.fn(), instantWaits())
        ).rejects.toThrow('Could not make ACME\\joe the owner');

        expect(state.owner).toBe(ANNA);
        expect(ownerEntry(report).state).toBe('change-failed');
    });

    test('gives the app back when processing fails, then rethrows that failure unchanged', async () => {
        const { owners, state } = makeOwners();
        const processingError = new Error('Failed to create a thumbnail for 1 of 9 sheet(s)');

        const err = await withTemporaryAppOwner(
            paramsFor(owners, report),
            async () => {
                throw processingError;
            },
            instantWaits()
        ).catch((e) => e);

        expect(err).toBe(processingError);
        expect(state.owner).toBe(ANNA);
        expect(ownerEntry(report).state).toBe('restored');
    });

    test('retries a failed restore with a short backoff', async () => {
        const { owners, state } = makeOwners();
        const waits = instantWaits();
        const realChange = owners.change.getMockImplementation();
        owners.change
            .mockImplementationOnce(realChange)
            .mockRejectedValueOnce(new Error('ECONNRESET'))
            .mockRejectedValueOnce(new Error('ECONNRESET'))
            .mockImplementationOnce(realChange);

        await withTemporaryAppOwner(paramsFor(owners, report), async () => {}, waits);

        expect(state.owner).toBe(ANNA);
        expect(waits.pause.mock.calls).toEqual(RESTORE_BACKOFF_MS.map((ms) => [ms]));
        expect(ownerEntry(report).state).toBe('restored');
    });

    test('still retries the restore after Ctrl-C, when it matters most', async () => {
        // The settle wait rejects once the run is interrupted; the restore must not.
        const { owners, state } = makeOwners();
        const waits = instantWaits();
        const realChange = owners.change.getMockImplementation();
        owners.change
            .mockImplementationOnce(realChange)
            .mockRejectedValueOnce(new Error('ECONNRESET'))
            .mockImplementationOnce(realChange);

        await withTemporaryAppOwner(
            paramsFor(owners, report),
            async () => {
                markInterrupted('SIGINT');
            },
            waits
        );

        expect(waits.pause).toHaveBeenCalledTimes(1);
        expect(state.owner).toBe(ANNA);
    });

    test('stops the run when the app cannot be given back', async () => {
        const { owners, state } = makeOwners();
        const realChange = owners.change.getMockImplementation();
        owners.change.mockImplementationOnce(realChange);
        for (let i = 0; i < RESTORE_ATTEMPTS; i += 1) {
            owners.change.mockRejectedValueOnce(new Error('Received error code: 500::boom'));
        }

        const err = await withTemporaryAppOwner(
            paramsFor(owners, report),
            async () => 'processed',
            instantWaits()
        ).catch((e) => e);

        expect(err.stopsRun).toBe(true);
        expect(err.stopReason).toContain('no further owners');
        expect(err.message).toContain('ACME\\anna');
        expect(state.owner).toBe(JOE);
        expect(ownerEntry(report).state).toBe('restore-failed');
        expect(report.stopped).toEqual({ appId: APP });

        const errors = timeline.filter((line) => line.startsWith('ERROR')).join('\n');
        expect(errors).toContain('may still be owned by ACME\\joe');
        expect(errors).toContain(`give app ${APP} back to ACME\\anna by hand`);
    });

    test('keeps the processing failure on a stopping error, but never as its cause', async () => {
        // isAbortArtifact follows `cause`: an app abandoned by Ctrl-C would otherwise hand its
        // abort error to this one, and the failed restore would be filed as merely abandoned.
        const { owners } = makeOwners();
        const realChange = owners.change.getMockImplementation();
        owners.change.mockImplementationOnce(realChange);
        for (let i = 0; i < RESTORE_ATTEMPTS; i += 1) {
            owners.change.mockRejectedValueOnce(new Error('Received error code: 500::boom'));
        }
        const abandoned = new DOMException('The operation was aborted', 'AbortError');

        const err = await withTemporaryAppOwner(
            paramsFor(owners, report),
            async () => {
                // Ctrl-C mid-app: the run is interrupted and the app's work unwinds.
                markInterrupted('SIGINT');
                throw abandoned;
            },
            instantWaits()
        ).catch((e) => e);

        expect(err.stopsRun).toBe(true);
        expect(err.processingError).toBe(abandoned);
        expect(err.cause).toBeUndefined();
        expect(isAbortArtifact(err)).toBe(false);
    });

    test('leaves an owner someone else set meanwhile, rather than undo their change', async () => {
        const { owners, state } = makeOwners();

        await withTemporaryAppOwner(
            paramsFor(owners, report),
            async () => {
                state.owner = OTHER;
            },
            instantWaits()
        );

        expect(state.owner).toBe(OTHER);
        expect(ownerEntry(report).state).toBe('changed-elsewhere');
        expect(timeline[indexOf('changed by someone else')]).toContain('ACME\\anna');
    });

    test('does not change anything once the run has been interrupted', async () => {
        const { owners } = makeOwners();
        const work = jest.fn();
        markInterrupted('SIGINT');

        const err = await withTemporaryAppOwner(
            paramsFor(owners, report),
            work,
            instantWaits()
        ).catch((e) => e);

        // Filed by the app loop as abandoned, not failed.
        expect(isAbortArtifact(err)).toBe(true);
        expect(owners.change).not.toHaveBeenCalled();
        expect(work).not.toHaveBeenCalled();
    });

    test('gives the app back when Ctrl-C cuts the settle wait short', async () => {
        const { owners, state } = makeOwners();
        const work = jest.fn();
        const abort = new DOMException('The operation was aborted', 'AbortError');
        const waits = {
            settle: jest.fn(async () => {
                markInterrupted('SIGINT');
                throw abort;
            }),
            pause: jest.fn(),
        };

        const err = await withTemporaryAppOwner(paramsFor(owners, report), work, waits).catch(
            (e) => e
        );

        expect(err).toBe(abort);
        expect(work).not.toHaveBeenCalled();
        expect(state.owner).toBe(ANNA);
        expect(ownerEntry(report).state).toBe('restored');
    });
});

describe('planTemporaryAppOwner', () => {
    test('records what a real run would do, and never changes anything', async () => {
        const { owners } = makeOwners();
        const plan = jest.fn().mockResolvedValue('planned');

        await expect(
            planTemporaryAppOwner(
                { appId: APP, owners, target: JOE, report, ErrorClass: QseowError },
                plan
            )
        ).resolves.toBe('planned');

        expect(owners.change).not.toHaveBeenCalled();
        expect(ownerEntry(report)).toMatchObject({
            from: 'ACME\\anna',
            to: 'ACME\\joe',
            state: 'planned',
        });
    });

    test('plans without a target when only a real run can tell who it is', async () => {
        const { owners } = makeOwners();

        await planTemporaryAppOwner(
            { appId: APP, owners, target: null, report, ErrorClass: QseowError },
            jest.fn()
        );

        expect(ownerEntry(report)).toMatchObject({
            from: 'ACME\\anna',
            to: null,
            state: 'planned',
        });
    });

    test.each([
        ['unchanged', { owner: JOE }],
        ['kept', { keepReason: 'the app is in a personal space' }],
    ])('says when the owner would be %s', async (state, setup) => {
        const { owners } = makeOwners(setup);

        await planTemporaryAppOwner(
            { appId: APP, owners, target: JOE, report, ErrorClass: QseowError },
            jest.fn()
        );

        expect(ownerEntry(report).state).toBe(state);
    });

    test('fails the plan when the owner cannot be read, as the real run would fail the app', async () => {
        const { owners } = makeOwners();
        owners.inspect.mockRejectedValueOnce(new Error('403'));
        const plan = jest.fn();

        await expect(
            planTemporaryAppOwner(
                { appId: APP, owners, target: JOE, report, ErrorClass: QseowError },
                plan
            )
        ).rejects.toThrow('A real run would fail this app');

        expect(plan).not.toHaveBeenCalled();
    });
});
