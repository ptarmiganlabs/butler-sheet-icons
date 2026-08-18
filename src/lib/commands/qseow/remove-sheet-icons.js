import { Command, Option } from 'commander';
import { addDryRunOption } from '../dry-run-option.js';
import { logger, setLoggingLevel } from '../../../globals.js';
import { qseowRemoveSheetIcons } from '../../qseow/qseow-remove-sheet-icons.js';
import { runCommand } from '../run-command.js';
import { collectAppIds } from '../helpers.js';
import { buildQseowConnectionOptions } from '../qseow-connection-options.js';
import { toAppIdList } from '../../util/app-ids.js';

/**
 * Commander action that removes sheet icons from specified QSEoW apps.
 *
 * The run header is emitted by the worker, not here: the wizard invokes
 * workers directly, and the header must come from the same place on both
 * paths - decided from the options the run actually uses.
 *
 * @param {object} [options] - Options describing server, authentication and app selection. Defaults to `{}`.
 * @param {import('commander').Command} cmd - Commander command reference for worker logging.
 *
 * @returns {Promise<void>} Resolves once the worker reports success or the error is logged.
 */
const handleQseowRemoveSheetIcons = async (options = {}, cmd) => {
    // Level set here as well as in the worker: any handler-level logging
    // before the worker runs must already respect a quiet run.
    if (options.loglevel) {
        setLoggingLevel(options.loglevel);
    }

    // Joined explicitly: --appid is variadic, and letting a template literal coerce the
    // array reads as one strange id rather than as several.
    logger.verbose(`appid=${toAppIdList(options.appid).join(', ')}`);

    return runCommand('QSEOW MAIN 2', () => qseowRemoveSheetIcons(options, cmd));
};

/**
 * Creates the "qseow remove-sheet-icons" command and wires it up to its handler.
 *
 * The option set is deliberately narrower than `create-sheet-thumbnails`. Removing an icon
 * clears a property over the engine session, so nothing here drives a browser: the web UI
 * logon credentials, the rendering options (`--headless`, `--pagewait`, `--imagedir`,
 * `--includesheetpart`, the exclude/blur rules) and the browser options have no effect on
 * this path and are not offered.
 *
 * @returns {import('commander').Command} Configured remove-sheet-icons command instance.
 */
const buildQseowRemoveSheetIconsCommand = () => {
    const command = new Command('remove-sheet-icons');
    const connection = buildQseowConnectionOptions('BSI_QSEOW_RSI');

    command
        .alias('remove-sheet-thumbnails')
        .description(
            'Remove all sheet icons from Qlik Sense Enterprise on Windows (QSEoW) applications.\nMultiple apps can be updated with a single command, using a Qlik Sense tag to identify which apps will be updated.'
        )
        .action(handleQseowRemoveSheetIcons)
        .addOption(
            new Option('--log-level, --loglevel <level>', 'Log level')
                .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                .default('info')
                .env('BSI_QSEOW_RSI_LOG_LEVEL')
        )
        .addOption(connection.host)
        .addOption(connection.engineport)
        .addOption(connection.qrsport)
        .addOption(connection.schemaversion)
        .addOption(connection.certfile)
        .addOption(connection.certkeyfile)
        .addOption(connection.rejectUnauthorized)
        .addOption(connection.secure)
        .addOption(connection.apiuserdir)
        .addOption(connection.apiuserid)
        .addOption(
            new Option(
                '--appid <id...>',
                'Qlik Sense app(s) whose sheet icons should be removed. Several ids can be given, separated by spaces or commas.\nCombines with --qliksensetag rather than replacing it: apps named either way are all updated, each one once.'
            )
                .argParser(collectAppIds)
                .env('BSI_QSEOW_RSI_APP_ID')
        )
        .addOption(
            new Option(
                '--qliksensetag <value>',
                'Used to control which Sense apps should have their sheet icons removed. All apps with this tag will be updated.'
            )
                .default('')
                .env('BSI_QSEOW_RSI_QLIKSENSE_TAG')
        )
        .addOption(connection.prefix);

    // After the option set is complete: the description this adds depends on
    // whether the command declares exclude/blur rules.
    addDryRunOption(command);

    return command;
};

export { buildQseowRemoveSheetIconsCommand, handleQseowRemoveSheetIcons };
