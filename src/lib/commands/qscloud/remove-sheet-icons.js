import { Command, Option } from 'commander';
import { logger, appVersion } from '../../../globals.js';
import { qscloudRemoveSheetIcons } from '../../cloud/cloud-remove-sheet-icons.js';

/**
 * Commander action that removes sheet icons from specified Qlik Sense Cloud apps.
 *
 * @param {object} [options={}] - Options describing tenant, authentication and app selection.
 * @param {import('commander').Command} cmd - Commander command reference for worker logging.
 *
 * @returns {Promise<void>} Resolves once the worker reports success or the error is logged.
 */
const handleCloudRemoveSheetIcons = async (options = {}, cmd) => {
    logger.info(`App version: ${appVersion}`);

    try {
        const res = await qscloudRemoveSheetIcons(options, cmd);
        logger.debug(`Call to qscloudRemoveSheetIcons succeeded: ${res}`);
    } catch (err) {
        logger.error(`CLOUD MAIN 5: ${err}`);
        if (err.message) {
            logger.error(`CLOUD MAIN 5 (message): ${err.message}`);
        }
        if (err.stack) {
            logger.error(`CLOUD MAIN 5 (stack): ${err.stack}`);
        }
    }
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
            new Option('--loglevel, --log-level <level>', 'Log level')
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
            new Option('--appid <id>', 'Qlik Sense app whose sheet icons should be modified.').env(
                'BSI_QSCLOUD_RSI_APPID'
            )
        )
        .addOption(
            new Option(
                '--collectionid <id>',
                'Used to control which Sense apps should have their sheets updated with new icons. All apps in this collection will be updated'
            )
                .default('')
                .env('BSI_QSCLOUD_RSI_COLLECTIONID')
        );

    return command;
};

export { buildCloudRemoveSheetIconsCommand, handleCloudRemoveSheetIcons };
