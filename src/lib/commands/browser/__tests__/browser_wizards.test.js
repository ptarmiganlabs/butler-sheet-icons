import { jest, describe, test, expect, beforeEach } from '@jest/globals';

const getBrowserInventory = jest.fn();
const browserUninstall = jest.fn().mockResolvedValue(true);
const fetchAvailableVersions = jest.fn();
const browserInstall = jest.fn().mockResolvedValue({ buildId: '151.0.7922.47' });

jest.unstable_mockModule('../../../browser/browser-inventory.js', () => ({
    getBrowserInventory,
    getBrowserCacheDir: () => '/cache',
}));
jest.unstable_mockModule('../../../browser/browser-uninstall.js', () => ({
    browserUninstall,
    browserUninstallAll: jest.fn(),
}));
jest.unstable_mockModule('../../../browser/browser-list-available.js', () => ({
    fetchAvailableVersions,
    browserListAvailable: jest.fn(),
    getMostRecentUsableChromeBuildId: jest.fn(),
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
        expect(getBrowserInventory).toHaveBeenCalledTimes(1);
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
        getBrowserInventory.mockRejectedValue(new Error('EACCES'));
        const runtime = scriptedRuntime({ _build: '151.0.7922.47', _review: 'run' });

        await runInteractive({ path: 'browser uninstall', runtime });

        expect(runtime.asked[0].type).toBe('input');
        expect(browserUninstall.mock.calls[0][0].browserVersion).toBe('151.0.7922.47');
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

    test('fetches versions for the browser that was chosen', async () => {
        const runtime = scriptedRuntime({
            browser: 'firefox',
            browserVersion: 'latest',
            _review: 'cancel',
        });

        await runInteractive({ path: 'browser install', runtime });

        expect(fetchAvailableVersions).toHaveBeenCalledWith(
            expect.objectContaining({ browser: 'firefox' })
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
