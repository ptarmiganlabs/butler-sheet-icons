import { Command, Option } from 'commander';
import { logger, appVersion } from '../../../globals.js';
import { browserInstall } from '../../browser/browser-install.js';
import {
    VERSION_RECOMMENDED,
    describeBrowserVersionOption,
    parseBrowserVersionValue,
} from '../../browser/browser-version.js';
import { runCommand } from '../run-command.js';

/**
 * Commander action that installs the browser.
 *
 * @param {object} [options] - CLI options describing target browser and loglevel. Defaults to `{}`.
 * @param {import('commander').Command} cmd - Commander command object for downstream context.
 *
 * @returns {Promise<void>} Resolves after attempting the install and logging any failures.
 */
const handleBrowserInstall = async (options = {}, cmd) => {
    logger.info(`App version: ${appVersion}`);

    return runCommand('BROWSER MAIN 9', () => browserInstall(options, cmd));
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
            new Option('--log-level, --loglevel <level>', 'Log level')
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
            // The argParser maps a set-but-empty value onto the default: Commander lets a bare
            // `BSI_BROWSER_I_BROWSER_VERSION=` line in a unit file beat .default(), and an empty
            // string must mean "unset", not an error.
            new Option('--browser-version <version>', describeBrowserVersionOption('install'))
                .default(VERSION_RECOMMENDED)
                .argParser(parseBrowserVersionValue)
                .env('BSI_BROWSER_I_BROWSER_VERSION')
        );

    return command;
};

export { buildBrowserInstallCommand, handleBrowserInstall };
