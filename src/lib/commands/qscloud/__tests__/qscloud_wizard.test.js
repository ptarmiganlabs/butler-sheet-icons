import { jest, describe, test, expect, beforeEach } from '@jest/globals';

const qscloudTestConnection = jest.fn();
const listCollections = jest.fn();
const listApps = jest.fn();
const listAppsByCollection = jest.fn();
const qscloudCreateThumbnails = jest.fn().mockResolvedValue(true);

jest.unstable_mockModule('../../../cloud/cloud-repo.js', () => ({
    default: jest.fn().mockImplementation((config) => ({ config })),
}));
jest.unstable_mockModule('../../../cloud/cloud-test-connection.js', () => ({
    qscloudTestConnection,
}));
jest.unstable_mockModule('../../../cloud/cloud-apps.js', () => ({
    listCollections,
    listApps,
    listAppsByCollection,
}));
jest.unstable_mockModule('../../../cloud/cloud-create-thumbnails.js', () => ({
    qscloudCreateThumbnails,
}));

const { runInteractive } = await import('../../../interactive/index.js');
const { scriptedRuntime } = await import('../../../interactive/test-helpers/scripted-runtime.js');
const { labelForApp, labelForCollection } =
    await import('../create-sheet-thumbnails.interactive.js');

const PATH = 'qscloud create-sheet-thumbnails';

/**
 * The answers a run needs when both gates are declined.
 *
 * Carries answers for the gated questions too, so a test that opens a gate only
 * has to flip the gate rather than restate the whole conversation.
 *
 * @param {object} [overrides] - Answers to replace or add.
 *
 * @returns {object} Answers for the scripted runtime.
 */
const baseAnswers = (overrides = {}) => ({
    tenanturl: 'acme.eu.qlikcloud.com',
    apikey: 'a-real-key',
    skipLogin: false,
    logonuserid: 'user@acme.com',
    logonpwd: 'secret',
    _appSource: 'all',
    appid: ['app-a'],
    includesheetpart: '1',
    excludeSheetStatus: [],
    excludeSheetTag: '',
    excludeSheetNumber: '',
    excludeSheetTitle: '',
    blurSheetStatus: [],
    blurSheetTag: '',
    blurSheetNumber: '',
    blurSheetTitle: '',
    blurFactor: '5',
    _filtering: false,
    _advanced: false,
    _review: 'cancel',
    ...overrides,
});

beforeEach(() => {
    jest.clearAllMocks();
    qscloudTestConnection.mockResolvedValue({ user: 'someone' });
    listApps.mockResolvedValue([
        { id: 'app-a', name: 'Finance' },
        { id: 'app-b', name: 'Sales' },
    ]);
    listAppsByCollection.mockResolvedValue([{ id: 'app-c', name: 'HR' }]);
    listCollections.mockResolvedValue([{ id: 'coll-1', name: 'Finance', itemCount: 4 }]);
});

describe('the connection probe', () => {
    test('runs as soon as the API key is given, not after every other question', async () => {
        // The single biggest difference from the plain CLI, where a bad key is
        // discovered only once the run starts - after 25 flags have been typed.
        const runtime = scriptedRuntime(baseAnswers());

        await runInteractive({ path: PATH, runtime });

        const askedBeforeProbe = runtime.asked
            .slice(0, runtime.asked.findIndex((a) => a.key === 'apikey') + 1)
            .map((a) => a.key);

        expect(qscloudTestConnection).toHaveBeenCalledTimes(1);
        expect(askedBeforeProbe).toEqual(['tenanturl', 'apikey']);
    });

    test('re-asks the API key when the tenant rejects it', async () => {
        qscloudTestConnection
            .mockRejectedValueOnce(new Error('401 Unauthorized'))
            .mockResolvedValue({ user: 'someone' });

        const runtime = scriptedRuntime(baseAnswers({ apikey: ['wrong-key', 'a-real-key'] }));

        await runInteractive({ path: PATH, runtime });

        expect(runtime.asked.filter((a) => a.key === 'apikey')).toHaveLength(2);
        expect(runtime.output()).toContain('401 Unauthorized');
    });

    test('reports the failure where the credential was typed', async () => {
        qscloudTestConnection
            .mockRejectedValueOnce(new Error('401 Unauthorized'))
            .mockResolvedValue({ user: 'someone' });

        const runtime = scriptedRuntime(baseAnswers({ apikey: ['wrong-key', 'a-real-key'] }));

        await runInteractive({ path: PATH, runtime });

        // Nothing beyond the credentials was asked before the complaint.
        const asked = runtime.asked.map((a) => a.key);
        expect(asked.indexOf('_appSource')).toBeGreaterThan(asked.lastIndexOf('apikey'));
    });
});

describe('choosing which apps to update', () => {
    test('offers the apps the tenant actually has', async () => {
        const runtime = scriptedRuntime(baseAnswers());

        await runInteractive({ path: PATH, runtime });

        expect(listApps).toHaveBeenCalledTimes(1);
        const question = runtime.asked.find((a) => a.key === 'appid');
        expect(question.choices.map((c) => c.value)).toEqual(['app-a', 'app-b']);
    });

    test('labels every app with its id, marked as an id', async () => {
        // App names are not unique - duplicates exist on real servers - so the
        // name alone is ambiguous to whoever is choosing.
        const runtime = scriptedRuntime(baseAnswers());

        await runInteractive({ path: PATH, runtime });

        const question = runtime.asked.find((a) => a.key === 'appid');
        expect(question.choices[0].name).toBe('Finance  (id: app-a)');
    });

    test('reports what a collection holds instead of a list that cannot narrow', async () => {
        // The collection reaches the worker as well, and the two are additive,
        // so unticking an app in a list of its apps never removed it from the
        // run. Saying how many it holds is the honest version of that.
        const runtime = scriptedRuntime(
            baseAnswers({ _appSource: 'grouped', collectionid: 'coll-1' })
        );

        await runInteractive({ path: PATH, runtime });

        expect(listAppsByCollection).toHaveBeenCalledWith(expect.anything(), 'coll-1');
        expect(listApps).not.toHaveBeenCalled();
        expect(runtime.asked.map((a) => a.key)).not.toContain('appid');
        expect(runtime.output()).toContain(
            "1 app(s) are in collection 'coll-1' and will be updated."
        );
    });

    test('shows how many items a collection holds, so an empty one is visible', async () => {
        const runtime = scriptedRuntime(
            baseAnswers({ _appSource: 'grouped', collectionid: 'coll-1' })
        );

        await runInteractive({ path: PATH, runtime });

        const question = runtime.asked.find((a) => a.key === 'collectionid');
        expect(question.choices[0].name).toBe('Finance  (4 items)');
    });

    test('re-asks a collection that holds no apps, rather than running over nothing', async () => {
        listAppsByCollection.mockResolvedValueOnce([]).mockResolvedValue([{ id: 'app-c' }]);

        const runtime = scriptedRuntime(
            baseAnswers({ _appSource: 'grouped', collectionid: ['coll-1', 'coll-1'] })
        );

        await runInteractive({ path: PATH, runtime });

        expect(runtime.asked.filter((a) => a.key === 'collectionid')).toHaveLength(2);
        expect(runtime.output()).toContain("Collection 'coll-1' holds no apps.");
    });

    test('still lets an app id be typed, without fetching any list', async () => {
        const runtime = scriptedRuntime(baseAnswers({ _appSource: 'typed', appid: 'app-z' }));

        await runInteractive({ path: PATH, runtime });

        expect(listApps).not.toHaveBeenCalled();
        expect(listAppsByCollection).not.toHaveBeenCalled();
    });

    test('does not ask which collection when apps are chosen another way', async () => {
        const runtime = scriptedRuntime(baseAnswers());

        await runInteractive({ path: PATH, runtime });

        expect(runtime.asked.map((a) => a.key)).not.toContain('collectionid');
    });
});

describe('the static/dynamic classification', () => {
    // QSEoW twin of the same block: PER_RUN_KEYS in spec-ops.js is the one
    // statement of the rule, so both platforms get the same treatment.
    const connection = { tenanturl: 'acme.eu.qlikcloud.com', apikey: 'a-real-key' };

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

    test('an option describing the environment stays answered', async () => {
        const runtime = scriptedRuntime(baseAnswers());

        await runInteractive({
            path: PATH,
            presetOptions: { ...connection, imagedir: './img' },
            runtime,
        });

        expect(runtime.asked.map((a) => a.key)).not.toContain('imagedir');
    });
});

describe('a selection that would process nothing', () => {
    test('is refused where it was made, not after the run is confirmed', async () => {
        const runtime = scriptedRuntime(baseAnswers({ _appSource: 'typed', appid: ['', 'app-z'] }));

        await runInteractive({ path: PATH, runtime });

        expect(runtime.asked.filter((a) => a.key === 'appid')).toHaveLength(2);
        expect(runtime.output()).toContain('No apps selected');
        expect(qscloudCreateThumbnails).not.toHaveBeenCalled();
    });

    test('is allowed when a collection is carrying the selection instead', async () => {
        // The run is the union of the two, so naming no apps is fine as long as
        // the collection holds some.
        const runtime = scriptedRuntime(
            baseAnswers({ collectionid: 'coll-1', appid: [], _review: 'run' })
        );

        await runInteractive({
            path: PATH,
            presetOptions: { collectionid: 'coll-1' },
            runtime,
        });

        expect(runtime.asked.filter((a) => a.key === 'appid')).toHaveLength(1);
        expect(qscloudCreateThumbnails).toHaveBeenCalledWith(
            expect.objectContaining({ collectionid: 'coll-1' })
        );
    });
});

describe('an app id supplied before the wizard starts', () => {
    // QSEoW twin of the same block: an id in a .env file used to remove the app
    // question but leave the question that leads to it, so the wizard asked how
    // apps should be chosen and then never showed a list.
    const supplied = {
        tenanturl: 'acme.eu.qlikcloud.com',
        apikey: 'a-real-key',
        appid: ['app-b'],
    };

    test('still gets the picker, with the supplied app ticked and listed first', async () => {
        // First, not merely ticked: a ticked row below the fold of a long list
        // is the same as no choice at all.
        const runtime = scriptedRuntime(baseAnswers({ appid: ['app-a'] }));

        await runInteractive({ path: PATH, presetOptions: supplied, runtime });

        const question = runtime.asked.find((a) => a.key === 'appid');
        expect(question).toBeDefined();
        expect(question.choices).toEqual([
            expect.objectContaining({ value: 'app-b', checked: true }),
            expect.objectContaining({ value: 'app-a', checked: false }),
        ]);
    });

    test('says a supplied app the tenant no longer has is not in the list', async () => {
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

        expect(qscloudCreateThumbnails).toHaveBeenCalledWith(
            expect.objectContaining({ appid: ['app-a'] })
        );
    });
});

describe('a collection supplied before the wizard starts', () => {
    // QSEoW twin of the same block. A collection is a second way of naming
    // apps, not an alternative to naming them, so a supplied one applies
    // whichever route is taken - and asking about it only on the collection
    // route let it add apps the operator was never shown.
    const supplied = {
        tenanturl: 'acme.eu.qlikcloud.com',
        apikey: 'a-real-key',
        collectionid: 'coll-1',
    };

    test('is asked about on the all-apps route too, opening on the supplied one', async () => {
        const runtime = scriptedRuntime(baseAnswers({ collectionid: 'coll-1' }));

        await runInteractive({ path: PATH, presetOptions: supplied, runtime });

        const question = runtime.asked.find((a) => a.key === 'collectionid');
        expect(question).toBeDefined();
        expect(question.default).toBe('coll-1');
    });

    test('offers a way to drop it, which the collection route does not need', async () => {
        const runtime = scriptedRuntime(baseAnswers({ collectionid: '' }));

        await runInteractive({ path: PATH, presetOptions: supplied, runtime });

        const question = runtime.asked.find((a) => a.key === 'collectionid');
        expect(question.choices[0]).toEqual(expect.objectContaining({ value: '' }));
    });

    test('choosing none stops the collection apps being added to the run', async () => {
        const runtime = scriptedRuntime(
            baseAnswers({ collectionid: '', appid: ['app-a'], _review: 'run' })
        );

        await runInteractive({ path: PATH, presetOptions: supplied, runtime });

        // An empty collection matches the option's own default, so it is never
        // emitted to the command line and the bag carries exactly what the plain
        // CLI produces when no collection is given. qscloudCreateThumbnails
        // gates on `collectionid && length > 0`, so no collection lookup
        // happens: the run covers the picked app and nothing else.
        const bag = qscloudCreateThumbnails.mock.calls[0][0];
        expect(bag.appid).toEqual(['app-a']);
        expect(bag.collectionid).toBe('');
    });

    test('keeping it still adds the collection apps, as the CLI does', async () => {
        const runtime = scriptedRuntime(
            baseAnswers({ collectionid: 'coll-1', appid: ['app-a'], _review: 'run' })
        );

        await runInteractive({ path: PATH, presetOptions: supplied, runtime });

        expect(qscloudCreateThumbnails).toHaveBeenCalledWith(
            expect.objectContaining({ appid: ['app-a'], collectionid: 'coll-1' })
        );
    });

    test('a collection that was never supplied is still only asked on its own route', async () => {
        const runtime = scriptedRuntime(baseAnswers());

        await runInteractive({ path: PATH, runtime });

        expect(runtime.asked.map((a) => a.key)).not.toContain('collectionid');
    });
});

describe('progressive disclosure', () => {
    test('declining advanced options keeps the conversation short', async () => {
        // The lever that matters. This command declares 25 options; a flat list
        // of 25 questions is the problem no amount of styling fixes.
        const runtime = scriptedRuntime(baseAnswers());

        await runInteractive({ path: PATH, runtime });

        const asked = runtime.asked.filter((a) => a.key !== '_review').map((a) => a.key);

        // Pinned exactly rather than as a count, so a new option quietly
        // joining the default path shows up here as a diff and has to be
        // classified - gated, or deliberately part of the short conversation.
        expect(asked).toEqual([
            // Connection
            'tenanturl',
            'apikey',
            'skipLogin',
            'logonuserid',
            'logonpwd',
            // Apps
            '_appSource',
            'appid',
            // Sheets
            'includesheetpart',
            // The two gates, both declined
            '_filtering',
            '_advanced',
        ]);
    });

    test('accepting advanced options asks for them', async () => {
        const runtime = scriptedRuntime(
            baseAnswers({
                _advanced: true,
                loglevel: 'info',
                schemaversion: '12.612.0',
                pagewait: '5',
                imagedir: './img',
                browser: 'chrome',
                browserVersion: 'recommended',
                browserPageTimeout: '90',
                browserCacheDir: '',
                headless: true,
            })
        );

        await runInteractive({ path: PATH, runtime });

        expect(runtime.asked.map((a) => a.key)).toContain('schemaversion');
        expect(runtime.asked.map((a) => a.key)).toContain('browserPageTimeout');
        // Behind the advanced gate rather than in the main flow: most runs never name a
        // browser cache directory, and an unplaced key would be asked last and ungated.
        expect(runtime.asked.map((a) => a.key)).toContain('browserCacheDir');
    });

    test('never asks for the log level up front', async () => {
        const runtime = scriptedRuntime(baseAnswers());

        await runInteractive({ path: PATH, runtime });

        expect(runtime.asked[0].key).toBe('tenanturl');
    });
});

describe('the run itself', () => {
    test('cancelling runs nothing', async () => {
        const runtime = scriptedRuntime(baseAnswers());

        await runInteractive({ path: PATH, runtime });

        expect(qscloudCreateThumbnails).not.toHaveBeenCalled();
    });

    test('confirming calls the worker with a Commander-shaped bag', async () => {
        const runtime = scriptedRuntime(baseAnswers({ _review: 'run' }));

        await runInteractive({ path: PATH, runtime });

        expect(qscloudCreateThumbnails).toHaveBeenCalledTimes(1);
        const options = qscloudCreateThumbnails.mock.calls[0][0];
        expect(options.tenanturl).toBe('acme.eu.qlikcloud.com');
        expect(options.appid).toEqual(['app-a']);
        // Synthetic questions must never reach the worker.
        expect(options._appSource).toBeUndefined();
        expect(options._advanced).toBeUndefined();
    });

    test('never prints the API key', async () => {
        const runtime = scriptedRuntime(baseAnswers({ _review: 'run' }));

        await runInteractive({ path: PATH, runtime });

        expect(runtime.output()).not.toContain('a-real-key');
    });
});

describe('the labels', () => {
    test('an app label carries the full id, never truncated', () => {
        const id = 'a1b2c3d4-1111-2222-3333-444455556666';

        expect(labelForApp({ id, name: 'Finance' })).toBe(`Finance  (id: ${id})`);
    });

    test('two apps sharing a name stay distinguishable', () => {
        const first = labelForApp({ id: 'app-a', name: 'Performance review' });
        const second = labelForApp({ id: 'app-b', name: 'Performance review' });

        expect(first).not.toBe(second);
    });

    test('a collection with no items says so', () => {
        expect(labelForCollection({ name: 'Empty', itemCount: 0 })).toBe('Empty  (0 items)');
    });
});
