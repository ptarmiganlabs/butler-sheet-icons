import { Command, Option } from 'commander';
import { logger, appVersion } from '../../../globals.js';
import { browserUninstallAll } from '../../browser/browser-uninstall.js';

/**
 * Commander action that removes every cached browser managed by Butler Sheet Icons.
 *
 * @param {object} [options={}] - CLI options (loglevel) passed through to the worker.
 * @param {import('commander').Command} cmd - Commander command reference for auditing/logging.
 *
 * @returns {Promise<void>} Resolves after the uninstall-all worker finishes or errors are logged.
 */
const handleBrowserUninstallAll = async (options = {}, cmd) => {
    logger.info(`App version: ${appVersion}`);

    try {
        const res = await browserUninstallAll(options, cmd);
        logger.debug(`Call to browserUninstallAll succeeded: ${res}`);
    } catch (err) {
        logger.error(`BROWSER MAIN 8: ${err}`);
        if (err.message) {
            logger.error(`BROWSER MAIN 8 (message): ${err.message}`);
        }
        if (err.stack) {
            logger.error(`BROWSER MAIN 8 (stack): ${err.stack}`);
        }
    }
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
            new Option('--loglevel, --log-level <level>', 'Log level')
                .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                .default('info')
                .env('BS_BROWSER_UIA_LOG_LEVEL')
        );

    return command;
};

export { buildBrowserUninstallAllCommand, handleBrowserUninstallAll };
