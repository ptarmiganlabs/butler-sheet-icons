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

const {
    withTemporaryAppOwner,
    planTemporaryAppOwner,
    movesObjectsWithOwner,
    RESTORE_ATTEMPTS,
    RESTORE_BACKOFF_MS,
} = await import('../temporary-app-owner.js');
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

const ANNAS_SHEET = {
    id: 'o-anna-sheet',
    name: 'Sales overview',
    objectType: 'sheet',
    owner: ANNA,
};
const ANNAS_SCRIPT = { id: 'o-anna-script', name: '', objectType: 'app_appscript', owner: ANNA };
const JOES_SHEET = { id: 'o-joe-sheet', name: "Joe's notes", objectType: 'sheet', owner: JOE };
const JOES_BOOKMARK = { id: 'o-joe-bookmark', name: 'Mine', objectType: 'bookmark', owner: JOE };
const OTHERS_BOOKMARK = {
    id: 'o-other-bookmark',
    name: 'Q3',
    objectType: 'bookmark',
    owner: OTHER,
};

/**
 * A platform half whose owner change moves objects, as QRS does: changing the app's owner hands
 * every object the previous owner had in the app to the new owner.
 *
 * @param {object} [setup] - Starting state.
 * @param {object} [setup.owner] - Who owns the app at the start.
 * @param {object[]} [setup.objects] - The app's objects, each with its `owner`.
 *
 * @returns {{owners: object, state: {owner: object, objects: object[]}, transfer: Function}} The
 *     fake, the state it keeps, and an owner change as anyone - BSI or someone else - makes it.
 */
const makeObjectOwners = ({ owner = ANNA, objects = [] } = {}) => {
    const { owners, state } = makeOwners({ owner });
    state.objects = objects.map((object) => ({ ...object }));

    const transfer = (newOwner) => {
        for (const object of state.objects) {
            if (object.owner.id === state.owner.id) {
                object.owner = newOwner;
            }
        }
        state.owner = newOwner;
    };

    owners.change.mockImplementation(async (appId, newOwner) => {
        timeline.push(`CHANGE ${newOwner.label}`);
        transfer(newOwner);
    });
    owners.objectsOwnedBy = jest.fn(async (appId, ownerId) =>
        state.objects
            .filter((object) => object.owner.id === ownerId)
            .map(({ id, name, objectType }) => ({ id, name, objectType }))
    );
    owners.changeObjectOwner = jest.fn(async (objectId, newOwner) => {
        timeline.push(`GIVE ${objectId} ${newOwner.label}`);
        state.objects.find((object) => object.id === objectId).owner = newOwner;
    });
    owners.manualObjectFix = jest.fn(
        (objectList, to) => `give ${objectList} back to ${to.label} by hand`
    );

    return { owners, state, transfer };
};

/**
 * Who owns one of the fake's objects now.
 *
 * @param {object} state - The fake's state.
 * @param {string} id - Object id.
 *
 * @returns {object} The owner.
 */
const ownerOf = (state, id) => state.objects.find((object) => object.id === id).owner;

/**
 * An object as the platform half lists it, without its owner.
 *
 * @param {object} object - One of the objects above.
 *
 * @returns {{id: string, name: string, objectType: string}} The listed object.
 */
const listed = (object) => ({ id: object.id, name: object.name, objectType: object.objectType });

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
        expect(report.stopped).toEqual({
            appId: APP,
            reason: 'an app owner could not be restored, so no further app was started',
        });

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

describe('withTemporaryAppOwner where an owner change moves objects (QSEoW)', () => {
    test("gives the target its own objects back after the restore, and touches no one else's", async () => {
        const { owners, state } = makeObjectOwners({
            objects: [ANNAS_SHEET, ANNAS_SCRIPT, JOES_SHEET, OTHERS_BOOKMARK],
        });
        let duringWork;

        await withTemporaryAppOwner(
            paramsFor(owners, report),
            async () => {
                duringWork = state.objects.map((object) => object.owner);
            },
            instantWaits()
        );

        // While the app was processed, Joe had it and everything Anna had in it...
        expect(duringWork).toEqual([JOE, JOE, JOE, OTHER]);
        // ...and afterwards everyone has exactly what they had before.
        expect(state.owner).toBe(ANNA);
        expect(state.objects.map((object) => object.owner)).toEqual([ANNA, ANNA, JOE, OTHER]);
        expect(owners.changeObjectOwner).toHaveBeenCalledTimes(1);
        expect(ownerEntry(report)).toMatchObject({
            state: 'restored',
            ownObjects: [listed(JOES_SHEET)],
            givenBack: 1,
            notGivenBack: [],
        });
        expect(timeline[indexOf('Gave 1 object(s)')]).toContain(`sheet "Joe's notes"`);
    });

    test('logs the objects, and how to give them back by hand, before changing anything', async () => {
        const { owners } = makeObjectOwners({ objects: [ANNAS_SHEET, JOES_SHEET] });

        await withTemporaryAppOwner(paramsFor(owners, report), async () => {}, instantWaits());

        const listedLine = indexOf('ACME\\joe already owns 1 object(s)');
        expect(listedLine).toBeGreaterThanOrEqual(0);
        expect(timeline[listedLine]).toContain(`sheet "Joe's notes" (o-joe-sheet)`);
        expect(listedLine).toBeLessThan(indexOf('CHANGE ACME\\joe'));

        // Giving the app back by hand moves Joe's sheet to Anna too, so the fix logged before the
        // change - the only record if the process dies - says how to undo that as well.
        const changing = timeline[indexOf('Changing the owner')];
        expect(changing).toContain(`give app ${APP} back to ACME\\anna by hand`);
        expect(changing).toContain(
            `give sheet "Joe's notes" (o-joe-sheet) back to ACME\\joe by hand`
        );
        expect(ownerEntry(report).manualFix).toContain('back to ACME\\joe by hand');
    });

    test('fails the app, having changed nothing, when the objects cannot be listed', async () => {
        const { owners, state } = makeObjectOwners({ objects: [JOES_SHEET] });
        const listError = new Error('QRS returned status 500 for "app/object"');
        owners.objectsOwnedBy.mockRejectedValueOnce(listError);
        const work = jest.fn();

        const err = await withTemporaryAppOwner(
            paramsFor(owners, report),
            work,
            instantWaits()
        ).catch((e) => e);

        expect(err).toBeInstanceOf(QseowError);
        expect(err.message).toContain(
            `Could not find out which objects ACME\\joe owns in app ${APP}`
        );
        expect(err.cause).toBe(listError);
        expect(err.stopsRun).toBeUndefined();
        expect(owners.change).not.toHaveBeenCalled();
        expect(work).not.toHaveBeenCalled();
        expect(state.owner).toBe(ANNA);
    });

    test('gives the objects back when processing fails too', async () => {
        const { owners, state } = makeObjectOwners({ objects: [JOES_SHEET] });
        const processingError = new Error('Failed to create a thumbnail for 1 of 9 sheet(s)');

        const err = await withTemporaryAppOwner(
            paramsFor(owners, report),
            async () => {
                throw processingError;
            },
            instantWaits()
        ).catch((e) => e);

        expect(err).toBe(processingError);
        expect(ownerOf(state, 'o-joe-sheet')).toBe(JOE);
        expect(ownerEntry(report)).toMatchObject({ state: 'restored', givenBack: 1 });
    });

    test('gives the objects back after a change that was reported as failed but landed', async () => {
        const { owners, state, transfer } = makeObjectOwners({ objects: [JOES_SHEET] });
        owners.change.mockImplementationOnce(async (appId, newOwner) => {
            transfer(newOwner);
            throw new Error('socket hang up');
        });

        await expect(
            withTemporaryAppOwner(paramsFor(owners, report), jest.fn(), instantWaits())
        ).rejects.toThrow('Could not make ACME\\joe the owner');

        expect(state.owner).toBe(ANNA);
        expect(ownerOf(state, 'o-joe-sheet')).toBe(JOE);
        expect(ownerEntry(report)).toMatchObject({ state: 'change-failed', givenBack: 1 });
    });

    test('gives the objects back after someone else changed the app owner meanwhile', async () => {
        const { owners, state, transfer } = makeObjectOwners({
            objects: [ANNAS_SHEET, JOES_SHEET],
        });

        await withTemporaryAppOwner(
            paramsFor(owners, report),
            async () => {
                transfer(OTHER);
            },
            instantWaits()
        );

        // Their change stands: the app, and what was Anna's, stay with Other...
        expect(state.owner).toBe(OTHER);
        expect(ownerOf(state, 'o-anna-sheet')).toBe(OTHER);
        // ...but Joe's own sheet, which their change took from him, is his again.
        expect(ownerOf(state, 'o-joe-sheet')).toBe(JOE);
        expect(ownerEntry(report)).toMatchObject({ state: 'changed-elsewhere', givenBack: 1 });
    });

    test('leaves an object alone that someone else took while the app was processed', async () => {
        const { owners, state } = makeObjectOwners({ objects: [JOES_SHEET] });

        await withTemporaryAppOwner(
            paramsFor(owners, report),
            async () => {
                state.objects[0].owner = OTHER;
            },
            instantWaits()
        );

        expect(ownerOf(state, 'o-joe-sheet')).toBe(OTHER);
        expect(owners.changeObjectOwner).not.toHaveBeenCalled();
        expect(ownerEntry(report)).toMatchObject({ state: 'restored', givenBack: 0 });
        expect(timeline[indexOf('left them as they are')]).toContain(
            `sheet "Joe's notes" (o-joe-sheet)`
        );
    });

    test('retries the give-back, writing each object only once', async () => {
        const { owners, state } = makeObjectOwners({ objects: [JOES_SHEET, JOES_BOOKMARK] });
        const waits = instantWaits();
        const realGive = owners.changeObjectOwner.getMockImplementation();
        owners.changeObjectOwner
            .mockImplementationOnce(realGive)
            .mockRejectedValueOnce(new Error('ECONNRESET'));

        await withTemporaryAppOwner(paramsFor(owners, report), async () => {}, waits);

        expect(ownerOf(state, 'o-joe-sheet')).toBe(JOE);
        expect(ownerOf(state, 'o-joe-bookmark')).toBe(JOE);
        expect(owners.changeObjectOwner.mock.calls.map(([id]) => id)).toEqual([
            'o-joe-sheet',
            'o-joe-bookmark',
            'o-joe-bookmark',
        ]);
        expect(waits.pause.mock.calls).toEqual([[RESTORE_BACKOFF_MS[0]]]);
        expect(ownerEntry(report)).toMatchObject({ state: 'restored', givenBack: 2 });
    });

    test('stops the run when the objects cannot be given back, and says how to by hand', async () => {
        const { owners, state } = makeObjectOwners({ objects: [JOES_SHEET] });
        owners.changeObjectOwner.mockRejectedValue(new Error('Received error code: 500::boom'));

        const err = await withTemporaryAppOwner(
            paramsFor(owners, report),
            async () => 'processed',
            instantWaits()
        ).catch((e) => e);

        expect(err.stopsRun).toBe(true);
        expect(err.stopReason).toContain('objects in an app back to their owner');
        // The app itself went back; Joe's sheet went with it and could not be returned.
        expect(state.owner).toBe(ANNA);
        expect(ownerOf(state, 'o-joe-sheet')).toBe(ANNA);
        expect(owners.changeObjectOwner).toHaveBeenCalledTimes(RESTORE_ATTEMPTS);
        expect(ownerEntry(report)).toMatchObject({
            state: 'give-back-failed',
            notGivenBack: [listed(JOES_SHEET)],
        });
        expect(report.stopped).toEqual({
            appId: APP,
            reason: 'objects in an app could not be given back to their owner, so no further app was started',
        });

        const errors = timeline.filter((line) => line.startsWith('ERROR')).join('\n');
        expect(errors).toContain("may now be owned by the app's owner");
        expect(errors).toContain(
            `give sheet "Joe's notes" (o-joe-sheet) back to ACME\\joe by hand`
        );
    });

    test('names what is still to give back while the give-back is under way', async () => {
        const { owners } = makeObjectOwners({ objects: [JOES_SHEET] });
        const realGive = owners.changeObjectOwner.getMockImplementation();
        let entryWhileGiving;
        owners.changeObjectOwner.mockImplementationOnce(async (...args) => {
            entryWhileGiving = structuredClone(ownerEntry(report));
            return realGive(...args);
        });

        await withTemporaryAppOwner(paramsFor(owners, report), async () => {}, instantWaits());

        // A verdict rendered by a second signal at this moment must name the sheet.
        expect(entryWhileGiving).toMatchObject({
            state: 'giving-back',
            notGivenBack: [listed(JOES_SHEET)],
        });
    });

    test('changes nothing more when the target owns no objects in the app', async () => {
        const { owners } = makeObjectOwners({ objects: [ANNAS_SHEET] });

        await withTemporaryAppOwner(paramsFor(owners, report), async () => {}, instantWaits());

        expect(owners.changeObjectOwner).not.toHaveBeenCalled();
        expect(indexOf('already owns')).toBe(-1);
        expect(ownerEntry(report).state).toBe('restored');
        expect(ownerEntry(report)).not.toHaveProperty('givenBack');
    });
});

describe('movesObjectsWithOwner', () => {
    test('is true only for a platform half that lists and gives back objects', () => {
        expect(movesObjectsWithOwner(makeOwners().owners)).toBe(false);
        expect(movesObjectsWithOwner(makeObjectOwners().owners)).toBe(true);
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

    test('lists the objects a real run would give back, and changes none of them', async () => {
        const { owners } = makeObjectOwners({ objects: [ANNAS_SHEET, JOES_SHEET] });

        await planTemporaryAppOwner(
            { appId: APP, owners, target: JOE, report, ErrorClass: QseowError },
            jest.fn()
        );

        expect(owners.change).not.toHaveBeenCalled();
        expect(owners.changeObjectOwner).not.toHaveBeenCalled();
        expect(ownerEntry(report)).toMatchObject({
            state: 'planned',
            ownObjects: [listed(JOES_SHEET)],
        });
    });

    test('lists no objects without a target, which only a real run can tell', async () => {
        const { owners } = makeObjectOwners({ objects: [JOES_SHEET] });

        await planTemporaryAppOwner(
            { appId: APP, owners, target: null, report, ErrorClass: QseowError },
            jest.fn()
        );

        expect(owners.objectsOwnedBy).not.toHaveBeenCalled();
        expect(ownerEntry(report)).not.toHaveProperty('ownObjects');
    });

    test('fails the plan when the objects cannot be listed, as the real run would', async () => {
        const { owners } = makeObjectOwners({ objects: [JOES_SHEET] });
        owners.objectsOwnedBy.mockRejectedValueOnce(new Error('403'));
        const plan = jest.fn();

        await expect(
            planTemporaryAppOwner(
                { appId: APP, owners, target: JOE, report, ErrorClass: QseowError },
                plan
            )
        ).rejects.toThrow('A real run would fail this app');

        expect(plan).not.toHaveBeenCalled();
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
