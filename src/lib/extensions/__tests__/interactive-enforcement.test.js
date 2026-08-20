import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// `preAction` is not a sufficient enforcement point on its own: for `-i` the wizard runs *inside*
// the action handler, so the hook fires before a single question has been asked. These tests drive
// the real wizard end to end and assert the hook is given the options the run actually uses.

const beforeAction = jest.fn();

jest.unstable_mockModule('#extensions', () => ({
    extensions: { seamVersion: 1, commands: [], options: [], hooks: { beforeAction } },
}));

const qseowVerifyCertificatesExist = jest.fn();
const qseowVerifyContentLibraryExists = jest.fn();
const listAppsByTag = jest.fn();
const listAllApps = jest.fn();
const qseowCreateThumbnails = jest.fn().mockResolvedValue(true);

jest.unstable_mockModule('../../qseow/qseow-certificates.js', () => ({
    qseowVerifyCertificatesExist,
}));
jest.unstable_mockModule('../../qseow/qseow-contentlibrary.js', () => ({
    qseowVerifyContentLibraryExists,
}));
jest.unstable_mockModule('../../qseow/qseow-app-lookup.js', () => ({
    listAppsByTag,
    listAllApps,
}));
jest.unstable_mockModule('../../qseow/qseow-create-thumbnails.js', () => ({
    qseowCreateThumbnails,
}));

const { runInteractive } = await import('../../interactive/index.js');
const { scriptedRuntime } = await import('../../interactive/test-helpers/scripted-runtime.js');

const PATH = 'qseow create-sheet-thumbnails';

/**
 * A complete set of wizard answers, ending in "Run it".
 *
 * @param {object} [overrides] - Answers to replace or add.
 *
 * @returns {object} Answers for the scripted runtime.
 */
const answers = (overrides = {}) => ({
    host: 'sense.acme.com',
    certfile: './cert/client.pem',
    certkeyfile: './cert/client_key.pem',
    apiuserdir: 'INTERNAL',
    apiuserid: 'sa_api',
    logonuserdir: 'ACME',
    logonuserid: 'goran',
    logonpwd: 'a-password',
    _appSource: 'all',
    appid: ['app-a'],
    contentlibrary: 'Butler sheet thumbnails',
    includesheetpart: '1',
    _filtering: false,
    _advanced: false,
    _review: 'run',
    ...overrides,
});

beforeEach(() => {
    jest.clearAllMocks();
    // `clearMocks` clears calls but not implementations, so a hook left rejecting by one test would
    // still be rejecting in the next one.
    beforeAction.mockReset();
    qseowVerifyCertificatesExist.mockResolvedValue(true);
    qseowVerifyContentLibraryExists.mockResolvedValue(true);
    listAllApps.mockResolvedValue([{ id: 'app-a', name: 'Finance' }]);
    listAppsByTag.mockResolvedValue([]);
    qseowCreateThumbnails.mockResolvedValue(true);
});

describe('a wizard run reaches the beforeAction hook', () => {
    test('with the options the wizard assembled, not the near-empty ones from parse time', async () => {
        await runInteractive({ path: PATH, runtime: scriptedRuntime(answers()) });

        expect(beforeAction).toHaveBeenCalledTimes(1);

        const [path, options] = beforeAction.mock.calls[0];

        expect(path).toBe(PATH);
        // The whole point: these are answers the wizard collected, none of which existed on the
        // command line when Commander fired `preAction`.
        expect(options.host).toBe('sense.acme.com');
        expect(options.contentlibrary).toBe('Butler sheet thumbnails');
    });

    test('before the run starts, so throwing stops it', async () => {
        beforeAction.mockImplementation(() => {
            throw new Error('not entitled');
        });

        await expect(
            runInteractive({ path: PATH, runtime: scriptedRuntime(answers()) })
        ).rejects.toThrow('not entitled');

        expect(qseowCreateThumbnails).not.toHaveBeenCalled();
    });

    test('and an async refusal stops it too', async () => {
        beforeAction.mockRejectedValue(new Error('async refusal'));

        await expect(
            runInteractive({ path: PATH, runtime: scriptedRuntime(answers()) })
        ).rejects.toThrow('async refusal');

        expect(qseowCreateThumbnails).not.toHaveBeenCalled();
    });

    test('and a hook that returns normally lets the run proceed', async () => {
        await runInteractive({ path: PATH, runtime: scriptedRuntime(answers()) });

        expect(qseowCreateThumbnails).toHaveBeenCalledTimes(1);
    });

    // Cancelling never reaches the run, so there is nothing to be entitled to.
    test('but a cancelled wizard never calls it', async () => {
        await runInteractive({
            path: PATH,
            runtime: scriptedRuntime(answers({ _review: 'cancel' })),
        });

        expect(beforeAction).not.toHaveBeenCalled();
        expect(qseowCreateThumbnails).not.toHaveBeenCalled();
    });
});
