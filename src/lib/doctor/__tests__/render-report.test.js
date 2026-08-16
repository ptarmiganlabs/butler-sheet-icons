import { jest, test, expect, describe, beforeEach } from '@jest/globals';

const loggerMock = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
};

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: loggerMock,
}));

const { renderReport, BEST_EFFORT_DISCLAIMER } = await import('../render-report.js');
const { CONFIDENCE, SEVERITY } = await import('../findings.js');

/**
 * The shared renderer.
 *
 * `browser check`'s output comes from here rather than being formatted inline, which is what makes
 * the second diagnostic nearly free. The consequence tested throughout this file is that the
 * renderer knows nothing about browsers: it renders sections, facts, findings and remediation,
 * whatever produced them.
 */

/**
 * A check result as the runner produces one.
 *
 * @param {string} section - Section heading the check belongs under.
 * @param {object[]} findings - Findings the check produced.
 * @param {object} [extra] - Extra fields on the result.
 *
 * @returns {object} A check result.
 */
const result = (section, findings, extra = {}) => ({
    check: { id: `${section.toLowerCase()}-check`, title: `${section} check`, section },
    findings,
    ...extra,
});

/**
 * Every line at every level, in the order they were logged.
 *
 * @returns {string[]} The lines, each prefixed with the level it went to.
 */
const lines = () =>
    [
        ...loggerMock.info.mock.calls.map(([line]) => ['info', String(line)]),
        ...loggerMock.warn.mock.calls.map(([line]) => ['warn', String(line)]),
        ...loggerMock.error.mock.calls.map(([line]) => ['error', String(line)]),
    ].map(([level, line]) => `${level}: ${line}`);

/**
 * Only the lines the renderer sent at info, in order.
 *
 * @returns {string[]} The lines.
 */
const infoLines = () => loggerMock.info.mock.calls.map(([line]) => String(line));

/**
 * Only the lines the renderer sent at error, in order.
 *
 * @returns {string[]} The lines.
 */
const errorLines = () => loggerMock.error.mock.calls.map(([line]) => String(line));

beforeEach(() => {
    loggerMock.info.mockClear();
    loggerMock.warn.mockClear();
    loggerMock.error.mockClear();
    loggerMock.verbose.mockClear();
    loggerMock.debug.mockClear();
});

describe('sections and facts', () => {
    test('prints one heading per section, in the order the checks ran', () => {
        renderReport({
            heading: 'Butler Sheet Icons browser check',
            results: [
                result('Environment', [
                    {
                        id: 'BSI-ENV-001',
                        severity: SEVERITY.INFO,
                        title: 'Environment',
                        detail: 'x',
                        facts: [{ label: 'Platform', value: 'win32 x64' }],
                        remediation: [],
                    },
                ]),
                result('Browser cache', [
                    {
                        id: 'BSI-BROWSER-005',
                        severity: SEVERITY.OK,
                        title: 'Cached browsers match this machine',
                        detail: 'x',
                        facts: [{ label: 'Directory', value: 'C:\\bsi\\cache' }],
                        remediation: [],
                    },
                ]),
            ],
            okMessage: 'fine',
        });

        expect(infoLines()).toEqual([
            'Butler Sheet Icons browser check',
            'Environment',
            '    Platform            : win32 x64',
            'Browser cache',
            '    Directory           : C:\\bsi\\cache',
            ...BEST_EFFORT_DISCLAIMER,
            expect.stringContaining('Result: OK'),
        ]);
    });

    test('two checks sharing a section print one heading between them', () => {
        // §7.3 has one "Browser cache" block, and §15.3 has two checks looking at the cache. The
        // section is what reconciles them, and it is why a check declares one.
        renderReport({
            heading: 'h',
            results: [
                result('Browser cache', [
                    {
                        id: 'A',
                        severity: SEVERITY.OK,
                        title: 't',
                        detail: 'd',
                        facts: [{ label: 'Directory', value: '/cache' }],
                        remediation: [],
                    },
                ]),
                result('Browser cache', [
                    {
                        id: 'B',
                        severity: SEVERITY.OK,
                        title: 't',
                        detail: 'd',
                        facts: [{ label: 'Cached builds', value: '1' }],
                        remediation: [],
                    },
                ]),
            ],
            okMessage: 'fine',
        });

        expect(infoLines().filter((line) => line === 'Browser cache')).toHaveLength(1);
    });

    test('renders sub-lines under the fact they belong to', () => {
        renderReport({
            heading: 'h',
            results: [
                result('Browser cache', [
                    {
                        id: 'A',
                        severity: SEVERITY.OK,
                        title: 't',
                        detail: 'd',
                        facts: [
                            {
                                label: 'Cached builds',
                                value: '2',
                                sublines: ['chrome 138 usable', 'chrome 131 not usable'],
                            },
                        ],
                        remediation: [],
                    },
                ]),
            ],
            okMessage: 'fine',
        });

        expect(infoLines()).toContain('        chrome 138 usable');
        expect(infoLines()).toContain('        chrome 131 not usable');
    });

    test('a section whose check was skipped is left out entirely', () => {
        renderReport({
            heading: 'h',
            results: [result('Launch test', [], { skipped: 'not-applicable' })],
            okMessage: 'fine',
        });

        expect(infoLines()).not.toContain('Launch test');
    });
});

describe('findings', () => {
    test('an error finding states what was observed, at error level', () => {
        renderReport({
            heading: 'h',
            results: [
                result('Selection', [
                    {
                        id: 'BSI-BROWSER-011',
                        severity: SEVERITY.ERROR,
                        title: 'no usable browser was found',
                        detail: 'The cache at D:\\bsi holds no chrome build this machine can run.',
                        facts: [],
                        remediation: [{ text: 'Stage a browser.' }],
                    },
                ]),
            ],
            okMessage: 'fine',
        });

        expect(errorLines()).toContain(
            '    The cache at D:\\bsi holds no chrome build this machine can run.'
        );
    });

    test('an ok finding does not shout at info, but is visible at verbose', () => {
        // §7.3's healthy output is facts, not a wall of "OK: ..." lines. The titles are still
        // emitted, one level down, so a verbose run says what was actually examined.
        renderReport({
            heading: 'h',
            results: [
                result('Browser cache', [
                    {
                        id: 'BSI-BROWSER-005',
                        severity: SEVERITY.OK,
                        title: 'Cached browsers match this machine',
                        detail: 'One chrome build, for win64.',
                        facts: [],
                        remediation: [],
                    },
                ]),
            ],
            okMessage: 'fine',
        });

        expect(infoLines().join('\n')).not.toContain('Cached browsers match this machine');
        expect(loggerMock.verbose.mock.calls.map(([line]) => String(line)).join('\n')).toContain(
            'Cached browsers match this machine'
        );
    });

    test('a warning finding is rendered at warn, and does not fail the run', () => {
        renderReport({
            heading: 'h',
            results: [
                result('Browser executable', [
                    {
                        id: 'BSI-BROWSER-003',
                        severity: SEVERITY.WARNING,
                        title: 'PUPPETEER_EXECUTABLE_PATH names a file that does not exist',
                        detail: 'Set to "/usr/bin/chromium-browser", which is not there.',
                        facts: [],
                        remediation: [],
                    },
                ]),
            ],
            okMessage: 'fine',
        });

        expect(loggerMock.warn.mock.calls.map(([line]) => String(line)).join('\n')).toContain(
            'which is not there'
        );
        expect(infoLines().at(-1)).toContain('Result: OK');
    });
});

describe('the result line', () => {
    test("is OK when nothing failed, and carries the command's own headline", () => {
        renderReport({
            heading: 'h',
            results: [result('Environment', [])],
            okMessage: 'Butler Sheet Icons can take screenshots on this machine.',
        });

        expect(infoLines().at(-1)).toBe(
            'Result: OK - Butler Sheet Icons can take screenshots on this machine.'
        );
    });

    test('is FAILED when any finding is an error, and quotes the first one', () => {
        renderReport({
            heading: 'h',
            results: [
                result('Selection', [
                    {
                        id: 'BSI-BROWSER-011',
                        severity: SEVERITY.ERROR,
                        title: 'no usable browser was found, and taking screenshots would require downloading one over the internet',
                        detail: 'd',
                        facts: [],
                        remediation: [{ text: 'Stage a browser.' }],
                    },
                ]),
            ],
            okMessage: 'fine',
        });

        expect(errorLines()).toContain(
            'Result: FAILED - no usable browser was found, and taking screenshots would require downloading one over the internet'
        );
    });

    test('reports the outcome it renders', () => {
        const ok = renderReport({
            heading: 'h',
            results: [
                result('Selection', [
                    {
                        id: 'X',
                        severity: SEVERITY.ERROR,
                        title: 't',
                        detail: 'd',
                        facts: [],
                        remediation: [{ text: 'Do a thing.' }],
                    },
                ]),
            ],
            okMessage: 'fine',
        });

        expect(ok).toBe(false);
    });
});

describe('remediation', () => {
    test('is numbered once across every error finding, worst first', () => {
        renderReport({
            heading: 'h',
            results: [
                result('A', [
                    {
                        id: 'X',
                        severity: SEVERITY.WARNING,
                        title: 't',
                        detail: 'd',
                        facts: [],
                        remediation: [{ text: 'A warning step.' }],
                    },
                ]),
                result('B', [
                    {
                        id: 'Y',
                        severity: SEVERITY.ERROR,
                        title: 't',
                        detail: 'd',
                        facts: [],
                        remediation: [{ text: 'First step.' }, { text: 'Second step.' }],
                    },
                ]),
            ],
            okMessage: 'fine',
        });

        expect(errorLines()).toContain('Next steps:');
        expect(errorLines()).toContain('    1. First step.');
        expect(errorLines()).toContain('    2. Second step.');
        // A warning's advice does not belong in the "this run failed, do these things" list.
        expect(errorLines().join('\n')).not.toContain('A warning step.');
    });

    test('prints the command for the host, not both', () => {
        // BSI's primary platform is Windows Server, where a bash snippet is noise.
        renderReport({
            heading: 'h',
            results: [
                result('A', [
                    {
                        id: 'X',
                        severity: SEVERITY.ERROR,
                        title: 't',
                        detail: 'd',
                        facts: [],
                        remediation: [
                            {
                                text: 'Install it.',
                                command: {
                                    powershell: 'butler-sheet-icons.exe browser install',
                                    bash: './butler-sheet-icons browser install',
                                },
                            },
                        ],
                    },
                ]),
            ],
            okMessage: 'fine',
            platform: 'win32',
        });

        const text = errorLines().join('\n');

        expect(text).toContain('butler-sheet-icons.exe browser install');
        expect(text).not.toContain('./butler-sheet-icons browser install');
    });

    test('prints the bash command on a non-Windows host', () => {
        renderReport({
            heading: 'h',
            results: [
                result('A', [
                    {
                        id: 'X',
                        severity: SEVERITY.ERROR,
                        title: 't',
                        detail: 'd',
                        facts: [],
                        remediation: [
                            {
                                text: 'Install it.',
                                command: {
                                    powershell: 'butler-sheet-icons.exe browser install',
                                    bash: './butler-sheet-icons browser install',
                                },
                            },
                        ],
                    },
                ]),
            ],
            okMessage: 'fine',
            platform: 'linux',
        });

        expect(errorLines().join('\n')).toContain('./butler-sheet-icons browser install');
    });
});

describe('a malformed finding cannot take down the report', () => {
    // The runner isolates each check, but everything from the renderer onward was unguarded: a
    // severity outside the four it knows made `logger[undefined]` a TypeError, thrown after the
    // heading and facts had already printed, so the user got a half-written report with no
    // disclaimer and no Result line.
    const malformed = {
        id: 'BSI-TEST-001',
        severity: 'critical',
        title: 'a severity nobody declared',
        detail: 'something went wrong',
        facts: [{ label: 'Thing', value: 'value' }],
        remediation: [{ text: 'Do a thing.' }],
    };

    test.each([
        ['no facts', { id: 'X', severity: SEVERITY.ERROR, title: 't', detail: 'd' }],
        [
            'no remediation',
            { id: 'X', severity: SEVERITY.ERROR, title: 't', detail: 'd', facts: [] },
        ],
        ['nothing but a severity', { severity: SEVERITY.ERROR }],
        ['a null finding', null],
    ])('a finding with %s renders rather than throwing', (_name, entry) => {
        // supersede()'s own contract says "a check is free to return plain objects", so the
        // renderer has to survive them. Repairing only `severity` left `for (const fact of
        // entry.facts)` throwing from inside the section loop - after the heading had printed and
        // outside the runner's isolation, producing exactly the truncated report with no
        // disclaimer and no Result line that the repair was written to prevent.
        expect(() =>
            renderReport({ heading: 'h', results: [result('A', [entry])], okMessage: 'fine' })
        ).not.toThrow();

        const text = lines().join('\n');

        expect(text).toContain(BEST_EFFORT_DISCLAIMER[0]);
        expect(text).toContain('Result:');
    });

    test('renders rather than throwing', () => {
        expect(() =>
            renderReport({
                heading: 'h',
                results: [result('A', [malformed])],
                okMessage: 'fine',
            })
        ).not.toThrow();

        // And the report is complete, not truncated at the point of the bad finding.
        expect(lines().join('\n')).toContain(BEST_EFFORT_DISCLAIMER[0]);
        expect(lines().join('\n')).toContain('Result:');
    });

    test('is treated as a failure rather than silently passing', () => {
        // A finding whose severity cannot be interpreted is a bug in a check. On a command used
        // as a deployment gate, the safe reading is "something is wrong here", not "fine".
        const ok = renderReport({
            heading: 'h',
            results: [result('A', [malformed])],
            okMessage: 'fine',
        });

        expect(ok).toBe(false);
    });
});

describe('the FAILED headline names the machine problem, not the diagnostic', () => {
    // BSI-DOCTOR-001 is emitted in place of whichever check threw, so registry position could put
    // it first among errors and let it speak for the machine - burying the real diagnosis under
    // "re-run with --loglevel debug and file an issue".
    const runnerError = {
        id: 'BSI-DOCTOR-001',
        severity: SEVERITY.ERROR,
        title: 'A diagnostic check could not be completed',
        detail: 'the check "environment" stopped with an error',
        facts: [],
        remediation: [{ text: 'File a Butler Sheet Icons issue.' }],
    };

    const realProblem = {
        id: 'BSI-BROWSER-011',
        severity: SEVERITY.ERROR,
        title: 'no usable browser was found',
        detail: 'the cache is empty',
        facts: [],
        remediation: [{ text: 'Stage a browser.' }],
    };

    test('a runner error does not outrank a real finding it happens to precede', () => {
        renderReport({
            heading: 'h',
            results: [result('A', [runnerError]), result('B', [realProblem])],
            okMessage: 'fine',
        });

        expect(errorLines()).toContain('Result: FAILED - no usable browser was found');
    });

    test('but it is still the headline when it is the only error', () => {
        // Suppressing it entirely would leave a failed run with no stated reason.
        renderReport({
            heading: 'h',
            results: [result('A', [runnerError])],
            okMessage: 'fine',
        });

        expect(errorLines()).toContain(
            'Result: FAILED - A diagnostic check could not be completed'
        );
    });

    test('its advice still appears in Next steps', () => {
        renderReport({
            heading: 'h',
            results: [result('A', [runnerError]), result('B', [realProblem])],
            okMessage: 'fine',
        });

        const text = errorLines().join('\n');

        expect(text).toContain('Stage a browser.');
        expect(text).toContain('File a Butler Sheet Icons issue.');
    });
});

describe('a finding that was inferred rather than observed', () => {
    // §15.9's third layer, and the one the disclaimer cannot do on its own: an administrator
    // reading one paragraph of a long report has to be able to tell "I looked, and this is what
    // is on your machine" from "this matches a known failure". Nothing emits `possible` yet -
    // every finding a check produces is observed - so this holds the branch until `doctor
    // analyze` needs it.
    test('says so on its own line', () => {
        renderReport({
            heading: 'h',
            results: [
                result('A', [
                    {
                        id: 'X',
                        severity: SEVERITY.ERROR,
                        title: 't',
                        detail: 'A proxy is intercepting HTTPS.',
                        facts: [],
                        remediation: [],
                        supersededBy: [],
                        confidence: CONFIDENCE.POSSIBLE,
                    },
                ]),
            ],
            okMessage: 'fine',
        });

        expect(errorLines()).toContain(
            '    A proxy is intercepting HTTPS. (possible cause, not confirmed on this machine)'
        );
    });

    test('a finding with no confidence stated is treated as observed, and reads unchanged', () => {
        // Every existing check writes finding literals without the field, and `browser check`'s
        // output is held line for line elsewhere. Absent has to mean confirmed.
        renderReport({
            heading: 'h',
            results: [
                result('A', [
                    {
                        id: 'X',
                        severity: SEVERITY.ERROR,
                        title: 't',
                        detail: 'A proxy is intercepting HTTPS.',
                        facts: [],
                        remediation: [],
                        supersededBy: [],
                    },
                ]),
            ],
            okMessage: 'fine',
        });

        expect(errorLines()).toContain('    A proxy is intercepting HTTPS.');
    });
});

describe('the best-effort disclaimer', () => {
    test('sits immediately before the Result line on a healthy run', () => {
        renderReport({ heading: 'h', results: [result('A', [])], okMessage: 'fine' });

        const printed = lines();
        const resultIndex = printed.findIndex((line) => line.includes('Result:'));
        const disclaimerEnd = printed.findIndex((line) =>
            line.includes(BEST_EFFORT_DISCLAIMER.at(-1))
        );

        expect(disclaimerEnd).toBeGreaterThan(-1);
        expect(resultIndex).toBe(disclaimerEnd + 1);
    });

    test('is printed on the failure path too', () => {
        renderReport({
            heading: 'h',
            results: [
                result('A', [
                    {
                        id: 'X',
                        severity: SEVERITY.ERROR,
                        title: 't',
                        detail: 'd',
                        facts: [],
                        remediation: [{ text: 'Do a thing.' }],
                    },
                ]),
            ],
            okMessage: 'fine',
        });

        expect(lines().join('\n')).toContain(BEST_EFFORT_DISCLAIMER[0]);
    });

    test('has no flag that suppresses it', () => {
        // Deliberately asserted as an absence: a switch to hide it would be used by exactly the
        // automated contexts where a human later reads the output without knowing it was hidden.
        renderReport({
            heading: 'h',
            results: [result('A', [])],
            okMessage: 'fine',
            disclaimer: false,
            showDisclaimer: false,
            quiet: true,
        });

        expect(lines().join('\n')).toContain(BEST_EFFORT_DISCLAIMER[0]);
    });
});
