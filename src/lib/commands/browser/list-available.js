import { Command, Option } from 'commander';
import { logger, appVersion } from '../../../globals.js';
import { browserListAvailable } from '../../browser/browser-list-available.js';

const buildBrowserListAvailableCommand = () => {
    const command = new Command('list-available');

    command
        .description(
            'Show which browsers are available for download and installation by Butler Sheet Icons.'
        )
        .action(async (options, cmd) => {
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
        })
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

export { buildBrowserListAvailableCommand };
