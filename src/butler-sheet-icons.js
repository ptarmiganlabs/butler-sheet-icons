// First, and before anything that reads process.env. Option declarations bind `.env('BSI_…')`,
// so `.env` has to be in place before the command tree is built. It lives here rather than in
// globals.js so that importing library code does not read a dotfile off disk - see issue #1014.
import 'dotenv/config';
import { Command } from 'commander';
import { appVersion } from './globals.js';
import { installFatalHandlers } from './lib/util/fatal-handlers.js';
import { buildQseowCommand } from './lib/commands/qseow/index.js';
import { buildQscloudCommand } from './lib/commands/qscloud/index.js';
import { buildBrowserCommand } from './lib/commands/browser/index.js';
import { buildInteractiveCommand } from './lib/interactive/interactive-command.js';
import { relaxMandatoryOptionsIfInteractive } from './lib/interactive/mandatory-relaxation.js';

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
            'This is a tool that creates thumbnail images based on the actual layout of sheets in Qlik Sense applications.\nQlik Sense Cloud and Qlik Sense Enterprise on Windows are both supported.\nThe created thumbnails are saved to disk and uploaded to the Sense app as new sheet thumbnail images.\n\nNew to Butler Sheet Icons? Run "butler-sheet-icons interactive" to be asked for what is needed instead of assembling a command line.'
        );

    program.addCommand(buildQseowCommand());
    program.addCommand(buildQscloudCommand());
    program.addCommand(buildBrowserCommand());
    program.addCommand(buildInteractiveCommand());

    // Must happen before the parse: Commander rejects a command line missing a
    // mandatory option before any hook or handler runs, so `-i` would never be
    // reached. Does nothing at all unless the command line asks for a wizard,
    // and restores what it changed before any handler runs.
    relaxMandatoryOptionsIfInteractive(program, process.argv);

    await program.parseAsync(process.argv);
})();
