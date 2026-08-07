import { logger } from '../../globals.js';

/**
 * Runs a command implementation on behalf of a Commander action handler, and makes its
 * outcome visible in the process exit code.
 *
 * Every command in Butler Sheet Icons returns a boolean saying whether it succeeded, and
 * before this existed every handler threw that boolean away. `process.exitCode` was set
 * nowhere in the codebase, so a run in which every app failed exited 0 - indistinguishable
 * from a clean run to any scheduler, CI job or shell script.
 *
 * A thrown error is treated the same as `false`: logged, exit code 1, no rethrow. Letting
 * it escape would reach the `unhandledRejection` handler in `butler-sheet-icons.js`, which
 * writes a crash dump - the wrong response to an operational failure such as an
 * unreachable server.
 *
 * @param {string} logPrefix - Prefix for error lines, e.g. `'CLOUD MAIN 3'`. Kept
 *     per-handler so existing log output stays greppable.
 * @param {() => Promise<boolean>} run - The command implementation to invoke.
 * @param {(err: unknown) => void} [onError] - Replaces the default error logging. Used by
 *     handlers whose command already explained the failure, where repeating it made the
 *     output unreadable (issue #785).
 *
 * @returns {Promise<boolean>} What the command returned, or `false` if it threw.
 */
export const runCommand = async (logPrefix, run, onError) => {
    try {
        const result = await run();

        if (result === false) {
            process.exitCode = 1;
            logger.verbose(`${logPrefix}: command reported failure, exit code set to 1`);
            return false;
        }

        logger.debug(`${logPrefix}: command completed successfully`);
        return result;
    } catch (err) {
        process.exitCode = 1;

        if (onError) {
            onError(err);
            return false;
        }

        logger.error(`${logPrefix}: ${err}`);
        if (err?.message) {
            logger.error(`${logPrefix} (message): ${err.message}`);
        }
        if (err?.stack) {
            logger.error(`${logPrefix} (stack): ${err.stack}`);
        }

        return false;
    }
};
