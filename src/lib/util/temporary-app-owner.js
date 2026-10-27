import { setTimeout as delay } from 'node:timers/promises';

import { logger } from '../../globals.js';
import { interruptAbortSignal, isInterrupted } from './interrupt.js';
import { describeWithCauses } from './log-error.js';
import { recordAppOwner, recordRunStop } from './run-report.js';
import { describeObjects } from './run-report-render.js';

/**
 * `--change-app-owner`: give an app to another user while it is processed, then give it back
 * (issue #1209).
 *
 * The platform-neutral half. The platform supplies how to read and change an owner - QRS on
 * QSEoW - as `owners`; everything that decides whether an app can end up with the wrong owner is
 * here. Only QSEoW has the option: on Qlik Cloud, owning a shared-space app did not let BSI update
 * its public sheets, so the change helped nothing there (issue #1209). The hooks a platform may
 * leave out - a reason to keep an owner, objects that move with it - stay, for whichever platform
 * needs them next:
 *
 * - The original owner is read fresh, immediately before the change, and **logged before the
 *   change is made**. If the process dies before the restore - a second Ctrl-C, the shutdown
 *   watchdog, a crash, `kill -9` - that line is the record of who to give the app back to.
 * - The restore runs whatever happens to the app: processing failed, the settle wait was cut
 *   short by Ctrl-C, or all went well. It is retried, and never waits with `sleep()`, which rejects
 *   at once after an interrupt - exactly when a restore matters most.
 * - A restore that still fails stops the run (decided with Göran): whatever broke it would most
 *   likely break the next app's restore too, so no further owner is changed.
 * - An owner someone else set while the app was being processed is left alone, not overwritten.
 * - On QSEoW an owner change also moves every object in the app that the previous owner had to
 *   the new owner, so the change back hands the temporary owner's own objects - ones it had in the
 *   app before the run - to the original owner. A platform where that happens supplies
 *   `objectsOwnedBy` and `changeObjectOwner`: those objects are listed, and logged, before the
 *   change, and given back after the restore with the same retries. A give-back that still fails
 *   stops the run, as a failed restore does (decided with Göran, decision 9 on #1209).
 */

/**
 * The wait after an owner change: `sleep()` from globals.js exactly - Ctrl-C cuts it short - built
 * from the same two parts rather than imported. Both workers load this module, and importing
 * `sleep` would make it, and them, fail to load under every globals.js mock written before it
 * needed one.
 *
 * @param {number} ms - Milliseconds to wait.
 *
 * @returns {Promise<void>} Resolves after `ms`; rejects with an `AbortError` once interrupted.
 */
const settleWait = (ms) => delay(ms, undefined, { signal: interruptAbortSignal() });

/** How many times the restore, and the give-back of objects, is tried before the run stops. */
export const RESTORE_ATTEMPTS = 3;

/**
 * Pause before each retry of the restore, in milliseconds.
 *
 * Short on purpose: after a Ctrl-C the whole shutdown has eight seconds before the watchdog ends
 * the process, and the restore has to fit inside that alongside closing the browser.
 */
export const RESTORE_BACKOFF_MS = Object.freeze([1000, 2000]);

/** Why the run stops after a failed restore, as the app loop logs it. */
const RESTORE_STOP_REASON =
    'BSI could not give an app back to its original owner, so it changes no further owners';

/** Why the run stops after a failed give-back of objects, as the app loop logs it. */
const GIVE_BACK_STOP_REASON =
    'BSI could not give the objects in an app back to their owner, so it changes no further owners';

/**
 * Whether a platform's owner change moves the objects in the app too - true on QSEoW.
 *
 * Such a platform supplies the functions that list who owns which objects and change one object's
 * owner; a platform whose owner change moves no objects supplies neither.
 *
 * @param {object} owners - The platform half; see {@link withTemporaryAppOwner}.
 *
 * @returns {boolean} True when `owners` lists and gives back objects.
 */
export const movesObjectsWithOwner = (owners) =>
    typeof owners?.objectsOwnedBy === 'function' && typeof owners?.changeObjectOwner === 'function';

/**
 * An error the app loop reads as "do not go on to the next app".
 *
 * The processing error, when there was one, is kept as `processingError` - deliberately not as
 * `cause`. `isAbortArtifact` follows `cause`, so an app abandoned by Ctrl-C would hand its abort
 * error to this one, and a failed restore would be counted as an app merely abandoned.
 *
 * @param {Function} ErrorClass - Platform error class.
 * @param {string} message - What went wrong.
 * @param {Error|undefined} processingError - The app's own failure, if it had one.
 * @param {string} [stopReason] - Why the run stops, as the app loop logs it.
 *
 * @returns {Error} The error, marked `stopsRun`.
 */
const runStoppingError = (
    ErrorClass,
    message,
    processingError,
    stopReason = RESTORE_STOP_REASON
) => {
    const err = new ErrorClass(message);

    err.stopsRun = true;
    err.stopReason = stopReason;

    if (processingError) {
        err.processingError = processingError;
    }

    return err;
};

/**
 * Puts the original owner back, if the app still has the temporary one.
 *
 * Reads the owner before each attempt instead of writing blindly:
 *
 * - the original owner already has it - the change never landed, or someone gave it back - so
 *   there is nothing to do;
 * - a third user has it - someone changed it while BSI worked - so it is left alone, because
 *   overwriting it would undo their change;
 * - otherwise the app goes back to its original owner.
 *
 * Never throws: the caller decides what a failure means.
 *
 * @param {object} params - What to restore.
 * @param {string} params.appId - Qlik Sense app id.
 * @param {object} params.owners - Platform half; see {@link withTemporaryAppOwner}.
 * @param {object} params.original - Who owned the app before the run.
 * @param {object} params.target - Who owns it while the run processes it.
 * @param {string} params.logPrefix - Log prefix.
 * @param {(ms: number) => Promise<void>} params.pause - Waits between attempts; never `sleep()`.
 *
 * @returns {Promise<{ok: boolean, state?: string, error?: unknown}>} `state` is `restored`,
 *     `untouched` (the original owner never lost it) or `changed-elsewhere`.
 */
const restoreOwner = async ({ appId, owners, original, target, logPrefix, pause }) => {
    let lastError;

    for (let attempt = 1; attempt <= RESTORE_ATTEMPTS; attempt += 1) {
        try {
            const current = await owners.currentOwnerId(appId);

            if (current === original.id) {
                return { ok: true, state: 'untouched' };
            }

            if (current !== target.id) {
                logger.warn(
                    `${logPrefix}: The owner of app ${appId} was changed by someone else while BSI was processing it, so BSI left it as it is rather than undo that change. Before this run it was owned by ${original.label}.`
                );

                return { ok: true, state: 'changed-elsewhere' };
            }

            await owners.change(appId, original);

            return { ok: true, state: 'restored' };
        } catch (err) {
            lastError = err;

            if (attempt < RESTORE_ATTEMPTS) {
                logger.warn(
                    `${logPrefix}: Could not give app ${appId} back to ${original.label} (attempt ${attempt} of ${RESTORE_ATTEMPTS}), trying again: ${describeWithCauses(err)}`
                );
                await pause(RESTORE_BACKOFF_MS[attempt - 1] ?? 0);
            }
        }
    }

    return { ok: false, error: lastError };
};

/**
 * Gives the temporary owner back the objects it had in the app before the run.
 *
 * Needed because an owner change moves objects (see the module comment): the app's owner, once
 * restored, was handed them as well. Reads before writing, like the restore:
 *
 * - an object the app's owner now has is given back - an owner change moved it there;
 * - an object the temporary owner still has needs nothing;
 * - an object neither of them has - deleted, or given to someone else while the app was being
 *   processed - is left alone and reported, because taking it back would undo that change.
 *
 * Retried like the restore, and an object given back in one attempt is not written again in the
 * next. The report lists what is still to give back after every write, so a verdict rendered by a
 * second signal names exactly those. Never throws: the caller decides what a failure means.
 *
 * @param {object} params - What to give back.
 * @param {string} params.appId - Qlik Sense app id.
 * @param {object} params.owners - Platform half; see {@link withTemporaryAppOwner}.
 * @param {object[]} params.objects - The objects the temporary owner had before the change.
 * @param {object} params.target - The temporary owner.
 * @param {object} params.report - The run report.
 * @param {string} params.logPrefix - Log prefix.
 * @param {(ms: number) => Promise<void>} params.pause - Waits between attempts; never `sleep()`.
 *
 * @returns {Promise<{ok: boolean, givenBack: object[], leftAlone: object[],
 *     notGivenBack: object[], error?: unknown}>} What was given back, what was left alone, and on
 *     failure what may still be with the app's owner.
 */
const giveObjectsBack = async ({ appId, owners, objects, target, report, logPrefix, pause }) => {
    const givenBack = [];
    const stillToGive = () => objects.filter((object) => !givenBack.includes(object));
    let lastError;

    if (objects.length === 0) {
        return { ok: true, givenBack, leftAlone: [], notGivenBack: [] };
    }

    for (let attempt = 1; attempt <= RESTORE_ATTEMPTS; attempt += 1) {
        try {
            const ownedBy = async (ownerId) =>
                new Set((await owners.objectsOwnedBy(appId, ownerId)).map(({ id }) => id));

            // Whoever owns the app now is who the last owner change handed the objects to: the
            // original owner after a restore, or whoever changed the owner meanwhile.
            const appOwnerId = await owners.currentOwnerId(appId);
            const moved = appOwnerId === target.id ? new Set() : await ownedBy(appOwnerId);
            const kept = await ownedBy(target.id);
            const leftAlone = stillToGive().filter(({ id }) => !moved.has(id) && !kept.has(id));

            for (const object of stillToGive().filter(({ id }) => moved.has(id))) {
                await owners.changeObjectOwner(object.id, target);
                givenBack.push(object);
                recordAppOwner(report, appId, { notGivenBack: stillToGive() });
            }

            return { ok: true, givenBack, leftAlone, notGivenBack: [] };
        } catch (err) {
            lastError = err;

            if (attempt < RESTORE_ATTEMPTS) {
                logger.warn(
                    `${logPrefix}: Could not give the objects in app ${appId} back to ${target.label} (attempt ${attempt} of ${RESTORE_ATTEMPTS}), trying again: ${describeWithCauses(err)}`
                );
                await pause(RESTORE_BACKOFF_MS[attempt - 1] ?? 0);
            }
        }
    }

    return { ok: false, givenBack, leftAlone: [], notGivenBack: stillToGive(), error: lastError };
};

/**
 * Processes one app with `target` as its owner, and gives the app back afterwards.
 *
 * The order, which is the whole point:
 *
 * 1. Read who owns the app now. A read that fails fails the app, before anything has changed.
 * 2. Leave the owner alone when `target` already owns the app, or when the platform says this
 *    app's owner must not be changed (none does on QSEoW, where a published app is re-owned like
 *    any other) - and process the app as it would be without the option.
 * 3. Where an owner change moves objects (QSEoW), list the objects `target` already owns in the
 *    app. A list that cannot be read fails the app, before anything has changed: without it there
 *    is no telling afterwards which objects were `target`'s.
 * 4. Log the original owner, `target`'s objects and how to restore both by hand, **then** change
 *    the owner. A change that fails fails the app without processing it, after checking the change
 *    did not land after all - a timeout says nothing about whether the server applied it.
 * 5. Wait `waitSeconds`, so the change has reached every Qlik Sense service, then process.
 * 6. Restore, however step 5 ended, then give `target` back the objects from step 3. If either
 *    fails, the run stops.
 *
 * @param {object} params - What to do.
 * @param {string} params.appId - Qlik Sense app id.
 * @param {object} params.owners - The platform half. Four functions: `inspect(appId)` reads the
 *     app's name and owner, and why its owner must be left alone, if it must; `currentOwnerId(appId)`
 *     reads only the owner's id, for the checks before each restore attempt; `change(appId, owner)`
 *     makes `owner` the app's owner; `manualFix(appId, owner)` says how an operator gives the app
 *     back to `owner` by hand. And, on a platform whose owner change moves objects, three more:
 *     `objectsOwnedBy(appId, ownerId)` lists the objects in the app that user owns;
 *     `changeObjectOwner(objectId, owner)` gives one object to `owner`;
 *     `manualObjectFix(objectList, owner)` says how an operator gives the listed objects back.
 * @param {{id: string, label: string}} params.target - Who owns the app while it is processed.
 * @param {number} params.waitSeconds - Seconds to wait after the change.
 * @param {object} params.report - The run report.
 * @param {string} params.logPrefix - Log prefix, e.g. `'QSEOW APP OWNER'`.
 * @param {Function} params.ErrorClass - Platform error class.
 * @param {() => Promise<unknown>} work - Processes the app.
 * @param {object} [deps] - Test seams.
 * @param {(ms: number) => Promise<void>} [deps.settle] - The wait before processing. Ctrl-C cuts
 *     it short, and the restore still follows.
 * @param {(ms: number) => Promise<void>} [deps.pause] - The wait between restore attempts. A
 *     plain timer: `sleep()` rejects at once after an interrupt.
 *
 * @returns {Promise<unknown>} Whatever `work` returned.
 *
 * @throws {Error} The app's own failure; or, when the owner or the objects could not be read, or
 *     the owner could not be changed, an error saying so; or, when the restore or the give-back
 *     failed, an error marked `stopsRun`.
 */
export const withTemporaryAppOwner = async (
    { appId, owners, target, waitSeconds, report, logPrefix, ErrorClass },
    work,
    { settle = settleWait, pause = delay } = {}
) => {
    let inspected;
    try {
        inspected = await owners.inspect(appId);
    } catch (err) {
        throw new ErrorClass(
            `Could not find out who owns app ${appId}, so its owner was not changed and the app was not processed`,
            { cause: err }
        );
    }

    const { appName, owner: original, keepReason } = inspected;
    const entry = { appName, from: original.label, to: target.label };

    if (original.id === target.id) {
        recordAppOwner(report, appId, { ...entry, state: 'unchanged' });
        logger.info(
            `${logPrefix}: App ${appId} "${appName}" is already owned by ${target.label}, so its owner is left as it is.`
        );

        return work();
    }

    if (keepReason) {
        recordAppOwner(report, appId, { ...entry, state: 'kept', reason: keepReason });
        logger.info(
            `${logPrefix}: The owner of app ${appId} "${appName}" is left as ${original.label}: ${keepReason}. The app is processed as it would be without --change-app-owner.`
        );

        return work();
    }

    // Read before the interrupt check below, which has to stay right before the change.
    let ownObjects = [];
    if (movesObjectsWithOwner(owners)) {
        try {
            ownObjects = await owners.objectsOwnedBy(appId, target.id);
        } catch (err) {
            throw new ErrorClass(
                `Could not find out which objects ${target.label} owns in app ${appId}, so its owner was not changed and the app was not processed`,
                { cause: err }
            );
        }
    }

    // The app loop checks between apps; this closes the window between that check and the
    // change. Named as an abort, so the loop files the app as abandoned, not failed.
    if (isInterrupted()) {
        throw new DOMException(
            `Interrupted before the owner of app ${appId} was changed; it was left as it was`,
            'AbortError'
        );
    }

    const objectFix = (objects) =>
        owners.manualObjectFix(describeObjects(objects, { ids: true }), target);

    // Giving the app back by hand moves the target's own objects to the original owner as well,
    // so the fix says how to undo that too.
    const manualFix =
        ownObjects.length > 0
            ? `${owners.manualFix(appId, original)} That also moves the ${ownObjects.length} object(s) ${target.label} already owned in the app to ${original.label}. ${objectFix(ownObjects)}`
            : owners.manualFix(appId, original);

    // Logged before the change, not after: if the process dies before the restore, these lines
    // are the only record of who the app, and the objects listed, belong to.
    if (ownObjects.length > 0) {
        logger.info(
            `${logPrefix}: ${target.label} already owns ${ownObjects.length} object(s) in app ${appId} "${appName}": ${describeObjects(ownObjects, { ids: true })}. Changing the app's owner moves them too, so BSI gives them back to ${target.label} after it restores the app's owner.`
        );
    }
    logger.info(
        `${logPrefix}: Changing the owner of app ${appId} "${appName}" from ${original.label} to ${target.label} while it is processed. If this run stops before changing it back: ${manualFix}`
    );
    recordAppOwner(report, appId, {
        ...entry,
        state: 'changing',
        manualFix,
        ...(ownObjects.length > 0 ? { ownObjects } : {}),
    });

    const restore = () => restoreOwner({ appId, owners, original, target, logPrefix, pause });

    const giveBack = () => {
        if (ownObjects.length > 0) {
            recordAppOwner(report, appId, { state: 'giving-back', notGivenBack: ownObjects });
        }

        return giveObjectsBack({
            appId,
            owners,
            objects: ownObjects,
            target,
            report,
            logPrefix,
            pause,
        });
    };

    const stopWith = (restored, processingError) => {
        recordAppOwner(report, appId, { state: 'restore-failed' });
        recordRunStop(report, {
            appId,
            reason: 'an app owner could not be restored, so no further app was started',
        });

        logger.error(
            `${logPrefix}: App ${appId} "${appName}" may still be owned by ${target.label}: BSI could not give it back to ${original.label} after ${RESTORE_ATTEMPTS} attempts. ${describeWithCauses(restored.error)}`
        );
        logger.error(`${logPrefix}: To give it back by hand: ${manualFix}`);

        return runStoppingError(
            ErrorClass,
            `Could not give app ${appId} back to its original owner ${original.label}: ${describeWithCauses(restored.error)}`,
            processingError
        );
    };

    const stopGivingBack = (given, processingError) => {
        recordAppOwner(report, appId, {
            state: 'give-back-failed',
            notGivenBack: given.notGivenBack,
        });
        recordRunStop(report, {
            appId,
            reason: 'objects in an app could not be given back to their owner, so no further app was started',
        });

        logger.error(
            `${logPrefix}: ${given.notGivenBack.length} object(s) that ${target.label} owned in app ${appId} "${appName}" before this run may now be owned by the app's owner: BSI could not give them back after ${RESTORE_ATTEMPTS} attempts. ${describeWithCauses(given.error)}`
        );
        logger.error(`${logPrefix}: To give them back by hand: ${objectFix(given.notGivenBack)}`);

        return runStoppingError(
            ErrorClass,
            `Could not give ${given.notGivenBack.length} object(s) in app ${appId} back to ${target.label}: ${describeWithCauses(given.error)}`,
            processingError,
            GIVE_BACK_STOP_REASON
        );
    };

    const logGivenBack = (given) => {
        if (given.givenBack.length > 0) {
            logger.info(
                `${logPrefix}: Gave ${given.givenBack.length} object(s) in app ${appId} "${appName}" back to ${target.label}: ${describeObjects(given.givenBack)}.`
            );
        }

        if (given.leftAlone.length > 0) {
            logger.warn(
                `${logPrefix}: ${given.leftAlone.length} object(s) that ${target.label} owned in app ${appId} "${appName}" before this run now belong neither to ${target.label} nor to the app's owner - deleted, or given to someone else while the app was being processed - so BSI left them as they are: ${describeObjects(given.leftAlone, { ids: true })}`
            );
        }
    };

    const objectFields = (given) =>
        ownObjects.length > 0 ? { givenBack: given.givenBack.length, notGivenBack: [] } : {};

    try {
        await owners.change(appId, target);
    } catch (err) {
        const restored = await restore();

        if (!restored.ok) {
            throw stopWith(restored, err);
        }

        // A change reported as failed may have landed and been undone just now - which moves the
        // target's own objects to the original owner like any restore.
        const given = await giveBack();

        if (!given.ok) {
            throw stopGivingBack(given, err);
        }

        recordAppOwner(report, appId, { state: 'change-failed', ...objectFields(given) });
        logGivenBack(given);

        throw new ErrorClass(
            `Could not make ${target.label} the owner of app ${appId}, so the app was not processed`,
            { cause: err }
        );
    }

    recordAppOwner(report, appId, { state: 'changed' });

    let result;
    let processingError;
    try {
        // Commander always supplies the wait; a programmatic caller that leaves it out waits 0.
        await settle(Math.max(0, Number(waitSeconds) || 0) * 1000);
        result = await work();
    } catch (err) {
        processingError = err;
    }

    const restored = await restore();

    if (!restored.ok) {
        throw stopWith(restored, processingError);
    }

    const given = await giveBack();

    if (!given.ok) {
        throw stopGivingBack(given, processingError);
    }

    recordAppOwner(report, appId, {
        state: restored.state === 'changed-elsewhere' ? 'changed-elsewhere' : 'restored',
        ...objectFields(given),
    });

    if (restored.state === 'restored') {
        logger.info(`${logPrefix}: App ${appId} "${appName}" is owned by ${original.label} again.`);
    }
    logGivenBack(given);

    if (processingError) {
        throw processingError;
    }

    return result;
};

/**
 * The dry run's half: read who owns an app and record what a real run would do with it.
 *
 * Reads only. A read that fails fails the plan for that app, because the real run would fail
 * that app at the same read, before processing it.
 *
 * @param {object} params - What to plan.
 * @param {string} params.appId - Qlik Sense app id.
 * @param {object} params.owners - The platform half; `inspect` and, where an owner change moves
 *     objects, `objectsOwnedBy` are used.
 * @param {{id: string, label: string}|null} params.target - Who would own the app, or null when
 *     that is only known once a real run has signed in.
 * @param {object} params.report - The run report.
 * @param {Function} params.ErrorClass - Platform error class.
 * @param {() => Promise<unknown>} plan - Plans the app.
 *
 * @returns {Promise<unknown>} Whatever `plan` returned.
 *
 * @throws {Error} When the owner or the objects cannot be read, or whatever `plan` threw.
 */
export const planTemporaryAppOwner = async (
    { appId, owners, target, report, ErrorClass },
    plan
) => {
    let inspected;
    try {
        inspected = await owners.inspect(appId);
    } catch (err) {
        throw new ErrorClass(
            `Could not find out who owns app ${appId}. A real run would fail this app without processing it`,
            { cause: err }
        );
    }

    const { appName, owner, keepReason } = inspected;

    let state = 'planned';
    if (target && owner.id === target.id) {
        state = 'unchanged';
    } else if (keepReason) {
        state = 'kept';
    }

    // The objects a real run would give back. Unknown without a target, which only a real run's
    // sign-in can tell.
    let ownObjects = [];
    if (state === 'planned' && target && movesObjectsWithOwner(owners)) {
        try {
            ownObjects = await owners.objectsOwnedBy(appId, target.id);
        } catch (err) {
            throw new ErrorClass(
                `Could not find out which objects ${target.label} owns in app ${appId}. A real run would fail this app without processing it`,
                { cause: err }
            );
        }
    }

    recordAppOwner(report, appId, {
        appName,
        from: owner.label,
        to: target?.label ?? null,
        state,
        ...(state === 'kept' ? { reason: keepReason } : {}),
        ...(ownObjects.length > 0 ? { ownObjects } : {}),
    });

    return plan();
};

/**
 * The `planApp` / `processApp` pair a create-thumbnails worker hands the app loop, with
 * `--change-app-owner` applied when it is on and untouched when it is off.
 *
 * One composition for both platform twins, so neither can wrap one callback and forget the
 * other: a dry run that did not show the owner change, or a real run that skipped it, would each
 * be a plan that lies.
 *
 * @param {object} params - The owner change.
 * @param {object} params.options - The command's options: `changeAppOwner`, `changeAppOwnerWait`.
 * @param {object} params.owners - The platform half; see {@link withTemporaryAppOwner}.
 * @param {{id: string, label: string}|null} params.target - Who owns each app while it is
 *     processed; null on a dry run that could not tell.
 * @param {string} params.logPrefix - Log prefix.
 * @param {Function} params.ErrorClass - Platform error class.
 * @param {object} callbacks - The worker's own callbacks.
 * @param {(appId: string, report: object) => Promise<unknown>} callbacks.planApp - Plans one app.
 * @param {(appId: string, report: object) => Promise<unknown>} callbacks.processApp - Processes
 *     one app.
 *
 * @returns {{planApp: Function, processApp: Function}} The callbacks to hand the app loop.
 */
export const withAppOwnerChange = (
    { options, owners, target, logPrefix, ErrorClass },
    { planApp, processApp }
) => {
    if (options.changeAppOwner !== true) {
        return { planApp, processApp };
    }

    return {
        planApp: (appId, report) =>
            planTemporaryAppOwner({ appId, owners, target, report, ErrorClass }, () =>
                planApp(appId, report)
            ),
        processApp: (appId, report) =>
            withTemporaryAppOwner(
                {
                    appId,
                    owners,
                    target,
                    waitSeconds: options.changeAppOwnerWait,
                    report,
                    logPrefix,
                    ErrorClass,
                },
                () => processApp(appId, report)
            ),
    };
};
