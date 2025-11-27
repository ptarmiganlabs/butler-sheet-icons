import { Command, Option, InvalidArgumentError } from 'commander';
import { logger, appVersion } from './globals.js';

import { qseowCreateThumbnails } from './lib/qseow/qseow-create-thumbnails.js';
import { qscloudCreateThumbnails } from './lib/cloud/cloud-create-thumbnails.js';
import { qscloudListCollections } from './lib/cloud/cloud-collections.js';
import { qscloudRemoveSheetIcons } from './lib/cloud/cloud-remove-sheet-icons.js';
import { browserInstalled } from './lib/browser/browser-installed.js';
import { browserUninstall, browserUninstallAll } from './lib/browser/browser-uninstall.js';
import { browserListAvailable } from './lib/browser/browser-list-available.js';

const program = new Command();

const parsePositiveInteger = (value, { min = 0, max, errorMessage, returnNumber = false } = {}) => {
    const stringValue = `${value}`.trim();
    const messageParts = [];
    if (min !== undefined) {
        messageParts.push(`>= ${min}`);
    }
    if (max !== undefined) {
        messageParts.push(`<= ${max}`);
    }
    const defaultMessage =
        errorMessage ||
        `Value must be an integer${messageParts.length ? ` ${messageParts.join(' and ')}` : ''}.`;

    if (!/^\d+$/.test(stringValue)) {
        throw new InvalidArgumentError(defaultMessage);
    }

    const parsed = Number.parseInt(stringValue, 10);

    if (
        Number.isNaN(parsed) ||
        (min !== undefined && parsed < min) ||
        (max !== undefined && parsed > max)
    ) {
        throw new InvalidArgumentError(defaultMessage);
    }

    return returnNumber ? parsed : stringValue;
};

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
        .alias('create-sheet-icons')
        .description(
            'Create thumbnail images based on the layout of each sheet in Qlik Sense Enterprise on Windows (QSEoW) applications.\nMultiple apps can be updated with a single command, using a Qlik Sense tag to identify  which apps will be updated.'
        )
        .action(async (options, command) => {
            // Show app version
            logger.info(`App version: ${appVersion}`);

            logger.verbose(`appid=${options.appid}`);
            logger.verbose(`itemid=${options.itemid}`);
            try {
                const resolvedOptions = { ...options };
                // Set default browser version per browser
                if (!resolvedOptions.browserVersion || resolvedOptions.browserVersion === '') {
                    if (resolvedOptions.browser === 'chrome') {
                        resolvedOptions.browserVersion = 'latest';
                    } else if (resolvedOptions.browser === 'firefox') {
                        resolvedOptions.browserVersion = 'latest';
                    }
                }

                const res = await qseowCreateThumbnails(resolvedOptions, command);
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
            new Option('--loglevel, --log-level <level>', 'Log level')
                .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                .default('info')
                .env('BSI_LOG_LEVEL')
        )
        .addOption(
            new Option('--host <host>', 'Qlik Sense server IP/FQDN')
                .makeOptionMandatory()
                .env('BSI_QSEOW_CST_HOST')
        )
        .addOption(
            new Option('--engineport <port>', 'Qlik Sense server engine port')
                .argParser((value) =>
                    parsePositiveInteger(value, {
                        errorMessage: 'Engine port must be a non-negative integer.',
                    })
                )
                .default('4747')
                .makeOptionMandatory()
                .env('BSI_QSEOW_CST_ENGINE_PORT')
        )
        .addOption(
            new Option('--qrsport <port>', 'Qlik Sense server repository service (QRS) port')
                .argParser((value) =>
                    parsePositiveInteger(value, {
                        errorMessage: 'QRS port must be a non-negative integer.',
                    })
                )
                .default('4242')
                .makeOptionMandatory()
                .env('BSI_QSEOW_CST_QRS_PORT')
        )
        .addOption(
            new Option(
                '--port <port>',
                'Qlik Sense http/https port. 443 is default for https, 80 for http'
            )
                .argParser((value) =>
                    parsePositiveInteger(value, {
                        errorMessage: 'Port must be a non-negative integer.',
                    })
                )
                .env('BSI_QSEOW_CST_PORT')
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
                .env('BSI_QSEOW_CST_SCHEMA_VERSION')
        )
        .addOption(
            new Option('--certfile <file>', 'Qlik Sense certificate file (exported from QMC)')
                .default('./cert/client.pem')
                .makeOptionMandatory()
                .env('BSI_QSEOW_CST_CERT_FILE')
        )
        .addOption(
            new Option(
                '--certkeyfile <file>',
                'Qlik Sense certificate key file (exported from QMC)'
            )
                .default('./cert/client_key.pem')
                .makeOptionMandatory()
                .env('BSI_QSEOW_CST_CERTKEY_FILE')
        )
        .addOption(
            new Option(
                '--rejectUnauthorized <true|false>',
                'Ignore warnings when Sense certificate does not match the --host paramater'
            )
                .default(false)
                .makeOptionMandatory()
                .env('BSI_QSEOW_CST_REJECT_UNAUTHORIZED')
        )
        .addOption(
            new Option('--secure <true|false>', 'Connection to Qlik Sense engine is via https')
                .default(true)
                .makeOptionMandatory()
                .env('BSI_QSEOW_CST_SECURE')
        )
        .addOption(
            new Option(
                '--apiuserdir <directory>',
                'User directory for user to connect with when using Sense APIs'
            )
                .makeOptionMandatory()
                .env('BSI_QSEOW_CST_API_USER_DIR')
        )
        .addOption(
            new Option(
                '--apiuserid <userid>',
                'User ID for user to connect with when using Sense APIs'
            )
                .makeOptionMandatory()
                .env('BSI_QSEOW_CST_API_USER_ID')
        )
        .addOption(
            new Option(
                '--logonuserdir <directory>',
                'User directory for user to connect with when logging into web UI'
            )
                .makeOptionMandatory()
                .env('BSI_QSEOW_CST_LOGON_USER_DIR')
        )
        .addOption(
            new Option(
                '--logonuserid <userid>',
                'User ID for user to connect with when logging into web UI'
            )
                .makeOptionMandatory()
                .env('BSI_QSEOW_CST_LOGON_USER_ID')
        )
        .addOption(
            new Option('--logonpwd <password>', 'password for user to connect with')
                .makeOptionMandatory()
                .env('BSI_QSEOW_CST_LOGON_PWD')
        )
        .addOption(
            new Option('--appid <id>', 'Qlik Sense app whose sheet icons should be modified.').env(
                'BSI_QSEOW_CST_APP_ID'
            )
        )
        .addOption(
            new Option(
                '--qliksensetag <value>',
                'Used to control which Sense apps should have their sheets updated with new icons. All apps with this tag will be updated.'
            )
                .default('')
                .env('BSI_QSEOW_CST_QLIKSENSE_TAG')
        )
        .addOption(
            new Option('--prefix <prefix>', 'Qlik Sense virtual proxy prefix')
                .default('')
                .makeOptionMandatory()
                .env('BSI_QSEOW_CST_PREFIX')
        )
        .addOption(
            new Option('--headless <true|false>', 'Headless (=not visible) browser (true, false)')
                .default(true)
                .makeOptionMandatory()
                .env('BSI_QSEOW_CST_HEADLESS')
        )
        .addOption(
            new Option(
                '--pagewait <seconds>',
                'Number of seconds to wait after moving to a new sheet. Set this high enough so the sheet has time to render properly'
            )
                .argParser((value) =>
                    parsePositiveInteger(value, {
                        errorMessage: 'Page wait must be a non-negative integer.',
                    })
                )
                .default(5)
                .makeOptionMandatory()
                .env('BSI_QSEOW_CST_PAGE_WAIT')
        )
        .addOption(
            new Option(
                '--imagedir <directory>',
                'Directory in which thumbnail images will be stored. Relative or absolute path'
            )
                .default('./img')
                .makeOptionMandatory()
                .env('BSI_QSEOW_CST_IMAGE_DIR')
        )
        .addOption(
            new Option(
                '--contentlibrary <library-name>',
                'Qlik Sense content library to which thumbnails will be uploaded'
            )
                .default('Butler sheet thumbnails')
                .makeOptionMandatory()
                .env('BSI_QSEOW_CST_CONTENT_LIBRARY')
        )
        .addOption(
            new Option(
                '--includesheetpart <value>',
                'Which part of sheets should be used to take screenshots. 1=object area only, 2=1 + sheet title, 3=2 + selection bar, 4=3 + menu bar'
            )
                .argParser((value) =>
                    parsePositiveInteger(value, {
                        errorMessage: 'Include sheet part must be a non-negative integer.',
                    })
                )
                .default('1')
                .makeOptionMandatory()
                .env('BSI_QSEOW_CST_INCLUDE_SHEET_PART')
        )
        .addOption(
            new Option(
                '--exclude-sheet-status <status...>',
                'Exclude all sheets with specified status(es)'
            )
                .choices(['private', 'published', 'public'])
                .default([])
                .env('BSI_QSEOW_CST_EXCLUDE_SHEET_STATUS')
        )
        .addOption(
            new Option(
                '--exclude-sheet-tag <value...>',
                'Sheets with one or more of these tags set will be excluded from sheet icon update.'
            ).env('BSI_QSEOW_CST_EXCLUDE_SHEET_TAG')
        )
        .addOption(
            new Option(
                '--exclude-sheet-number <number...>',
                'Sheet numbers (1=first sheet in an app) that will be excluded from sheet icon update.'
            )
                .argParser((value) =>
                    parsePositiveInteger(value, {
                        errorMessage: 'Exclude sheet number must be a non-negative integer.',
                    })
                )
                .env('BSI_QSEOW_CST_EXCLUDE_SHEET_NUMBER')
        )
        .addOption(
            new Option(
                '--exclude-sheet-title <title...>',
                'Use sheet titles to control which sheets that will be excluded from sheet icon update.'
            ).env('BSI_QSEOW_CST_EXCLUDE_SHEET_TITLE')
        )
        .addOption(
            new Option(
                '--blur-sheet-status <status...>',
                'Blur all sheets with specified status(es)'
            )
                .choices(['published', 'public'])
                .default([])
                .env('BSI_QSEOW_CST_BLUR_SHEET_STATUS')
        )
        .addOption(
            new Option(
                '--blur-sheet-tag <value>',
                'Sheets with one or more of these tags set will be blurred in the sheet icon update.'
            ).env('BSI_QSEOW_CST_BLUR_SHEET_TAG')
        )
        .addOption(
            new Option(
                '--blur-sheet-number <number...>',
                'Sheet numbers (1=first sheet in an app) that will be blurred in the sheet icon update.'
            )
                .argParser((value) =>
                    parsePositiveInteger(value, {
                        errorMessage: 'Blur sheet number must be a non-negative integer.',
                    })
                )
                .env('BSI_QSEOW_CST_BLUR_SHEET_NUMBER')
        )
        .addOption(
            new Option(
                '--blur-sheet-title <title...>',
                'Sheets with this title will be blurred in the sheet icon update.'
            ).env('BSI_QSEOW_CST_BLUR_SHEET_TITLE')
        )
        .addOption(
            new Option(
                '--blur-factor <factor>',
                'Factor to blur the sheets with. 0 = no blur, 100 = full blur.'
            )
                .argParser((value) =>
                    parsePositiveInteger(value, {
                        errorMessage: 'Blur factor must be a non-negative integer.',
                    })
                )
                .default('5')
                .env('BSI_QSEOW_CST_BLUR_FACTOR')
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
                    '2024-Feb',
                    '2024-May',
                    '2024-Nov',
                    '2025-May',
                    '2025-Nov',
                ])
                .default('2025-Nov')
                .env('BSI_QSEOW_CST_SENSE_VERSION')
        )
        .addOption(
            new Option(
                '--browser <browser>',
                'Browser to install (e.g. "chrome" or "firefox"). Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.'
            )
                .choices(['chrome', 'firefox'])
                .default('chrome')
                .env('BSI_QSEOW_CST_BROWSER')
        )
        .addOption(
            new Option(
                '--browser-version <version>',
                'Version (=build id) of the browser to install. Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.'
            )
                .default('latest')
                .env('BSI_QSEOW_CST_BROWSER_VERSION')
        )
        .addOption(
            new Option(
                '--browser-page-timeout <seconds>',
                'Timeout (seconds) for the browser to load a page. Default is 90 seconds. This is the time that the browser will wait for a page to load before giving up.'
            )
                .argParser((value) =>
                    parsePositiveInteger(value, {
                        errorMessage: 'Browser page timeout must be a non-negative integer.',
                    })
                )
                .default('90')
                .env('BSI_BROWSER_PAGE_TIMEOUT')
        );

    // ---------
    // cloud commands
    function makeCloudCommand() {
        const cloud = new Command('qscloud');

        cloud
            .command('create-sheet-thumbnails')
            .alias('create-sheet-icons')
            .description(
                'Create thumbnail images based on the layout of each sheet in Qlik Sense Cloud applications.\nMultiple apps can be updated with a single command, using a Qlik Sense collection to identify which apps will be updated.'
            )
            .action(async (options, command) => {
                // Show app version
                logger.info(`App version: ${appVersion}`);

                logger.verbose(`appid=${options.appid}`);
                try {
                    const resolvedOptions = { ...options };
                    // Set default browser version per browser
                    if (!resolvedOptions.browserVersion || resolvedOptions.browserVersion === '') {
                        if (resolvedOptions.browser === 'chrome') {
                            resolvedOptions.browserVersion = 'latest';
                        } else if (resolvedOptions.browser === 'firefox') {
                            resolvedOptions.browserVersion = 'latest';
                        }
                    }

                    const res = await qscloudCreateThumbnails(resolvedOptions, command);
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
                new Option('--loglevel, --log-level <level>', 'Log level')
                    .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                    .default('info')
                    .env('BSI_QSCLOUD_CST_LOG_LEVEL')
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
                    .env('BSI_QSCLOUD_CST_SCHEMAVERSION')
            )
            .addOption(
                new Option(
                    '--tenanturl <url>',
                    'URL or host of Qlik Sense cloud tenant. Example: "https://tenant.eu.qlikcloud.com" or "tenant.eu.qlikcloud.com"'
                )
                    .makeOptionMandatory()
                    .env('BSI_QSCLOUD_CST_TENANTURL')
            )
            .addOption(
                new Option('--apikey <key>', 'API key used to access the Sense APIs')
                    .makeOptionMandatory()
                    .env('BSI_QSCLOUD_CST_APIKEY')
            )
            .addOption(
                new Option(
                    '--skip-login',
                    'Skip QS login page, go directly to the tenant URL. Use this if you are automatically logged in to Qlik Sense'
                )
                    .default(false)
                    .makeOptionMandatory()
                    .env('BSI_QSCLOUD_CST_SKIP_LOGIN')
            )
            .addOption(
                new Option(
                    '--logonuserid <userid>',
                    'User ID for user to connect with when logging into web UI'
                )
                    .makeOptionMandatory()
                    .env('BSI_QSCLOUD_CST_LOGON_USER_ID')
            )
            .addOption(
                new Option('--logonpwd <password>', 'password for user to connect with')
                    .makeOptionMandatory()
                    .env('BSI_QSCLOUD_CST_LOGON_PWD')
            )
            .addOption(
                new Option(
                    '--headless <true|false>',
                    'Headless (=not visible) browser (true, false)'
                )
                    .default(true)
                    .makeOptionMandatory()
                    .env('BSI_QSCLOUD_CST_HEADLESS')
            )
            .addOption(
                new Option(
                    '--pagewait <seconds>',
                    'Number of seconds to wait after moving to a new sheet. Set this high enough so the sheet has time to render properly'
                )
                    .argParser((value) =>
                        parsePositiveInteger(value, {
                            errorMessage: 'Page wait must be a non-negative integer.',
                        })
                    )
                    .default(5)
                    .makeOptionMandatory()
                    .env('BSI_QSCLOUD_CST_PAGE_WAIT')
            )
            .addOption(
                new Option(
                    '--imagedir <directory>',
                    'Directory in which thumbnail images will be stored. Relative or absolute path'
                )
                    .default('./img')
                    .makeOptionMandatory()
                    .env('BSI_QSCLOUD_CST_IMAGE_DIR')
            )
            .addOption(
                new Option(
                    '--includesheetpart <value>',
                    'Which part of sheets should be used to take screenshots. 1=object area only, 2=1 + sheet title, 3 not used, 4=full screen'
                )
                    .argParser((value) =>
                        parsePositiveInteger(value, {
                            errorMessage: 'Include sheet part must be a non-negative integer.',
                        })
                    )
                    .choices(['1', '2', '4'])
                    .default('1')
                    .makeOptionMandatory()
                    .env('BSI_QSCLOUD_CST_INCLUDE_SHEET_PART')
            )
            .addOption(
                new Option(
                    '--appid <id>',
                    'Qlik Sense app whose sheet icons should be modified.'
                ).env('BSI_QSCLOUD_CST_APP_ID')
            )
            .addOption(
                new Option(
                    '--collectionid <id>',
                    'Used to control which Sense apps should have their sheets updated with new icons. All apps in this collection will be updated'
                )
                    .default('')
                    .env('BSI_QSCLOUD_CST_COLLECTION_ID')
            )
            .addOption(
                new Option(
                    '--exclude-sheet-status <status...>',
                    'Exclude all sheets with specified status(es)'
                )
                    .choices(['private', 'published', 'public'])
                    .default([])
                    .env('BSI_QSCLOUD_CST_EXCLUDE_SHEET_STATUS')
            )
            .addOption(
                new Option(
                    '--exclude-sheet-tag <value...>',
                    'Sheets with one or more of these tags set will be excluded from sheet icon update.'
                ).env('BSI_QSCLOUD_CST_EXCLUDE_SHEET_TAG')
            )
            .addOption(
                new Option(
                    '--exclude-sheet-number <number...>',
                    'Sheet numbers (1=first sheet in an app) that will be excluded from sheet icon update.'
                )
                    .argParser((value) =>
                        parsePositiveInteger(value, {
                            errorMessage: 'Exclude sheet number must be a non-negative integer.',
                        })
                    )
                    .env('BSI_QSCLOUD_CST_EXCLUDE_SHEET_NUMBER')
            )
            .addOption(
                new Option(
                    '--exclude-sheet-title <title...>',
                    'Use sheet titles to control which sheets that will be excluded from sheet icon update.'
                ).env('BSI_QSCLOUD_CST_EXCLUDE_SHEET_TITLE')
            )
            .addOption(
                new Option(
                    '--blur-sheet-status <status...>',
                    'Blur all sheets with specified status(es)'
                )
                    .choices(['published', 'public'])
                    .default([])
                    .env('BSI_QSCLOUD_CST_BLUR_SHEET_STATUS')
            )
            .addOption(
                new Option(
                    '--blur-sheet-tag <value>',
                    'Sheets with one or more of these tags set will be blurred in the sheet icon update.'
                ).env('BSI_QSCLOUD_CST_BLUR_SHEET_TAG')
            )
            .addOption(
                new Option(
                    '--blur-sheet-number <number...>',
                    'Sheet numbers (1=first sheet in an app) that will be blurred in the sheet icon update.'
                )
                    .argParser((value) =>
                        parsePositiveInteger(value, {
                            errorMessage: 'Blur sheet number must be a non-negative integer.',
                        })
                    )
                    .env('BSI_QSCLOUD_CST_BLUR_SHEET_NUMBER')
            )
            .addOption(
                new Option(
                    '--blur-sheet-title <title...>',
                    'Sheets with this title will be blurred in the sheet icon update.'
                ).env('BSI_QSCLOUD_CST_BLUR_SHEET_TITLE')
            )
            .addOption(
                new Option(
                    '--blur-factor <factor>',
                    'Factor to blur the sheets with. 0 = no blur, 100 = full blur.'
                )
                    .argParser((value) =>
                        parsePositiveInteger(value, {
                            errorMessage: 'Blur factor must be a non-negative integer.',
                        })
                    )
                    .default('5')
                    .env('BSI_QSCLOUD_CST_BLUR_FACTOR')
            )
            .addOption(
                new Option(
                    '--browser <browser>',
                    'Browser to install (e.g. "chrome" or "firefox"). Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.'
                )
                    .choices(['chrome', 'firefox'])
                    .default('chrome')
                    .env('BSI_QSCLOUD_CST_BROWSER')
            )
            .addOption(
                new Option(
                    '--browser-version <version>',
                    'Version (=build id) of the browser to install. Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.'
                )
                    .default('latest')
                    .env('BSI_QSCLOUD_CST_BROWSER_VERSION')
            )
            .addOption(
                new Option(
                    '--browser-page-timeout <seconds>',
                    'Timeout (seconds) for the browser to load a page. Default is 90 seconds. This is the time that the browser will wait for a page to load before giving up.'
                )
                    .argParser((value) =>
                        parsePositiveInteger(value, {
                            errorMessage: 'Browser page timeout must be a non-negative integer.',
                        })
                    )
                    .default('90')
                    .env('BSI_BROWSER_PAGE_TIMEOUT')
            );

        // ---------
        cloud
            .command('list-collections')
            .description('List available collections.')
            .action(async (options, command) => {
                // Show app version
                logger.info(`App version: ${appVersion}`);

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

        // ---------
        cloud
            .command('remove-sheet-icons')
            .alias('remove-sheet-thumbnails')
            .description('Remove all sheet icons from a Qlik Sense Cloud app.')
            .action(async (options, command) => {
                // Show app version
                logger.info(`App version: ${appVersion}`);

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
                new Option(
                    '--appid <id>',
                    'Qlik Sense app whose sheet icons should be modified.'
                ).env('BSI_QSCLOUD_RSI_APPID')
            )
            .addOption(
                new Option(
                    '--collectionid <id>',
                    'Used to control which Sense apps should have their sheets updated with new icons. All apps in this collection will be updated'
                )
                    .default('')
                    .env('BSI_QSCLOUD_RSI_COLLECTIONID')
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
                // Show app version
                logger.info(`App version: ${appVersion}`);

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
                new Option('--loglevel, --log-level <level>', 'Log level')
                    .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                    .default('info')
                    .env('BSI_BROWSER_LI_LOG_LEVEL')
            );

        // uninstall sub-command
        browser
            .command('uninstall')
            .description(
                'Uninstall a browser from the Butler Sheet Icons cache.\nThis will remove the browser from the cache, but will not affect other browsers on this computer.\nUse the "butler-sheet-icons browser list-installed" command to see which browsers are currently installed.'
            )
            .action(async (options, command) => {
                // Show app version
                logger.info(`App version: ${appVersion}`);

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
                new Option('--loglevel, --log-level <level>', 'Log level')
                    .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                    .default('info')
                    .env('BSI_BROWSER_UI_LOG_LEVEL')
            )
            .addOption(
                new Option(
                    '--browser <browser>',
                    'Browser to uninstall (e.g. "chrome" or "firefox"). Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.'
                )
                    .default('chrome')
                    .makeOptionMandatory()
                    .env('BSI_BROWSER_UI_BROWSER')
            )
            .addOption(
                new Option(
                    '--browser-version <version>',
                    'Version (=build id) of the browser to uninstall. Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.'
                )
                    .makeOptionMandatory()
                    .env('BSI_BROWSER_UI_BROWSER_VERSION')
            );

        // uninstall-all sub-command
        browser
            .command('uninstall-all')
            .description(
                'Uninstall all browsers from the Butler Sheet Icons cache.\nThis will remove all browsers from the cache, but will not affect other browsers on this computer.\nUse the "butler-sheet-icons browser list-installed" command to see which browsers are currently installed.'
            )
            .action(async (options, command) => {
                // Show app version
                logger.info(`App version: ${appVersion}`);

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
                new Option('--loglevel, --log-level <level>', 'Log level')
                    .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                    .default('info')
                    .env('BS_BROWSER_UIA_LOG_LEVEL')
            );

        // install sub-command
        browser
            .command('install')
            .description(
                'Install a browser into the Butler Sheet Icons cache.\nThis will download the browser and install it into the cache, where it can be used by Butler Sheet Icons.\nUse the "butler-sheet-icons browser list-installed" command to see which browsers are currently installed.'
            )
            .action(async (options, command) => {
                // Show app version
                logger.info(`App version: ${appVersion}`);

                try {
                    // Set default browser version per browser
                    if (!options.browserVersion || options.browserVersion === '') {
                        if (options.browser === 'chrome') {
                            options.browserVersion = 'stable';
                        } else if (options.browser === 'firefox') {
                            // Firefox doesn't have a "stable" channel, so use "latest"
                            // Firefox support is still experimental, so always use latest version = nightly build
                            options.browserVersion = 'latest';
                        }
                    }
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
                new Option('--loglevel, --log-level <level>', 'Log level')
                    .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                    .default('info')
                    .env('BSI_BROWSER_I_LOG_LEVEL')
            )
            .addOption(
                new Option(
                    '--browser <browser>',
                    'Browser to install (e.g. "chrome" or "firefox"). Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.'
                )
                    .choices(['chrome', 'firefox'])
                    .default('chrome')
                    .env('BSI_BROWSER_I_BROWSER')
            )
            .addOption(
                new Option(
                    '--browser-version <version>',
                    'Version (=build id) of the browser to install. Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.'
                )
                    .default('latest')
                    .env('BSI_BROWSER_I_BROWSER_VERSION')
            );

        // available sub-command
        browser
            .command('list-available')
            .description(
                'Show which browsers are available for download and installation by Butler Sheet Icons.'
            )
            .action(async (options, command) => {
                // Show app version
                logger.info(`App version: ${appVersion}`);

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
                new Option('--loglevel, --log-level <level>', 'Log level')
                    .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                    .default('info')
                    .env('BSI_BROWSER_LA_LOG_LEVEL')
            )
            .addOption(
                new Option(
                    '--browser <browser>',
                    'Browser to install (e.g. "chrome" or "firefox"). Use "butler-sheet-icons browser list-installed" to see which browsers are currently installed.'
                )
                    .choices(['chrome', 'firefox'])
                    .default('chrome')
                    .env('BSI_BROWSER_LA_BROWSER')
            )
            .addOption(
                new Option(
                    '--channel <browser>',
                    "Which of the browser's release channel versions should be listed?\n This option is only used for Chrome."
                )
                    .choices(['stable', 'beta', 'dev', 'canary'])
                    .default('stable')
                    .env('BSI_BROWSER_LA_CHANNEL')
            );
        return browser;
    }

    program.addCommand(makeCloudCommand());
    program.addCommand(makeBrowserCommand());

    // Parse command line params
    await program.parseAsync(process.argv);
})();
