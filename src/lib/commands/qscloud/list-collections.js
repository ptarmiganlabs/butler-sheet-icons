import { Command, Option } from 'commander';
import { logger, appVersion } from '../../../globals.js';
import { qscloudListCollections } from '../../cloud/cloud-collections.js';

const buildCloudListCollectionsCommand = () => {
    const command = new Command('list-collections');

    command
        .description('List available collections.')
        .action(async (options, cmd) => {
            logger.info(`App version: ${appVersion}`);

            logger.verbose(`collection=${options.collection}`);
            try {
                const res = await qscloudListCollections(options, cmd);
                logger.debug(`Call to qscloudListCollections succeeded: ${res}`);
            } catch (err) {
                logger.error(`CLOUD MAIN 4: ${err}`);
                if (err.message) {
                    logger.error(`CLOUD MAIN 4 (message): ${err.message}`);
                }
                if (err.stack) {
                    logger.error(`CLOUD MAIN 4 (stack): ${err.stack}`);
                }
            }
        })
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

export { buildCloudListCollectionsCommand };
