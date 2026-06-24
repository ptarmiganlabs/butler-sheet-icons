import { Command } from 'commander';
import { appVersion, logger } from './globals.js';
import { writeCrashDump } from './lib/util/crash-dump.js';
import { buildQseowCommand } from './lib/commands/qseow/index.js';
import { buildQscloudCommand } from './lib/commands/qscloud/index.js';
import { buildBrowserCommand } from './lib/commands/browser/index.js';

// ---------------------------------------------------------------------------
// Process-level safety net: catch any error that escapes all try/catch blocks
// ---------------------------------------------------------------------------

/**
 * Handler for synchronous uncaught exceptions.
 * Writes a crash dump and exits with code 1.
 *
 * @param {Error} err - The uncaught error.
 *
 * @returns {void}
 */
process.on('uncaughtException', (err) => {
    try {
        const message = `FATAL: Uncaught exception: ${err?.message ?? err}`;
        try {
            logger.error(message);
        } catch {
            console.error(message);
        }
    } finally {
        // Fire-and-forget the crash dump write, then exit. writeCrashDump has
        // its own 5s timeout so it can never block process exit indefinitely.
        writeCrashDump(err, 'uncaughtException').finally(() => {
            process.exit(1);
        });
    }
});

/**
 * Handler for unhandled promise rejections.
 * Logs the error and writes a crash dump, then exits with code 1. We treat
 * unhandled rejections the same as uncaught exceptions because BSI runs
 * short-lived batch commands — there is no "recovery" mode worth returning
 * to, and silently continuing can leave half-completed work in Qlik Sense.
 *
 * @param {Error|unknown} reason - The rejection reason (usually an Error).
 *
 * @returns {void}
 */
process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    try {
        const message = `FATAL: Unhandled promise rejection: ${err?.message ?? err}`;
        try {
            logger.error(message);
        } catch {
            console.error(message);
        }
    } finally {
        writeCrashDump(err, 'unhandledRejection').finally(() => {
            process.exit(1);
        });
    }
});

const program = new Command();

/**
 * Top level async function.
 * Workaround to deal with the fact that Node.js doesn't currently support top level async functions.
 */
(async () => {
    program
        .version(appVersion)
        .name('butler-sheet-icons')
        .description(
            'This is a tool that creates thumbnail images based on the actual layout of sheets in Qlik Sense applications.\nQlik Sense Cloud and Qlik Sense Enterprise on Windows are both supported.\nThe created thumbnails are saved to disk and uploaded to the Sense app as new sheet thumbnail images.'
        );

    program.addCommand(buildQseowCommand());
    program.addCommand(buildQscloudCommand());
    program.addCommand(buildBrowserCommand());

    await program.parseAsync(process.argv);
})();
