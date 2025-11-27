import { Command, Option } from 'commander';
import { logger, appVersion } from '../../../globals.js';
import { browserListAvailable } from '../../browser/browser-list-available.js';

/**
 * Commander action that queries which browsers are available for download.
 *
 * @param {object} [options={}] - CLI options specifying browser type, channel and logging.
 * @param {import('commander').Command} cmd - Commander command context propagated to the worker.
 *
 * @returns {Promise<void>} Resolves when the worker returns or errors are logged.
 */
const handleBrowserListAvailable = async (options = {}, cmd) => {
    logger.info(`App version: ${appVersion}`);

    try {
        const res = await browserListAvailable(options, cmd);
        logger.debug(`Call to browserAvailable succeeded: ${JSON.stringify(res, null, 2)}`);
    } catch (err) {
        logger.error(`BROWSER MAIN 10: ${err}`);
        if (err.message) {
            logger.error(`BROWSER MAIN 10 (message): ${err.message}`);
        }
        if (err.stack) {
            logger.error(`BROWSER MAIN 10 (stack): ${err.stack}`);
        }
    }
};

/**
 * Builds the "browser list-available" command with its options and handler.
 *
 * @returns {import('commander').Command} Configured list-available command instance.
 */
const buildBrowserListAvailableCommand = () => {
    const command = new Command('list-available');

    command
        .description(
            'Show which browsers are available for download and installation by Butler Sheet Icons.'
        )
        .action(handleBrowserListAvailable)
        .addOption(
            new Option('--loglevel, --log-level <level>', 'Log level')
                .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                .default('info')
                .env('BSI_BROWSER_LA_LOG_LEVEL')
        )
        .addOption(
            new Option(
                '--browser <browser>',
                'Browser to install (e.g. "chrome" or "firefox"). Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.'
            )
                .choices(['chrome', 'firefox'])
                .default('chrome')
                .env('BSI_BROWSER_LA_BROWSER')
        )
        .addOption(
            new Option(
                '--channel <browser>',
                "Which of the browser's release channel versions should be listed?\n This option is only used for Chrome."
            )
                .choices(['stable', 'beta', 'dev', 'canary'])
                .default('stable')
                .env('BSI_BROWSER_LA_CHANNEL')
        );

    return command;
};

export { buildBrowserListAvailableCommand, handleBrowserListAvailable };
