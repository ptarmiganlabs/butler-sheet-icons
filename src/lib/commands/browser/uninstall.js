import { Command, Option } from 'commander';
import { logger, appVersion } from '../../../globals.js';
import { browserUninstall } from '../../browser/browser-uninstall.js';

const buildBrowserUninstallCommand = () => {
    const command = new Command('uninstall');

    command
        .description(
            'Uninstall a browser from the Butler Sheet Icons cache.\nThis will remove the browser from the cache, but will not affect other browsers on this computer.\nUse the "butler-sheet-icons browser list-installed" command to see which browsers are currently installed.'
        )
        .action(async (options, cmd) => {
            logger.info(`App version: ${appVersion}`);

            try {
                const res = await browserUninstall(options, cmd);
                logger.debug(`Call to browserUninstall succeeded: ${res}`);
            } catch (err) {
                logger.error(`BROWSER MAIN 7: ${err}`);
                if (err.message) {
                    logger.error(`BROWSER MAIN 7 (message): ${err.message}`);
                }
                if (err.stack) {
                    logger.error(`BROWSER MAIN 7 (stack): ${err.stack}`);
                }
            }
        })
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
                .default('chrome')
                .makeOptionMandatory()
                .env('BSI_BROWSER_UI_BROWSER')
        )
        .addOption(
            new Option(
                '--browser-version <version>',
                'Version (=build id) of the browser to uninstall. Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.'
            )
                .makeOptionMandatory()
                .env('BSI_BROWSER_UI_BROWSER_VERSION')
        );

    return command;
};

export { buildBrowserUninstallCommand };
