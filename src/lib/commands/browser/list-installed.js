import { Command, Option } from 'commander';
import { logger, appVersion } from '../../../globals.js';
import { browserInstalled } from '../../browser/browser-installed.js';

/**
 * Commander action that lists browsers already downloaded into the Butler cache.
 *
 * @param {object} [options={}] - CLI options, currently only used for logging level.
 * @param {import('commander').Command} cmd - Commander command instance forwarded to the worker.
 *
 * @returns {Promise<void>} Resolves when browserInstalled completes or errors are logged.
 */
const handleBrowserListInstalled = async (options = {}, cmd) => {
    logger.info(`App version: ${appVersion}`);

    logger.verbose(`appid=${options.appid}`);
    try {
        const res = await browserInstalled(options, cmd);
        logger.debug(`Call to browserInstalled succeeded: ${res}`);
    } catch (err) {
        logger.error(`BROWSER MAIN 6: ${err}`);
        if (err.message) {
            logger.error(`BROWSER MAIN 6 (message): ${err.message}`);
        }
        if (err.stack) {
            logger.error(`BROWSER MAIN 6 (stack): ${err.stack}`);
        }
    }
};

/**
 * Builds the "browser list-installed" command.
 *
 * @returns {import('commander').Command} Configured list-installed command.
 */
const buildBrowserListInstalledCommand = () => {
    const command = new Command('list-installed');

    command
        .description(
            'Show which browsers are currently installed and available for use by Butler Sheet Icons.'
        )
        .action(handleBrowserListInstalled)
        .addOption(
            new Option('--loglevel, --log-level <level>', 'Log level')
                .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                .default('info')
                .env('BSI_BROWSER_LI_LOG_LEVEL')
        );

    return command;
};

export { buildBrowserListInstalledCommand, handleBrowserListInstalled };
