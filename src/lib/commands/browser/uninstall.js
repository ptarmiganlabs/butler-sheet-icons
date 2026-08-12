import { Command, Option } from 'commander';
import { logger, appVersion } from '../../../globals.js';
import { browserUninstall } from '../../browser/browser-uninstall.js';
import { runCommand } from '../run-command.js';
import { buildBrowserCacheDirOption } from '../helpers.js';
import { addInteractiveOption } from '../../interactive/interactive-option.js';

/**
 * Commander action that uninstalls a single browser build from the local cache.
 *
 * @param {object} [options] - CLI options that specify browser name/version and loglevel. Defaults to `{}`.
 * @param {import('commander').Command} cmd - Commander command object for downstream context.
 *
 * @returns {Promise<void>} Resolves after attempting the uninstall and logging any failures.
 */
const handleBrowserUninstall = async (options = {}, cmd) => {
    logger.info(`App version: ${appVersion}`);

    // Optional chaining, not `options.interactive`: the default parameter only
    // covers `undefined`, and a null options bag has to keep reaching
    // runCommand() to be reported as a failure rather than thrown from here.
    if (options?.interactive) {
        // Loaded on demand, and the import specifier is a literal so esbuild
        // still bundles it for the SEA build. Importing it at module scope
        // would pull the whole prompt framework into every consumer of this
        // builder - including `command-tree.js`, which imports the builders and
        // would close a cycle - to declare one flag.
        const { launchInteractive } = await import('../../interactive/launch.js');

        return launchInteractive('BROWSER MAIN 7', 'browser uninstall', cmd);
    }

    return runCommand('BROWSER MAIN 7', () => browserUninstall(options, cmd));
};

/**
 * Builds the "browser uninstall" command definition.
 *
 * @returns {import('commander').Command} Configured uninstall command.
 */
const buildBrowserUninstallCommand = () => {
    const command = new Command('uninstall');

    command
        .description(
            'Uninstall a browser from the Butler Sheet Icons cache.\nThis will remove the browser from the cache, but will not affect other browsers on this computer.\nUse the "butler-sheet-icons browser list-installed" command to see which browsers are currently installed.'
        )
        .action(handleBrowserUninstall)
        .addOption(
            new Option('--log-level, --loglevel <level>', 'Log level')
                .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                .default('info')
                .env('BSI_BROWSER_UI_LOG_LEVEL')
        )
        .addOption(
            // Chrome only; see the note on the same option in install.js.
            new Option(
                '--browser <browser>',
                'Browser to uninstall. Only "chrome" is supported. Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.'
            )
                .choices(['chrome'])
                .default('chrome')
                .makeOptionMandatory()
                .env('BSI_BROWSER_UI_BROWSER')
        )
        .addOption(
            // No default on purpose: uninstalling is destructive, so the build to remove has to
            // be named. Unlike the other commands this one does not share
            // describeBrowserVersionOption - floating keywords such as "stable" are refused at
            // run time, because they name whatever the vendor currently publishes rather than a
            // build on this machine.
            new Option(
                '--browser-version <version>',
                'Browser build to uninstall: an exact build id (e.g. "151.0.7922.77"), or "recommended" for the build Butler Sheet Icons is tested with. Use "butler-sheet-icons browser list-installed" to see which builds are installed.'
            )
                .makeOptionMandatory()
                .env('BSI_BROWSER_UI_BROWSER_VERSION')
        )
        .addOption(buildBrowserCacheDirOption());

    // Both mandatory options above are exactly why this command is worth doing
    // interactively: the build to remove has to be named exactly, and today it
    // is typed from memory. The wizard offers the builds actually installed.
    addInteractiveOption(command);

    return command;
};

export { buildBrowserUninstallCommand, handleBrowserUninstall };
