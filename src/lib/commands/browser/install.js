import { Command, Option } from 'commander';
import { logger, appVersion } from '../../../globals.js';
import { browserInstall } from '../../browser/browser-install.js';

/**
 * Commander action that normalizes requested browser defaults and installs the browser.
 *
 * @param {object} [options={}] - CLI options describing target browser and loglevel.
 * @param {import('commander').Command} cmd - Commander command object for downstream context.
 *
 * @returns {Promise<void>} Resolves after attempting the install and logging any failures.
 */
const handleBrowserInstall = async (options = {}, cmd) => {
    logger.info(`App version: ${appVersion}`);

    try {
        // Normalize browser version defaults
        if (!options.browserVersion || options.browserVersion === '') {
            if (options.browser === 'chrome') {
                options.browserVersion = 'stable';
            } else if (options.browser === 'firefox') {
                options.browserVersion = 'latest';
            }
        }

        // Install the browser
        const res = await browserInstall(options, cmd);
        logger.debug(`Call to browserInstall succeeded: ${JSON.stringify(res)}`);
    } catch (err) {
        logger.error(`BROWSER MAIN 9: ${err}`);
        if (err.message) {
            logger.error(`BROWSER MAIN 9 (message): ${err.message}`);
        }
        if (err.stack) {
            logger.error(`BROWSER MAIN 9 (stack): ${err.stack}`);
        }
    }
};

/**
 * Builds the "browser install" command for the CLI.
 *
 * @returns {import('commander').Command} Configured install command instance.
 */
const buildBrowserInstallCommand = () => {
    const command = new Command('install');

    command
        .description(
            'Install a browser into the Butler Sheet Icons cache.\nThis will download the browser and install it into the cache, where it can be used by Butler Sheet Icons.\nUse the "butler-sheet-icons browser list-installed" command to see which browsers are currently installed.'
        )
        .action(handleBrowserInstall)
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

export { buildBrowserInstallCommand, handleBrowserInstall };
