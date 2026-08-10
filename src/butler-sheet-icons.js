import { Command } from 'commander';
import { appVersion } from './globals.js';
import { installFatalHandlers } from './lib/util/fatal-handlers.js';
import { buildQseowCommand } from './lib/commands/qseow/index.js';
import { buildQscloudCommand } from './lib/commands/qscloud/index.js';
import { buildBrowserCommand } from './lib/commands/browser/index.js';

// Process-level safety net: catch any error that escapes all try/catch blocks,
// write a crash dump, and exit with code 1. Installed before anything else so
// the net is in place before there is anything to fall out of it.
installFatalHandlers();

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
