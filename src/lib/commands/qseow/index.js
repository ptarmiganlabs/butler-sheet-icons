import { Command, Option } from 'commander';
import { logger, setLoggingLevel } from '../../../globals.js';
import { qseowCreateThumbnails } from '../../qseow/qseow-create-thumbnails.js';
import { QSEOW_SHEET_PARTS } from '../../qseow/sheet-parts.js';
import { DEFAULT_QSEOW_SENSE_VERSION, QSEOW_SENSE_VERSIONS } from '../../qseow/qseow-selectors.js';
import {
    VERSION_RECOMMENDED,
    describeBrowserVersionOption,
    parseBrowserVersionValue,
} from '../../browser/browser-version.js';
import {
    parsePositiveInteger,
    collectPositiveIntegers,
    collectAppIds,
    buildBrowserCacheDirOption,
    buildBrowserExecutablePathOption,
} from '../helpers.js';
import { toAppIdList } from '../../util/app-ids.js';
import { addInteractiveOption } from '../../interactive/interactive-option.js';
import { addDryRunOption } from '../dry-run-option.js';
import { runCommand } from '../run-command.js';
import { buildQseowConnectionOptions } from '../qseow-connection-options.js';
import { buildQseowRemoveSheetIconsCommand } from './remove-sheet-icons.js';

/**
 * Commander action that triggers QSEoW thumbnail creation with error logging.
 *
 * @param {object} [options] - Parsed CLI options forwarded to the worker. Defaults to `{}`.
 * @param {import('commander').Command} command - Commander command instance for contextual metadata.
 *
 * @returns {Promise<void>} Resolves when the worker call finishes (successfully or after logging errors).
 */
const handleQseowCreateSheetThumbnails = async (options = {}, command) => {
    // Level set before any handler-level logging: a run at --log-level warn
    // asked for a quiet log. Guarded for programmatic callers without the
    // option; the worker sets the level again, which is idempotent. The run
    // header is emitted by the worker, not here - the wizard invokes workers
    // directly, and the header must come from the same place on both paths,
    // decided from the options the run actually uses.
    if (options.loglevel) {
        setLoggingLevel(options.loglevel);
    }

    // Joined explicitly: --appid is variadic, and letting a template literal coerce the
    // array reads as one strange id rather than as several.
    logger.verbose(`appid=${toAppIdList(options.appid).join(', ')}`);

    if (options?.interactive) {
        // Loaded on demand; see the note in browser/uninstall.js for why this
        // import is not at module scope.
        const { launchInteractive } = await import('../../interactive/launch.js');

        return launchInteractive('QSEOW MAIN 1', 'qseow create-sheet-thumbnails', command);
    }

    return runCommand('QSEOW MAIN 1', () => qseowCreateThumbnails(options, command));
};

/**
 * Builds the root "qseow" command with its create-sheet-thumbnails and remove-sheet-icons
 * sub-commands.
 *
 * @returns {import('commander').Command} Configured qseow command tree ready for registration.
 */
const buildQseowCommand = () => {
    const qseow = new Command('qseow');
    const connection = buildQseowConnectionOptions('BSI_QSEOW_CST');

    const createSheetThumbnails = qseow
        .command('create-sheet-thumbnails')
        .alias('create-sheet-icons')
        .description(
            'Create thumbnail images based on the layout of each sheet in Qlik Sense Enterprise on Windows (QSEoW) applications.\nMultiple apps can be updated with a single command, using a Qlik Sense tag to identify  which apps will be updated.'
        )
        .action(handleQseowCreateSheetThumbnails)
        .addOption(
            new Option('--log-level, --loglevel <level>', 'Log level')
                .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                .default('info')
                .env('BSI_LOG_LEVEL')
        )
        .addOption(connection.host)
        .addOption(connection.engineport)
        .addOption(connection.qrsport)
        .addOption(
            // Only this command opens the web UI, so only this command needs
            // the hub's http/https port.
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
        .addOption(connection.schemaversion)
        .addOption(connection.certfile)
        .addOption(connection.certkeyfile)
        .addOption(connection.rejectUnauthorized)
        .addOption(connection.secure)
        .addOption(connection.apiuserdir)
        .addOption(connection.apiuserid)
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
            new Option(
                '--appid <id...>',
                'Qlik Sense app(s) whose sheet icons should be modified. Several ids can be given, separated by spaces or commas.\nCombines with --qliksensetag rather than replacing it: apps named either way are all updated, each one once.'
            )
                .argParser(collectAppIds)
                .env('BSI_QSEOW_CST_APP_ID')
        )
        .addOption(
            new Option(
                '--qliksensetag <value>',
                'Used to control which Sense apps should have their sheets updated with new icons. All apps with this tag will be updated.'
            )
                .default('')
                .env('BSI_QSEOW_CST_QLIKSENSE_TAG')
        )
        .addOption(connection.prefix)
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
                .choices(QSEOW_SHEET_PARTS)
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
                .argParser(
                    collectPositiveIntegers({
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
                '--blur-sheet-tag <value...>',
                'Sheets with one or more of these tags set will be blurred in the sheet icon update.'
            ).env('BSI_QSEOW_CST_BLUR_SHEET_TAG')
        )
        .addOption(
            new Option(
                '--blur-sheet-number <number...>',
                'Sheet numbers (1=first sheet in an app) that will be blurred in the sheet icon update.'
            )
                .argParser(
                    collectPositiveIntegers({
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
                .choices(QSEOW_SENSE_VERSIONS)
                .default(DEFAULT_QSEOW_SENSE_VERSION)
                .env('BSI_QSEOW_CST_SENSE_VERSION')
        )
        .addOption(
            // Chrome only: thumbnails are produced by driving the browser over the Chrome
            // DevTools Protocol with a Chromium-only argument list, so no other browser could be
            // driven here. The option is kept so that scripts naming the browser keep working.
            new Option('--browser <browser>', 'Browser used to render sheets. Chrome only.')
                .choices(['chrome'])
                .default('chrome')
                .env('BSI_QSEOW_CST_BROWSER')
        )
        .addOption(
            // The argParser maps a set-but-empty value onto the default: Commander lets a bare
            // `BSI_QSEOW_CST_BROWSER_VERSION=` line in a unit file beat .default(), and an
            // empty string must mean "unset", not an error.
            new Option('--browser-version <version>', describeBrowserVersionOption('use'))
                .default(VERSION_RECOMMENDED)
                .argParser(parseBrowserVersionValue)
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
        )
        .addOption(buildBrowserCacheDirOption())
        .addOption(buildBrowserExecutablePathOption());

    // Bound to the command itself rather than to qseow.commands[0]: the positional index
    // silently tracks registration order, which now has a second sub-command in it.
    addInteractiveOption(createSheetThumbnails);
    addDryRunOption(createSheetThumbnails);

    qseow.addCommand(buildQseowRemoveSheetIconsCommand());

    return qseow;
};

export { buildQseowCommand, handleQseowCreateSheetThumbnails };
