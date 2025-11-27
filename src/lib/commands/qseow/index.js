import { Command, Option } from 'commander';
import { logger, appVersion } from '../../../globals.js';
import { qseowCreateThumbnails } from '../../qseow/qseow-create-thumbnails.js';
import { parsePositiveInteger } from '../helpers.js';

/**
 * Commander action that triggers QSEoW thumbnail creation with normalized options and error logging.
 *
 * @param {object} [options={}] - Parsed CLI options forwarded to the worker.
 * @param {import('commander').Command} command - Commander command instance for contextual metadata.
 *
 * @returns {Promise<void>} Resolves when the worker call finishes (successfully or after logging errors).
 */
const handleQseowCreateSheetThumbnails = async (options = {}, command) => {
    logger.info(`App version: ${appVersion}`);

    logger.verbose(`appid=${options.appid}`);
    logger.verbose(`itemid=${options.itemid}`);
    try {
        const resolvedOptions = { ...options };
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
};

/**
 * Builds the root "qseow" command with its create-sheet-thumbnails sub-command.
 *
 * @returns {import('commander').Command} Configured qseow command tree ready for registration.
 */
const buildQseowCommand = () => {
    const qseow = new Command('qseow');

    qseow
        .command('create-sheet-thumbnails')
        .alias('create-sheet-icons')
        .description(
            'Create thumbnail images based on the layout of each sheet in Qlik Sense Enterprise on Windows (QSEoW) applications.\nMultiple apps can be updated with a single command, using a Qlik Sense tag to identify  which apps will be updated.'
        )
        .action(handleQseowCreateSheetThumbnails)
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

    return qseow;
};

export { buildQseowCommand, handleQseowCreateSheetThumbnails };
