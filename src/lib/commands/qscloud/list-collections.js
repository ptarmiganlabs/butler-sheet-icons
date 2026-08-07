import { Command, Option } from 'commander';
import { logger, appVersion } from '../../../globals.js';
import { qscloudListCollections } from '../../cloud/cloud-collections.js';
import { runCommand } from '../run-command.js';

/**
 * Commander action that lists available Qlik Sense Cloud collections through the worker module.
 *
 * @param {object} [options] - CLI options containing tenant URL, API key and output format. Defaults to `{}`.
 * @param {import('commander').Command} cmd - Commander command instance propagated downstream.
 *
 * @returns {Promise<void>} Resolves after the worker completes or errors are logged.
 */
const handleCloudListCollections = async (options = {}, cmd) => {
    logger.info(`App version: ${appVersion}`);

    logger.verbose(`collection=${options.collection}`);
    return runCommand('CLOUD MAIN 4', () => qscloudListCollections(options, cmd));
};

/**
 * Builds the "qscloud list-collections" command with description, options and action handler.
 *
 * @returns {import('commander').Command} Configured list-collections command.
 */
const buildCloudListCollectionsCommand = () => {
    const command = new Command('list-collections');

    command
        .description('List available collections.')
        .action(handleCloudListCollections)
        .addOption(
            new Option('--loglevel, --log-level <level>', 'Log level')
                .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                .default('info')
                .env('BSI_QSCLOUD_LC_LOG_LEVEL')
        )
        .addOption(
            new Option(
                '--tenanturl <url>',
                'URL or host of Qlik Sense cloud tenant. Example: "https://tenant.eu.qlikcloud.com" or "tenant.eu.qlikcloud.com"'
            )
                .makeOptionMandatory()
                .env('BSI_QSCLOUD_LC_TENANTURL')
        )
        .addOption(
            new Option('--apikey <key>', 'API key used to access the Sense APIs')
                .makeOptionMandatory()
                .env('BSI_QSCLOUD_LC_APIKEY')
        )
        .addOption(
            new Option('--outputformat <table|json>', 'Output format')
                .choices(['table', 'json'])
                .default('table')
                .env('BSI_QSCLOUD_LC_OUTPUTFORMAT')
        );

    return command;
};

export { buildCloudListCollectionsCommand, handleCloudListCollections };
