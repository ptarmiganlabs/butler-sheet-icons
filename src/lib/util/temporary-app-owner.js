import { setTimeout as delay } from 'node:timers/promises';

import { logger } from '../../globals.js';
import { interruptAbortSignal, isInterrupted } from './interrupt.js';
import { describeWithCauses } from './log-error.js';
import { recordAppOwner, recordRunStop } from './run-report.js';

/**
 * `--change-app-owner`: give an app to another user while it is processed, then give it back
 * (issue #1209).
 *
 * The platform-neutral half. Each platform supplies how to read and change an owner - QRS on
 * QSEoW, the REST API on Qlik Cloud - as `owners`; everything that decides whether an app can end
 * up with the wrong owner is here, once, so the two platforms cannot drift on it:
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

/** How many times the restore is tried before the run stops. */
export const RESTORE_ATTEMPTS = 3;

/**
 * Pause before each retry of the restore, in milliseconds.
 *
 * Short on purpose: after a Ctrl-C the whole shutdown has eight seconds before the watchdog ends
 * the process, and the restore has to fit inside that alongside closing the browser.
 */
export const RESTORE_BACKOFF_MS = Object.freeze([1000, 2000]);

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
 *
 * @returns {Error} The error, marked `stopsRun`.
 */
const runStoppingError = (ErrorClass, message, processingError) => {
    const err = new ErrorClass(message);

    err.stopsRun = true;
    err.stopReason =
        'BSI could not give an app back to its original owner, so it changes no further owners';

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
 * Processes one app with `target` as its owner, and gives the app back afterwards.
 *
 * The order, which is the whole point:
 *
 * 1. Read who owns the app now. A read that fails fails the app, before anything has changed.
 * 2. Leave the owner alone when `target` already owns the app, or when the platform says this
 *    app's owner must not be changed (Qlik Cloud published and personal-space apps) - and process
 *    the app as it would be without the option.
 * 3. Log the original owner and how to restore it by hand, **then** change the owner. A change
 *    that fails fails the app without processing it, after checking the change did not land
 *    after all - a timeout says nothing about whether the server applied it.
 * 4. Wait `waitSeconds`, so the change has reached every Qlik Sense service, then process.
 * 5. Restore, however step 4 ended. If the restore fails, the run stops.
 *
 * @param {object} params - What to do.
 * @param {string} params.appId - Qlik Sense app id.
 * @param {object} params.owners - The platform half, four functions: `inspect(appId)` reads the
 *     app's name and owner, and why its owner must be left alone, if it must; `currentOwnerId(appId)`
 *     reads only the owner's id, for the checks before each restore attempt; `change(appId, owner)`
 *     makes `owner` the app's owner; `manualFix(appId, owner)` says how an operator gives the app
 *     back to `owner` by hand.
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
 * @throws {Error} The app's own failure; or, when the owner could not be read or changed, an
 *     error saying so; or, when the restore failed, an error marked `stopsRun`.
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

    // The app loop checks between apps; this closes the window between that check and the
    // change. Named as an abort, so the loop files the app as abandoned, not failed.
    if (isInterrupted()) {
        throw new DOMException(
            `Interrupted before the owner of app ${appId} was changed; it was left as it was`,
            'AbortError'
        );
    }

    const manualFix = owners.manualFix(appId, original);

    // Logged before the change, not after: if the process dies before the restore, this line is
    // the only record of who the app belongs to.
    logger.info(
        `${logPrefix}: Changing the owner of app ${appId} "${appName}" from ${original.label} to ${target.label} while it is processed. If this run stops before changing it back: ${manualFix}`
    );
    recordAppOwner(report, appId, { ...entry, state: 'changing', manualFix });

    const restore = () => restoreOwner({ appId, owners, original, target, logPrefix, pause });

    const stopWith = (restored, processingError) => {
        recordAppOwner(report, appId, { state: 'restore-failed' });
        recordRunStop(report, { appId });

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

    try {
        await owners.change(appId, target);
    } catch (err) {
        const restored = await restore();

        if (!restored.ok) {
            throw stopWith(restored, err);
        }

        recordAppOwner(report, appId, { state: 'change-failed' });

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

    recordAppOwner(report, appId, {
        state: restored.state === 'changed-elsewhere' ? 'changed-elsewhere' : 'restored',
    });

    if (restored.state === 'restored') {
        logger.info(`${logPrefix}: App ${appId} "${appName}" is owned by ${original.label} again.`);
    }

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
 * @param {object} params.owners - The platform half; only `inspect` is used.
 * @param {{id: string, label: string}|null} params.target - Who would own the app, or null when
 *     that is only known once a real run has signed in.
 * @param {object} params.report - The run report.
 * @param {Function} params.ErrorClass - Platform error class.
 * @param {() => Promise<unknown>} plan - Plans the app.
 *
 * @returns {Promise<unknown>} Whatever `plan` returned.
 *
 * @throws {Error} When the owner cannot be read, or whatever `plan` threw.
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

    recordAppOwner(report, appId, {
        appName,
        from: owner.label,
        to: target?.label ?? null,
        state,
        ...(state === 'kept' ? { reason: keepReason } : {}),
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
