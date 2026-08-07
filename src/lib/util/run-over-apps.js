import { logger } from '../../globals.js';

/**
 * Runs a per-app worker over a list of app IDs, isolating each app from the others and
 * keeping count of the ones that failed.
 *
 * This replaces four hand-written copies of the same loop. The copies had already
 * drifted - four different log prefixes, and none of them counted anything - so a run in
 * which every app failed was indistinguishable from a run in which every app succeeded.
 *
 * Callers decide what a failure means by reading the returned counts. Nothing is thrown
 * for a failed app: the point of the loop is that one bad app does not stop the rest.
 *
 * The per-app worker is expected to log its own failure in detail before rethrowing; the
 * line logged here names the app and the reason, without repeating the stack.
 *
 * @param {string[]} appIds - App IDs to process. Duplicates are removed, so an app named
 *     by both `--appid` and a collection is processed once.
 * @param {object} ctx - Logging context.
 * @param {string} ctx.logPrefix - Prefix for the per-app failure lines, e.g. `'CLOUD PROCESS APP'`.
 * @param {string} [ctx.emptySelectionHint] - Extra guidance logged when the list is empty,
 *     e.g. which options to check. An empty list is reported as an error, because it means
 *     the operator asked for work that did not happen.
 * @param {(appId: string) => Promise<unknown>} processApp - Worker invoked once per app.
 *
 * @returns {Promise<{total: number, failed: number}>} How many apps were processed and how
 *     many of those failed.
 */
export const runOverApps = async (appIds, { logPrefix, emptySelectionHint }, processApp) => {
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
        return { total: 0, failed: 0 };
    }

    let failed = 0;

    for (const appId of uniqueAppIds) {
        try {
            logger.info(`--------------------------------------------------`);
            logger.info(`About to process app ${appId}`);

            await processApp(appId);

            logger.verbose(`Done processing app ${appId}`);
        } catch (err) {
            failed += 1;
            logger.error(`${logPrefix}: Failed to process app ${appId}: ${err?.message ?? err}`);
        }
    }

    if (failed > 0) {
        logger.error(`Failed to process ${failed} of ${uniqueAppIds.length} app(s)`);
    }

    return { total: uniqueAppIds.length, failed };
};
