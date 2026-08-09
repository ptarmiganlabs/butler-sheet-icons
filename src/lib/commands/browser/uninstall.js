import { Command, Option } from 'commander';
import { logger, appVersion } from '../../../globals.js';
import { browserUninstall } from '../../browser/browser-uninstall.js';
import { runCommand } from '../run-command.js';

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
            new Option('--loglevel, --log-level <level>', 'Log level')
                .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                .default('info')
                .env('BSI_BROWSER_UI_LOG_LEVEL')
        )
        .addOption(
            new Option(
                '--browser <browser>',
                'Browser to uninstall (e.g. "chrome" or "firefox"). Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.'
            )
                .choices(['chrome', 'firefox'])
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
                'Browser build to uninstall: an exact build id (for Chrome e.g. "151.0.7922.77", for Firefox e.g. "stable_153.0.3"), or "recommended" for the build Butler Sheet Icons is tested with. Use "butler-sheet-icons browser list-installed" to see which builds are installed.'
            )
                .makeOptionMandatory()
                .env('BSI_BROWSER_UI_BROWSER_VERSION')
        );

    return command;
};

export { buildBrowserUninstallCommand, handleBrowserUninstall };
