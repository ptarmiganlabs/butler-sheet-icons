import { jest, test, expect, describe, beforeEach } from '@jest/globals';
import os from 'node:os';
import path from 'node:path';

/**
 * `doctor check` - the worker.
 *
 * Two claims are worth more than any individual assertion here.
 *
 * **It runs every area by default, and that is asserted structurally.** The registry currently
 * holds only `environment` and `browser` checks, so `doctor check` with no `--area` runs exactly
 * what `browser check` runs: today the two commands are indistinguishable by output, and will stay
 * so until checks for config, qseow and qscloud exist. A behavioural comparison written now would
 * pass for the wrong reason and keep passing after the two genuinely diverge, so the default is
 * held against `CHECK_AREAS` and `CHECKS` themselves.
 *
 * **Selecting an area does not gather facts for the others.** Gathering the browser facts starts
 * Chrome. `doctor check --area environment` asking a question about the account this process runs
 * as must not launch a browser to answer it.
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
    appVersion: 'test-version',
}));

jest.unstable_mockModule('@puppeteer/browsers', () => ({
    canDownload: jest.fn().mockResolvedValue(true),
    computeExecutablePath: jest.fn(),
    detectBrowserPlatform: jest.fn().mockReturnValue('win64'),
    getInstalledBrowsers: jest.fn().mockResolvedValue([]),
    getVersionComparator: jest.fn(),
    install: jest.fn(),
    resolveBuildId: jest.fn(),
    uninstall: jest.fn(),
}));

jest.unstable_mockModule('../../browser/browser-detect.js', () => ({
    detectAvailableBrowser: jest.fn(),
}));

jest.unstable_mockModule('../../browser/browser-inventory.js', () => ({
    getBrowserInventory: jest.fn().mockResolvedValue([]),
    hasUsableExecutable: jest.fn().mockReturnValue(true),
    canRunOnHost: jest.fn().mockReturnValue(true),
}));

jest.unstable_mockModule('../../browser/browser-install.js', () => ({
    browserInstall: jest.fn(),
}));

const launchMock = jest.fn();
jest.unstable_mockModule('puppeteer-core', () => ({
    default: { launch: launchMock },
}));

const { detectAvailableBrowser } = await import('../../browser/browser-detect.js');
const { getBrowserInventory } = await import('../../browser/browser-inventory.js');
const { doctorCheck, areasToRun, NO_CHECKS_ID } = await import('../doctor-check.js');
const { CHECKS, checksForAreas } = await import('../checks/index.js');
const { CHECK_AREAS } = await import('../run-checks.js');
const { BEST_EFFORT_DISCLAIMER } = await import('../render-report.js');
const { SEVERITY } = await import('../findings.js');

const CACHE_DIR = path.join(os.tmpdir(), 'bsi-doctor-check-test');

/**
 * Options with a cache directory of this suite's own, so nothing depends on the real one.
 *
 * @param {object} [extra] - Extra options to merge in.
 *
 * @returns {object} An options bag.
 */
const options = (extra = {}) => ({
    browser: 'chrome',
    browserVersion: '138.0.7204.94',
    headless: 'true',
    browserCacheDir: CACHE_DIR,
    ...extra,
});

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
    delete process.env.PUPPETEER_CACHE_DIR;
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
    getBrowserInventory.mockResolvedValue([]);
    detectAvailableBrowser.mockResolvedValue({
        executablePath: '/usr/bin/chromium',
        source: 'system',
        browser: 'chrome',
        buildId: '138.0.7204.94',
    });
    launchMock.mockResolvedValue({
        version: jest.fn().mockResolvedValue('Chrome/138.0.7204.94'),
        close: jest.fn().mockResolvedValue(undefined),
    });
});

describe('which areas run', () => {
    test('the default is every area the contract recognises, read from the contract', () => {
        // Not a restated list. `CHECK_AREAS` is the closed set a check may declare, so an area
        // added there is one `doctor check` runs from that moment, with nothing to remember.
        expect(areasToRun(undefined)).toEqual([...CHECK_AREAS]);
    });

    test('an empty selection is the same as no selection', () => {
        // Commander stores `[]` for a set-but-empty BSI_DOCTOR_C_AREA, which this repo has been
        // bitten by before. Empty means unset, not "nothing".
        expect(areasToRun([])).toEqual([...CHECK_AREAS]);
    });

    test('a selection is kept exactly as given', () => {
        expect(areasToRun(['environment'])).toEqual(['environment']);
    });

    test('a repeated area is collapsed to one', () => {
        // `collectChoices` accumulates without de-duplicating, and `buildCheckContext` loops per
        // entry - so a repeat used to call the area's fact gatherer twice. For `browser` that
        // gatherer starts Chrome.
        expect(areasToRun(['browser', 'browser'])).toEqual(['browser']);
        expect(areasToRun(['environment', 'browser', 'environment'])).toEqual([
            'environment',
            'browser',
        ]);
    });

    test('a repeated area does not gather its facts twice', async () => {
        await doctorCheck(options({ area: ['browser', 'browser'], skipLaunch: true }));

        // The measured symptom: two launch-and-close cycles, and the second gather's facts
        // overwriting the first, so the report described a different browser from the one it
        // judged.
        expect(detectAvailableBrowser).toHaveBeenCalledTimes(1);
        expect(getBrowserInventory).toHaveBeenCalledTimes(1);
    });

    test('a repeated area cannot inflate the run into a full-run claim', async () => {
        // `BSI_DOCTOR_C_AREA=browser,environment,config,qseow,qseow` used to reach the area count
        // of a full run with qscloud never selected, and printed the full-run verdict.
        const report = await doctorCheck(
            options({ area: ['browser', 'environment', 'config', 'qseow', 'qseow'] })
        );

        expect(report.areas).toEqual(['browser', 'environment', 'config', 'qseow']);
        expect(loggedText()).not.toContain('found no problems on this machine');
    });

    test('the default selects every registered check', async () => {
        // The other half of the structural claim: an area no check declares would leave the
        // default running less than the whole registry, silently.
        expect(checksForAreas(areasToRun(undefined)).map((check) => check.id)).toEqual(
            CHECKS.map((check) => check.id)
        );
    });

    test('--area narrows the run to that area', async () => {
        const report = await doctorCheck(options({ area: ['environment'] }));

        expect(report.areas).toEqual(['environment']);
        expect(report.results.map((result) => result.check.id)).toEqual(
            checksForAreas(['environment']).map((check) => check.id)
        );
    });

    test('--area environment does not start a browser to answer a question about the account', async () => {
        await doctorCheck(options({ area: ['environment'] }));

        expect(launchMock).not.toHaveBeenCalled();
        expect(detectAvailableBrowser).not.toHaveBeenCalled();
        expect(getBrowserInventory).not.toHaveBeenCalled();
    });

    test('the browser area still gathers browser facts', async () => {
        await doctorCheck(options({ area: ['browser'] }));

        expect(getBrowserInventory).toHaveBeenCalled();
        expect(detectAvailableBrowser).toHaveBeenCalled();
    });
});

describe('an area with no registered checks', () => {
    // config, qseow and qscloud are recognised areas with nothing behind them yet. Reporting OK
    // for a run that verified nothing is the one outcome a deployment gate must never see.
    test('fails the run rather than reporting a clean bill of health', async () => {
        const report = await doctorCheck(options({ area: ['config'] }));

        expect(report.ok).toBe(false);
        expect(report.findings.map((entry) => entry.id)).toContain(NO_CHECKS_ID);
    });

    test('says which areas had nothing to run', async () => {
        await doctorCheck(options({ area: ['config', 'qseow'] }));

        expect(loggedText()).toContain('config, qseow');
    });

    test('named alongside a real area, it still fails the run', async () => {
        // The hole the original guard left: it tested whether the selection was *entirely* empty,
        // so one populated area was enough to restore the clean bill of health. Measured:
        // `--area environment --area qseow` printed
        // `Result: OK - ... found no problems in: environment, qseow.` and exited 0, having
        // examined nothing whatsoever about qseow.
        const report = await doctorCheck(options({ area: ['environment', 'qseow'] }));

        expect(report.ok).toBe(false);
        expect(report.findings.map((entry) => entry.id)).toContain(NO_CHECKS_ID);
    });

    test('the report never claims the unexamined area was fine', async () => {
        await doctorCheck(options({ area: ['environment', 'qseow'] }));

        expect(loggedText()).not.toMatch(/found no problems in: environment, qseow/);
    });

    test('the default run says what it did not examine, without failing', async () => {
        // The other half, and why this cannot simply be an error per area: three of the five
        // areas have no checks today, so holding the default to that rule would make plain
        // `doctor check` exit 1 on every machine. Sweeping an area in is not a request for it.
        const report = await doctorCheck(options());

        expect(report.ok).toBe(true);
        expect(report.examined).toEqual(['browser', 'environment']);
        expect(loggedText()).toContain('Not examined: config, qseow, qscloud.');
    });

    test('the default run does not claim to have found no problems on this machine', async () => {
        // It examined two areas of five. The sentence has to carry its own limits, because it is
        // read - and pasted - on its own.
        await doctorCheck(options());

        expect(loggedText()).toMatch(/Result: OK[^\n]*Not examined/);
    });
});

describe('--skip-launch', () => {
    test('does not let the verdict claim the machine is fine', async () => {
        // Measured: `doctor check --skip-launch true` printed
        // `Result: OK - Butler Sheet Icons found no problems on this machine.` about a browser it
        // never started, while the identical `browser check` run said so plainly. `doctorCheck`
        // was passing `okMessage: () => ...`, throwing away the ctx argument the callback contract
        // exists to supply.
        await doctorCheck(options({ skipLaunch: true }));

        expect(loggedText()).not.toContain('found no problems on this machine');
        expect(loggedText()).toContain(
            'The browser was not started, so whether it runs here is untested.'
        );
    });

    test('still qualifies when only the browser area was asked for', async () => {
        await doctorCheck(options({ area: ['browser'], skipLaunch: true }));

        expect(loggedText()).toContain('whether it runs here is untested');
    });

    test('an area with no launch to report on does not break the sentence', async () => {
        // `ctx.launch` exists only when the browser area was gathered.
        await doctorCheck(options({ area: ['environment'] }));

        expect(loggedText()).toContain('Result: OK');
        expect(loggedText()).not.toContain('undefined');
    });
});

describe('the best-effort disclaimer', () => {
    test('is printed on the success path', async () => {
        await doctorCheck(options({ area: ['environment'] }));

        for (const line of BEST_EFFORT_DISCLAIMER) {
            expect(loggedText()).toContain(line);
        }
    });

    test('is printed on the failure path', async () => {
        await doctorCheck(options({ area: ['config'] }));

        for (const line of BEST_EFFORT_DISCLAIMER) {
            expect(loggedText()).toContain(line);
        }
    });

    test('is carried in the returned data as well as printed', async () => {
        const report = await doctorCheck(options({ area: ['environment'] }));

        expect(report.disclaimer).toEqual(BEST_EFFORT_DISCLAIMER);
    });
});

describe('the verdict', () => {
    test('is ok when nothing failed', async () => {
        const report = await doctorCheck(options({ area: ['environment'] }));

        expect(report.ok).toBe(true);
        expect(report.findings.every((entry) => entry.severity !== SEVERITY.ERROR)).toBe(true);
    });

    test('nothing in the worker touches the process exit code', async () => {
        // The handler owns that, through runCommand. A worker setting it would leak across the
        // whole jest run, which is why `preserve-exit-code.js` exists at all.
        const before = process.exitCode;

        await doctorCheck(options({ area: ['config'] }));

        expect(process.exitCode).toBe(before);
    });
});
