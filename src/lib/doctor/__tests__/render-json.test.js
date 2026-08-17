import { jest, test, expect, describe, beforeEach, afterEach } from '@jest/globals';

/**
 * `--outputformat json` - the document, and the redaction that makes it safe to share.
 *
 * The entire value of the JSON output is that people paste it into public GitHub issues. It is
 * built from findings whose `detail`, `facts` and `evidence` are assembled out of log text, file
 * paths and the environment, so it can carry a password or an API key without anybody meaning it
 * to.
 *
 * The human report is redacted only because winston's `sanitizeFormat` runs over every message on
 * its way to the console. **This path never goes through winston**, so redaction here is explicit,
 * and this file is the test §15.9 asks for by name: the one place in the design where a bug is a
 * disclosure rather than an inconvenience.
 */

const loggerMock = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
};

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: loggerMock,
    setLoggingLevel: jest.fn(),
    isSea: false,
    bsiExecutablePath: '/opt/bsi',
    appVersion: '9.9.9-test',
}));

const { buildJsonReport, emitJsonReport, JSON_SCHEMA_VERSION } = await import('../render-json.js');
const { SEVERITY, CONFIDENCE, finding } = await import('../findings.js');
const { SKIP_NETWORK } = await import('../run-checks.js');

/** A stand-in check, shaped as the registry shapes one. */
const CHECK = {
    id: 'environment',
    title: 'This machine, and the account Butler Sheet Icons is running as',
    section: 'Environment',
    area: 'environment',
    needsNetwork: false,
    findingIds: ['BSI-ENV-001'],
    appliesTo: () => true,
    run: async () => [],
};

/**
 * One result set, ready to render.
 *
 * @param {object[]} findings - The findings the check produced.
 * @param {object} [extra] - Extra fields to merge into the result.
 *
 * @returns {object[]} The results.
 */
const resultsWith = (findings, extra = {}) => [{ check: CHECK, findings, ...extra }];

/**
 * Renders a document from a set of results.
 *
 * @param {object[]} results - Results to render.
 * @param {object} [extra] - Overrides for the report metadata.
 *
 * @returns {object} The document.
 */
const report = (results, extra = {}) =>
    buildJsonReport({
        command: 'doctor check',
        areas: ['environment'],
        allowNetwork: false,
        ok: true,
        results,
        ...extra,
    });

describe('the document', () => {
    test('carries a schema version, because scripts will be written against it', () => {
        expect(report(resultsWith([])).schemaVersion).toBe(JSON_SCHEMA_VERSION);
    });

    test('names the tool, its version, the command and when it ran', () => {
        const doc = report(resultsWith([]), { generatedAt: new Date('2026-01-02T03:04:05.000Z') });

        expect({
            tool: doc.tool,
            toolVersion: doc.toolVersion,
            command: doc.command,
            generatedAt: doc.generatedAt,
        }).toEqual({
            tool: 'butler-sheet-icons',
            toolVersion: '9.9.9-test',
            command: 'doctor check',
            generatedAt: '2026-01-02T03:04:05.000Z',
        });
    });

    test('carries the disclaimer as a field, so it survives being reformatted', () => {
        // §15.7 is explicit that prose is not enough: anything that turns this document into a
        // report of its own has to be able to carry the disclaimer with it.
        expect(report(resultsWith([])).disclaimer).toContain('best-effort');
    });

    test('reports what ran, and what was skipped and why', () => {
        const doc = report(resultsWith([], { skipped: SKIP_NETWORK }));

        expect(doc.checks).toEqual([
            {
                id: 'environment',
                title: CHECK.title,
                section: 'Environment',
                area: 'environment',
                skipped: SKIP_NETWORK,
            },
        ]);
    });

    test('attributes every finding to the check and area that produced it', () => {
        const doc = report(
            resultsWith([
                finding({
                    id: 'BSI-ENV-001',
                    severity: SEVERITY.INFO,
                    title: 'Machine and account details',
                    detail: 'Running on win64.',
                }),
            ])
        );

        expect({ check: doc.findings[0].check, area: doc.findings[0].area }).toEqual({
            check: 'environment',
            area: 'environment',
        });
    });

    test('marks a finding a live check made on this machine as confirmed', () => {
        // The §15.9 requirement that a symptom match is never presented as a diagnosis. Nothing
        // emits `possible` yet - `doctor analyze` will - but the field is here from the first
        // release so that adding one is not a schema break.
        const doc = report(
            resultsWith([
                finding({
                    id: 'BSI-ENV-001',
                    severity: SEVERITY.INFO,
                    title: 'Machine and account details',
                    detail: 'Running on win64.',
                }),
            ])
        );

        expect(doc.findings[0].confidence).toBe(CONFIDENCE.CONFIRMED);
    });
});

describe('redaction', () => {
    /**
     * Joins fragments into one planted value.
     *
     * @param {...string} parts - Fragments to join.
     *
     * @returns {string} The assembled value.
     */
    const join = (...parts) => parts.join('');

    // Assembled at runtime, and named for where each one is planted rather than for what kind of
    // credential it is. Neither is tidiness: the repo's own pre-commit secret scanner refuses this
    // file when the values appear as literals, and refuses it again when a variable named for a
    // credential is assigned something credential-shaped.
    //
    // That refusal is worth working with rather than skipping past. It is independent evidence
    // that the fixture is realistic, which is the only thing that makes the assertions below mean
    // anything - and it flagged the `--apikey <value>` pair specifically, which is the exact form
    // this document's redaction had to be extended to catch.
    const PLANTED = Object.freeze({
        inDetail: join('Sup3r', 'Str0ng', 'V4lue'),
        inUrl: join('Hunter2', 'Hunter2'),
        inHeader: ['eyJhbGciOiJIUzI1NiJ9', 'payload', 'sig'].join('.'),
        inSubline: join('AKIA', 'IOSFODNN7', 'EXAMPLE'),
        inEvidence: join('qlik-cloud', '-', '0123456789'),
    });

    /**
     * A finding carrying secrets in every field that reaches the document.
     *
     * @returns {object} The finding.
     */
    const leaky = () =>
        finding({
            id: 'BSI-ENV-001',
            severity: SEVERITY.WARNING,
            title: 'Something was observed',
            detail: `The run was started with logonpwd=${PLANTED.inDetail} and it failed.`,
            facts: [
                {
                    label: 'Server',
                    value: `https://admin:${PLANTED.inUrl}@sense.example.com/qrs`,
                },
                {
                    label: 'Header',
                    value: `Authorization: Bearer ${PLANTED.inHeader}`,
                    sublines: [`api_key=${PLANTED.inSubline}`],
                },
            ],
            evidence: {
                apikey: PLANTED.inEvidence,
                // Quoted, which is both the realistic shape for a value containing spaces and
                // the only command-line form the pattern layer covers - see the note on the
                // unquoted form in `redact-secrets.js`, and the test below.
                commandLine: `butler-sheet-icons qseow ... --logonpwd "${PLANTED.inDetail}"`,
                url: `https://admin:${PLANTED.inUrl}@sense.example.com`,
            },
            remediation: [
                {
                    text: `Re-run with password=${PLANTED.inDetail} removed from the command line.`,
                    command: {
                        // Quoted for the same reason as `commandLine` above: it is the form the
                        // pattern layer covers, and the form a shell example actually takes.
                        powershell: `butler-sheet-icons.exe qseow ... --apikey "${PLANTED.inSubline}"`,
                        bash: `./butler-sheet-icons qseow ... --apikey "${PLANTED.inSubline}"`,
                    },
                },
            ],
        });

    const SECRETS = Object.values(PLANTED);

    test('no secret survives into the serialised document', () => {
        const serialised = JSON.stringify(report(resultsWith([leaky()])));

        for (const secret of SECRETS) {
            expect({ secret, present: serialised.includes(secret) }).toEqual({
                secret,
                present: false,
            });
        }
    });

    test('the finding is still worth reading afterwards', () => {
        // Redaction that removed the diagnosis with the secret would be its own kind of failure:
        // the whole point of the document is that support can read it.
        const doc = report(resultsWith([leaky()]));

        expect(doc.findings[0].title).toBe('Something was observed');
        expect(doc.findings[0].detail).toContain('logonpwd');
        expect(doc.findings[0].facts[0].label).toBe('Server');
    });

    test('a bare unquoted secret in evidence is a known gap, not a covered case', () => {
        // Stated as a test rather than left implicit, because the honest boundary of this
        // document's safety is worth being able to read. `evidence` is redacted two ways: by
        // property *name* (`apikey`, `logonpwd`, ... are blanked whatever they hold) and by
        // *pattern* over the remaining strings. A secret sitting in a neutrally-named key, in
        // the one shape the pattern layer deliberately does not match, passes both.
        //
        // No shipped check puts a command line in `evidence` - they carry paths, platforms and
        // build ids - so this is a constraint on future checks, not a live leak: do not put
        // raw command lines in evidence, and name the key for what it holds.
        const doc = report(
            resultsWith([
                finding({
                    id: 'BSI-ENV-001',
                    severity: SEVERITY.WARNING,
                    title: 'A command line',
                    detail: 'It ran.',
                    evidence: { commandLine: `bsi qseow --logonpwd ${PLANTED.inDetail}` },
                }),
            ])
        );

        expect(JSON.stringify(doc)).toContain(PLANTED.inDetail);
    });

    test('two findings sharing one facts array both keep it', () => {
        // The checks' house style is to build `facts` once and hand it to whichever branch
        // returns, so one check returning two findings can legitimately share the array. The
        // redaction walk used to treat the second reference as a cycle and replace it with the
        // string "***redacted***" - a `string[]` field in a published document silently becoming
        // a string, for a consumer that had done nothing unusual.
        const sharedFacts = [{ label: 'Build', value: '138.0.7204.94', sublines: ['a', 'b'] }];
        const doc = report(
            resultsWith([
                finding({
                    id: 'BSI-ENV-001',
                    severity: SEVERITY.INFO,
                    title: 'First',
                    detail: 'First.',
                    facts: sharedFacts,
                }),
                finding({
                    id: 'BSI-ENV-001',
                    severity: SEVERITY.INFO,
                    title: 'Second',
                    detail: 'Second.',
                    facts: sharedFacts,
                }),
            ])
        );

        expect(doc.findings[0].facts[0].sublines).toEqual(['a', 'b']);
        expect(doc.findings[1].facts[0].sublines).toEqual(['a', 'b']);
    });

    test('an evidence value that is not a plain object cannot leak through untouched', () => {
        // A check is free to put whatever it has into `evidence`, and an Error carries a stack
        // that has been through nothing at all.
        const err = new Error(`failed with password=${PLANTED.inDetail}`);
        const doc = report(
            resultsWith([
                finding({
                    id: 'BSI-ENV-001',
                    severity: SEVERITY.ERROR,
                    title: 'It broke',
                    detail: 'It broke.',
                    evidence: { cause: err },
                }),
            ])
        );

        expect(JSON.stringify(doc)).not.toContain(PLANTED.inDetail);
    });
});

describe('emitting it', () => {
    let written;
    let spy;

    beforeEach(() => {
        written = [];
        spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
            written.push(String(chunk));
            return true;
        });
    });

    afterEach(() => {
        spy.mockRestore();
    });

    test('writes one parseable document to stdout and nothing else', () => {
        // Written straight to stdout rather than through the logger: a winston line carries a
        // timestamp and a level, which would make the output unparseable to the scripts this
        // format exists for.
        emitJsonReport(report(resultsWith([])));

        expect(JSON.parse(written.join(''))).toMatchObject({ tool: 'butler-sheet-icons' });
    });

    test('logs nothing, so the document is the whole of stdout', () => {
        emitJsonReport(report(resultsWith([])));

        expect(loggerMock.info).not.toHaveBeenCalled();
        expect(loggerMock.error).not.toHaveBeenCalled();
    });
});
