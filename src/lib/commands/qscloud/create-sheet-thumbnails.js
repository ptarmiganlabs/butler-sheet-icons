import { Command, Option } from 'commander';
import { logger, setLoggingLevel } from '../../../globals.js';
import { qscloudCreateThumbnails } from '../../cloud/cloud-create-thumbnails.js';
import { CLOUD_SHEET_PARTS } from '../../cloud/sheet-parts.js';
import {
    VERSION_RECOMMENDED,
    describeBrowserVersionOption,
    parseBrowserVersionValue,
} from '../../browser/browser-version.js';
import {
    parsePositiveInteger,
    collectPositiveIntegers,
    collectAppIds,
    buildTenantUrlOption,
    buildBrowserCacheDirOption,
    buildBrowserExecutablePathOption,
} from '../helpers.js';
import { toAppIdList } from '../../util/app-ids.js';
import { addInteractiveOption } from '../../interactive/interactive-option.js';
import { addDryRunOption } from '../dry-run-option.js';
import { runCommand } from '../run-command.js';

/**
 * Commander action for generating Qlik Sense Cloud sheet thumbnails via the worker module.
 *
 * @param {object} [options] - Parsed CLI options describing tenant, auth, browser and filtering settings. Defaults to `{}`.
 * @param {import('commander').Command} cmd - Commander command reference forwarded to the worker.
 *
 * @returns {Promise<void>} Resolves after delegating to qscloudCreateThumbnails and logging any errors.
 */
const handleCloudCreateSheetThumbnails = async (options = {}, cmd) => {
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

        return launchInteractive('CLOUD MAIN 2', 'qscloud create-sheet-thumbnails', cmd);
    }
    return runCommand('CLOUD MAIN 3', () => qscloudCreateThumbnails(options, cmd));
};

/**
 * Creates the "qscloud create-sheet-thumbnails" command complete with options and action handler.
 *
 * @returns {import('commander').Command} Configured command ready to be attached to the root CLI.
 */
const buildCloudCreateSheetThumbnailsCommand = () => {
    const command = new Command('create-sheet-thumbnails');

    command
        .alias('create-sheet-icons')
        .description(
            'Create thumbnail images based on the layout of each sheet in Qlik Sense Cloud applications.\nMultiple apps can be updated with a single command, using a Qlik Sense collection to identify which apps will be updated.'
        )
        .action(handleCloudCreateSheetThumbnails)
        .addOption(
            new Option('--log-level, --loglevel <level>', 'Log level')
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
        .addOption(buildTenantUrlOption('BSI_QSCLOUD_CST_TENANTURL'))
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
                '--capture-overview-after <true|false>',
                'Capture a second screenshot of the app overview after the thumbnails have been applied, showing the result rather than the starting state. Costs one extra browser login per app'
            )
                // Not mandatory, matching --blur-factor and --browser-page-timeout: a tuning
                // flag with a working default. specsFromCommand() reads option.mandatory to
                // decide what the interactive wizard asks about, and this is not a question a
                // guided run should have to answer.
                .default(true)
                .env('BSI_QSCLOUD_CST_CAPTURE_OVERVIEW_AFTER')
        )
        .addOption(
            new Option(
                '--includesheetpart <value>',
                'Which part of sheets should be used to take screenshots. 1=object area only, 2=1 + sheet title, 3 not used, 4=full screen'
            )
                .choices(CLOUD_SHEET_PARTS)
                .default('1')
                .makeOptionMandatory()
                .env('BSI_QSCLOUD_CST_INCLUDE_SHEET_PART')
        )
        .addOption(
            new Option(
                '--appid <id...>',
                'Qlik Sense app(s) whose sheet icons should be modified. Several ids can be given, separated by spaces or commas.\nCombines with --collectionid rather than replacing it: apps named either way are all updated, each one once.'
            )
                .argParser(collectAppIds)
                .env('BSI_QSCLOUD_CST_APP_ID')
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
                .argParser(
                    collectPositiveIntegers({
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
                '--blur-sheet-tag <value...>',
                'Sheets with one or more of these tags set will be blurred in the sheet icon update.'
            ).env('BSI_QSCLOUD_CST_BLUR_SHEET_TAG')
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
            // Chrome only: thumbnails are produced by driving the browser over the Chrome
            // DevTools Protocol with a Chromium-only argument list, so no other browser could be
            // driven here. The option is kept so that scripts naming the browser keep working.
            new Option('--browser <browser>', 'Browser used to render sheets. Chrome only.')
                .choices(['chrome'])
                .default('chrome')
                .env('BSI_QSCLOUD_CST_BROWSER')
        )
        .addOption(
            // The argParser maps a set-but-empty value onto the default: Commander lets a bare
            // `BSI_QSCLOUD_CST_BROWSER_VERSION=` line in a unit file beat .default(), and an
            // empty string must mean "unset", not an error.
            new Option('--browser-version <version>', describeBrowserVersionOption('use'))
                .default(VERSION_RECOMMENDED)
                .argParser(parseBrowserVersionValue)
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
        )
        .addOption(buildBrowserCacheDirOption())
        .addOption(buildBrowserExecutablePathOption());

    addInteractiveOption(command);
    addDryRunOption(command);

    return command;
};

export { buildCloudCreateSheetThumbnailsCommand, handleCloudCreateSheetThumbnails };
