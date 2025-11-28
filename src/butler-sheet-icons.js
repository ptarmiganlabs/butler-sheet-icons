import { Command } from 'commander';
import { appVersion, isSea, logger } from './globals.js';
import { buildQseowCommand } from './lib/commands/qseow/index.js';
import { buildQscloudCommand } from './lib/commands/qscloud/index.js';
import { buildBrowserCommand } from './lib/commands/browser/index.js';
import { installWarningFilter } from './lib/runtime/node-warning-filter.js';
import { shouldSilenceBundledDeprecations } from './lib/runtime/should-silence-bundled-deprecations.js';
import {
    ensureNodeFlagsApplied,
    DEFAULT_SUPPORTED_NODE_FLAGS,
} from './lib/runtime/ensure-node-flags.js';

const NODE_FLAG_FORWARD_ENV = 'BSI_NODE_FLAG_REINVOKED';

installWarningFilter({
    enabled: shouldSilenceBundledDeprecations({ env: process.env, isSeaRuntime: isSea }),
    logger,
});

/**
 * Allow SEA binaries to respect Node tracing flags by reinvoking the CLI once with
 * NODE_OPTIONS populated. Without this Commander would reject flags such as
 * --trace-warnings that normally belong to the Node runtime.
 */
ensureNodeFlagsApplied({
    argv: process.argv.slice(2),
    env: process.env,
    processRef: process,
    consoleRef: console,
    nodeFlagForwardEnv: NODE_FLAG_FORWARD_ENV,
    supportedNodeFlags: DEFAULT_SUPPORTED_NODE_FLAGS,
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
