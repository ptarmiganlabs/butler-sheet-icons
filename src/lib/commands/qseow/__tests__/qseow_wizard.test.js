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

describe('a value supplied before the wizard starts, carrying a probe', () => {
    // Issue #897. A content library or a certificate path is a property of the
    // environment, so it stays answered once supplied - but skipping the question
    // was skipping its check with it, and a `.env` naming a library that has since
    // been deleted failed only after every other question had been answered.

    /**
     * What a run needs when the content library is supplied rather than asked for.
     *
     * @param {object} [overrides] - Answers to replace or add.
     *
     * @returns {object} Answers for the scripted runtime, with no content library queued.
     */
    const withoutLibrary = (overrides = {}) => {
        const answers = baseAnswers(overrides);
        delete answers.contentlibrary;

        return answers;
    };

    test('is checked rather than trusted, without being asked about', async () => {
        const runtime = scriptedRuntime(withoutLibrary());

        await runInteractive({
            path: PATH,
            presetOptions: { contentlibrary: 'From dot env' },
            runtime,
        });

        expect(qseowVerifyContentLibraryExists).toHaveBeenCalledTimes(1);
        expect(runtime.asked.map((a) => a.key)).not.toContain('contentlibrary');
    });

    test('is checked only once everything the check reads has been answered', async () => {
        // The reason the check happens here rather than in a pass before the
        // first question: this probe opens a QRS connection built from the host,
        // the certificates and the credentials, none of which a .env supplying
        // only the library name has provided.
        const runtime = scriptedRuntime(withoutLibrary());

        // Snapshotted at call time, not read from `mock.calls` afterwards: the
        // driver hands the probe the live answers object and keeps filling it in,
        // so inspecting it after the run shows every later answer too - and the
        // assertion would hold even if these had been answered afterwards, which
        // is the one thing this test exists to rule out.
        let seenByProbe;
        qseowVerifyContentLibraryExists.mockImplementation(async (options) => {
            seenByProbe = { ...options };

            return true;
        });

        await runInteractive({
            path: PATH,
            presetOptions: { contentlibrary: 'From dot env' },
            runtime,
        });

        expect(seenByProbe.contentlibrary).toBe('From dot env');
        expect(seenByProbe.host).toBe('sense.acme.com');
        expect(seenByProbe.logonpwd).toBe('a-password');
    });

    test('says so when the check passes, so a pause on the network is explained', async () => {
        const runtime = scriptedRuntime(withoutLibrary());

        await runInteractive({
            path: PATH,
            presetOptions: { contentlibrary: 'From dot env' },
            runtime,
        });

        // One string, not two `toContain`s: '--contentlibrary' appears in the
        // opening banner as well, so asserting the two halves separately would
        // pass even if the confirmation named a different option.
        expect(runtime.output()).toContain('--contentlibrary checked');
    });

    test('becomes a question, opening on the supplied value, when the check fails', async () => {
        qseowVerifyContentLibraryExists.mockResolvedValueOnce(false).mockResolvedValue(true);

        // The promoted question needs an answer queued: it is asked after all.
        const runtime = scriptedRuntime(baseAnswers());

        await runInteractive({
            path: PATH,
            presetOptions: { contentlibrary: 'Deleted last year' },
            runtime,
        });

        const asked = runtime.asked.filter((a) => a.key === 'contentlibrary');

        expect(asked).toHaveLength(1);
        // Opened on what was supplied, so correcting it is an edit not a retype.
        expect(asked[0].default).toBe('Deleted last year');
        expect(qseowCreateThumbnails).not.toHaveBeenCalled();
    });

    test('the corrected answer is what the run uses', async () => {
        qseowVerifyContentLibraryExists.mockResolvedValueOnce(false).mockResolvedValue(true);

        const runtime = scriptedRuntime(
            baseAnswers({ contentlibrary: 'Butler sheet thumbnails', _review: 'run' })
        );

        await runInteractive({
            path: PATH,
            presetOptions: { contentlibrary: 'Deleted last year' },
            runtime,
        });

        expect(qseowCreateThumbnails.mock.calls[0][0].contentlibrary).toBe(
            'Butler sheet thumbnails'
        );
    });

    test('names the option and the environment variable the value came from', async () => {
        // The value is usually in a .env file nobody has opened in months, so
        // naming the variable is what makes the failure actionable.
        qseowVerifyContentLibraryExists.mockResolvedValueOnce(false).mockResolvedValue(true);

        // The promoted question needs an answer queued: it is asked after all.
        const runtime = scriptedRuntime(baseAnswers());

        await runInteractive({
            path: PATH,
            presetOptions: { contentlibrary: 'Deleted last year' },
            presetSources: { contentlibrary: 'env' },
            runtime,
        });

        const output = runtime.output();

        expect(output).toContain('--contentlibrary (from BSI_QSEOW_CST_CONTENT_LIBRARY)');
        expect(output).toContain("Content library 'Deleted last year' does not exist");
    });

    test('names the other values the check reads, because one may be the real cause', async () => {
        // A wrong --host is what makes this check fail, and re-typing the library
        // name can never fix it. Without this line the only clue is a message
        // about a value that is perfectly correct.
        qseowVerifyContentLibraryExists.mockResolvedValueOnce(false).mockResolvedValue(true);

        const answers = baseAnswers();
        delete answers.host;

        const runtime = scriptedRuntime(answers);

        await runInteractive({
            path: PATH,
            presetOptions: { contentlibrary: 'Deleted last year', host: 'wrong.acme.com' },
            runtime,
        });

        expect(runtime.output()).toContain('This check also uses these values you supplied');
        expect(runtime.output()).toContain('--host');
    });

    test('names only what the check reads, not everything the .env file supplied', async () => {
        // The list exists to narrow the search. Naming every supplied option is
        // two dozen flags on the .env workflow this feature is for, which pushes
        // the actual error off screen and narrows nothing.
        qseowVerifyContentLibraryExists.mockResolvedValueOnce(false).mockResolvedValue(true);

        const answers = baseAnswers();
        delete answers.host;
        delete answers.logonuserid;

        const runtime = scriptedRuntime(answers);

        await runInteractive({
            path: PATH,
            presetOptions: {
                contentlibrary: 'Deleted last year',
                host: 'wrong.acme.com',
                // Supplied, but nothing the content library check reads.
                logonuserid: 'goran',
            },
            runtime,
        });

        const line = runtime
            .output()
            .split('\n')
            .find((text) => text.includes('This check also uses'));

        expect(line).toContain('--host');
        expect(line).not.toContain('--logonuserid');
    });

    test('reports both certificate files, on a line each', async () => {
        // The probe hangs off --certkeyfile only because it is the second of the
        // pair and cannot run before both paths are known. It checks --certfile
        // just as thoroughly, and naming only the key file hid that.
        const answers = baseAnswers();
        delete answers.certfile;
        delete answers.certkeyfile;

        const runtime = scriptedRuntime(answers);

        await runInteractive({
            path: PATH,
            presetOptions: {
                certfile: '/certs/client.pem',
                certkeyfile: '/certs/client_key.pem',
            },
            presetSources: { certfile: 'env', certkeyfile: 'env' },
            runtime,
        });

        const lines = runtime
            .output()
            .split('\n')
            .filter((text) => text.includes(' checked'));

        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain('--certfile (from BSI_QSEOW_CST_CERT_FILE) checked');
        expect(lines[1]).toContain('--certkeyfile (from BSI_QSEOW_CST_CERTKEY_FILE) checked');
    });

    test('reports only the covered options that were supplied', async () => {
        // --certfile was typed on screen a moment ago, so confirming it exists
        // tells the operator nothing they did not just do themselves.
        const answers = baseAnswers();
        delete answers.certkeyfile;

        const runtime = scriptedRuntime(answers);

        await runInteractive({
            path: PATH,
            presetOptions: { certkeyfile: '/certs/client_key.pem' },
            runtime,
        });

        const lines = runtime
            .output()
            .split('\n')
            .filter((text) => text.includes(' checked'));

        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('--certkeyfile checked');
    });

    test('checks the certificates supplied for it too', async () => {
        // The other probe on this wizard, and a local one rather than a network
        // one - the twin cases have to behave the same way.
        qseowVerifyCertificatesExist.mockResolvedValueOnce(false).mockResolvedValue(true);

        const answers = baseAnswers({ certkeyfile: './cert/client_key.pem' });

        const runtime = scriptedRuntime(answers);

        await runInteractive({
            path: PATH,
            presetOptions: { certkeyfile: './moved/client_key.pem' },
            runtime,
        });

        expect(qseowVerifyCertificatesExist).toHaveBeenCalled();
        expect(runtime.output()).toContain('Certificate file(s) not found');
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

describe('the static/dynamic classification', () => {
    // PER_RUN_KEYS in spec-ops.js is the one statement of the rule: an option
    // describing this run is always asked, opening on what was supplied; an
    // option describing this environment stays answered.
    const connection = {
        host: 'sense.acme.com',
        certfile: './cert/client.pem',
        certkeyfile: './cert/client_key.pem',
        apiuserdir: 'INTERNAL',
        apiuserid: 'sa_api',
        logonuserdir: 'ACME',
        logonuserid: 'goran',
        logonpwd: 'a-password',
    };

    test('a supplied --includesheetpart is asked again, opening on that value', async () => {
        const runtime = scriptedRuntime(baseAnswers({ includesheetpart: '4' }));

        await runInteractive({
            path: PATH,
            presetOptions: { ...connection, includesheetpart: '2' },
            runtime,
        });

        const question = runtime.asked.find((a) => a.key === 'includesheetpart');
        expect(question).toBeDefined();
        expect(question.default).toBe('2');
    });

    test('a supplied sheet filter is shown even when the filtering gate is declined', async () => {
        // Otherwise the worst of both worlds: a filter from a .env file quietly
        // excluding sheets, behind a question answered "no".
        const runtime = scriptedRuntime(
            baseAnswers({ _filtering: false, excludeSheetNumber: '2' })
        );

        await runInteractive({
            path: PATH,
            presetOptions: { ...connection, excludeSheetNumber: ['7'] },
            runtime,
        });

        const question = runtime.asked.find((a) => a.key === 'excludeSheetNumber');
        expect(question).toBeDefined();
        expect(question.default).toBe('7');
    });

    test('the other filters stay behind the gate', async () => {
        const runtime = scriptedRuntime(
            baseAnswers({ _filtering: false, excludeSheetNumber: '2' })
        );

        await runInteractive({
            path: PATH,
            presetOptions: { ...connection, excludeSheetNumber: ['7'] },
            runtime,
        });

        expect(runtime.asked.map((a) => a.key)).not.toContain('blurSheetNumber');
    });

    test('an option describing the environment stays answered', async () => {
        // --contentlibrary and --imagedir sit outside PER_RUN_KEYS on purpose.
        const runtime = scriptedRuntime(baseAnswers());

        await runInteractive({
            path: PATH,
            presetOptions: { ...connection, contentlibrary: 'Butler sheet thumbnails' },
            runtime,
        });

        expect(runtime.asked.map((a) => a.key)).not.toContain('contentlibrary');
        expect(runtime.output()).toContain('not asked about again');
    });

    test('a supplied option inside the advanced block is shown, gate declined or not', async () => {
        // PER_RUN_KEYS promises that moving a key in or out is the whole edit.
        // It only holds if a gated question can see what was supplied: without
        // that, reclassifying --image-dir would have the banner promise it and
        // the advanced gate silently swallow it.
        const runtime = scriptedRuntime(baseAnswers({ _advanced: false, imagedir: './out' }));

        await runInteractive({
            path: PATH,
            presetOptions: { ...connection, imagedir: './from-env' },
            runtime,
        });

        // Static today, so not asked - but the gate no longer hides it, which is
        // what makes the reclassification safe.
        const hidden = runtime.asked.map((a) => a.key);
        expect(hidden).not.toContain('imagedir');
        expect(runtime.output()).toContain('not asked about again');
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

    test('still gets the picker, with the supplied app ticked and listed first', async () => {
        // First, not merely ticked. On the QSEoW test server the app that came
        // from a .env file sat at index 16 of 519, ten rows below the fold, so
        // the list looked entirely unticked and submitting it silently kept an
        // app nobody had chosen in this run.
        const runtime = scriptedRuntime(baseAnswers({ appid: ['app-a'] }));

        await runInteractive({ path: PATH, presetOptions: supplied, runtime });

        const question = runtime.asked.find((a) => a.key === 'appid');
        expect(question).toBeDefined();
        expect(question.choices).toEqual([
            expect.objectContaining({ value: 'app-b', checked: true }),
            expect.objectContaining({ value: 'app-a', checked: false }),
        ]);
    });

    test('matches a supplied id that differs only in case', async () => {
        // GUIDs are not case-sensitive and are routinely pasted out of the QMC
        // in upper case. Comparing exactly reported an app that is plainly on
        // the server as missing, and left its row unticked so it was dropped.
        const runtime = scriptedRuntime(baseAnswers({ appid: ['app-a'] }));

        await runInteractive({
            path: PATH,
            presetOptions: { ...supplied, appid: ['APP-B'] },
            runtime,
        });

        const question = runtime.asked.find((a) => a.key === 'appid');
        expect(question.choices[0]).toEqual(
            expect.objectContaining({ value: 'app-b', checked: true })
        );
        expect(runtime.output()).not.toContain('no longer on the server');
    });

    test('says a supplied app the server no longer has is not in the list', async () => {
        const runtime = scriptedRuntime(baseAnswers({ appid: ['app-a'] }));

        await runInteractive({
            path: PATH,
            presetOptions: { ...supplied, appid: ['app-gone'] },
            runtime,
        });

        expect(runtime.output()).toContain('app-gone - supplied, but no longer on the server');
    });

    test('is announced as asked again rather than as skipped', async () => {
        const runtime = scriptedRuntime(baseAnswers({ appid: ['app-a'] }));

        await runInteractive({ path: PATH, presetOptions: supplied, runtime });

        expect(runtime.output()).toContain('so you can change it for this run: --appid');
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
