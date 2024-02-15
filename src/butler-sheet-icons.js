const { Command, Option } = require('commander');
const { logger, appVersion } = require('./globals');

const { qseowCreateThumbnails } = require('./lib/qseow/qseow-create-thumbnails');
const { qseowRemoveSheetIcons } = require('./lib/qseow/qseow-remove-sheet-icons');
const { qscloudCreateThumbnails } = require('./lib/cloud/cloud-create-thumbnails');
const { qscloudListCollections } = require('./lib/cloud/cloud-collections');
const { qscloudRemoveSheetIcons } = require('./lib/cloud/cloud-remove-sheet-icons');
const { browserInstalled } = require('./lib/browser/browser-installed');
const { browserInstall } = require('./lib/browser/browser-install');
const { browserUninstall, browserUninstallAll } = require('./lib/browser/browser-uninstall');
const { browserListAvailable } = require('./lib/browser/browser-list-available');

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
                // Set default browser version per browser
                if (!options.browserVersion || options.browserVersion === '') {
                    if (options.browser === 'chrome') {
                        // eslint-disable-next-line no-param-reassign
                        options.browserVersion = 'stable';
                    } else if (options.browser === 'firefox') {
                        // eslint-disable-next-line no-param-reassign
                        options.browserVersion = 'latest';
                    }
                }

                const res = await qseowCreateThumbnails(options, command);
                logger.debug(`Call to qseowCreateThumbnails succeeded: ${res}`);
            } catch (err) {
                logger.error(`QSEOW MAIN 1: ${err}`);
                if (err.message) {
                    logger.error(`QSEOW MAIN 1 (message): ${err.message}`);
                }
                if (err.stack) {
                    logger.error(`QSEOW MAIN 1 (stack): ${err.stack}`);
                }
            }
        })
        .addOption(
            new Option('--loglevel <level>', 'log level')
                .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                .default('info')
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
        .requiredOption('--appid <id>', 'Qlik Sense app whose sheet icons should be modified.', '')
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
            'Used to control which Sense apps should have their sheets updated with new icons. All apps with this tag will be updated.',
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
        )
        .addOption(
            new Option('--sense-version <version>', 'Version of the QSEoW server to connect to')
                .choices([
                    'pre-2022-Nov',
                    '2022-Nov',
                    '2023-Feb',
                    '2023-May',
                    '2023-Aug',
                    '2023-Nov',
                ])
                .default('2023-Nov')
        )
        .addOption(
            new Option(
                '--browser <browser>',
                'Browser to install (e.g. "chrome" or "firefox"). Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.'
            )
                .choices(['chrome', 'firefox'])
                .default('chrome')
        )
        .option(
            '--browser-version <version>',
            'Version (=build id) of the browser to install. Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.'
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
                logger.error(`QSEOW MAIN 2: ${err}`);
                if (err.message) {
                    logger.error(`QSEOW MAIN 2 (message): ${err.message}`);
                }
                if (err.stack) {
                    logger.error(`QSEOW MAIN 2 (stack): ${err.stack}`);
                }
            }
        })
        .addOption(
            new Option('--loglevel <level>', 'log level')
                .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                .default('info')
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
        .requiredOption('--appid <id>', 'Qlik Sense app whose sheet icons should be modified.', '')
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
        .option(
            '--qliksensetag <value>',
            'Used to control which Sense apps should have their sheets updated with new icons. All apps with this tag will be updated.',
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
                    // Set default browser version per browser
                    if (!options.browserVersion || options.browserVersion === '') {
                        if (options.browser === 'chrome') {
                            // eslint-disable-next-line no-param-reassign
                            options.browserVersion = 'stable';
                        } else if (options.browser === 'firefox') {
                            // eslint-disable-next-line no-param-reassign
                            options.browserVersion = 'latest';
                        }
                    }

                    const res = await qscloudCreateThumbnails(options, command);
                    logger.debug(`Call to qscloudCreateThumbnails succeeded: ${res}`);
                } catch (err) {
                    logger.error(`CLOUD MAIN 3: ${err}`);
                    if (err.message) {
                        logger.error(`CLOUD MAIN 3 (message): ${err.message}`);
                    }
                    if (err.stack) {
                        logger.error(`CLOUD MAIN 3 (stack): ${err.stack}`);
                    }
                }
            })
            .addOption(
                new Option('--loglevel <level>', 'log level')
                    .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                    .default('info')
            )
            .requiredOption(
                '--schemaversion <string>',
                'Qlik Sense engine schema version',
                '12.612.0'
            )
            .requiredOption(
                '--tenanturl <url>',
                'URL or host of Qlik Sense cloud tenant. Example: "https://tenant.eu.qlikcloud.com" or "tenant.eu.qlikcloud.com"'
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
            .requiredOption(
                '--includesheetpart <value>',
                'which part of sheets should be used to take screenshots. 1=object area only, 2=1 + sheet title, 3 not used, 4=full screen',
                '1'
            )
            .option('--appid <id>', 'Qlik Sense app whose sheet icons should be modified.')
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
            )
            .addOption(
                new Option(
                    '--browser <browser>',
                    'Browser to install (e.g. "chrome" or "firefox"). Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.'
                )
                    .choices(['chrome', 'firefox'])
                    .default('chrome')
            )
            .option(
                '--browser-version <version>',
                'Version (=build id) of the browser to install. Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.'
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
                new Option('--loglevel <level>', 'log level')
                    .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                    .default('info')
            )
            .requiredOption(
                '--tenanturl <url>',
                'URL or host of Qlik Sense cloud tenant. Example: "https://tenant.eu.qlikcloud.com" or "tenant.eu.qlikcloud.com"'
            )
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
                    logger.error(`CLOUD MAIN 5: ${err}`);
                    if (err.message) {
                        logger.error(`CLOUD MAIN 5 (message): ${err.message}`);
                    }
                    if (err.stack) {
                        logger.error(`CLOUD MAIN 5 (stack): ${err.stack}`);
                    }
                }
            })
            .addOption(
                new Option('--loglevel <level>', 'log level')
                    .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                    .default('info')
            )
            .requiredOption(
                '--schemaversion <string>',
                'Qlik Sense engine schema version',
                '12.612.0'
            )
            .requiredOption(
                '--tenanturl <url>',
                'URL or host of Qlik Sense cloud tenant. Example: "https://tenant.eu.qlikcloud.com" or "tenant.eu.qlikcloud.com"'
            )
            .requiredOption('--apikey <key>', 'API key used to access the Sense APIs')
            .option('--appid <id>', 'Qlik Sense app whose sheet icons should be modified.')
            .option(
                '--collectionid <id>',
                'Used to control which Sense apps should have their sheets updated with new icons. All apps in this collection will be updated',
                ''
            );

        return cloud;
    }

    // ------------------
    // browser commands
    function makeBrowserCommand() {
        const browser = new Command('browser');

        // "installed" sub-command
        browser
            .command('list-installed')
            .description(
                'Show which browsers are currently installed and available for use by Butler Sheet Icons.'
            )
            .action(async (options, command) => {
                logger.verbose(`appid=${options.appid}`);
                try {
                    const res = await browserInstalled(options, command);
                    logger.debug(`Call to browserInstalled succeeded: ${res}`);
                } catch (err) {
                    logger.error(`BROWSER MAIN 6: ${err}`);
                    if (err.message) {
                        logger.error(`BROWSER MAIN 6 (message): ${err.message}`);
                    }
                    if (err.stack) {
                        logger.error(`BROWSER MAIN 6 (stack): ${err.stack}`);
                    }
                }
            })
            .addOption(
                new Option('--loglevel <level>', 'log level')
                    .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                    .default('info')
            );

        // uninstall sub-command
        browser
            .command('uninstall')
            .description(
                'Uninstall a browser from the Butler Sheet Icons cache.\nThis will remove the browser from the cache, but will not affect other browsers on this computer.\nUse the "butler-sheet-icons browser list-installed" command to see which browsers are currently installed.'
            )
            .action(async (options, command) => {
                try {
                    const res = await browserUninstall(options, command);
                    logger.debug(`Call to browserUninstall succeeded: ${res}`);
                } catch (err) {
                    logger.error(`BROWSER MAIN 7: ${err}`);
                    if (err.message) {
                        logger.error(`BROWSER MAIN 7 (message): ${err.message}`);
                    }
                    if (err.stack) {
                        logger.error(`BROWSER MAIN 7 (stack): ${err.stack}`);
                    }
                }
            })
            .addOption(
                new Option('--loglevel <level>', 'log level')
                    .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                    .default('info')
            )
            .requiredOption(
                '--browser <browser>',
                'Browser to uninstall (e.g. "chrome" or "firefox"). Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.',
                'chrome'
            )
            .requiredOption(
                '--browser-version <version>',
                'Version (=build id) of the browser to uninstall. Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.'
            );

        // uninstall-all sub-command
        browser
            .command('uninstall-all')
            .description(
                'Uninstall all browsers from the Butler Sheet Icons cache.\nThis will remove all browsers from the cache, but will not affect other browsers on this computer.\nUse the "butler-sheet-icons browser list-installed" command to see which browsers are currently installed.'
            )
            .action(async (options, command) => {
                try {
                    const res = await browserUninstallAll(options, command);
                    logger.debug(`Call to browserUninstallAll succeeded: ${res}`);
                } catch (err) {
                    logger.error(`BROWSER MAIN 8: ${err}`);
                    if (err.message) {
                        logger.error(`BROWSER MAIN 8 (message): ${err.message}`);
                    }
                    if (err.stack) {
                        logger.error(`BROWSER MAIN 8 (stack): ${err.stack}`);
                    }
                }
            })
            .addOption(
                new Option('--loglevel <level>', 'log level')
                    .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                    .default('info')
            );

        // install sub-command
        browser
            .command('install')
            .description(
                'Install a browser into the Butler Sheet Icons cache.\nThis will download the browser and install it into the cache, where it can be used by Butler Sheet Icons.\nUse the "butler-sheet-icons browser list-installed" command to see which browsers are currently installed.'
            )
            .action(async (options, command) => {
                try {
                    // Set default browser version per browser
                    if (!options.browserVersion || options.browserVersion === '') {
                        if (options.browser === 'chrome') {
                            // eslint-disable-next-line no-param-reassign
                            options.browserVersion = 'stable';
                        } else if (options.browser === 'firefox') {
                            // Firefox doesn't have a "stable" channel, so use "latest"
                            // Firefox support is still experimental, so always use latest version = nightly build
                            // eslint-disable-next-line no-param-reassign
                            options.browserVersion = 'latest';
                        }
                    } else if (
                        options.browser === 'firefox' &&
                        options.browserVersion !== 'latest'
                    ) {
                        // Only "latest" is supported for Firefox.
                        // In the future we might support other/specifc versions, but for now we'll just use latest.
                        logger.error(
                            `Firefox support is still experimental, so only "latest" is supported for browser version. You specified a different version: ${options.browserVersion}.`
                        );
                        process.exit(1);
                    }

                    const res = await browserInstall(options, command);
                    logger.debug(`Call to browserInstall succeeded: ${res}`);
                } catch (err) {
                    if (err.stack) {
                        logger.error(`BROWSER MAIN 9 (stack): ${err.stack}`);
                    } else if (err.message) {
                        logger.error(`BROWSER MAIN 9 (message): ${err.message}`);
                    } else {
                        logger.error(`BROWSER MAIN 9: ${err}`);
                    }
                }
            })
            .addOption(
                new Option('--loglevel <level>', 'log level')
                    .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                    .default('info')
            )
            .addOption(
                new Option(
                    '--browser <browser>',
                    'Browser to install (e.g. "chrome" or "firefox"). Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.'
                )
                    .choices(['chrome', 'firefox'])
                    .default('chrome')
            )
            .option(
                '--browser-version <version>',
                'Version (=build id) of the browser to install. Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.'
            );

        // available sub-command
        browser
            .command('list-available')
            .description(
                'Show which browsers are available for download and installation by Butler Sheet Icons.'
            )
            .action(async (options, command) => {
                try {
                    const res = await browserListAvailable(options, command);
                    logger.debug(
                        `Call to browserAvailable succeeded: ${JSON.stringify(res, null, 2)}`
                    );
                } catch (err) {
                    logger.error(`BROWSER MAIN 10: ${err}`);
                    if (err.message) {
                        logger.error(`BROWSER MAIN 10 (message): ${err.message}`);
                    }
                    if (err.stack) {
                        logger.error(`BROWSER MAIN 10 (stack): ${err.stack}`);
                    }
                }
            })

            .addOption(
                new Option('--loglevel <level>', 'log level')
                    .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                    .default('info')
            )
            .addOption(
                new Option(
                    '--browser <browser>',
                    'Browser to install (e.g. "chrome" or "firefox"). Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.'
                )
                    .choices(['chrome', 'firefox'])
                    .default('chrome')
            )
            .addOption(
                new Option(
                    '--channel <browser>',
                    "Which of the browser's release channel versions should be listed?\n This option is only used for Chrome."
                )
                    .choices(['stable', 'beta', 'dev', 'canary'])
                    .default('stable')
            );
        return browser;
    }

    program.addCommand(makeCloudCommand());
    program.addCommand(makeBrowserCommand());

    // Parse command line params
    await program.parseAsync(process.argv);
})();
