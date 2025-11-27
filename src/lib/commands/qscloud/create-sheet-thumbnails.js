import { Command, Option } from 'commander';
import { logger, appVersion } from '../../../globals.js';
import { qscloudCreateThumbnails } from '../../cloud/cloud-create-thumbnails.js';
import { parsePositiveInteger } from '../helpers.js';

const buildCloudCreateSheetThumbnailsCommand = () => {
    const command = new Command('create-sheet-thumbnails');

    command
        .alias('create-sheet-icons')
        .description(
            'Create thumbnail images based on the layout of each sheet in Qlik Sense Cloud applications.\nMultiple apps can be updated with a single command, using a Qlik Sense collection to identify which apps will be updated.'
        )
        .action(async (options, cmd) => {
            logger.info(`App version: ${appVersion}`);

            logger.verbose(`appid=${options.appid}`);
            try {
                const resolvedOptions = { ...options };
                if (!resolvedOptions.browserVersion || resolvedOptions.browserVersion === '') {
                    if (resolvedOptions.browser === 'chrome') {
                        resolvedOptions.browserVersion = 'latest';
                    } else if (resolvedOptions.browser === 'firefox') {
                        resolvedOptions.browserVersion = 'latest';
                    }
                }

                const res = await qscloudCreateThumbnails(resolvedOptions, cmd);
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
            new Option('--headless <true|false>', 'Headless (=not visible) browser (true, false)')
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
            new Option('--appid <id>', 'Qlik Sense app whose sheet icons should be modified.').env(
                'BSI_QSCLOUD_CST_APP_ID'
            )
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

    return command;
};

export { buildCloudCreateSheetThumbnailsCommand };
