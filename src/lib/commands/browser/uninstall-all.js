import { Command, Option } from 'commander';
import { logger, appVersion } from '../../../globals.js';
import { browserUninstallAll } from '../../browser/browser-uninstall.js';
import { runCommand } from '../run-command.js';

/**
 * Commander action that removes every cached browser managed by Butler Sheet Icons.
 *
 * @param {object} [options] - CLI options (loglevel) passed through to the worker. Defaults to `{}`.
 * @param {import('commander').Command} cmd - Commander command reference for auditing/logging.
 *
 * @returns {Promise<void>} Resolves after the uninstall-all worker finishes or errors are logged.
 */
const handleBrowserUninstallAll = async (options = {}, cmd) => {
    logger.info(`App version: ${appVersion}`);

    return runCommand('BROWSER MAIN 8', () => browserUninstallAll(options, cmd));
};

/**
 * Builds the "browser uninstall-all" command definition.
 *
 * @returns {import('commander').Command} Configured uninstall-all command.
 */
const buildBrowserUninstallAllCommand = () => {
    const command = new Command('uninstall-all');

    command
        .description(
            'Uninstall all browsers from the Butler Sheet Icons cache.\nThis will remove all browsers from the cache, but will not affect other browsers on this computer.\nUse the "butler-sheet-icons browser list-installed" command to see which browsers are currently installed.'
        )
        .action(handleBrowserUninstallAll)
        .addOption(
            new Option('--log-level, --loglevel <level>', 'Log level')
                .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                .default('info')
                .env('BS_BROWSER_UIA_LOG_LEVEL')
        );

    return command;
};

export { buildBrowserUninstallAllCommand, handleBrowserUninstallAll };
