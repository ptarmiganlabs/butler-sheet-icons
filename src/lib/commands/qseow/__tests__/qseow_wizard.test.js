import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// QSEoW twin of qscloud_wizard.test.js. Same shape of conversation, different
// things that can be wrong first: QSEoW authenticates with certificate files on
// disk, so a bad path is the first failure an operator can hit.

const qseowVerifyCertificatesExist = jest.fn();
const qseowVerifyContentLibraryExists = jest.fn();
const listAppsByTag = jest.fn();
const listAllApps = jest.fn();
const qseowCreateThumbnails = jest.fn().mockResolvedValue(true);

jest.unstable_mockModule('../../../qseow/qseow-certificates.js', () => ({
    qseowVerifyCertificatesExist,
}));
jest.unstable_mockModule('../../../qseow/qseow-contentlibrary.js', () => ({
    qseowVerifyContentLibraryExists,
}));
jest.unstable_mockModule('../../../qseow/qseow-app-lookup.js', () => ({
    listAppsByTag,
    listAllApps,
}));
jest.unstable_mockModule('../../../qseow/qseow-create-thumbnails.js', () => ({
    qseowCreateThumbnails,
}));

const { runInteractive } = await import('../../../interactive/index.js');
const { scriptedRuntime } = await import('../../../interactive/test-helpers/scripted-runtime.js');
const { labelForApp } = await import('../create-sheet-thumbnails.interactive.js');

const PATH = 'qseow create-sheet-thumbnails';

/**
 * The answers a run needs when both gates are declined.
 *
 * @param {object} [overrides] - Answers to replace or add.
 *
 * @returns {object} Answers for the scripted runtime.
 */
const baseAnswers = (overrides = {}) => ({
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
    _review: 'cancel',
    ...overrides,
});

beforeEach(() => {
    jest.clearAllMocks();
    qseowVerifyCertificatesExist.mockResolvedValue(true);
    qseowVerifyContentLibraryExists.mockResolvedValue(true);
    listAllApps.mockResolvedValue([
        { id: 'app-a', name: 'Finance' },
        { id: 'app-b', name: 'Sales' },
    ]);
    listAppsByTag.mockResolvedValue([{ id: 'app-c', name: 'Tagged' }]);
});

describe('the certificate probe', () => {
    test('checks the files as soon as both paths are given', async () => {
        const runtime = scriptedRuntime(baseAnswers());

        await runInteractive({ path: PATH, runtime });

        const asked = runtime.asked.map((a) => a.key);
        expect(qseowVerifyCertificatesExist).toHaveBeenCalledTimes(1);
        // Nothing beyond the two paths was asked before the check.
        expect(asked.slice(0, 3)).toEqual(['host', 'certfile', 'certkeyfile']);
    });

    test('re-asks the key file when the certificates are not found', async () => {
        qseowVerifyCertificatesExist.mockResolvedValueOnce(false).mockResolvedValue(true);

        const runtime = scriptedRuntime(
            baseAnswers({ certkeyfile: ['./wrong.pem', './cert/client_key.pem'] })
        );

        await runInteractive({ path: PATH, runtime });

        expect(runtime.asked.filter((a) => a.key === 'certkeyfile')).toHaveLength(2);
        expect(runtime.output()).toContain('Certificate file(s) not found');
    });

    test('reports it before the credentials are asked for', async () => {
        // The point of probing here: today this failure surfaces after every one
        // of the command's 36 options has been supplied.
        qseowVerifyCertificatesExist.mockResolvedValueOnce(false).mockResolvedValue(true);

        const runtime = scriptedRuntime(
            baseAnswers({ certkeyfile: ['./wrong.pem', './cert/client_key.pem'] })
        );

        await runInteractive({ path: PATH, runtime });

        const asked = runtime.asked.map((a) => a.key);
        expect(asked.indexOf('logonpwd')).toBeGreaterThan(asked.lastIndexOf('certkeyfile'));
    });
});

describe('the content library probe', () => {
    test('re-asks when the library does not exist on the server', async () => {
        // A missing content library aborts the run only after every screenshot
        // has already been taken.
        qseowVerifyContentLibraryExists.mockResolvedValueOnce(false).mockResolvedValue(true);

        const runtime = scriptedRuntime(
            baseAnswers({ contentlibrary: ['Nope', 'Butler sheet thumbnails'] })
        );

        await runInteractive({ path: PATH, runtime });

        expect(runtime.asked.filter((a) => a.key === 'contentlibrary')).toHaveLength(2);
        expect(runtime.output()).toContain("Content library 'Nope' does not exist");
    });
});

describe('choosing which apps to update', () => {
    test('offers every app on the server', async () => {
        const runtime = scriptedRuntime(baseAnswers());

        await runInteractive({ path: PATH, runtime });

        expect(listAllApps).toHaveBeenCalledTimes(1);
        const question = runtime.asked.find((a) => a.key === 'appid');
        expect(question.choices.map((c) => c.value)).toEqual(['app-a', 'app-b']);
    });

    test('labels every app with its id, marked as an id', async () => {
        const runtime = scriptedRuntime(baseAnswers());

        await runInteractive({ path: PATH, runtime });

        const question = runtime.asked.find((a) => a.key === 'appid');
        expect(question.choices[0].name).toBe('Finance  (id: app-a)');
    });

    test('reports what a tag matches instead of offering a list that cannot narrow', async () => {
        // The tag reaches the worker as well, and the two are additive, so
        // unticking an app in a list of tagged apps never removed it from the
        // run. Saying how many the tag matched is the honest version of that.
        const runtime = scriptedRuntime(
            baseAnswers({ _appSource: 'grouped', qliksensetag: 'BSI' })
        );

        await runInteractive({ path: PATH, runtime });

        expect(listAppsByTag).toHaveBeenCalledTimes(1);
        expect(listAllApps).not.toHaveBeenCalled();
        expect(runtime.asked.map((a) => a.key)).not.toContain('appid');
        expect(runtime.output()).toContain("1 app(s) carry the tag 'BSI' and will be updated.");
    });

    test('re-asks a tag that matches no apps, rather than running over nothing', async () => {
        listAppsByTag
            .mockResolvedValueOnce([])
            .mockResolvedValue([{ id: 'app-c', name: 'Tagged' }]);

        const runtime = scriptedRuntime(
            baseAnswers({ _appSource: 'grouped', qliksensetag: ['nosuchtag', 'BSI'] })
        );

        await runInteractive({ path: PATH, runtime });

        expect(runtime.asked.filter((a) => a.key === 'qliksensetag')).toHaveLength(2);
        expect(runtime.output()).toContain("No apps on the server carry the tag 'nosuchtag'.");
    });

    test('still asks for app ids on the tag route when some were supplied', async () => {
        // Otherwise the banner promises --appid is asked about again and then
        // this route quietly skips it.
        const runtime = scriptedRuntime(
            baseAnswers({ _appSource: 'grouped', qliksensetag: 'BSI', appid: ['app-a'] })
        );

        await runInteractive({
            path: PATH,
            presetOptions: { appid: ['app-a'] },
            runtime,
        });

        expect(runtime.asked.map((a) => a.key)).toContain('appid');
    });

    test('still lets an app id be typed, without fetching any list', async () => {
        const runtime = scriptedRuntime(baseAnswers({ _appSource: 'typed', appid: 'app-z' }));

        await runInteractive({ path: PATH, runtime });

        expect(listAllApps).not.toHaveBeenCalled();
        expect(listAppsByTag).not.toHaveBeenCalled();
    });

    test('does not ask for a tag when apps are chosen another way', async () => {
        const runtime = scriptedRuntime(baseAnswers());

        await runInteractive({ path: PATH, runtime });

        expect(runtime.asked.map((a) => a.key)).not.toContain('qliksensetag');
    });
});

describe('a selection that would process nothing', () => {
    test('is refused where it was made, not after the run is confirmed', async () => {
        const runtime = scriptedRuntime(baseAnswers({ _appSource: 'typed', appid: ['', 'app-z'] }));

        await runInteractive({ path: PATH, runtime });

        expect(runtime.asked.filter((a) => a.key === 'appid')).toHaveLength(2);
        expect(runtime.output()).toContain('No apps selected');
        expect(qseowCreateThumbnails).not.toHaveBeenCalled();
    });

    test('is allowed when a tag is carrying the selection instead', async () => {
        // The run is the union of the two, so naming no apps is fine as long as
        // the tag names some.
        const runtime = scriptedRuntime(
            baseAnswers({ qliksensetag: 'BSI', appid: [], _review: 'run' })
        );

        await runInteractive({
            path: PATH,
            presetOptions: { qliksensetag: 'BSI' },
            runtime,
        });

        expect(runtime.asked.filter((a) => a.key === 'appid')).toHaveLength(1);
        expect(qseowCreateThumbnails).toHaveBeenCalledWith(
            expect.objectContaining({ qliksensetag: 'BSI' })
        );
    });
});

describe('an app id supplied before the wizard starts', () => {
    // An id in a .env file used to remove the app question but leave the
    // question that leads to it, so the wizard asked how apps should be chosen,
    // was answered, and then went straight on to the sheet question without
    // ever showing a list.
    const supplied = {
        host: 'sense.acme.com',
        certfile: './cert/client.pem',
        certkeyfile: './cert/client_key.pem',
        apiuserdir: 'INTERNAL',
        apiuserid: 'sa_api',
        logonuserdir: 'ACME',
        logonuserid: 'goran',
        logonpwd: 'a-password',
        appid: ['app-b'],
        contentlibrary: 'Butler sheet thumbnails',
    };

    test('still gets the picker, with the supplied app already ticked', async () => {
        const runtime = scriptedRuntime(baseAnswers({ appid: ['app-a'] }));

        await runInteractive({ path: PATH, presetOptions: supplied, runtime });

        const question = runtime.asked.find((a) => a.key === 'appid');
        expect(question).toBeDefined();
        expect(question.choices).toEqual([
            expect.objectContaining({ value: 'app-a', checked: false }),
            expect.objectContaining({ value: 'app-b', checked: true }),
        ]);
    });

    test('is announced as asked again rather than as skipped', async () => {
        const runtime = scriptedRuntime(baseAnswers({ appid: ['app-a'] }));

        await runInteractive({ path: PATH, presetOptions: supplied, runtime });

        expect(runtime.output()).toContain('picked from what is actually there: --appid');
        expect(runtime.output()).not.toMatch(/not asked about again:[^\n]*--appid/);
    });

    test('opens the typed question on the supplied id', async () => {
        const runtime = scriptedRuntime(baseAnswers({ _appSource: 'typed', appid: 'app-z' }));

        await runInteractive({ path: PATH, presetOptions: supplied, runtime });

        expect(runtime.asked.find((a) => a.key === 'appid').default).toBe('app-b');
    });

    test('the picked apps win over the supplied ones', async () => {
        const runtime = scriptedRuntime(baseAnswers({ appid: ['app-a'], _review: 'run' }));

        await runInteractive({ path: PATH, presetOptions: supplied, runtime });

        expect(qseowCreateThumbnails).toHaveBeenCalledWith(
            expect.objectContaining({ appid: ['app-a'] })
        );
    });
});

describe('a tag supplied before the wizard starts', () => {
    // A tag is a second way of naming apps, not an alternative to naming them:
    // the run covers --appid *and* everything carrying the tag. So a supplied
    // tag applies whichever route is taken, and asking about it only on the tag
    // route let it add apps the operator was never shown - while the banner
    // said it would be asked about again.
    const supplied = {
        host: 'sense.acme.com',
        certfile: './cert/client.pem',
        certkeyfile: './cert/client_key.pem',
        apiuserdir: 'INTERNAL',
        apiuserid: 'sa_api',
        logonuserdir: 'ACME',
        logonuserid: 'goran',
        logonpwd: 'a-password',
        qliksensetag: 'BSI',
        contentlibrary: 'Butler sheet thumbnails',
    };

    test('is asked about on the all-apps route too, opening on the supplied tag', async () => {
        const runtime = scriptedRuntime(baseAnswers({ qliksensetag: 'BSI' }));

        await runInteractive({ path: PATH, presetOptions: supplied, runtime });

        const question = runtime.asked.find((a) => a.key === 'qliksensetag');
        expect(question).toBeDefined();
        expect(question.default).toBe('BSI');
    });

    test('is asked about on the typed route too', async () => {
        const runtime = scriptedRuntime(
            baseAnswers({ _appSource: 'typed', appid: 'app-z', qliksensetag: 'BSI' })
        );

        await runInteractive({ path: PATH, presetOptions: supplied, runtime });

        expect(runtime.asked.map((a) => a.key)).toContain('qliksensetag');
    });

    test('clearing it stops the tagged apps being added to the run', async () => {
        const runtime = scriptedRuntime(
            baseAnswers({ qliksensetag: '', appid: ['app-a'], _review: 'run' })
        );

        await runInteractive({ path: PATH, presetOptions: supplied, runtime });

        // An empty tag matches the option's own default, so it is never emitted
        // to the command line and the bag carries exactly what the plain CLI
        // produces when no tag is given. qseowCreateThumbnails gates on
        // `qliksensetag && length > 0`, so no tag lookup happens: the run covers
        // the picked app and nothing else.
        const bag = qseowCreateThumbnails.mock.calls[0][0];
        expect(bag.appid).toEqual(['app-a']);
        expect(bag.qliksensetag).toBe('');
    });

    test('keeping it still adds the tagged apps, as the CLI does', async () => {
        const runtime = scriptedRuntime(
            baseAnswers({ qliksensetag: 'BSI', appid: ['app-a'], _review: 'run' })
        );

        await runInteractive({ path: PATH, presetOptions: supplied, runtime });

        expect(qseowCreateThumbnails).toHaveBeenCalledWith(
            expect.objectContaining({ appid: ['app-a'], qliksensetag: 'BSI' })
        );
    });

    test('a tag that was never supplied is still only asked on the tag route', async () => {
        const runtime = scriptedRuntime(baseAnswers());

        await runInteractive({ path: PATH, runtime });

        expect(runtime.asked.map((a) => a.key)).not.toContain('qliksensetag');
    });
});

describe('progressive disclosure', () => {
    test('declining both gates keeps the conversation short', async () => {
        // This command declares 36 options, the most in the CLI, which is what
        // makes the gating matter more here than anywhere else.
        const runtime = scriptedRuntime(baseAnswers());

        await runInteractive({ path: PATH, runtime });

        const asked = runtime.asked.filter((a) => a.key !== '_review').map((a) => a.key);

        // Pinned exactly, so an option quietly joining the default path shows up
        // as a diff and has to be classified.
        expect(asked).toEqual([
            // Connection
            'host',
            'certfile',
            'certkeyfile',
            'apiuserdir',
            'apiuserid',
            'logonuserdir',
            'logonuserid',
            'logonpwd',
            // Apps
            '_appSource',
            'appid',
            // Sheets
            'contentlibrary',
            'includesheetpart',
            // The two gates, both declined
            '_filtering',
            '_advanced',
        ]);
    });

    test('accepting advanced options asks for the ports and the rest', async () => {
        const runtime = scriptedRuntime(
            baseAnswers({
                _advanced: true,
                loglevel: 'info',
                engineport: '4747',
                qrsport: '4242',
                port: '', // optional, left blank on purpose
                schemaversion: '12.612.0',
                rejectUnauthorized: false,
                secure: true,
                prefix: '',
                headless: true,
                pagewait: '5',
                imagedir: './img',
                senseVersion: '2025-Nov',
                browser: 'chrome',
                browserVersion: 'recommended',
                browserPageTimeout: '90',
                browserCacheDir: '',
            })
        );

        await runInteractive({ path: PATH, runtime });

        const asked = runtime.asked.map((a) => a.key);
        expect(asked).toContain('engineport');
        expect(asked).toContain('senseVersion');
        // Behind the advanced gate rather than in the main flow: most runs never name a
        // browser cache directory, and an unplaced key would be asked last and ungated.
        expect(asked).toContain('browserCacheDir');
    });
});

describe('the run itself', () => {
    test('cancelling runs nothing', async () => {
        const runtime = scriptedRuntime(baseAnswers());

        await runInteractive({ path: PATH, runtime });

        expect(qseowCreateThumbnails).not.toHaveBeenCalled();
    });

    test('confirming calls the worker with a Commander-shaped bag', async () => {
        const runtime = scriptedRuntime(baseAnswers({ _review: 'run' }));

        await runInteractive({ path: PATH, runtime });

        const options = qseowCreateThumbnails.mock.calls[0][0];
        expect(options.host).toBe('sense.acme.com');
        expect(options.appid).toEqual(['app-a']);
        expect(options._appSource).toBeUndefined();
        expect(options._filtering).toBeUndefined();
    });

    test('never prints the logon password', async () => {
        const runtime = scriptedRuntime(baseAnswers({ _review: 'run' }));

        await runInteractive({ path: PATH, runtime });

        expect(runtime.output()).not.toContain('a-password');
    });
});

describe('both platforms label an app the same way', () => {
    // The two wizards must not drift: an operator moving between a QSEoW server
    // and a Cloud tenant should read the same thing.
    test('the label carries the full id, never truncated', () => {
        const id = 'a1b2c3d4-1111-2222-3333-444455556666';

        expect(labelForApp({ id, name: 'Finance' })).toBe(`Finance  (id: ${id})`);
    });

    test('two apps sharing a name stay distinguishable', () => {
        // Three duplicated names exist on the QSEoW test server today.
        expect(labelForApp({ id: 'app-a', name: 'Performance review' })).not.toBe(
            labelForApp({ id: 'app-b', name: 'Performance review' })
        );
    });
});
