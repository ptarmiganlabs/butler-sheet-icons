import { Command, Option } from 'commander';
import { logger, appVersion } from '../../../globals.js';

const buildBrowserInstallCommand = () => {
    const command = new Command('install');

    command
        .description(
            'Install a browser into the Butler Sheet Icons cache.\nThis will download the browser and install it into the cache, where it can be used by Butler Sheet Icons.\nUse the "butler-sheet-icons browser list-installed" command to see which browsers are currently installed.'
        )
        .action(async (options) => {
            logger.info(`App version: ${appVersion}`);

            try {
                if (!options.browserVersion || options.browserVersion === '') {
                    if (options.browser === 'chrome') {
                        options.browserVersion = 'stable';
                    } else if (options.browser === 'firefox') {
                        options.browserVersion = 'latest';
                    }
                }
            } catch (err) {
                if (err.stack) {
                    logger.error(`BROWSER MAIN 9 (stack): ${err.stack}`);
                } else if (err.message) {
                    logger.error(`BROWSER MAIN 9 (message): ${err.message}`);
                } else {
                    logger.error(`BROWSER MAIN 9: ${err}`);
                }
            }
        })
        .addOption(
            new Option('--loglevel, --log-level <level>', 'Log level')
                .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                .default('info')
                .env('BSI_BROWSER_I_LOG_LEVEL')
        )
        .addOption(
            new Option(
                '--browser <browser>',
                'Browser to install (e.g. "chrome" or "firefox"). Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.'
            )
                .choices(['chrome', 'firefox'])
                .default('chrome')
                .env('BSI_BROWSER_I_BROWSER')
        )
        .addOption(
            new Option(
                '--browser-version <version>',
                'Version (=build id) of the browser to install. Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.'
            )
                .default('latest')
                .env('BSI_BROWSER_I_BROWSER_VERSION')
        );

    return command;
};

export { buildBrowserInstallCommand };
