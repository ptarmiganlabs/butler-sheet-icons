import { Command, Option } from 'commander';
import { logger, appVersion } from '../../../globals.js';
import { logRunHeader } from '../../util/run-report-render.js';
import { browserListAvailable } from '../../browser/browser-list-available.js';
import { runCommand } from '../run-command.js';

/**
 * Commander action that queries which browsers are available for download.
 *
 * @param {object} [options] - CLI options specifying browser type, channel and logging. Defaults to `{}`.
 * @param {import('commander').Command} cmd - Commander command context propagated to the worker.
 *
 * @returns {Promise<void>} Resolves when the worker returns or errors are logged.
 */
const handleBrowserListAvailable = async (options = {}, cmd) => {
    logRunHeader(logger, appVersion, 'browser list-available');

    return runCommand(
        'BROWSER MAIN 10',
        () => browserListAvailable(options, cmd),
        (err) => {
            // browserListAvailable has already explained the failure - a connectivity problem
            // gets actionable advice, anything else gets its message. Repeating it here three
            // times over, stack trace included, is what made an offline run unreadable
            // (issue #785). The stack stays available at debug level.
            logger.error('Could not list available browsers.');
            logger.debug(err?.stack ?? String(err));
        }
    );
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
            new Option('--log-level, --loglevel <level>', 'Log level')
                .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                .default('info')
                .env('BSI_BROWSER_LA_LOG_LEVEL')
        )
        .addOption(
            // Chrome only; see the note on the same option in install.js.
            new Option(
                '--browser <browser>',
                'Browser to list available versions for. Only "chrome" is supported. Use "butler-sheet-icons browser install" to install one of the listed builds.'
            )
                .choices(['chrome'])
                .default('chrome')
                .env('BSI_BROWSER_LA_BROWSER')
        )
        .addOption(
            new Option(
                '--channel <channel>',
                "Which of the browser's release channel versions should be listed?"
            )
                .choices(['stable', 'beta', 'dev', 'canary'])
                .default('stable')
                .env('BSI_BROWSER_LA_CHANNEL')
        );

    return command;
};

export { buildBrowserListAvailableCommand, handleBrowserListAvailable };
