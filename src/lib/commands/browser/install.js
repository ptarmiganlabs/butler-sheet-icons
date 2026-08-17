import { Command, Option } from 'commander';
import { logger, appVersion } from '../../../globals.js';
import { logRunHeader } from '../../util/run-report-render.js';
import { browserInstall } from '../../browser/browser-install.js';
import {
    VERSION_RECOMMENDED,
    describeBrowserVersionOption,
    parseBrowserVersionValue,
} from '../../browser/browser-version.js';
import { runCommand } from '../run-command.js';
import { buildBrowserCacheDirOption } from '../helpers.js';
import { addInteractiveOption } from '../../interactive/interactive-option.js';

/**
 * Commander action that installs the browser.
 *
 * @param {object} [options] - CLI options describing target browser and loglevel. Defaults to `{}`.
 * @param {import('commander').Command} cmd - Commander command object for downstream context.
 *
 * @returns {Promise<void>} Resolves after attempting the install and logging any failures.
 */
const handleBrowserInstall = async (options = {}, cmd) => {
    logRunHeader(logger, appVersion, 'browser install');

    // Optional chaining, not `options.interactive`: the default parameter only
    // covers `undefined`, and a null options bag has to keep reaching
    // runCommand() to be reported as a failure rather than thrown from here.
    if (options?.interactive) {
        // Loaded on demand; see the note in uninstall.js for why this import is
        // not at module scope.
        const { launchInteractive } = await import('../../interactive/launch.js');

        return launchInteractive('BROWSER MAIN 9', 'browser install', cmd);
    }

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
            // Chrome is the only browser Butler Sheet Icons drives: the render path speaks the
            // Chrome DevTools Protocol and passes a Chromium-only argument list. The option is
            // kept rather than dropped so that scripts passing "--browser chrome" keep working.
            new Option(
                '--browser <browser>',
                'Browser to install. Only "chrome" is supported. Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.'
            )
                .choices(['chrome'])
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
        )
        .addOption(buildBrowserCacheDirOption());

    // The version picker is the reason: `--browser-version` accepts hundreds of
    // build ids that are impossible to recall, and the wizard searches them.
    addInteractiveOption(command);

    return command;
};

export { buildBrowserInstallCommand, handleBrowserInstall };
