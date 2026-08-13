import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const getBrowserInventory = jest.fn();
const browserUninstall = jest.fn().mockResolvedValue(true);
const fetchAvailableVersions = jest.fn();
const browserInstall = jest.fn().mockResolvedValue({ buildId: '151.0.7922.47' });

// Mocked so that what a wizard *reports* is an assertable fact rather than
// something that merely scrolls past. A wizard that declines to run says so
// through the logger, in the same words `browser list-installed` uses, and that
// wording is the whole user-facing half of issue #1013.
const logger = {
    info: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
};

jest.unstable_mockModule('../../../../globals.js', () => ({
    logger,
    appVersion: '0.0.0-test',
    // Plain functions rather than jest.fn(), because `clearMocks` runs before
    // every test and a level of `undefined` would be pinned into the real
    // logger by withQuietLogging's restore.
    getLoggingLevel: () => 'info',
    setLoggingLevel: () => {},
    isSea: false,
    bsiExecutablePath: '/test',
    getChromiumRevision: () => 'test-revision',
    sleep: () => Promise.resolve(),
}));

jest.unstable_mockModule('../../../browser/browser-inventory.js', () => ({
    getBrowserInventory,
    // Not used by the wizards, but browser-detect.js and browser-install.js both import it from
    // here, and ESM checks named exports across the whole linked graph - so omitting it fails
    // this suite before a single test runs, with no test failure to point at the cause.
    hasUsableExecutable: jest.fn(() => true),
}));
jest.unstable_mockModule('../../../browser/browser-uninstall.js', () => ({
    browserUninstall,
    browserUninstallAll: jest.fn(),
}));
jest.unstable_mockModule('../../../browser/browser-list-available.js', () => ({
    fetchAvailableVersions,
    browserListAvailable: jest.fn(),
}));
jest.unstable_mockModule('../../../browser/browser-install.js', () => ({ browserInstall }));

const { runInteractive } = await import('../../../interactive/index.js');
const { scriptedRuntime } = await import('../../../interactive/test-helpers/scripted-runtime.js');

const MAC_BUILD = {
    browser: 'chrome',
    buildId: '151.0.7922.47',
    platform: 'mac_arm',
    path: '/cache/chrome/mac_arm-151.0.7922.47',
    executablePath: '/cache/chrome/mac_arm-151.0.7922.47/chrome',
    isCurrentPlatform: true,
};

const WIN_BUILD = {
    ...MAC_BUILD,
    platform: 'win64',
    path: '/cache/chrome/win64-151.0.7922.47',
    isCurrentPlatform: false,
};

beforeEach(() => {
    jest.clearAllMocks();
    browserUninstall.mockResolvedValue(true);
    browserInstall.mockResolvedValue({ buildId: '151.0.7922.47' });
    getBrowserInventory.mockResolvedValue([MAC_BUILD]);
    fetchAvailableVersions.mockResolvedValue([
        { version: '151.0.7922.47', name: 'chrome/.../151.0.7922.47' },
        { version: '150.0.7871.24', name: 'chrome/.../150.0.7871.24' },
    ]);
});

describe('the uninstall wizard', () => {
    test('asks once, from the real cache, instead of for a version from memory', async () => {
        // Today this command needs --browser and --browser-version, both
        // mandatory, with the version typed exactly and nothing telling you
        // what is installed.
        const runtime = scriptedRuntime({
            _build: { browser: 'chrome', buildId: '151.0.7922.47' },
            _review: 'run',
        });

        await runInteractive({ path: 'browser uninstall', runtime });

        expect(runtime.asked.map((a) => a.key)).toEqual(['_build', '_review']);
        // Twice: once by the precheck deciding whether there is anything to do
        // at all, once by the picker building its list. Two reads of a local
        // directory, rather than caching an inventory that "Start over" would
        // then show after it had gone stale.
        expect(getBrowserInventory).toHaveBeenCalledTimes(2);
    });

    test('reads the cache named by --browser-cache-dir, not the default one', async () => {
        // Both the precheck and the picker. Without this, `browser uninstall
        // --browser-cache-dir X -i` inspects the default location, announces there is
        // nothing to uninstall, and exits - while the same flags without -i work.
        const runtime = scriptedRuntime({
            _build: { browser: 'chrome', buildId: '151.0.7922.47' },
            _review: 'cancel',
        });

        await runInteractive({
            path: 'browser uninstall',
            presetOptions: { browserCacheDir: '/qlik/browsers' },
            runtime,
        });

        expect(getBrowserInventory).toHaveBeenCalledTimes(2);
        for (const call of getBrowserInventory.mock.calls) {
            expect(call[0]).toEqual({ cacheDir: path.resolve('/qlik/browsers') });
        }
    });

    test('never asks for the log level, which nobody wants as question one', async () => {
        const runtime = scriptedRuntime({ _build: MAC_BUILD, _review: 'cancel' });

        await runInteractive({ path: 'browser uninstall', runtime });

        expect(runtime.asked.map((a) => a.key)).not.toContain('loglevel');
    });

    test('labels a build that cannot run here, and still offers it', async () => {
        // Wanting the disk space back is a perfectly good reason to remove a
        // browser you cannot run.
        getBrowserInventory.mockResolvedValue([WIN_BUILD]);
        const runtime = scriptedRuntime({
            _build: { browser: 'chrome', buildId: '151.0.7922.47' },
            _review: 'cancel',
        });

        await runInteractive({ path: 'browser uninstall', runtime });

        const labels = runtime.asked[0].choices.map((choice) => choice.name);
        expect(labels[0]).toContain('built for win64');
        expect(labels[0]).toContain('cannot run here');
    });

    test('shows the platform plainly for a build that does run here', async () => {
        const runtime = scriptedRuntime({ _build: MAC_BUILD, _review: 'cancel' });

        await runInteractive({ path: 'browser uninstall', runtime });

        expect(runtime.asked[0].choices[0].name).toBe('chrome  151.0.7922.47  (mac_arm)');
    });

    test('calls the existing handler with a plain options bag', async () => {
        // The wizard is a front end. No worker is modified, and the options it
        // produces are the ones a flag-driven run would produce.
        const runtime = scriptedRuntime({
            _build: { browser: 'chrome', buildId: '151.0.7922.47' },
            _review: 'run',
        });

        await runInteractive({ path: 'browser uninstall', runtime });

        expect(browserUninstall).toHaveBeenCalledTimes(1);
        const options = browserUninstall.mock.calls[0][0];
        expect(options.browser).toBe('chrome');
        expect(options.browserVersion).toBe('151.0.7922.47');
        expect(options.loglevel).toBe('info');
        expect(options._build).toBeUndefined();
    });

    test('echoes a command line that names the build, not the synthetic question', async () => {
        const runtime = scriptedRuntime({
            _build: { browser: 'chrome', buildId: '151.0.7922.47' },
            _review: 'run',
        });

        await runInteractive({ path: 'browser uninstall', runtime });

        const output = runtime.output();
        expect(output).toContain(
            'butler-sheet-icons browser uninstall --browser-version 151.0.7922.47'
        );
        expect(output).not.toContain('_build');
    });

    test('falls back to typing a version when the cache cannot be read', async () => {
        // "Not found" and "found but unusable" are different answers. A cache
        // that cannot be read is not an empty one, so the precheck must let it
        // through rather than reporting there is nothing to uninstall - the
        // question's own fallback is how an operator recovers here.
        getBrowserInventory.mockRejectedValue(new Error('EACCES'));
        const runtime = scriptedRuntime({ _build: '151.0.7922.47', _review: 'run' });

        await runInteractive({ path: 'browser uninstall', runtime });

        expect(runtime.asked[0].type).toBe('input');
        expect(browserUninstall.mock.calls[0][0].browserVersion).toBe('151.0.7922.47');
        expect(logger.info).not.toHaveBeenCalledWith(
            expect.stringContaining('No browsers installed')
        );
    });

    test('cancelling runs nothing', async () => {
        const runtime = scriptedRuntime({ _build: MAC_BUILD, _review: 'cancel' });

        const result = await runInteractive({ path: 'browser uninstall', runtime });

        expect(result).toBe(true);
        expect(browserUninstall).not.toHaveBeenCalled();
    });

    test('starting over asks again, then runs', async () => {
        const build = { browser: 'chrome', buildId: '151.0.7922.47' };
        // Two answers for the build question, because the restart asks it again
        // - the user picking the same thing the second time around.
        const runtime = scriptedRuntime({ _build: [build, build], _review: ['restart', 'run'] });

        await runInteractive({ path: 'browser uninstall', runtime });

        expect(runtime.asked.filter((a) => a.key === '_build')).toHaveLength(2);
        expect(browserUninstall).toHaveBeenCalledTimes(1);
    });

    test('reports failure when the command reports failure', async () => {
        browserUninstall.mockResolvedValue(false);
        const runtime = scriptedRuntime({
            _build: { browser: 'chrome', buildId: '151.0.7922.47' },
            _review: 'run',
        });

        await expect(runInteractive({ path: 'browser uninstall', runtime })).resolves.toBe(false);
    });
});

describe('the uninstall wizard with an empty cache', () => {
    // Issue #1013. An empty cache reached the same code path as a failed
    // lookup, so the wizard offered the free-text fallback - whose prompt is
    // --browser-version's own help text - and every answer to it ended in
    // "Browser not found in cache". There is no answer that can succeed, so
    // there is no question worth asking.
    beforeEach(() => {
        getBrowserInventory.mockResolvedValue([]);
    });

    test('asks nothing and runs nothing', async () => {
        // An unqueued key makes scriptedRuntime throw, so an empty script is
        // itself an assertion that no question was reached.
        const runtime = scriptedRuntime({});

        const result = await runInteractive({ path: 'browser uninstall', runtime });

        expect(result).toBe(true);
        expect(runtime.asked).toEqual([]);
        expect(browserUninstall).not.toHaveBeenCalled();
    });

    test('stops before announcing itself, rather than after', async () => {
        // The transcript in the bug report is the wizard preamble followed by
        // an unanswerable question. Printing the preamble and only then backing
        // out would fix half of it.
        const runtime = scriptedRuntime({});

        await runInteractive({ path: 'browser uninstall', runtime });

        expect(runtime.output()).toBe('');
    });

    test('says so in the words list-installed already uses', async () => {
        await runInteractive({ path: 'browser uninstall', runtime: scriptedRuntime({}) });

        expect(logger.info).toHaveBeenCalledWith(
            expect.stringContaining('No browsers installed, so there is nothing to uninstall.')
        );
    });

    test('points at the command that fixes it', async () => {
        await runInteractive({ path: 'browser uninstall', runtime: scriptedRuntime({}) });

        expect(logger.info).toHaveBeenCalledWith(
            expect.stringContaining('butler-sheet-icons browser install')
        );
    });
});

describe('an option a synthetic question stands in for', () => {
    // The other half of issue #1013: the wizard announced that
    // --browser-version would not be asked about, and then asked for exactly
    // that. `_build` collects it under another name, which the key-based filter
    // could not see.
    const PRESET = { browserVersion: '150.0.7871.24' };

    test('is not announced as skipped', async () => {
        const runtime = scriptedRuntime({ _build: MAC_BUILD, _review: 'cancel' });

        await runInteractive({ path: 'browser uninstall', presetOptions: PRESET, runtime });

        expect(runtime.output()).not.toContain('not asked about again: --browser-version');
    });

    test('is named as asked about again, so an ignored value is not a mystery', async () => {
        const runtime = scriptedRuntime({ _build: MAC_BUILD, _review: 'cancel' });

        await runInteractive({ path: 'browser uninstall', presetOptions: PRESET, runtime });

        const output = runtime.output();
        expect(output).toContain('asked about again so you can change it for this run');
        expect(output).toContain('--browser-version');
    });

    test('is still asked about, and the answer wins over the supplied value', async () => {
        // Deliberate: a picker over the real cache beats a build id remembered
        // in .env from a run before, which may name something since removed.
        const runtime = scriptedRuntime({
            _build: { browser: 'chrome', buildId: '151.0.7922.47' },
            _review: 'run',
        });

        await runInteractive({ path: 'browser uninstall', presetOptions: PRESET, runtime });

        expect(runtime.asked.map((a) => a.key)).toEqual(['_build', '_review']);
        expect(browserUninstall.mock.calls[0][0].browserVersion).toBe('151.0.7922.47');
    });

    test('leaves an ordinary supplied option announced as before', async () => {
        // The replaces handling must not swallow the existing banner: --browser
        // is covered by the picker too, so this checks the case that is not -
        // an option no question stands in for.
        const runtime = scriptedRuntime({ browserVersion: '151.0.7922.47', _review: 'cancel' });

        await runInteractive({
            path: 'browser install',
            presetOptions: { browser: 'chrome' },
            runtime,
        });

        expect(runtime.output()).toContain(
            'Already supplied, so not asked about again: --browser.'
        );
    });
});

describe('options already supplied on the command line', () => {
    // What makes `-i` compose rather than merely exist:
    // `bsi browser install --browser chrome -i` should ask which build, not
    // which browser.
    //
    // A preset answer also has to stay visible to the questions that follow. The install
    // wizard's version picker does not read earlier answers, so that property is covered by
    // the uninstall wizard's cache-dir test above.
    test('are not asked about again', async () => {
        const runtime = scriptedRuntime({ browserVersion: '151.0.7922.47', _review: 'cancel' });

        await runInteractive({
            path: 'browser install',
            presetOptions: { browser: 'chrome' },
            runtime,
        });

        expect(runtime.asked.map((a) => a.key)).toEqual(['browserVersion', '_review']);
    });

    test('and reach the command that finally runs', async () => {
        const runtime = scriptedRuntime({ browserVersion: '151.0.7922.47', _review: 'run' });

        await runInteractive({
            path: 'browser install',
            presetOptions: { browser: 'chrome' },
            runtime,
        });

        expect(browserInstall).toHaveBeenCalledWith(
            expect.objectContaining({ browser: 'chrome', browserVersion: '151.0.7922.47' })
        );
    });

    test('are named up front, so it is clear why they were skipped', async () => {
        const runtime = scriptedRuntime({ browserVersion: '151.0.7922.47', _review: 'cancel' });

        await runInteractive({
            path: 'browser install',
            presetOptions: { browser: 'chrome' },
            runtime,
        });

        expect(runtime.written.join('')).toContain('--browser');
    });
});

describe('the install wizard', () => {
    test('offers published versions without the serial availability check', async () => {
        // browserListAvailable runs one request per version, strictly serially,
        // purely to pick each line log level. The picker must not pay for that.
        const runtime = scriptedRuntime({
            browser: 'chrome',
            browserVersion: '151.0.7922.47',
            _review: 'run',
        });

        await runInteractive({ path: 'browser install', runtime });

        expect(fetchAvailableVersions).toHaveBeenCalledTimes(1);
    });

    test('fetches the stable channel, which is what the picker lists', async () => {
        const runtime = scriptedRuntime({
            browser: 'chrome',
            browserVersion: 'latest',
            _review: 'cancel',
        });

        await runInteractive({ path: 'browser install', runtime });

        expect(fetchAvailableVersions).toHaveBeenCalledWith(
            expect.objectContaining({ channel: 'stable' })
        );
    });

    test('pins the recommended and stable entries above the published list', async () => {
        const runtime = scriptedRuntime({
            browser: 'chrome',
            browserVersion: 'recommended',
            _review: 'cancel',
        });

        await runInteractive({ path: 'browser install', runtime });

        const versionQuestion = runtime.asked.find((a) => a.key === 'browserVersion');
        expect(versionQuestion.type).toBe('search');

        const offered = await versionQuestion.source('');
        expect(offered[0].value).toBe('recommended');
        expect(offered[1].value).toBe('stable');
        expect(offered[2].value).toBe('151.0.7922.47');
    });

    test('the search filters as the user types', async () => {
        const runtime = scriptedRuntime({
            browser: 'chrome',
            browserVersion: '150.0.7871.24',
            _review: 'cancel',
        });

        await runInteractive({ path: 'browser install', runtime });

        const versionQuestion = runtime.asked.find((a) => a.key === 'browserVersion');
        const matches = await versionQuestion.source('150.');

        expect(matches.map((m) => m.value)).toEqual(['150.0.7871.24']);
    });

    test('falls back to typing a version when the list cannot be fetched', async () => {
        // An offline machine can still install a build whose id is known.
        fetchAvailableVersions.mockRejectedValue(new Error('ENOTFOUND'));
        const runtime = scriptedRuntime({
            browser: 'chrome',
            browserVersion: '151.0.7922.47',
            _review: 'run',
        });

        await runInteractive({ path: 'browser install', runtime });

        expect(runtime.asked.find((a) => a.key === 'browserVersion').type).toBe('input');
        expect(browserInstall).toHaveBeenCalledTimes(1);
    });

    test('omits options left at their default from the echoed line', async () => {
        const runtime = scriptedRuntime({
            browser: 'chrome',
            browserVersion: 'recommended',
            _review: 'run',
        });

        await runInteractive({ path: 'browser install', runtime });

        // Every option has a default here, so accepting them all produces the
        // bare command - which is exactly what a user would have typed.
        expect(runtime.output()).toContain('butler-sheet-icons browser install\n');
    });
});

describe('discoverability', () => {
    test('says up front how to get out, since there is no way back a step', async () => {
        // The prompt library has no back gesture, so the two things a user can
        // do instead have to be visible before they need them. "Start over" at
        // the review is otherwise invisible until you reach it.
        const runtime = scriptedRuntime({ _build: MAC_BUILD, _review: 'cancel' });

        await runInteractive({ path: 'browser uninstall', runtime });

        const output = runtime.output();
        expect(output).toContain('Ctrl+C');
        expect(output).toContain('start over');
        // Before the review, which is the only place the alternative appears.
        expect(output.indexOf('Ctrl+C')).toBeLessThan(output.indexOf('Review'));
    });
});
