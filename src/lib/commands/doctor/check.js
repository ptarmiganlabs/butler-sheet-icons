import { Command, Option } from 'commander';
import { logger, appVersion } from '../../../globals.js';
import { logRunHeader } from '../../util/run-report-render.js';
import { doctorCheck } from '../../doctor/doctor-check.js';
import { CHECK_AREAS } from '../../doctor/run-checks.js';
import { runCommand } from '../run-command.js';
import { collectChoices } from '../helpers.js';
import { buildBrowserDiagnosticOptions } from '../browser-diagnostic-options.js';
import { booleanOptionParser } from '../../util/boolean-option.js';

/**
 * Commander action that runs the diagnostic checks and reports on them.
 *
 * **The exit code is the point**, exactly as it is for `browser check`: `0` when nothing failed,
 * `1` when something on this machine would stop Butler Sheet Icons working. That is expressed by
 * returning `ok` from inside `runCommand`, which is the repo's single place for turning a
 * command's verdict into `process.exitCode` - it sets the code rather than calling
 * `process.exit()`, so winston flushes the report that explains it, and it reports a thrown worker
 * as a failure rather than letting it escape to the top-level handler and be written out as a
 * crash dump. A machine with a problem is an operational finding, not a crash.
 *
 * The run header is skipped in JSON mode. The document has to be the whole of stdout for
 * anything to parse it, and the version is a field inside it instead.
 *
 * @param {object} [options] - CLI options. Defaults to `{}`. Commander passes its own `Command` as
 * a second argument, which this handler has no use for - the worker takes only the options bag.
 *
 * @returns {Promise<boolean>} Whether the machine passed.
 */
const handleDoctorCheck = async (options = {}) => {
    if (options.outputformat !== 'json') {
        logRunHeader(logger, appVersion, 'doctor check');
    }

    return runCommand('DOCTOR MAIN 1', async () => {
        const report = await doctorCheck(options);

        // The worker has already printed the report, including the reason for a failure and the
        // steps that fix it. Returning `ok` is all runCommand needs to set the exit code.
        return report.ok;
    });
};

/**
 * Builds the "doctor check" command.
 *
 * No `-i`: there is nothing to ask. Every option describes the machine the command is run on, and
 * each already defaults to what a real run would use. Recorded in `NOT_INTERACTIVE` in the
 * interactive registry, which is where a command with no wizard has to declare itself.
 *
 * @returns {import('commander').Command} Configured check command.
 */
const buildDoctorCheckCommand = () => {
    const command = new Command('check');

    command
        .description(
            'Run every diagnostic check against this machine and report what would stop Butler Sheet Icons working.\nMakes no network requests unless --allow-network is given, and never contacts Qlik Sense, so it is safe to run on a production server at any time.\nExits 1 when something failed, so it can be used as a gate in a deployment script.'
        )
        .action(handleDoctorCheck)
        .addOption(
            new Option('--log-level, --loglevel <level>', 'Log level')
                .choices(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])
                .default('info')
                .env('BSI_DOCTOR_C_LOG_LEVEL')
        )
        .addOption(
            // Deliberately no `.default()`. Commander hands a variadic option's current value to
            // its `argParser` as the accumulator, so an array default would make `--area browser`
            // mean *every area plus browser*. Absent means every area, resolved in `areasToRun()`,
            // which also gives a bare `BSI_DOCTOR_C_AREA=` line the "unset" meaning it has
            // everywhere else in this CLI.
            //
            // `.choices()` first for the help text and the wizard, then `.argParser` to replace
            // the parser it installs - see `collectChoices`.
            new Option(
                '--area <area...>',
                'Limit the run to these areas. Defaults to every area. Areas with no checks behind them yet fail the run rather than reporting a clean bill of health.'
            )
                .choices([...CHECK_AREAS])
                .argParser(collectChoices([...CHECK_AREAS]))
                .env('BSI_DOCTOR_C_AREA')
        )
        .addOption(
            // `text` rather than `table`: this is a report, not a table. The flag name follows
            // `qscloud list-collections --outputformat`, which shipped first, so an administrator
            // learns one name for the idea.
            new Option('--outputformat <text|json>', 'Output format')
                .choices(['text', 'json'])
                .default('text')
                .env('BSI_DOCTOR_C_OUTPUTFORMAT')
        )
        .addOption(
            // Optional argument rather than a bare flag, for the reason spelled out on
            // `--skip-launch`: Commander sets a bare flag from the mere presence of its
            // environment variable, so `BSI_DOCTOR_C_ALLOW_NETWORK=false` would turn it on.
            //
            // Off by default because the default has to be safe on an air-gapped production Sense
            // server, where a check that resolves a hostname does not fail - it hangs.
            new Option(
                '--allow-network [true|false]',
                'Allow checks that need network access to run. Off by default: the checks that need it are skipped rather than left to time out on a server with no internet access.'
            )
                .default(false)
                .argParser(booleanOptionParser({ whenEmpty: false }))
                .env('BSI_DOCTOR_C_ALLOW_NETWORK')
        );

    // The same options `browser check` carries, from the same factory. A doctor that reports OK
    // under different settings than the run it is meant to predict is worse than no doctor.
    buildBrowserDiagnosticOptions('BSI_DOCTOR_C').forEach((option) => command.addOption(option));

    return command;
};

export { buildDoctorCheckCommand, handleDoctorCheck };
