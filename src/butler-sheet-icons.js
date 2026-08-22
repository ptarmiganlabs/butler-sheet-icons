// First, and before anything that reads process.env. Option declarations bind `.env('BSI_…')`,
// so `.env` has to be in place before the command tree is built. It lives here rather than in
// globals.js so that importing library code does not read a dotfile off disk - see issue #1014.
import 'dotenv/config';
import { Command } from 'commander';
import { appVersion, logger } from './globals.js';
import { reportExpectedFailure } from './lib/util/errors.js';
import { installFatalHandlers } from './lib/util/fatal-handlers.js';
import { installSignalHandlers } from './lib/util/signal-handlers.js';
import { isInterrupted, interruptExitCode } from './lib/util/interrupt.js';
import { flushAndExit } from './lib/util/flush-exit.js';
import { buildQseowCommand } from './lib/commands/qseow/index.js';
import { buildQscloudCommand } from './lib/commands/qscloud/index.js';
import { buildBrowserCommand } from './lib/commands/browser/index.js';
import { buildDoctorCommand } from './lib/commands/doctor/index.js';
import { buildInteractiveCommand } from './lib/interactive/interactive-command.js';
import { relaxMandatoryOptionsIfInteractive } from './lib/interactive/mandatory-relaxation.js';
import { extensions } from '#extensions';
import { BUILD_DATE, EXTENSIONS_VERSION, describeVersion } from './lib/util/version-report.js';
import { applyExtensions } from './lib/extensions/apply.js';

// Process-level safety net: catch any error that escapes all try/catch blocks,
// write a crash dump, and exit with code 1. Installed before anything else so
// the net is in place before there is anything to fall out of it.
installFatalHandlers();

// Ctrl-C, `docker stop` and a CI timeout all arrive here (issue #1107). Beside
// the crash net rather than inside it: a signal is not a crash, writes no dump,
// and shuts the run down through the ordinary teardown so the operator is told
// which apps were already updated.
installSignalHandlers();

const program = new Command();

/**
 * Top level async function.
 * Workaround to deal with the fact that Node.js doesn't currently support top level async functions.
 */
(async () => {
    program
        // Reports which build this is and when it was made, not just what version of core it
        // bundles - a variant build was otherwise indistinguishable from a stock one. Issue #1152.
        .version(
            describeVersion({
                name: 'butler-sheet-icons',
                version: appVersion,
                variant: extensions?.variant,
                variantVersion: EXTENSIONS_VERSION,
                buildDate: BUILD_DATE,
            })
        )
        .name('butler-sheet-icons')
        .description(
            'This is a tool that creates thumbnail images based on the actual layout of sheets in Qlik Sense applications.\nQlik Sense Cloud and Qlik Sense Enterprise on Windows are both supported.\nThe created thumbnails are saved to disk and uploaded to the Sense app as new sheet thumbnail images.\n\nNew to Butler Sheet Icons? Run "butler-sheet-icons interactive" to be asked for what is needed instead of assembling a command line.'
        );

    program.addCommand(buildQseowCommand());
    program.addCommand(buildQscloudCommand());
    program.addCommand(buildBrowserCommand());
    program.addCommand(buildDoctorCommand());
    program.addCommand(buildInteractiveCommand());

    // Whatever this build adds on top of the commands above - nothing at all, unless the bundle
    // was built against an extensions module. The position is forced rather than chosen: a
    // contributed option has to exist before the relaxation call below, because Commander rejects
    // a command line missing a mandatory option before any hook or handler runs. See
    // src/lib/extensions/apply.js and issue #1135.
    applyExtensions(program, extensions);

    // Must happen before the parse: Commander rejects a command line missing a
    // mandatory option before any hook or handler runs, so `-i` would never be
    // reached. Does nothing at all unless the command line asks for a wizard,
    // and restores what it changed before any handler runs.
    relaxMandatoryOptionsIfInteractive(program, process.argv);

    // A run that stops deliberately is reported as a failed command line, not as a crash.
    //
    // Without this, anything thrown between the parse and the end of the action handler became a
    // rejected promise with nobody handling it, so `installFatalHandlers()` did exactly what it is
    // supposed to do with an error that reaches the top unhandled: logged `FATAL: Unhandled promise
    // rejection` and wrote a crash dump. That is right for a fault and wrong for a precondition the
    // operator can fix - and `src/lib/extensions/apply.js` documents throwing as the way a
    // `beforeAction` hook stops a run, so the contract invited precisely the throw that produced a
    // crash report. Issue #1150.
    //
    // Only errors that mark themselves are treated this way. `reportExpectedFailure` re-throws
    // everything else unchanged, which puts it back on the path it took before: the rejection
    // escapes this IIFE, the safety net catches it, and the dump is written. A bug inside a hook is
    // still a bug.
    //
    // The decision lives in errors.js rather than inline here because nothing in this file is
    // instrumented by the test suite - it is reached by spawning a process, not by importing one -
    // and untestable logic is how this bug survived as long as it did. Exit code set rather than
    // exited on, following the rule the note below records.
    try {
        await program.parseAsync(process.argv);
    } catch (err) {
        process.exitCode = reportExpectedFailure(err, (message) => logger.error(message));
    }

    // The one place the interrupted run is allowed to end the process, and the
    // second considered exception to the codebase's "set `process.exitCode`,
    // never call `process.exit()`" rule - the first being the injected `exit`
    // in `fatal-handlers.js`.
    //
    // It has to be here rather than inside the run: `runCommand` has already
    // set the code, but a shutdown leaves Puppeteer and enigma handles behind
    // that can hold the event loop open indefinitely, so waiting for a natural
    // drain would hang the very shutdown this exists to make prompt. By this
    // point the command has returned and the report has been rendered, so
    // nothing is lost by exiting outright.
    if (isInterrupted()) {
        // Drains stdout before exiting rather than calling `process.exit()`
        // outright. The verdict has just been rendered, and on a pipe -
        // `docker logs`, a CI collector, `| tee` - it is still buffered; a
        // hard exit here discards the report the interrupt existed to
        // produce. `flush-exit.js` carries the measurements and the bound.
        flushAndExit(process.exitCode ?? interruptExitCode());
    }
})();
