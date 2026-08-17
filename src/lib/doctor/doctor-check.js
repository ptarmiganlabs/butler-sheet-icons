import { logger, sendConsoleLogToStderr, setLoggingLevel } from '../../globals.js';
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
 * Reported when an area's fact gatherer threw.
 *
 * The counterpart to BSI-DOCTOR-001, one layer earlier. The runner isolates every check so a
 * throwing check becomes a finding naming it; gathering used to have no such net, and it is where
 * the risk actually lives - it reads the filesystem and starts a browser. An unguarded throw
 * rejected out of the run before the heading printed, destroying the whole report - including the
 * Environment section that would have explained the failure. Like BSI-DOCTOR-001 this says
 * something about Butler Sheet Icons, not about the machine.
 */
export const GATHER_ERROR_ID = 'BSI-DOCTOR-004';

/**
 * The finding an area's gathering failure becomes.
 *
 * @param {{area: string, error: string}} failure - What failed, and how.
 *
 * @returns {import('./findings.js').Finding} An error finding naming the area.
 */
const gatherFailedFinding = (failure) =>
    finding({
        id: GATHER_ERROR_ID,
        severity: SEVERITY.ERROR,
        title: 'the facts for an area could not be gathered',
        detail: `Collecting the facts for the "${failure.area}" area stopped with an error: ${failure.error}. The checks for that area did not run. Everything else in this report still ran.`,
        evidence: { area: failure.area, error: failure.error },
        remediation: [
            {
                text: 'Re-run with --loglevel debug and include the output in a Butler Sheet Icons issue. This is a fault in the diagnostic itself, not in the machine it was run on.',
            },
        ],
    });

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
 * **De-duplicated**, and that is not tidiness. `collectChoices` accumulates without de-duplicating,
 * so `--area browser --area browser` - or a `BSI_DOCTOR_C_AREA=browser,browser` typo in a unit file
 * - reached `buildCheckContext`, which loops per entry and calls the area's fact gatherer once per
 * repeat. For `browser` that gatherer starts Chrome, so a duplicated area launched and killed a
 * second browser, and the second gather's facts overwrote the first, meaning the report described
 * a different launch from the one it was about to judge. It also inflated the area count, which is
 * how `BSI_DOCTOR_C_AREA=browser,environment,config,qseow,qseow` printed the full-run verdict with
 * `qscloud` never selected.
 *
 * @param {string[]|string} [requested] - Areas asked for on the command line.
 *
 * @returns {string[]} The areas to run, each once, in the order first named.
 */
export const areasToRun = (requested) => {
    const asList = Array.isArray(requested) ? requested : requested ? [requested] : [];

    return asList.length > 0 ? [...new Set(asList)] : [...CHECK_AREAS];
};

/**
 * Whether the caller named areas explicitly, rather than falling back to all of them.
 *
 * The difference decides whether an area with no checks behind it fails the run. Naming
 * `--area qseow` is a request Butler Sheet Icons cannot satisfy, and answering it with `Result: OK`
 * would be a lie. Sweeping `qseow` in because no `--area` was given is not a request at all - it
 * means "check everything you can", and an area with nothing to check is simply not part of the
 * answer. Without this distinction, holding every area to the same rule would make the plain
 * `doctor check` exit 1 on every machine, since three of the five areas have no checks yet.
 *
 * @param {string[]|string} [requested] - Areas asked for on the command line.
 *
 * @returns {boolean} `true` when the caller named at least one area.
 */
export const areasWereNamed = (requested) =>
    Array.isArray(requested) ? requested.length > 0 : Boolean(requested);

/**
 * Which of the requested areas nothing actually ran for, and why.
 *
 * "Selected" is not "examined", and conflating the two is how this command came to report
 * `Result: OK` for work it had not done. A check can be selected and still never run: the runner
 * skips it when it needs network access that was not allowed, and when its own `appliesTo` says it
 * is irrelevant here. An area is examined when **at least one** of its checks produced a result -
 * not all of them, because `appliesTo` legitimately skips checks on every healthy run.
 *
 * Two distinct reasons, and they carry different weight:
 *
 * - `registered: false` - Butler Sheet Icons has no checks for this area at all.
 * - `registered: true` - it has some, and every one of them was skipped.
 *
 * @param {string[]} areas - The areas that were requested.
 * @param {import('./run-checks.js').Check[]} selected - The checks those areas selected.
 * @param {import('./run-checks.js').CheckResult[]} results - What the runner produced.
 *
 * @returns {{area: string, registered: boolean}[]} One entry per area nothing ran for.
 */
const unexaminedAreas = (areas, selected, results) => {
    const ran = new Set(results.filter((result) => !result.skipped).map((r) => r.check.area));

    return areas
        .filter((area) => !ran.has(area))
        .map((area) => ({
            area,
            registered: selected.some((check) => check.area === area),
        }));
};

/**
 * The finding that says what was not examined.
 *
 * Severity is the whole point of this function, and each branch was bought by a defect:
 *
 * - **Nothing at all was examined** - error. This is the original case: a report with no findings
 *   is `isHealthy` by definition, so without this the command printed a heading, a disclaimer and
 *   `Result: OK`, and exited 0, having looked at nothing.
 * - **An explicitly named area has no checks** - error. `--area qseow` is a request Butler Sheet
 *   Icons cannot satisfy; answering it with a clean bill of health for the areas that *do* have
 *   checks is the mixed-selection hole that let `--area environment --area qseow` exit 0.
 * - **Anything else** - warning. An area swept in by the default with nothing behind it, or one
 *   whose checks were all skipped for want of `--allow-network`, is worth stating plainly but must
 *   not fail the run: the first would make the plain `doctor check` exit 1 on every machine, and
 *   the second would make `--allow-network` mandatory on exactly the air-gapped servers the
 *   default exists to be safe on.
 *
 * @param {{area: string, registered: boolean}[]} unexamined - Areas nothing ran for.
 * @param {string[]} examined - Areas at least one check ran for.
 * @param {boolean} named - Whether the caller named areas explicitly.
 *
 * @returns {import('./findings.js').Finding} A finding naming what was not examined.
 */
const notExaminedFinding = (unexamined, examined, named) => {
    const missing = unexamined.filter((entry) => !entry.registered).map((entry) => entry.area);
    const allSkipped = unexamined.filter((entry) => entry.registered).map((entry) => entry.area);
    const fails = examined.length === 0 || (named && missing.length > 0);

    const reasons = [
        missing.length > 0
            ? `${missing.join(', ')} (Butler Sheet Icons has no checks for ${missing.length === 1 ? 'this area' : 'these areas'} yet)`
            : null,
        allSkipped.length > 0
            ? `${allSkipped.join(', ')} (every check was skipped - checks needing network access are skipped unless --allow-network is given)`
            : null,
    ].filter(Boolean);

    return finding({
        id: NO_CHECKS_ID,
        severity: fails ? SEVERITY.ERROR : SEVERITY.WARNING,
        title:
            examined.length === 0
                ? 'No diagnostic checks were run'
                : 'Some areas were not examined',
        detail: `Nothing was examined for: ${reasons.join('; ')}. ${
            examined.length === 0
                ? 'Nothing about this machine was examined, so this report says nothing about whether it works.'
                : `This report covers ${examined.join(', ')} only, and says nothing about the rest.`
        }`,
        evidence: {
            examined,
            notExamined: unexamined,
            areasWereNamed: named,
            registeredAreas: [...CHECK_AREAS],
        },
        remediation: fails
            ? [
                  {
                      text: 'Run without --area to check everything Butler Sheet Icons can, or name an area that has checks behind it. Checks for the remaining areas are added as they are needed.',
                      command: {
                          powershell: 'butler-sheet-icons.exe doctor check',
                          bash: './butler-sheet-icons doctor check',
                      },
                  },
              ]
            : [],
    });
};

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
 * @param {(ctx: object, coverage: {examined: string[], areas: string[]}) => string} args.okMessage -
 * The sentence after `Result: OK - `, given the gathered context and what was actually examined.
 * A function because it may depend on what was found: `browser check` qualifies
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
    areasWereNamed: named = true,
    outputFormat = 'text',
    allowNetwork = false,
}) => {
    const ctx = await buildCheckContext(options, areas, { command });

    // A check whose area failed to gather must not run: its facts are simply absent, so its
    // `appliesTo` would throw on the first dereference and the runner would dutifully convert
    // every one into a BSI-DOCTOR-001 - five findings naming five checks, none naming the
    // gatherer that actually broke. One failure, one finding.
    const failedAreas = new Set((ctx.gatherFailures ?? []).map((failure) => failure.area));
    const selected = checksForAreas(areas).filter((check) => !failedAreas.has(check.area));
    const results = await runChecks(selected, ctx, { allowNetwork });

    // Pushed before coverage is computed, so a failed area is accounted for by its own error
    // finding rather than reported a second time as "not examined". Same pseudo-result route as
    // the coverage finding: one path to the renderer, the exit code and the JSON document.
    for (const failure of ctx.gatherFailures ?? []) {
        results.push({
            check: {
                id: 'facts-gathered',
                title: 'The facts for every requested area could be gathered',
                section: 'Coverage',
                area: failure.area,
            },
            findings: [gatherFailedFinding(failure)],
        });
    }

    const unexamined = unexaminedAreas(areas, selected, results);
    const examined = areas.filter((area) => !unexamined.some((entry) => entry.area === area));

    // Appended as its own pseudo-result so it reaches the renderer, the exit code and the JSON
    // document by the same route every other finding does, rather than by a special case in each.
    // Its `check` carries a kebab-case id like every registry entry, never the finding id: the two
    // namespaces meet in `findings[].check`, which is the field a consumer joins on.
    if (unexamined.length > 0) {
        results.push({
            check: {
                id: 'areas-examined',
                title: 'Every requested area was examined',
                section: 'Coverage',
                area: unexamined[0].area,
            },
            findings: [notExaminedFinding(unexamined, examined, named)],
        });
    }

    const findings = allFindings(results);

    // Appended by the runner rather than left to each command's `okMessage`, so no caller can
    // forget it. `Result: OK` has to state its own limits: the sentence is read on its own, often
    // pasted on its own, and "no problems" over a partial run is the one thing this command must
    // never imply.
    const scope =
        unexamined.length > 0
            ? ` Not examined: ${unexamined.map((entry) => entry.area).join(', ')}.`
            : '';

    if (outputFormat === 'json') {
        const ok = isHealthy(findings);

        emitJsonReport(buildJsonReport({ command, areas, examined, allowNetwork, ok, results }));

        return { ok, ctx, results, findings, examined };
    }

    return {
        ok: renderReport({
            heading,
            results,
            okMessage: `${okMessage(ctx, { examined, areas })}${scope}`,
        }),
        ctx,
        results,
        findings,
        examined,
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
    // and a level in the middle of it would make the output unparseable.
    //
    // Two moves are needed, and holding the level was only the first. Winston's Console transport
    // writes *every* level to stdout unless told otherwise - `error` included - so quieting the
    // console to `error` still left an error line landing inside the document. Measured: a failing
    // run put 30 lines on stdout and none on stderr, and `detectAvailableBrowser` logs at `error`
    // and then returns null, so the run continues and the document is appended after it. A gate
    // doing `doctor check --outputformat json | jq` then fails to parse on exactly the broken
    // machine the document exists to describe, with stderr empty so nothing says why.
    //
    // So the whole console goes to stderr here, rather than being silenced: the error is the thing
    // that explains an empty or partial document, and a human running this in a terminal still
    // sees it. Scoped to this command rather than fixed in the transport, because Butler Sheet
    // Icons' output elsewhere is one narrative log that the documentation tells operators to
    // capture with `> bsi.log` - splitting it globally would drop errors out of every captured log.
    //
    // Deliberately not `withQuietLogging`: importing `getLoggingLevel` here would break every
    // suite whose `globals.js` mock does not enumerate that export, as a suite-load failure with
    // no failing test to point at it. There is nothing to restore either way - the process is
    // about to end.
    setLoggingLevel(outputFormat === 'json' ? 'error' : options.loglevel);

    if (outputFormat === 'json') {
        sendConsoleLogToStderr();
    }

    const areas = areasToRun(options.area);
    const named = areasWereNamed(options.area);
    const allowNetwork = Boolean(options.allowNetwork);

    logger.verbose(`Starting doctor check for areas: ${areas.join(', ')}`);
    logger.debug(`Options: ${JSON.stringify(redactOptions(options), null, 2)}`);

    const { ok, results, findings, examined } = await runDoctorCheck({
        options,
        areas,
        allowNetwork,
        outputFormat,
        areasWereNamed: named,
        command: 'doctor check',
        // The areas are named in the heading rather than left implicit. `Result: OK` after a run
        // that examined one area of five is a narrower claim than the same line after a full run,
        // and an administrator reading the report a week later has no other way to tell them apart.
        heading: `Butler Sheet Icons doctor check (areas: ${areas.join(', ')})`,
        // Two qualifications, and the sentence is wrong without either.
        //
        // **Scope.** "on this machine" is a claim about the whole machine, so it may only be made
        // when every area was examined. Anything narrower names what it covers. Deriving this
        // from `examined` rather than from the requested areas is the point: an area can be
        // requested and examined by nothing.
        //
        // **The launch.** `browser check` says plainly that a skipped launch leaves the most
        // valuable part untested; this said "found no problems on this machine" about a browser
        // it never started, because it threw away the ctx argument the callback contract supplies.
        // `?.` because `ctx.launch` exists only when the browser area was gathered.
        okMessage: (ctx, { examined }) =>
            [
                examined.length === CHECK_AREAS.length
                    ? 'Butler Sheet Icons found no problems on this machine.'
                    : `Butler Sheet Icons found no problems in: ${examined.join(', ')}.`,
                ctx.launch?.skipped
                    ? 'The browser was not started, so whether it runs here is untested.'
                    : null,
            ]
                .filter(Boolean)
                .join(' '),
    });

    return {
        ok,
        areas,
        examined,
        allowNetwork,
        outputFormat,
        findings,
        results,
        disclaimer: BEST_EFFORT_DISCLAIMER,
    };
};
