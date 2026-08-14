import { Command, Option } from 'commander';
import { logger, appVersion } from '../../../globals.js';
import { browserCheck } from '../../browser/browser-check.js';
import {
    VERSION_RECOMMENDED,
    describeBrowserVersionOption,
    parseBrowserVersionValue,
} from '../../browser/browser-version.js';
import { runCommand } from '../run-command.js';
import { buildBrowserCacheDirOption, buildBrowserExecutablePathOption } from '../helpers.js';
import { booleanOptionParser } from '../../util/boolean-option.js';

/**
 * Commander action that checks whether this machine can take screenshots.
 *
 * **The exit code is the point.** `browser check` is meant to be a gate in a deployment script on
 * a Sense server, so the outcome has to reach the shell: `0` when a browser was found and, unless
 * `--skip-launch`, launched; `1` when it was not, or the launch failed.
 *
 * That is expressed by returning `ok` from inside `runCommand`, which is the repo's single place
 * for turning a command's verdict into `process.exitCode`. Three properties of that route matter,
 * and none of them are incidental:
 *
 * - It sets `process.exitCode` rather than calling `process.exit()`, so winston flushes the report
 *   that explains the exit code. A hard exit would truncate it.
 * - It sets it here, in the handler. The worker returns data and never touches process state,
 *   which is what lets the same worker back a future `doctor check` and a `--output json` mode.
 * - A thrown worker is reported as a failure too, rather than escaping to the top-level
 *   `uncaughtException` handler and being written out as a crash dump. A machine without a browser
 *   is an operational finding, not a crash.
 *
 * @param {object} [options] - CLI options describing the browser, cache directory and launch
 * behaviour. Defaults to `{}`. Commander passes its own `Command` as a second argument, which
 * this handler has no use for - the worker takes only the options bag.
 *
 * @returns {Promise<boolean>} Whether the machine passed.
 */
const handleBrowserCheck = async (options = {}) => {
    logger.info(`App version: ${appVersion}`);

    return runCommand('BROWSER MAIN 11', async () => {
        const report = await browserCheck(options);

        // The worker has already printed the report, including the reason for a failure and the
        // steps that fix it. Returning `ok` is all runCommand needs to set the exit code.
        return report.ok;
    });
};

/**
 * Builds the "browser check" command.
 *
 * Every option here changes which browser a real run would pick, or how it would be started. A
 * doctor that reports OK under different settings than the run it is meant to predict is worse
 * than no doctor, which is why `--browser-cache-dir`, `--browser-executable-path` and `--headless`
 * are all carried rather than left to their defaults.
 *
 * No `-i`: there is nothing to ask. Recorded in `NOT_INTERACTIVE` in the interactive registry,
 * which is where a command with no wizard has to declare itself.
 *
 * @returns {import('commander').Command} Configured check command.
 */
const buildBrowserCheckCommand = () => {
    const command = new Command('check');

    command
        .description(
            'Check whether this machine can take sheet screenshots, without contacting Qlik Sense.\nReports where the browser cache is, which cached browsers can run here, which browser a real run would use, and whether it starts.\nMakes no network requests, and exits 1 when a real run would fail on this machine - so it can be used as a gate in a deployment script.'
        )
        .action(handleBrowserCheck)
        .addOption(
            new Option('--log-level, --loglevel <level>', 'Log level')
                .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                .default('info')
                .env('BSI_BROWSER_C_LOG_LEVEL')
        )
        .addOption(
            // Chrome only: the render path speaks the Chrome DevTools Protocol. The option is
            // carried so the check accepts the same command line the other browser commands do.
            new Option('--browser <browser>', 'Browser to check for. Only "chrome" is supported.')
                .choices(['chrome'])
                .default('chrome')
                .env('BSI_BROWSER_C_BROWSER')
        )
        .addOption(
            // Same `'' -> recommended` normalisation the other browser commands apply, so a bare
            // `BSI_BROWSER_C_BROWSER_VERSION=` line in a unit file means "unset" rather than an
            // error - and so the check cannot report OK under different pin semantics than a real
            // run would use.
            new Option('--browser-version <version>', describeBrowserVersionOption('check for'))
                .default(VERSION_RECOMMENDED)
                .argParser(parseBrowserVersionValue)
                .env('BSI_BROWSER_C_BROWSER_VERSION')
        )
        .addOption(buildBrowserCacheDirOption())
        .addOption(buildBrowserExecutablePathOption())
        .addOption(
            // A headed launch on a display-less server is a genuinely different test from a
            // headless one, which is what earns this option its place on a diagnostic.
            // Parsed here rather than left to `parseHeadlessOption` at the point of use. That
            // helper accepts only the exact strings 'true'/'false' and quietly returns `true` for
            // everything else, so `--headless off` and `BSI_BROWSER_C_HEADLESS=0` ran headless -
            // a false negative in the one option whose stated purpose is to catch a
            // headless-only failure. An empty value means unset, and unset here is the default.
            new Option('--headless <true|false>', 'Headless (=not visible) browser (true, false)')
                .default(true)
                .argParser(booleanOptionParser({ whenEmpty: true }))
                .env('BSI_BROWSER_C_HEADLESS')
        )
        .addOption(
            // The argument is optional, not absent, and that is load-bearing. Declared as a bare
            // flag, Commander sets it from the mere *presence* of BSI_BROWSER_C_SKIP_LAUNCH and
            // never reads the value - so `BSI_BROWSER_C_SKIP_LAUNCH=false` turned skip-launch on,
            // and the deployment gate passed having never started a browser. With an optional
            // argument the value reaches `argParser`, which Commander also runs on environment
            // values, so `--skip-launch false` and `BSI_BROWSER_C_SKIP_LAUNCH=false` agree.
            //
            // Bare `--skip-launch` still means true: Commander stores boolean `true` for an
            // optional-argument option supplied without a value, and the parser passes booleans
            // through untouched.
            new Option(
                '--skip-launch [true|false]',
                'Find a browser but do not start it. Faster, and useful where starting a browser is not allowed - but it leaves the most valuable part of the check undone.'
            )
                .default(false)
                .argParser(booleanOptionParser({ whenEmpty: false }))
                .env('BSI_BROWSER_C_SKIP_LAUNCH')
        );

    return command;
};

export { buildBrowserCheckCommand, handleBrowserCheck };
