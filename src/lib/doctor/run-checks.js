import { SEVERITY, demoteIfSuperseded, errorIdsOf, finding, normalizeFinding } from './findings.js';

/**
 * The check runner.
 *
 * Runs registered checks against one context and collects their findings. It knows nothing about
 * browsers, Qlik Sense or any other subject - **adding a check must be one new file plus one
 * registry entry, with no change to this file**. Anything that erodes that (a check needing a
 * special case here, a finding needing bespoke handling) is a signal that the contract is wrong,
 * not that the check is special. See §15.3 of `docs/todo/airgap-browser-phase-1.md`.
 *
 * Two rules are enforced here rather than trusted to each check:
 *
 * - **A check may not reach the network unless it says so and the caller allowed it.** The default
 *   has to be safe to run on a production Sense server at any time, and must never hang on a DNS
 *   timeout on an air-gapped host.
 * - **One broken check may not take down the report.** Every check is isolated, and a throw
 *   becomes an error finding naming the check that threw.
 */

/**
 * @typedef {object} Check
 * @property {string} id - Stable, kebab-case, unique across the registry.
 * @property {string} title - What the check asserts, as a statement.
 * @property {string} section - Heading the findings render under. Checks sharing a section render
 * under one heading, in registry order, which is how two cache checks produce §7.3's single
 * "Browser cache" block.
 * @property {string} area - One of {@link CHECK_AREAS}.
 * @property {boolean} needsNetwork - `true` checks are skipped unless the caller allows network.
 * @property {string[]} findingIds - Every finding id this check can emit. Declared rather than
 * discovered so the registry can be checked for collisions without running anything - see
 * `checks.test.js`.
 * @property {(ctx: object) => boolean} appliesTo - Cheap predicate; skips irrelevant checks.
 * @property {(ctx: object) => Promise<import('./findings.js').Finding[]>} run - The check itself.
 * Pure with respect to the world: it reads `ctx` and returns findings. It does not log, format,
 * install, write files or set `process.exitCode`.
 */

/**
 * @typedef {object} CheckResult
 * @property {Check} check - The check that produced this.
 * @property {import('./findings.js').Finding[]} findings - What it found, empty when skipped.
 * @property {string} [skipped] - Why it did not run, when it did not.
 */

/**
 * The areas a check may declare.
 *
 * A closed list rather than free-form text, because `checksForAreas` filters on this string and a
 * value nobody selects is indistinguishable from a check that does not exist. There is no throw,
 * no warning and no skipped result - the check is simply absent from the report. Measured: a
 * one-letter typo in `browser-selection`'s area left `browser check` reporting `Result: OK` and
 * exiting 0 on a machine with no browser at all, with the whole suite green, because the per-check
 * tests call `run()` directly and never go through the registry.
 *
 * `checks.test.js` holds every registered check to this list, so adding an area is a deliberate
 * line here rather than a silent consequence of a spelling.
 */
export const CHECK_AREAS = Object.freeze(['browser', 'environment', 'config', 'qseow', 'qscloud']);

/** Reported when a check was skipped because it needs network access that was not allowed. */
export const SKIP_NETWORK = 'network';

/** Reported when a check's own `appliesTo` predicate said it was irrelevant here. */
export const SKIP_NOT_APPLICABLE = 'not-applicable';

/**
 * The finding a check's own failure is reported as.
 *
 * Its own id rather than one borrowed from the area being checked: this says something about
 * Butler Sheet Icons, not about the machine, and an administrator seeing it should be able to
 * tell those apart at a glance.
 */
export const RUNNER_ERROR_ID = 'BSI-DOCTOR-001';

/**
 * Renders a thrown value as text.
 *
 * Not everything thrown is an `Error` - a rejected promise carrying a string reaches here too,
 * and `err.message` on it is `undefined`, which would produce a finding that says nothing.
 *
 * @param {unknown} err - The thrown value.
 *
 * @returns {string} Something worth printing.
 */
const describeError = (err) => {
    if (err instanceof Error) {
        return err.message;
    }

    return String(err);
};

/**
 * The finding a check's failure becomes.
 *
 * @param {Check} check - The check that threw.
 * @param {unknown} err - What it threw.
 *
 * @returns {import('./findings.js').Finding} An error finding naming the check.
 */
const checkFailedFinding = (check, err) =>
    finding({
        id: RUNNER_ERROR_ID,
        severity: SEVERITY.ERROR,
        title: 'A diagnostic check could not be completed',
        // The check id is the whole point. Without it the report says something failed and gives
        // nobody a place to look.
        detail: `The check "${check.id}" (${check.title}) stopped with an error: ${describeError(err)}. Everything else in this report still ran.`,
        evidence: { check: check.id },
        remediation: [
            {
                text: 'Re-run with --loglevel debug and include the output in a Butler Sheet Icons issue. This is a fault in the diagnostic itself, not in the machine it was run on.',
            },
        ],
    });

/**
 * Runs a set of checks and collects their findings.
 *
 * Sequential rather than concurrent, and deliberately so: the findings appear in registry order,
 * which is what makes the rendered report read top to bottom, and no check is expensive enough
 * for the parallelism to buy anything.
 *
 * @param {Check[]} checks - Checks to run, in the order their findings should appear.
 * @param {object} ctx - The context every check is handed.
 * @param {object} [runOptions] - How to run them.
 * @param {boolean} [runOptions.allowNetwork] - Whether `needsNetwork` checks may run.
 *
 * @returns {Promise<CheckResult[]>} One result per check, in the order given.
 */
export const runChecks = async (checks, ctx, { allowNetwork = false } = {}) => {
    const results = [];

    for (const check of checks) {
        if (check.needsNetwork && !allowNetwork) {
            ctx.logger?.debug?.(
                `Doctor: skipping check "${check.id}" because it needs network access`
            );
            results.push({ check, findings: [], skipped: SKIP_NETWORK });
            continue;
        }

        try {
            // Inside the try with `run`, because a predicate is code too. An `appliesTo` that
            // throws would otherwise escape the isolation the runner exists to provide.
            if (!check.appliesTo(ctx)) {
                ctx.logger?.debug?.(`Doctor: check "${check.id}" does not apply here`);
                results.push({ check, findings: [], skipped: SKIP_NOT_APPLICABLE });
                continue;
            }

            results.push({ check, findings: asFindingList(await check.run(ctx)) });
        } catch (err) {
            results.push({ check, findings: [checkFailedFinding(check, err)] });
        }
    }

    // After every check, never during: a consequence may be registered before the cause that
    // explains it, so registry order stays a reading order rather than a correctness dependency.
    return applySupersession(results);
};

/**
 * Whatever a check returned, as a list of findings.
 *
 * A check is meant to return an array. When one returns a bare finding instead - an easy mistake,
 * and the contract invites hand-written checks - the runner used to reassemble the per-check
 * structure by slicing a flattened array with a running cursor, so a missing `.length` made the
 * cursor `NaN` and **every** finding after that point silently vanished. One malformed check
 * emptied the whole report and the command exited 0 on a broken machine.
 *
 * Coercing here means the structure is never flattened and re-cut in the first place.
 *
 * @param {unknown} produced - Whatever `check.run()` resolved to.
 *
 * @returns {object[]} The findings, always an array.
 */
const asFindingList = (produced) => {
    if (Array.isArray(produced)) {
        return produced;
    }

    // `null`/`undefined` is a check that found nothing worth saying. Anything else is a single
    // finding the author forgot to wrap.
    return produced == null ? [] : [produced];
};

/**
 * Normalises every finding and resolves supersession, preserving the per-check structure.
 *
 * Maps in place rather than flattening and re-cutting: a finding must stay attributed to the check
 * that produced it, because the renderer groups by check section and a mis-attributed finding
 * reads as the wrong subsystem having found something.
 *
 * @param {CheckResult[]} results - Results to resolve.
 *
 * @returns {CheckResult[]} The results, normalised and with superseded errors demoted.
 */
const applySupersession = (results) => {
    // Normalised before anything reasons about severity, so the renderer, the sort and the exit
    // code all see a shape they understand.
    const normalised = results.map((result) => ({
        ...result,
        findings: result.findings.map(normalizeFinding),
    }));

    // One snapshot of what failed, taken across the whole report, so a consequence may be
    // registered before its cause.
    const errorIds = errorIdsOf(normalised.flatMap((result) => result.findings));

    return normalised.map((result) => ({
        ...result,
        findings: result.findings.map((entry) => demoteIfSuperseded(entry, errorIds)),
    }));
};

/**
 * Every finding from a set of results, flattened in the order they were produced.
 *
 * @param {CheckResult[]} results - Results from {@link runChecks}.
 *
 * @returns {import('./findings.js').Finding[]} The findings.
 */
export const allFindings = (results) => results.flatMap((result) => result.findings);
