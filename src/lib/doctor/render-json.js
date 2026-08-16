import { appVersion } from '../../globals.js';
import { redactSensitivePatterns, redactValue } from '../util/redact-secrets.js';
import { CONFIDENCE, normalizeFinding } from './findings.js';
import { BEST_EFFORT_DISCLAIMER } from './render-report.js';

/**
 * The machine-readable form of a diagnostic report.
 *
 * Two audiences, and the second is the one that pays for this. A script gating a deployment can
 * read the findings; more usefully, support can ask for this document in a GitHub issue and get a
 * complete picture of a machine they cannot log in to.
 *
 * That second use is also the risk. **The whole value of this format is that people paste it
 * somewhere public**, and it is built from findings whose `detail`, `facts` and `evidence` are
 * assembled out of log text, file paths and the environment. The human report is redacted only
 * because winston's `sanitizeFormat` runs over every message on its way to the console; this path
 * never touches winston, so redaction here is explicit and unconditional. See
 * `__tests__/render-json.test.js`, which is the dedicated test §15.9 asks for by name.
 */

/**
 * The version of the document this module emits.
 *
 * Treated as a public interface, because it becomes one the moment somebody scripts against it.
 * Add fields freely; renaming or removing one, or changing what an existing field means, is a
 * version bump.
 */
export const JSON_SCHEMA_VERSION = 1;

/**
 * Applies pattern redaction to every string in a value, however deeply nested.
 *
 * The second of two layers. {@link redactValue} runs first and works on property *names* - it
 * blanks anything called `apikey` or `logonpwd` whatever it holds, and flattens class instances
 * and other exotic objects to a placeholder rather than introspecting them, which is what stops an
 * `Error` sitting in `evidence` from carrying an unredacted stack into the document. This layer
 * then works on the *values*, catching the credential that arrived inside an ordinary sentence:
 * a URL with an embedded password, an `Authorization: Bearer` header quoted from a log.
 *
 * Neither layer is sufficient alone, which is why both run.
 *
 * @param {unknown} value - The value to walk.
 *
 * @returns {unknown} The same shape, with every string redacted.
 */
const redactStrings = (value) => {
    if (typeof value === 'string') {
        return redactSensitivePatterns(value);
    }

    if (Array.isArray(value)) {
        return value.map(redactStrings);
    }

    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [key, redactStrings(entry)])
        );
    }

    return value;
};

/**
 * Both redaction layers, in the order they have to run.
 *
 * @param {unknown} value - The value to redact.
 *
 * @returns {unknown} A safe copy.
 */
const redact = (value) => redactStrings(redactValue(value));

/**
 * One finding, as the document carries it.
 *
 * @param {import('./findings.js').Finding} entry - The finding.
 * @param {import('./run-checks.js').Check} check - The check that produced it.
 *
 * @returns {object} The serialisable finding.
 */
const findingDocument = (entry, check) => ({
    id: entry.id,
    severity: entry.severity,
    // Absent means observed. Every finding a check produces is observed on this machine, so the
    // default is `confirmed` and a symptom match will have to say otherwise explicitly.
    confidence: entry.confidence ?? CONFIDENCE.CONFIRMED,
    // Which check said this, and about what. The human report carries the same information as a
    // section heading; here it has to be on the finding, because a consumer will filter and
    // re-order these and the heading would not survive it.
    check: check.id,
    area: check.area,
    title: entry.title,
    detail: entry.detail,
    facts: entry.facts.map((fact) => ({
        label: fact.label,
        value: fact.value,
        sublines: fact.sublines ?? [],
    })),
    evidence: entry.evidence ?? null,
    remediation: entry.remediation.map((step) => ({
        text: step.text,
        // Both platforms, unlike the human report which prints only the one matching this host:
        // a document read on another machine, or by support, should not have had the other half
        // thrown away.
        command: step.command ?? null,
    })),
    docs: entry.docs ?? null,
    supersededBy: entry.supersededBy,
    supersededByFinding: entry.supersededByFinding ?? null,
});

/**
 * Builds the report document.
 *
 * @param {object} args - What to render.
 * @param {string} args.command - The command that produced this, e.g. `doctor check`.
 * @param {string[]} args.areas - The areas that were requested.
 * @param {string[]} [args.examined] - The areas at least one check actually ran for. A subset of
 * `areas`, and the field a consumer should read before believing `ok`: an area can be requested and
 * still be examined by nothing, because it has no checks registered or because every check it does
 * have was skipped.
 * @param {boolean} args.allowNetwork - Whether network-using checks were allowed.
 * @param {boolean} args.ok - Whether the run passed.
 * @param {import('./run-checks.js').CheckResult[]} args.results - Results from `runChecks`.
 * @param {Date} [args.generatedAt] - When the run happened. A parameter only so the shape can be
 * asserted against a fixed value.
 *
 * @returns {object} The document, fully redacted.
 */
export const buildJsonReport = ({
    command,
    areas,
    examined = areas,
    allowNetwork,
    ok,
    results,
    generatedAt = new Date(),
}) => {
    // Normalised here as well as in the runner, for the same reason the human renderer does it:
    // this function is callable on its own, and a finding missing `facts` would otherwise throw
    // from inside the map rather than being repaired.
    const safeResults = results.map((result) => ({
        ...result,
        findings: result.findings.map(normalizeFinding),
    }));

    const document = {
        schemaVersion: JSON_SCHEMA_VERSION,
        tool: 'butler-sheet-icons',
        toolVersion: appVersion,
        command,
        generatedAt: generatedAt.toISOString(),
        areas: [...areas],
        // What was asked for and what was actually looked at, separately. `ok` is a statement
        // about `examined`, never about `areas`, and a consumer that reads only the latter can
        // draw exactly the false conclusion this command exists to prevent.
        examined: [...examined],
        allowNetwork,
        // A field, not just prose. §15.7 is explicit: the disclaimer has to survive into anything
        // that reformats this report, and a consumer building a page out of the findings would
        // otherwise drop the one line that says they are best-effort.
        disclaimer: BEST_EFFORT_DISCLAIMER.join(' '),
        ok,
        checks: safeResults.map((result) => ({
            id: result.check.id,
            title: result.check.title,
            section: result.check.section,
            area: result.check.area,
            skipped: result.skipped ?? null,
        })),
        findings: safeResults.flatMap((result) =>
            result.findings.map((entry) => findingDocument(entry, result.check))
        ),
    };

    return redact(document);
};

/**
 * Writes a report document to stdout.
 *
 * Straight to the stream rather than through the logger, and that is the point: a winston line
 * carries a timestamp and a level, so a document logged rather than written is not JSON any more.
 * The caller holds the console quiet for the same reason.
 *
 * @param {object} document - The document from {@link buildJsonReport}.
 *
 * @returns {void}
 */
export const emitJsonReport = (document) => {
    process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
};
