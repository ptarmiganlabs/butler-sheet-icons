import { jest, test, expect, describe, beforeEach } from '@jest/globals';

/**
 * `doctor check` against a registry that misbehaves.
 *
 * A separate file from `doctor-check.test.js` because it replaces the check registry, and that
 * file's whole point is that it reads the real one.
 *
 * Two promises are checked here, and both are promises the *command* makes rather than the runner:
 * the runner's isolation is already tested against `runChecks` directly, and what is easy to lose
 * in a refactor is the route between the two. A diagnostic that dies on the way to reporting a
 * problem is worse than no diagnostic - the administrator is left with a stack trace about
 * Butler Sheet Icons when they came with a question about their server.
 */

const loggerMock = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
};

// Every export the real module has, not just the ones this file uses. A mock factory has to
// satisfy the whole linked graph, and `doctor-check.js` reaches through the check context into the
// browser modules, one of which imports `sleep`. Enumerating a subset makes an unrelated change to
// that graph fail here as a *suite-load* error with zero failing tests - which reads as something
// else entirely, and has cost this repo several afternoons.
jest.unstable_mockModule('../../../globals.js', () => ({
    logger: loggerMock,
    appVersion: 'test-version',
    getLoggingLevel: jest.fn(() => 'info'),
    setLoggingLevel: jest.fn(),
    sendConsoleLogToStderr: jest.fn(),
    isSea: false,
    bsiExecutablePath: '/opt/bsi',
    getChromiumRevision: jest.fn(),
    sleep: jest.fn(async () => {}),
}));

/** A check that fails the moment it is asked anything. */
const throwingCheck = {
    id: 'explodes',
    title: 'A check that throws',
    section: 'Environment',
    area: 'environment',
    needsNetwork: false,
    findingIds: [],
    appliesTo: () => true,
    run: async () => {
        throw new Error('the check itself is broken');
    },
};

/** A check that would reach the network. */
const networkCheck = {
    id: 'reaches-out',
    title: 'A check that needs the network',
    section: 'Environment',
    area: 'environment',
    needsNetwork: true,
    findingIds: ['BSI-ENV-900'],
    appliesTo: () => true,
    run: jest.fn(async () => []),
};

/**
 * The only check in its area, and one that never runs without `--allow-network`.
 *
 * Its own area on purpose: it is how an area comes to be *selected* and yet examined by nothing,
 * which the registry cannot currently produce - no shipped check declares `needsNetwork` - and
 * which is exactly why that route reached production unnoticed.
 */
const soleNetworkCheck = {
    id: 'config-reaches-out',
    title: 'A config check that needs the network',
    section: 'Config',
    area: 'config',
    needsNetwork: true,
    findingIds: ['BSI-CONFIG-900'],
    appliesTo: () => true,
    run: jest.fn(async () => []),
};

/** A check that is the only one in its area and always says it does not apply. */
const soleInapplicableCheck = {
    id: 'qseow-never-applies',
    title: 'A qseow check that never applies',
    section: 'Qseow',
    area: 'qseow',
    needsNetwork: false,
    findingIds: [],
    appliesTo: () => false,
    run: jest.fn(async () => []),
};

const REGISTRY = [throwingCheck, networkCheck, soleNetworkCheck, soleInapplicableCheck];

jest.unstable_mockModule('../checks/index.js', () => ({
    CHECKS: Object.freeze(REGISTRY),
    checksForAreas: (areas) => REGISTRY.filter((check) => areas.includes(check.area)),
}));

const { doctorCheck, NO_CHECKS_ID } = await import('../doctor-check.js');
const { RUNNER_ERROR_ID } = await import('../run-checks.js');
const { BEST_EFFORT_DISCLAIMER } = await import('../render-report.js');

/**
 * Every line the logger was given, at any level, joined.
 *
 * @returns {string} The logged output.
 */
const loggedText = () =>
    [loggerMock.info, loggerMock.warn, loggerMock.error, loggerMock.verbose, loggerMock.debug]
        .flatMap((fn) => fn.mock.calls.map(([line]) => String(line)))
        .join('\n');

beforeEach(() => {
    networkCheck.run.mockClear();
    soleNetworkCheck.run.mockClear();
    soleInapplicableCheck.run.mockClear();
});

describe('an area selected but examined by nothing', () => {
    // The second route to a false pass, and the one no CLI invocation could reach when it
    // shipped: with every selected check skipped, the report has zero findings, `isHealthy([])`
    // is vacuously true, `renderSections` prints nothing, and the output is heading -> disclaimer
    // -> `Result: OK`, exit 0. "Selected" is not "examined".
    test('every check skipped for want of --allow-network fails the run', async () => {
        const report = await doctorCheck({ area: ['config'] });

        expect(soleNetworkCheck.run).not.toHaveBeenCalled();
        expect(report.ok).toBe(false);
        expect(report.findings.map((entry) => entry.id)).toContain(NO_CHECKS_ID);
    });

    test('the same area passes once its check is allowed to run', async () => {
        const report = await doctorCheck({ area: ['config'], allowNetwork: true });

        expect(soleNetworkCheck.run).toHaveBeenCalled();
        expect(report.ok).toBe(true);
        expect(report.examined).toEqual(['config']);
    });

    test('every check skipped by its own appliesTo fails the run too', async () => {
        const report = await doctorCheck({ area: ['qseow'] });

        expect(report.ok).toBe(false);
        expect(report.findings.map((entry) => entry.id)).toContain(NO_CHECKS_ID);
    });

    test('an area that did run is not tarred with the one that did not', async () => {
        const report = await doctorCheck({ area: ['environment', 'config'] });

        // `environment` has a check that ran (and threw, which is its own finding); `config` has
        // one that was skipped. The report must account for them separately rather than in
        // aggregate. This run fails on the throwing check, so the coverage statement appears in
        // the finding's detail - the `Not examined:` clause qualifies the OK sentence, and there
        // is no OK sentence here.
        expect(report.examined).toEqual(['environment']);
        expect(loggedText()).toContain('Nothing was examined for: config');
        expect(loggedText()).toContain('This report covers environment only');
    });
});

describe('a check that throws', () => {
    test('becomes a finding naming it, rather than taking the command down', async () => {
        const report = await doctorCheck({ area: ['environment'] });

        expect(report.findings.map((entry) => entry.id)).toContain(RUNNER_ERROR_ID);
        expect(loggedText()).toContain('explodes');
    });

    test('fails the run, so nothing reads a partial report as a pass', async () => {
        const report = await doctorCheck({ area: ['environment'] });

        expect(report.ok).toBe(false);
    });

    test('the report is still printed, disclaimer and all', async () => {
        await doctorCheck({ area: ['environment'] });

        for (const line of BEST_EFFORT_DISCLAIMER) {
            expect(loggedText()).toContain(line);
        }
    });
});

describe('checks that need the network', () => {
    test('are skipped by default, so an air-gapped server never waits on a DNS timeout', async () => {
        await doctorCheck({ area: ['environment'] });

        expect(networkCheck.run).not.toHaveBeenCalled();
    });

    test('run when --allow-network is given', async () => {
        await doctorCheck({ area: ['environment'], allowNetwork: true });

        expect(networkCheck.run).toHaveBeenCalled();
    });

    test('the option reaches the runner under the name Commander stores it as', async () => {
        // `--allow-network` is stored as `allowNetwork`. This repo has issue #890 because that
        // conversion has been got wrong by hand before, and a misspelling here would silently
        // mean "never allow", which no assertion about the report's contents would catch.
        const report = await doctorCheck({ area: ['environment'], allowNetwork: true });

        expect(report.allowNetwork).toBe(true);
    });
});
