import { logger } from '../../globals.js';
import { SEVERITY, isHealthy, normalizeFinding, worstFirst } from './findings.js';
import { allFindings, RUNNER_ERROR_ID } from './run-checks.js';

/**
 * The shared renderer for every diagnostic command.
 *
 * `browser check`'s output comes from here rather than being formatted inline. That is the whole
 * point of the check contract: the second diagnostic is nearly free because it inherits this, and
 * a command users already depend on never has to be rewritten to get it. Consequently this file
 * knows nothing about browsers - it renders sections, facts, findings and remediation, whatever
 * produced them.
 *
 * The layout is §7.3 of `docs/todo/airgap-browser-phase-1.md`, which follows the repo's existing
 * 4-space `Key : value` style (`cloud-test-connection.js`, `browser-installed.js:41`).
 */

/**
 * The best-effort disclaimer, verbatim (§15.7).
 *
 * **Not suppressible.** There is no flag to hide it, and adding one would be a mistake: it would
 * be used by exactly the automated contexts where a human later reads the output without knowing
 * it was hidden.
 *
 * It appears once, immediately before the `Result:` line, so it is read next to the advice rather
 * than scrolled away above it. The wording is shared with every command in this family, so an
 * administrator who has read it once recognises it and skips it rather than re-reading a variant.
 */
export const BEST_EFFORT_DISCLAIMER = Object.freeze([
    'Note: these findings are best-effort. Butler Sheet Icons reports what it can observe on this',
    'machine, and cannot see everything about your environment - group policy, antivirus, proxy rules',
    'and Qlik Sense itself are all invisible to it. Review suggested commands before running them on a',
    'production server.',
]);

/** Width the fact labels are padded to, matching §7.3. */
const LABEL_WIDTH = 20;

/**
 * The logger method a finding's verdict is printed at.
 *
 * `ok` and `info` go to `verbose`, and that is the deliberate part. §7.3's healthy output is facts,
 * not a wall of "OK: ..." lines - so on a working machine the report is the observations and
 * nothing else. The findings are still emitted in the returned data, and still printed one level
 * down, so `--loglevel verbose` says exactly what was examined and a future JSON consumer sees
 * every one of them.
 */
const LOG_AT = Object.freeze({
    [SEVERITY.ERROR]: 'error',
    [SEVERITY.WARNING]: 'warn',
    [SEVERITY.INFO]: 'verbose',
    [SEVERITY.OK]: 'verbose',
});

/**
 * What a finding's verdict line says.
 *
 * A verdict that carries weight states what was observed; one that does not simply names the
 * question that was answered.
 *
 * @param {import('./findings.js').Finding} entry - The finding.
 *
 * @returns {string} The line to print.
 */
const verdictLine = (entry) =>
    entry.severity === SEVERITY.ERROR || entry.severity === SEVERITY.WARNING
        ? `    ${entry.detail}`
        : `    ${entry.title}`;

/**
 * One `    Label               : value` row.
 *
 * @param {import('./findings.js').Fact} fact - The fact to render.
 *
 * @returns {string} The rendered row.
 */
const factLine = (fact) => `    ${fact.label.padEnd(LABEL_WIDTH)}: ${fact.value}`;

/**
 * The remediation command for this host, if the step carries one.
 *
 * Only one is printed. Butler Sheet Icons' primary platform is Windows Server, where a bash
 * snippet beneath every step is noise an administrator has to read past.
 *
 * @param {import('./findings.js').Remediation} step - The remediation step.
 * @param {string} platform - Node platform identifier.
 *
 * @returns {string|undefined} The command, or `undefined` when the step carries none.
 */
const commandFor = (step, platform) =>
    platform === 'win32' ? step.command?.powershell : step.command?.bash;

/**
 * Renders the facts of every finding a check produced, under the check's section heading.
 *
 * The heading is emitted when the section changes rather than once per check, so two checks
 * looking at the same subject - the two cache checks of §15.3 - produce §7.3's single
 * "Browser cache" block rather than two.
 *
 * @param {import('./run-checks.js').CheckResult[]} results - Results to render.
 *
 * @returns {void}
 */
const renderSections = (results) => {
    let currentSection;

    for (const result of results) {
        // A skipped check has nothing to say. Saying "skipped" for each one would put the
        // machinery in front of the diagnosis.
        if (result.skipped || result.findings.length === 0) {
            continue;
        }

        if (result.check.section !== currentSection) {
            currentSection = result.check.section;
            logger.info(currentSection);
        }

        for (const entry of result.findings) {
            for (const fact of entry.facts) {
                logger.info(factLine(fact));

                for (const subline of fact.sublines ?? []) {
                    logger.info(`        ${subline}`);
                }
            }

            // The verdict, at the level its severity earns.
            logger[LOG_AT[entry.severity]](verdictLine(entry));
        }
    }
};

/**
 * Renders the numbered "Next steps" block from every failing finding's remediation.
 *
 * Only `error` findings contribute. A warning's advice is worth having, and is printed with the
 * warning itself, but it does not belong in the list headed "this run failed, do these things".
 *
 * @param {import('./findings.js').Finding[]} findings - Every finding in the report.
 * @param {string} platform - Node platform identifier.
 *
 * @returns {void}
 */
const renderNextSteps = (findings, platform) => {
    const steps = worstFirst(findings)
        .filter((entry) => entry.severity === SEVERITY.ERROR)
        .flatMap((entry) => entry.remediation);

    if (steps.length === 0) {
        return;
    }

    logger.error('Next steps:');

    steps.forEach((step, index) => {
        logger.error(`    ${index + 1}. ${step.text}`);

        const command = commandFor(step, platform);

        if (command) {
            logger.error(`       ${command}`);
        }
    });
};

/**
 * Prints a diagnostic report.
 *
 * @param {object} args - What to render.
 * @param {string} args.heading - First line, e.g. `Butler Sheet Icons browser check`.
 * @param {import('./run-checks.js').CheckResult[]} args.results - Results from `runChecks`.
 * @param {string} args.okMessage - The sentence after `Result: OK - `. The command's own headline;
 * the failure sentence comes from the first failing finding, because only it knows what failed.
 * @param {string} [args.platform] - Node platform identifier. Defaults to this machine's, and is
 * a parameter only so both branches can be tested on either host.
 *
 * @returns {boolean} `true` when nothing failed - the same judgement the `Result:` line printed,
 * returned so a caller cannot reach a different one.
 */
export const renderReport = ({ heading, results, okMessage, platform = process.platform }) => {
    // Normalised here as well as in the runner, because this function is callable on its own and
    // a severity it does not recognise used to throw from inside the section loop - after the
    // heading and some facts had already printed, and outside the runner's isolation. Idempotent,
    // so runner-produced input passes straight through.
    const safeResults = results.map((result) => ({
        ...result,
        findings: result.findings.map(normalizeFinding),
    }));
    const findings = allFindings(safeResults);
    const ok = isHealthy(findings);

    logger.info(heading);

    renderSections(safeResults);

    // Immediately before the Result line, so it sits next to the advice. Unconditional: see
    // BEST_EFFORT_DISCLAIMER.
    for (const line of BEST_EFFORT_DISCLAIMER) {
        logger.info(line);
    }

    if (ok) {
        logger.info(`Result: OK - ${okMessage}`);

        return true;
    }

    // The failing finding's own title, not a generic sentence. "no usable browser was found" and
    // "the configured browser executable does not exist" send an administrator to completely
    // different places, and a shared summary line would send them to neither.
    //
    // A fault in the diagnostic itself is passed over for the headline when anything else failed.
    // BSI-DOCTOR-001 is emitted in place of whichever check threw, so registry position alone
    // could put it first and let it speak for the machine - handing the administrator "re-run
    // with --loglevel debug and file an issue" as the summary of a server that simply has no
    // browser staged. It still headlines when it is the only error, because a failed run with no
    // stated reason is worse, and its advice appears in Next steps either way.
    const errors = worstFirst(findings).filter((entry) => entry.severity === SEVERITY.ERROR);
    const worst = errors.find((entry) => entry.id !== RUNNER_ERROR_ID) ?? errors[0];

    logger.error(`Result: FAILED - ${worst.title}`);

    renderNextSteps(findings, platform);

    return false;
};
