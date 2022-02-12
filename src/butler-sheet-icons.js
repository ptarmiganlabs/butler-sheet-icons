const { Command, Option, CommanderError } = require('commander');
const { logger, appVersion } = require('./globals');

const { qseowCreateThumbnails } = require('./lib/qseow/qseow-create-thumbnails');
const { qscloudCreateThumbnails } = require('./lib/cloud/cloud-create-thumbnails');
const { qscloudListCollections } = require('./lib/cloud/cloud-collections');

const program = new Command();

/**
 * Top level async function.
 * Workaround to deal with the fact that Node.js doesn't currently support top level async functions...
 */
(async () => {
    // Basic app info
    program
        .version(appVersion)
        .name('butler-sheet-icons')
        .description(
            'This is a tool that creates thumbnail images based on the actual layout of sheets in Qlik Sense applications.\nThe created thumbnails are saved to disk and uploaded to the Sense app as new sheet thumbnail images.'
        );

    const qseow = program.command('qseow');
    qseow
        .command('create-sheet-thumbnails')
        .description(
            'Create thumbnail images based on the layout of each sheet in Qlik Sense Enterprise on Windows (QSEoW) applications.\nMultiple apps can be updated with a single command. In this case a Qlik Sense tag is used to identify which apps will be updated.'
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
        .option(
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
            '--rootcertfile <file>',
            'Qlik Sense root certificate file (exported from QMC)',
            './cert/root.pem'
        )
        .option(
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
        .requiredOption('--hosttype <type>', 'type of Qlik Sense server (qseow)', 'qseow')
        .option('--headless <true|false>', 'headless (=not visible) browser (true, false)', true)
        .option(
            '--pagewait <seconds>',
            'number of seconds to wait after moving to a new sheet. Set this high enough so the sheet has time to render properly',
            5
        )
        .option(
            '--imagedir <directory>',
            'directory in which thumbnail images will be stored. Relative or absolute path',
            './img'
        )
        .requiredOption(
            '--contentlibrary <library-name>',
            'Qlik Sense content library to which thumbnails will be uploaded',
            'Butler sheet thumbnails'
        )
        .option(
            '--includesheetpart <value>',
            'which part of sheets should be use to take screenshots. 1=object area only, 2=1 + sheet title, 3=2 + selection bar, 4=3 + menu bar',
            '1'
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
                'Create thumbnail images based on the layout of each sheet in Qlik Sense Cloud applications.\nMultiple apps can be updated with a single command. In this case a Qlik Sense collection is used to identify which apps will be updated.'
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
            .option(
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
            .option(
                '--appid <id>',
                'Qlik Sense app whose sheet icons should be modified. Ignored if --qliksensetag is specified'
            )
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
            .option(
                '--includesheetpart <value>',
                'which part of sheets should be use to take screenshots. 1=object area only, 2=1 + sheet title, 3=2 + selection bar, 4=3 + menu bar',
                '1'
            )
            .option(
                '--collectionid <id>',
                'Used to control which Sense apps should have their sheets updated with new icons. All apps in this collection will be updated. If this parameter is specified the --appid parameter will be ignored',
                ''
            )
            .option(
                '--qliksensetag <value>',
                'Used to control which Sense apps should have their sheets updated with new icons. All apps with this tag will be updated. If this parameter is specified the --appid parameter will be ignored',
                ''
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
            .option(
                '--loglevel <level>',
                'log level (error, warning, info, verbose, debug, silly)',
                'info'
            )
            .requiredOption('--tenanturl <url>', 'URL to Qlik Sense cloud tenant')
            .requiredOption('--apikey <key>', 'API key used to access the Sense APIs');

        return cloud;
    }
    program.addCommand(makeCloudCommand());

    // Parse command line params
    await program.parseAsync(process.argv);
})();
