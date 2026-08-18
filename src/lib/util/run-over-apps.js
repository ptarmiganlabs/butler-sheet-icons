import { logger } from '../../globals.js';

/**
 * Runs a per-app worker over a list of app IDs, isolating each app from the others and
 * keeping count of the ones that failed.
 *
 * This replaces four hand-written copies of the same loop. The copies had already
 * drifted - four different log prefixes, and none of them counted anything - so a run in
 * which every app failed was indistinguishable from a run in which every app succeeded.
 *
 * Nothing is thrown for a failed app: the point of the loop is that one bad app does not
 * stop the rest. The overall verdict comes back as the return value instead.
 *
 * That verdict is decided here rather than by each caller. All four callers applied the
 * identical rule, and four copies of it - destructure, comment and all - was itself enough
 * duplicated code to fail the quality gate on the very PR that introduced this helper.
 *
 * The per-app worker is expected to log its own failure in detail before rethrowing; the
 * line logged here names the app and the reason, without repeating the stack.
 *
 * Callers must `return await` this, never a bare `return`. All four sit inside a
 * `try`/`catch`, and returning the promise unawaited hands it back before it settles - so
 * a rejection would skip the caller's own catch entirely rather than being logged there.
 *
 * @param {string[]} appIds - App IDs to process. Duplicates are removed, so an app named
 *     by both `--appid` and a collection is processed once.
 * @param {object} ctx - Logging context.
 * @param {string} ctx.logPrefix - Prefix for the per-app failure lines, e.g. `'CLOUD PROCESS APP'`.
 * @param {string} [ctx.action] - Verb for the per-app banner line, e.g. `plan` for a dry
 *     run. Defaults to `process`, so a dry run's log never claims to be processing.
 * @param {string} [ctx.emptySelectionHint] - Extra guidance logged when the list is empty,
 *     e.g. which options to check. An empty list is reported as an error, because it means
 *     the operator asked for work that did not happen.
 * @param {(appId: string, position: {n: number, total: number}) => Promise<unknown>} processApp -
 *     Worker invoked once per app. The position is the same 1-based `n` and
 *     total this loop prints in its `app n/total` line - handed to the worker
 *     so the log line, the live view's block and the committed board row all
 *     read one number from one owner (issue #1110), instead of each keeping
 *     a counter that agrees by convention.
 *
 * @returns {Promise<boolean>} `true` only when at least one app was selected and every one
 *     of them was processed without error. An empty selection is a failure, not a no-op.
 */
export const runOverApps = async (
    appIds,
    { logPrefix, emptySelectionHint, action = 'process' },
    processApp
) => {
    // An app named by both --appid and a collection must still be processed once.
    const uniqueAppIds = [...new Set(appIds)];

    logger.debug('Will process these app IDs:');
    uniqueAppIds.forEach((appId) => {
        logger.debug(appId);
    });

    if (uniqueAppIds.length === 0) {
        // Not the same as "nothing to do": the operator asked for apps and got none. An
        // unresolvable collection used to end here reporting success.
        logger.error(`No apps to process.${emptySelectionHint ? ` ${emptySelectionHint}` : ''}`);
        return false;
    }

    let failed = 0;
    let appNumber = 0;

    for (const appId of uniqueAppIds) {
        appNumber += 1;
        try {
            // Countable, and printed before the worker runs, so a run that
            // hangs hangs somewhere nameable: `app 3/7 <id>` with no line
            // after it says exactly where. A dry run keeps its verb - `plan
            // app 3/7` - so its log stays distinguishable from a real run.
            logger.info('');
            logger.info(
                `${action === 'process' ? 'app' : `${action} app`} ${appNumber}/${uniqueAppIds.length}  ${appId}`
            );

            await processApp(appId, { n: appNumber, total: uniqueAppIds.length });

            logger.verbose(`Done processing app ${appId}`);
        } catch (err) {
            failed += 1;
            logger.error(`${logPrefix}: Failed to process app ${appId}: ${err?.message ?? err}`);
        }
    }

    if (failed > 0) {
        logger.error(`Failed to process ${failed} of ${uniqueAppIds.length} app(s)`);
    }

    return failed === 0;
};
