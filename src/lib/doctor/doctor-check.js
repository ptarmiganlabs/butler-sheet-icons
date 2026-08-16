import { logger, setLoggingLevel } from '../../globals.js';
import { redactOptions } from '../util/redact-secrets.js';
import { buildCheckContext } from './context.js';
import { checksForAreas } from './checks/index.js';
import { CHECK_AREAS, allFindings, runChecks } from './run-checks.js';
import { SEVERITY, finding, isHealthy } from './findings.js';
import { BEST_EFFORT_DISCLAIMER, renderReport } from './render-report.js';
import { buildJsonReport, emitJsonReport } from './render-json.js';

/**
 * `doctor check` - what is wrong with this machine, and what to do about it.
 *
 * The generalisation `browser check` was built towards. The runner, the registry and the renderer
 * all already existed for one subsystem; this runs the same machinery across every registered
 * check, which is why the command is small and the previous issue was not.
 *
 * **Both commands go through {@link runDoctorCheck}.** That is not tidiness: `browser check` has
 * shipped and is documented as a deployment gate, and the one thing that must never happen is the
 * two reports drifting into different wordings of the same facts. They differ in exactly three
 * values - which areas run, the heading, and the sentence after `Result: OK` - and in nothing else.
 *
 * Scope, from §15.9 and not negotiable: Butler Sheet Icons' own operation is what this diagnoses.
 * Whether BSI can reach a Sense host is in scope; why that Sense installation is unhealthy is not.
 */

/**
 * Reported when the areas asked for have no registered checks between them.
 *
 * Its own id rather than a borrowed one, and an **error** rather than a warning. `config`, `qseow`
 * and `qscloud` are recognised areas with nothing behind them yet, so `doctor check --area qseow`
 * would otherwise print a report with no sections, no findings, `Result: OK` and exit 0 - a
 * deployment gate reporting a clean bill of health for a run that verified nothing. It cannot fire
 * for the default selection while any check at all is registered, and a test holds that.
 */
export const NO_CHECKS_ID = 'BSI-DOCTOR-003';

/**
 * The areas to run, given what was asked for.
 *
 * Absent or empty means every area. `--area` deliberately carries no Commander `.default()`:
 * Commander hands the option's current value to a variadic `argParser` as its accumulator, so an
 * array default would make `--area browser` mean *every area plus browser*. Empty also arrives from
 * a set-but-empty `BSI_DOCTOR_C_AREA=` line in a unit file, which this repo has been bitten by
 * before, and which means "unset" everywhere else in the CLI.
 *
 * Read from {@link CHECK_AREAS} rather than restated, so an area added to the contract is one this
 * command runs from that moment.
 *
 * @param {string[]|string} [requested] - Areas asked for on the command line.
 *
 * @returns {string[]} The areas to run.
 */
export const areasToRun = (requested) => {
    const asList = Array.isArray(requested) ? requested : requested ? [requested] : [];

    return asList.length > 0 ? [...asList] : [...CHECK_AREAS];
};

/**
 * The finding that says nothing was checked.
 *
 * @param {string[]} areas - The areas that were asked for.
 *
 * @returns {import('./findings.js').Finding} An error finding naming them.
 */
const nothingRanFinding = (areas) =>
    finding({
        id: NO_CHECKS_ID,
        severity: SEVERITY.ERROR,
        title: 'No diagnostic checks were run',
        detail: `Butler Sheet Icons has no checks registered for: ${areas.join(', ')}. Nothing about this machine was examined, so this report says nothing about whether it works.`,
        evidence: { areas, registeredAreas: [...CHECK_AREAS] },
        remediation: [
            {
                text: 'Run without --area to check everything Butler Sheet Icons can, or name an area that has checks behind it. Checks for the remaining areas are added as they are needed.',
                command: {
                    powershell: 'butler-sheet-icons.exe doctor check',
                    bash: './butler-sheet-icons doctor check',
                },
            },
        ],
    });

/**
 * Runs a set of areas and reports on them.
 *
 * The single path both `doctor check` and `browser check` take. Nothing here touches process
 * state: the verdict is returned, and each command's handler turns it into `process.exitCode`
 * through `runCommand`.
 *
 * @param {object} args - What to run.
 * @param {object} args.options - Resolved CLI options, passed to the fact gatherers and the checks.
 * @param {string[]} args.areas - The areas to run.
 * @param {string} args.heading - First line of the human report.
 * @param {(ctx: object) => string} args.okMessage - The sentence after `Result: OK - `, given the
 * gathered context. A function because it may depend on what was found: `browser check` qualifies
 * it when the launch was skipped.
 * @param {string} args.command - What to record as the command in JSON output.
 * @param {string} [args.outputFormat] - `text` or `json`. Defaults to `text`.
 * @param {boolean} [args.allowNetwork] - Whether `needsNetwork` checks may run.
 *
 * @returns {Promise<{ok: boolean, ctx: object, results: object[], findings: object[]}>} The
 * verdict, the context the checks saw, and what they found.
 */
export const runDoctorCheck = async ({
    options,
    areas,
    heading,
    okMessage,
    command,
    outputFormat = 'text',
    allowNetwork = false,
}) => {
    const selected = checksForAreas(areas);
    const ctx = await buildCheckContext(options, areas);
    const results = await runChecks(selected, ctx, { allowNetwork });

    // Appended as its own pseudo-result so it reaches the renderer, the exit code and the JSON
    // document by the same route every other finding does, rather than by a special case in each.
    if (selected.length === 0) {
        results.push({
            check: {
                id: NO_CHECKS_ID,
                title: 'Something was checked',
                section: 'Checks',
                area: areas[0],
            },
            findings: [nothingRanFinding(areas)],
        });
    }

    const findings = allFindings(results);

    if (outputFormat === 'json') {
        const ok = isHealthy(findings);

        emitJsonReport(buildJsonReport({ command, areas, allowNetwork, ok, results }));

        return { ok, ctx, results, findings };
    }

    return {
        ok: renderReport({ heading, results, okMessage: okMessage(ctx) }),
        ctx,
        results,
        findings,
    };
};

/**
 * Runs the full diagnostic and reports on it.
 *
 * @param {object} [options] - Options bag as Commander produces it.
 * @param {string[]} [options.area] - Areas to check. Defaults to every area.
 * @param {string} [options.outputformat] - `text` or `json`.
 * @param {boolean} [options.allowNetwork] - Allow checks that reach the network.
 * @param {string} [options.browser] - Browser a real run would look for.
 * @param {string} [options.browserVersion] - Build a real run would look for.
 * @param {string} [options.browserCacheDir] - Cache directory to search.
 * @param {string} [options.browserExecutablePath] - A browser executable to use instead.
 * @param {boolean|string} [options.headless] - Whether to start the browser headless.
 * @param {boolean} [options.skipLaunch] - Find a browser but do not start it.
 * @param {string} [options.loglevel] - Log level.
 *
 * @returns {Promise<object>} The report. `ok` is `false` when something on this machine would stop
 * Butler Sheet Icons working; the handler turns that into the process exit code, and nothing here
 * touches process state.
 */
export const doctorCheck = async (options = {}) => {
    const outputFormat = options.outputformat ?? 'text';

    // In JSON mode the document is the whole of stdout, and a winston line carrying a timestamp
    // and a level in the middle of it would make the output unparseable. Held at `error` rather
    // than silenced outright so that a genuine failure is still visible to whoever ran it.
    //
    // Deliberately not `withQuietLogging`: importing `getLoggingLevel` here would break every
    // suite whose `globals.js` mock does not enumerate that export, as a suite-load failure with
    // no failing test to point at it. There is nothing to restore either way - the process is
    // about to end.
    setLoggingLevel(outputFormat === 'json' ? 'error' : options.loglevel);

    const areas = areasToRun(options.area);
    const allowNetwork = Boolean(options.allowNetwork);

    logger.verbose(`Starting doctor check for areas: ${areas.join(', ')}`);
    logger.debug(`Options: ${JSON.stringify(redactOptions(options), null, 2)}`);

    const { ok, results, findings } = await runDoctorCheck({
        options,
        areas,
        allowNetwork,
        outputFormat,
        command: 'doctor check',
        // The areas are named in the heading rather than left implicit. `Result: OK` after a run
        // that examined one area of five is a narrower claim than the same line after a full run,
        // and an administrator reading the report a week later has no other way to tell them apart.
        heading: `Butler Sheet Icons doctor check (areas: ${areas.join(', ')})`,
        okMessage: () =>
            areas.length === CHECK_AREAS.length
                ? 'Butler Sheet Icons found no problems on this machine.'
                : `Butler Sheet Icons found no problems in: ${areas.join(', ')}. Other areas were not checked.`,
    });

    return {
        ok,
        areas,
        allowNetwork,
        outputFormat,
        findings,
        results,
        disclaimer: BEST_EFFORT_DISCLAIMER,
    };
};
