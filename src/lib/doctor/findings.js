/**
 * Findings: what a diagnostic check produces.
 *
 * A finding is plain data. It never logs, never formats and never touches process state - the
 * renderer decides how it appears and the command decides what its severity means for the exit
 * code. That separation is what lets one renderer serve `browser check` today and `doctor check`
 * tomorrow without either of them growing a special case.
 *
 * See §15.4 of `docs/todo/airgap-browser-phase-1.md` for the design rules. The two that cost the
 * most to get wrong:
 *
 * - **Finding ids are permanent and append-only.** They appear in logs, in GitHub issues and, in
 *   time, in `doctor explain`. Never reuse one, never renumber, and retire one by marking it
 *   obsolete rather than deleting it. Each area has its own block (`BSI-BROWSER-*`, `BSI-ENV-*`)
 *   so areas can grow independently.
 * - **`ok` findings are emitted, not omitted.** "I checked this and it is fine" is what lets an
 *   administrator rule a cause out, and it is what makes the output usable as a bug report.
 */

/**
 * How serious a finding is.
 *
 * `ok` and `info` are deliberately distinct. `ok` means a question was asked and answered
 * favourably, and is what rules a cause out; `info` is a fact with no verdict attached, such as
 * the machine's platform. Only `error` fails a run.
 */
export const SEVERITY = Object.freeze({
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info',
    OK: 'ok',
});

/**
 * Ordering for "worst first". Lower sorts earlier.
 */
export const SEVERITY_RANK = Object.freeze({
    [SEVERITY.ERROR]: 0,
    [SEVERITY.WARNING]: 1,
    [SEVERITY.INFO]: 2,
    [SEVERITY.OK]: 3,
});

/** The severities anything downstream of a check is allowed to see. */
const KNOWN_SEVERITIES = new Set(Object.values(SEVERITY));

/**
 * Forces a finding into the shape everything downstream assumes.
 *
 * Applied by the runner and again at the renderer's entry, so that nothing further along has to
 * test for the absurd. This exists because a check is allowed to return plain objects - the
 * contract is "one new file and one registry entry", and the next contributor will hand-write a
 * finding literal rather than call {@link finding}.
 *
 * It repairs the whole shape, not just the severity, and that scope was bought the hard way. An
 * earlier version fixed only `severity`, which left three faults live: a finding with no `facts`
 * threw `entry.facts is not iterable` *from inside the renderer's section loop* - after the
 * heading had printed, and outside the runner's per-check isolation, so the user got a
 * half-written report with no disclaimer and no `Result:` line; a finding with no `remediation`
 * got as far as printing a "Next steps:" header and then threw; and `{...null}` yielded an object
 * with a severity and nothing else.
 *
 * An unrecognised severity becomes `error`, never `info`. A finding whose severity cannot be
 * interpreted is a bug in a check, and on a command used as a deployment gate the safe reading of
 * "I do not understand this" is "something is wrong here".
 *
 * Idempotent, and returns the original object untouched when it is already well formed, so
 * applying it at more than one boundary costs nothing.
 *
 * @param {import('./findings.js').Finding} entry - The finding to normalise.
 *
 * @returns {import('./findings.js').Finding} A finding with every field the renderer reads.
 */
export const normalizeFinding = (entry) => {
    const wellFormed =
        entry !== null &&
        typeof entry === 'object' &&
        KNOWN_SEVERITIES.has(entry.severity) &&
        Array.isArray(entry.facts) &&
        Array.isArray(entry.remediation) &&
        Array.isArray(entry.supersededBy);

    if (wellFormed) {
        return entry;
    }

    const source = entry !== null && typeof entry === 'object' ? entry : {};

    return {
        ...source,
        // Marked only when the *severity* could not be read, which is what `errorIdsOf` acts on.
        // Filling in an omitted `facts` or `supersededBy` is ordinary defaulting and says nothing
        // about the finding's meaning; an uninterpretable severity does. Such a finding is
        // promoted to `error` so it still fails the run - but it must not become a *cause* that
        // explains another finding away: a check writing `severity: 'WARNING'` was repaired into
        // an error, joined the cause set, and demoted a genuine error that named its id, taking
        // the remediation an administrator needed with it.
        malformed: !KNOWN_SEVERITIES.has(source.severity),
        id: source.id ?? 'BSI-DOCTOR-002',
        severity: KNOWN_SEVERITIES.has(source.severity) ? source.severity : SEVERITY.ERROR,
        title:
            source.title ?? 'a diagnostic check returned a finding Butler Sheet Icons cannot read',
        detail:
            source.detail ??
            'The check that produced this did not describe what it found. This is a fault in the diagnostic, not in the machine it was run on.',
        facts: Array.isArray(source.facts) ? source.facts : [],
        remediation: Array.isArray(source.remediation) ? source.remediation : [],
        supersededBy: Array.isArray(source.supersededBy) ? source.supersededBy : [],
    };
};

/**
 * @typedef {object} RemediationCommand
 * @property {string} [powershell] - Command to run on Windows.
 * @property {string} [bash] - Command to run on macOS and Linux.
 */

/**
 * @typedef {object} Remediation
 * @property {string} text - What to do, in one sentence.
 * @property {RemediationCommand} [command] - The command that does it, keyed by host shell. The
 * renderer prints only the one matching this machine: Butler Sheet Icons' primary platform is
 * Windows Server, where a bash snippet is noise.
 */

/**
 * @typedef {object} Fact
 * @property {string} label - Left-hand label, e.g. `Home directory`.
 * @property {string} value - The observed value.
 * @property {string[]} [sublines] - Lines rendered one level deeper, for list-shaped facts such
 * as the contents of the browser cache.
 */

/**
 * @typedef {object} Finding
 * @property {string} id - Stable, permanent identifier, e.g. `BSI-BROWSER-003`.
 * @property {string} severity - One of {@link SEVERITY}.
 * @property {string} title - What was found, as a statement.
 * @property {string} detail - What was observed, **with the actual values**. "No browser found"
 * helps nobody; naming the directory, the builds in it and this machine's platform ends the
 * investigation.
 * @property {Fact[]} facts - Key/value rows for the human renderer.
 * @property {object} [evidence] - Structured data behind the finding, for JSON output.
 * @property {Remediation[]} remediation - Ordered, concrete steps.
 * @property {string[]} supersededBy - Finding ids that, if present as errors in the same report,
 * explain this one. See {@link supersede}.
 * @property {string} [docs] - Relative doc-site path, resolved to a URL by the renderer and
 * printed as a bare path offline.
 */

/**
 * Builds a finding, filling in the fields a check did not need.
 *
 * Every field has a default so a check can state only what it knows, and so the renderer never
 * has to test for absence. `facts` and `remediation` are always arrays for that reason.
 *
 * @param {object} spec - The finding's fields.
 * @param {string} spec.id - Stable identifier.
 * @param {string} spec.severity - One of {@link SEVERITY}.
 * @param {string} spec.title - What was found.
 * @param {string} spec.detail - What was observed, with values.
 * @param {Fact[]} [spec.facts] - Key/value rows.
 * @param {object} [spec.evidence] - Structured evidence.
 * @param {Remediation[]} [spec.remediation] - Ordered remediation steps.
 * @param {string[]} [spec.supersededBy] - Finding ids that explain this one.
 * @param {string} [spec.docs] - Relative doc-site path.
 *
 * @returns {Finding} The finding.
 */
export const finding = ({
    id,
    severity,
    title,
    detail,
    facts = [],
    evidence,
    remediation = [],
    supersededBy = [],
    docs,
}) => ({
    id,
    severity,
    title,
    detail,
    facts,
    evidence,
    remediation,
    supersededBy,
    docs,
});

/**
 * Ids of every finding currently reported as an error.
 *
 * Computed once from the whole report and handed to {@link demoteIfSuperseded}, so supersession is
 * decided against a single snapshot rather than re-derived per check.
 *
 * @param {Finding[]} findings - Every finding in the report.
 *
 * @returns {Set<string>} The error ids.
 */
export const errorIdsOf = (findings) =>
    new Set(
        findings
            // A finding the runner had to repair is not evidence of anything. It still fails the
            // run, which is right, but only a finding a check actually meant may explain another
            // one away - see the `malformed` marker in {@link normalizeFinding}.
            .filter((entry) => entry.severity === SEVERITY.ERROR && !entry.malformed)
            .map((entry) => entry.id)
    );

/**
 * Demotes one error whose cause is present among `errorIds`.
 *
 * Separated from {@link supersede} so the runner can resolve supersession without flattening the
 * per-check structure and slicing it back apart - reassembly by cursor arithmetic was how a single
 * malformed check erased every finding in the report.
 *
 * @param {Finding} entry - The finding to consider.
 * @param {Set<string>} errorIds - Ids of every finding reported as an error in this run.
 *
 * @returns {Finding} The finding, demoted if one of its declared causes is present.
 */
export const demoteIfSuperseded = (entry, errorIds) => {
    // Defensive about the field's absence rather than trusting `finding()` to have filled it in:
    // a check is free to return plain objects, and the runner's promise that one bad check cannot
    // take down the report has to survive that.
    const causes = entry.supersededBy ?? [];

    if (entry.severity !== SEVERITY.ERROR || causes.length === 0) {
        return entry;
    }

    // Never itself: a self-referential declaration would demote an error on the strength of its
    // own presence, which is the one input that makes "fails safe" false.
    const cause = causes.find((id) => id !== entry.id && errorIds.has(id));

    if (!cause) {
        return entry;
    }

    return {
        ...entry,
        severity: SEVERITY.INFO,
        // The cause carries the advice. Keeping a copy here is what put the same fix in the list
        // twice.
        remediation: [],
        supersededByFinding: cause,
    };
};

/**
 * Demotes error findings whose cause is already reported, once every check has run.
 *
 * A consequence and its cause are often both true - "the cached browsers are for another operating
 * system" *and* "no browser could be selected" - and reporting both as errors produced a "Next
 * steps" list whose second half repeated its first. So a consequence names the ids that would
 * explain it, and is demoted to `info` when one of them is actually present.
 *
 * Three properties make this safe, and each was bought by a real defect:
 *
 * - **It is declarative, not predictive.** Checks used to infer "a cache check will have raised an
 *   error" from the shape of the cache. That inference held only while `usable` meant exactly
 *   `canRunHere && executableExists`; the moment a build could be unusable for a third reason,
 *   every check reported OK, the one real error demoted itself, and `browser check` exited **0** on
 *   a machine that could not take a screenshot.
 * - **It fails safe.** With no matching cause present the error stands, so an unexplained failure
 *   is still a failure. Only an `error` supersedes: a warning left the run passable, and demoting
 *   an error on the strength of one would leave the report with nothing to fail on.
 * - **A finding cannot supersede itself.** Without that, a self-referential declaration demoted an
 *   error on the strength of its own presence - and a pair naming each other demoted both, leaving
 *   a report with two real problems, no errors, and exit code 0.
 *
 * Resolved after every check has run, so a consequence may be registered before its cause.
 *
 * @param {Finding[]} findings - Every finding in the report.
 *
 * @returns {Finding[]} The same findings, with superseded errors demoted and their now-duplicated
 * remediation dropped.
 */
export const supersede = (findings) => {
    const errorIds = errorIdsOf(findings);

    return findings.map((entry) => demoteIfSuperseded(entry, errorIds));
};

/**
 * Whether a set of findings should fail the run.
 *
 * One rule, in one place, so `browser check`'s exit code and the renderer's `Result:` line cannot
 * disagree about what "failed" means. Only `error` counts: a warning is something worth knowing
 * that did not stop this machine from working, and failing on those would make the command
 * useless as a deployment gate.
 *
 * @param {Finding[]} findings - Findings to judge.
 *
 * @returns {boolean} `true` when nothing failed.
 */
export const isHealthy = (findings) => findings.every((entry) => entry.severity !== SEVERITY.ERROR);

/**
 * Findings sorted worst first, preserving the order checks ran in within a severity.
 *
 * @param {Finding[]} findings - Findings to sort.
 *
 * @returns {Finding[]} A new, sorted array.
 */
export const worstFirst = (findings) =>
    [...findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
