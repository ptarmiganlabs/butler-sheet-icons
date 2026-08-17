import { Command, Option } from 'commander';
import { addDryRunOption } from '../dry-run-option.js';
import { appVersion, setLoggingLevel } from '../../../globals.js';
import { emitRunHeader } from '../../util/run-report.js';
import { qscloudRemoveSheetIcons } from '../../cloud/cloud-remove-sheet-icons.js';
import { runCommand } from '../run-command.js';
import { collectAppIds } from '../helpers.js';

/**
 * Commander action that removes sheet icons from specified Qlik Sense Cloud apps.
 *
 * @param {object} [options] - Options describing tenant, authentication and app selection. Defaults to `{}`.
 * @param {import('commander').Command} cmd - Commander command reference for worker logging.
 *
 * @returns {Promise<void>} Resolves once the worker reports success or the error is logged.
 */
const handleCloudRemoveSheetIcons = async (options = {}, cmd) => {
    // Level set before the header - see create-sheet-thumbnails.js for why.
    if (options.loglevel) {
        setLoggingLevel(options.loglevel);
    }
    // Rung-aware (issue #1076): on the board rung the terminal gets the
    // wordmark frame and the plain header goes to the log underneath.
    emitRunHeader({
        version: appVersion,
        jobLabel: 'Qlik Sense Cloud sheet icon removal',
        options,
    });

    return runCommand('CLOUD MAIN 5', () => qscloudRemoveSheetIcons(options, cmd));
};

/**
 * Creates the "qscloud remove-sheet-icons" command and wires it up to its handler.
 *
 * @returns {import('commander').Command} Configured remove-sheet-icons command instance.
 */
const buildCloudRemoveSheetIconsCommand = () => {
    const command = new Command('remove-sheet-icons');

    command
        .alias('remove-sheet-thumbnails')
        .description('Remove all sheet icons from a Qlik Sense Cloud app.')
        .action(handleCloudRemoveSheetIcons)
        .addOption(
            new Option('--log-level, --loglevel <level>', 'Log level')
                .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                .default('info')
                .env('BSI_QSCLOUD_RSI_LOG_LEVEL')
        )
        .addOption(
            new Option('--schemaversion <version>', 'Qlik Sense engine schema version')
                .choices([
                    '12.170.2',
                    '12.612.0',
                    '12.936.0',
                    '12.1306.0',
                    '12.1477.0',
                    '12.1657.0',
                    '12.1823.0',
                    '12.2015.0',
                ])
                .default('12.612.0')
                .env('BSI_QSCLOUD_RSI_SCHEMAVERSION')
        )
        .addOption(
            new Option(
                '--tenanturl <url>',
                'URL or host of Qlik Sense cloud tenant. Example: "https://tenant.eu.qlikcloud.com" or "tenant.eu.qlikcloud.com"'
            )
                .makeOptionMandatory()
                .env('BSI_QSCLOUD_RSI_TENANTURL')
        )
        .addOption(
            new Option('--apikey <key>', 'API key used to access the Sense APIs')
                .makeOptionMandatory()
                .env('BSI_QSCLOUD_RSI_APIKEY')
        )
        .addOption(
            new Option(
                '--appid <id...>',
                'Qlik Sense app(s) whose sheet icons should be modified. Several ids can be given, separated by spaces or commas.\nCombines with --collectionid rather than replacing it: apps named either way are all updated, each one once.'
            )
                .argParser(collectAppIds)
                .env('BSI_QSCLOUD_RSI_APPID')
        )
        .addOption(
            new Option(
                '--collectionid <id>',
                'Used to control which Sense apps should have their sheets updated with new icons. All apps in this collection will be updated'
            )
                .default('')
                .env('BSI_QSCLOUD_RSI_COLLECTIONID')
        );

    addDryRunOption(command);

    return command;
};

export { buildCloudRemoveSheetIconsCommand, handleCloudRemoveSheetIcons };
