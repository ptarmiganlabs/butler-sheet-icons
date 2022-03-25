const { Command, Option } = require('commander');
const { logger, appVersion } = require('./globals');

const { qseowCreateThumbnails } = require('./lib/qseow/qseow-create-thumbnails');
const { qscloudCreateThumbnails } = require('./lib/cloud/cloud-create-thumbnails');
const { qscloudListCollections } = require('./lib/cloud/cloud-collections');
const { qscloudRemoveSheetIcons } = require('./lib/cloud/cloud-remove-sheet-icons');

const program = new Command();

/**
 * Top level async function.
 * Workaround to deal with the fact that Node.js doesn't currently support top level async functions.
 */
(async () => {
    // Basic app info
    program
        .version(appVersion)
        .name('butler-sheet-icons')
        .description(
            'This is a tool that creates thumbnail images based on the actual layout of sheets in Qlik Sense applications.\nQlik Sense Cloud and Qlik Sense Enterprise on Windows are both supported.\nThe created thumbnails are saved to disk and uploaded to the Sense app as new sheet thumbnail images.'
        );

    const qseow = program.command('qseow');
    qseow
        .command('create-sheet-thumbnails')
        .description(
            'Create thumbnail images based on the layout of each sheet in Qlik Sense Enterprise on Windows (QSEoW) applications.\nMultiple apps can be updated with a single command, using a Qlik Sense tag to identify  which apps will be updated.'
        )
        .action(async (options, command) => {
            logger.verbose(`appid=${options.appid}`);
            logger.verbose(`itemid=${options.itemid}`);
            try {
                const res = await qseowCreateThumbnails(options, command);
                logger.debug(`Call to qseowCreateThumbnails succeeded: ${res}`);
            } catch (err) {
                logger.error(`MAIN qseow: ${err}`);
            }
        })
        .requiredOption(
            '--loglevel <level>',
            'log level (error, warning, info, verbose, debug, silly)',
            'info'
        )
        .requiredOption('--host <host>', 'Qlik Sense server IP/FQDN')
        .requiredOption('--engineport <port>', 'Qlik Sense server engine port', '4747')
        .requiredOption(
            '--qrsport <port>',
            'Qlik Sense server repository service (QRS) port',
            '4242'
        )
        .option(
            '--port <port>',
            'Qlik Sense http/https port. 443 is default for https, 80 for http'
        )
        .requiredOption('--schemaversion <string>', 'Qlik Sense engine schema version', '12.612.0')
        .requiredOption(
            '--appid <id>',
            'Qlik Sense app whose sheet icons should be modified. Ignored if --qliksensetag is specified',
            ''
        )
        .requiredOption(
            '--certfile <file>',
            'Qlik Sense certificate file (exported from QMC)',
            './cert/client.pem'
        )
        .requiredOption(
            '--certkeyfile <file>',
            'Qlik Sense certificate key file (exported from QMC)',
            './cert/client_key.pem'
        )
        .requiredOption(
            '--rejectUnauthorized <true|false>',
            'Ignore warnings when Sense certificate does not match the --host paramater',
            false
        )
        .requiredOption('--prefix <prefix>', 'Qlik Sense virtual proxy prefix', '')
        .requiredOption(
            '--secure <true|false>',
            'connection to Qlik Sense engine is via https',
            true
        )
        .requiredOption(
            '--apiuserdir <directory>',
            'user directory for user to connect with when using Sense APIs'
        )
        .requiredOption(
            '--apiuserid <userid>',
            'user ID for user to connect with when using Sense APIs'
        )
        .requiredOption(
            '--logonuserdir <directory>',
            'user directory for user to connect with when logging into web UI'
        )
        .requiredOption(
            '--logonuserid <userid>',
            'user ID for user to connect with when logging into web UI'
        )
        .requiredOption('--logonpwd <password>', 'password for user to connect with')
        .requiredOption(
            '--headless <true|false>',
            'headless (=not visible) browser (true, false)',
            true
        )
        .requiredOption(
            '--pagewait <seconds>',
            'number of seconds to wait after moving to a new sheet. Set this high enough so the sheet has time to render properly',
            5
        )
        .requiredOption(
            '--imagedir <directory>',
            'directory in which thumbnail images will be stored. Relative or absolute path',
            './img'
        )
        .requiredOption(
            '--contentlibrary <library-name>',
            'Qlik Sense content library to which thumbnails will be uploaded',
            'Butler sheet thumbnails'
        )
        .requiredOption(
            '--includesheetpart <value>',
            'which part of sheets should be used to take screenshots. 1=object area only, 2=1 + sheet title, 3=2 + selection bar, 4=3 + menu bar',
            '1'
        )
        .option(
            '--qliksensetag <value>',
            'Used to control which Sense apps should have their sheets updated with new icons. All apps with this tag will be updated. If this parameter is specified the --appid parameter will be ignored',
            ''
        )
        .option(
            '--exclude-sheet-tag <value>',
            'Sheets with this tag set will be excluded from sheet icon update.'
        )
        .option(
            '--exclude-sheet-number <number...>',
            'Sheet numbers (1=first sheet in an app) that will be excluded from sheet icon update.'
        )
        .option(
            '--exclude-sheet-title <title...>',
            'Use sheet titles to control which sheets that will be excluded from sheet icon update.'
        );

    // ---------
    qseow
        .command('remove-sheet-icons')
        .description('Remove all sheet icons from a Qlik Sense Enterprise on Windows (QSEoW) app.')
        .action(async (options, command) => {
            try {
                const res = await qseowRemoveSheetIcons(options, command);
                logger.debug(`Call to qseowRemoveSheetIcons succeeded: ${res}`);
            } catch (err) {
                logger.error(`MAIN qseow: ${err}`);
            }
        })
        .requiredOption(
            '--loglevel <level>',
            'log level (error, warning, info, verbose, debug, silly)',
            'info'
        )
        .requiredOption('--host <host>', 'Qlik Sense server IP/FQDN')
        .requiredOption('--engineport <port>', 'Qlik Sense server engine port', '4747')
        .requiredOption(
            '--qrsport <port>',
            'Qlik Sense server repository service (QRS) port',
            '4242'
        )
        .requiredOption('--schemaversion <string>', 'Qlik Sense engine schema version', '12.612.0')
        .requiredOption(
            '--appid <id>',
            'Qlik Sense app whose sheet icons should be modified. Ignored if --qliksensetag is specified',
            ''
        )
        .requiredOption(
            '--certfile <file>',
            'Qlik Sense certificate file (exported from QMC)',
            './cert/client.pem'
        )
        .requiredOption(
            '--certkeyfile <file>',
            'Qlik Sense certificate key file (exported from QMC)',
            './cert/client_key.pem'
        )
        .requiredOption(
            '--secure <true|false>',
            'connection to Qlik Sense engine is via https',
            true
        )
        .requiredOption(
            '--apiuserdir <directory>',
            'user directory for user to connect with when using Sense APIs'
        )
        .requiredOption(
            '--apiuserid <userid>',
            'user ID for user to connect with when using Sense APIs'
        )
        .option(
            '--qliksensetag <value>',
            'Used to control which Sense apps should have their sheets updated with new icons. All apps with this tag will be updated. If this parameter is specified the --appid parameter will be ignored',
            ''
        );

    // ------------------
    // cloud commands
    function makeCloudCommand() {
        const cloud = new Command('qscloud');

        cloud
            .command('create-sheet-thumbnails')
            .description(
                'Create thumbnail images based on the layout of each sheet in Qlik Sense Cloud applications.\nMultiple apps can be updated with a single command, using a Qlik Sense collection to identify which apps will be updated.'
            )
            .action(async (options, command) => {
                logger.verbose(`appid=${options.appid}`);
                try {
                    const res = await qscloudCreateThumbnails(options, command);
                    logger.debug(`Call to qscloudCreateThumbnails succeeded: ${res}`);
                } catch (err) {
                    logger.error(`MAIN cloud: ${err}`);
                }
            })
            .requiredOption(
                '--loglevel <level>',
                'log level (error, warning, info, verbose, debug, silly)',
                'info'
            )
            .requiredOption(
                '--schemaversion <string>',
                'Qlik Sense engine schema version',
                '12.612.0'
            )
            .requiredOption('--tenanturl <url>', 'URL to Qlik Sense cloud tenant')
            .requiredOption('--apikey <key>', 'API key used to access the Sense APIs')
            .requiredOption(
                '--logonuserid <userid>',
                'user ID for user to connect with when logging into web UI'
            )
            .requiredOption('--logonpwd <password>', 'password for user to connect with')
            .requiredOption(
                '--headless <true|false>',
                'headless (=not visible) browser (true, false)',
                true
            )
            .requiredOption(
                '--pagewait <seconds>',
                'number of seconds to wait after moving to a new sheet. Set this high enough so the sheet has time to render properly',
                5
            )
            .requiredOption(
                '--imagedir <directory>',
                'directory in which thumbnail images will be stored. Relative or absolute path',
                './img'
            )
            .requiredOption(
                '--includesheetpart <value>',
                'which part of sheets should be used to take screenshots. 1=object area only, 2=1 + sheet title, 3 not used, 4=full screen',
                '1'
            )
            .option(
                '--appid <id>',
                'Qlik Sense app whose sheet icons should be modified. Ignored if --qliksensetag is specified'
            )
            .option(
                '--collectionid <id>',
                'Used to control which Sense apps should have their sheets updated with new icons. All apps in this collection will be updated',
                ''
            )
            .option(
                '--exclude-sheet-number <number...>',
                'Sheet numbers (1=first sheet in an app) that will be excluded from sheet icon update.'
            )
            .option(
                '--exclude-sheet-title <title...>',
                'Use sheet titles to control which sheets that will be excluded from sheet icon update.'
            );

        // ---------
        cloud
            .command('list-collections')
            .description('List available collections.')
            .action(async (options, command) => {
                logger.verbose(`collection=${options.collection}`);
                try {
                    const res = await qscloudListCollections(options, command);
                    logger.debug(`Call to qscloudListCollections succeeded: ${res}`);
                } catch (err) {
                    logger.error(`MAIN cloud: ${err}`);
                }
            })
            .requiredOption(
                '--loglevel <level>',
                'log level (error, warning, info, verbose, debug, silly)',
                'info'
            )
            .requiredOption('--tenanturl <url>', 'URL to Qlik Sense cloud tenant')
            .requiredOption('--apikey <key>', 'API key used to access the Sense APIs')
            .addOption(
                new Option('--outputformat <table|json>', 'Output format')
                    .choices(['table', 'json'])
                    .default('table')
            );

        // ---------
        cloud
            .command('remove-sheet-icons')
            .description('Remove all sheet icons from a Qlik Sense Cloud app.')
            .action(async (options, command) => {
                try {
                    const res = await qscloudRemoveSheetIcons(options, command);
                    logger.debug(`Call to qscloudRemoveSheetIcons succeeded: ${res}`);
                } catch (err) {
                    logger.error(`MAIN cloud: ${err}`);
                }
            })
            .requiredOption(
                '--loglevel <level>',
                'log level (error, warning, info, verbose, debug, silly)',
                'info'
            )
            .requiredOption(
                '--schemaversion <string>',
                'Qlik Sense engine schema version',
                '12.612.0'
            )
            .requiredOption('--tenanturl <url>', 'URL to Qlik Sense cloud tenant')
            .requiredOption('--apikey <key>', 'API key used to access the Sense APIs')
            .option(
                '--appid <id>',
                'Qlik Sense app whose sheet icons should be modified. Ignored if --qliksensetag is specified'
            )
            .option(
                '--collectionid <id>',
                'Used to control which Sense apps should have their sheets updated with new icons. All apps in this collection will be updated',
                ''
            );

        return cloud;
    }
    program.addCommand(makeCloudCommand());

    // Parse command line params
    await program.parseAsync(process.argv);
})();
