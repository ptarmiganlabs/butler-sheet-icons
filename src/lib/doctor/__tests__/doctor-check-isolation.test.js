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

const REGISTRY = [throwingCheck, networkCheck];

jest.unstable_mockModule('../checks/index.js', () => ({
    CHECKS: Object.freeze(REGISTRY),
    checksForAreas: (areas) => REGISTRY.filter((check) => areas.includes(check.area)),
}));

const { doctorCheck } = await import('../doctor-check.js');
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
