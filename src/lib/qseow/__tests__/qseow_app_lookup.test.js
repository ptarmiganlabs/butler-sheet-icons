import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// QSEoW twin of cloud_apps.test.js. listAppsByTag had no dedicated coverage at all - it was
// only ever exercised sideways, through the two workers that call it - so the one thing that
// actually matters about its return value, that it carries app names and not just ids, was
// asserted nowhere.

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    },
    setLoggingLevel: jest.fn(),
    bsiExecutablePath: '/test/path',
    isSea: false,
}));

jest.unstable_mockModule('../qseow-qrs.js', () => ({
    setupQseowQrsConnection: jest.fn().mockReturnValue({ hostname: 'sense.example.com' }),
}));

const Get = jest.fn();
jest.unstable_mockModule('qrs-interact', () => ({
    default: jest.fn().mockImplementation(() => ({ Get })),
}));

const { listAppsByTag } = await import('../qseow-app-lookup.js');

const OPTIONS = {
    host: 'sense.example.com',
    qrsport: '4242',
    certfile: './cert/client.pem',
    certkeyfile: './cert/client_key.pem',
    qliksensetag: 'BSI',
};

/**
 * Points the mocked QRS at a server holding the given apps.
 *
 * @param {Array<object>} apps - Apps the `app/full` query should report.
 *
 * @returns {void}
 */
const withApps = (apps) => {
    Get.mockResolvedValue({ statusCode: 200, body: apps });
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('listAppsByTag', () => {
    test('returns id and name for every tagged app', async () => {
        withApps([
            { id: 'app-a', name: 'Finance' },
            { id: 'app-b', name: 'Sales' },
        ]);

        await expect(listAppsByTag(OPTIONS)).resolves.toEqual([
            { id: 'app-a', name: 'Finance' },
            { id: 'app-b', name: 'Sales' },
        ]);
    });

    test('keeps the name the QRS reply already carried', async () => {
        // The regression this file exists for. `app/full` has always returned the
        // name and this helper used to throw it away with `apps.map((a) => a.id)`,
        // which would have left an app picker showing GUIDs on QSEoW and names on
        // Cloud - see #986.
        withApps([{ id: 'app-a', name: 'Finance' }]);

        const [app] = await listAppsByTag(OPTIONS);

        expect(app.name).toBe('Finance');
        expect(app.name).not.toBe(app.id);
    });

    test('falls back to the id when the reply carries no name', async () => {
        withApps([{ id: 'app-a' }]);

        await expect(listAppsByTag(OPTIONS)).resolves.toEqual([{ id: 'app-a', name: 'app-a' }]);
    });

    test('returns an empty list when the tag matched nothing', async () => {
        withApps([]);

        await expect(listAppsByTag(OPTIONS)).resolves.toEqual([]);
    });

    test('queries app/full filtered by tag name', async () => {
        withApps([]);

        await listAppsByTag(OPTIONS);

        expect(decodeURIComponent(Get.mock.calls[0][0])).toBe(
            "app/full?filter=(tags.name eq 'BSI')"
        );
    });

    test('accepts several tags', async () => {
        withApps([]);

        await listAppsByTag({ ...OPTIONS, qliksensetag: ['BSI', 'Finance'] });

        expect(decodeURIComponent(Get.mock.calls[0][0])).toBe(
            "app/full?filter=(tags.name eq 'BSI' or tags.name eq 'Finance')"
        );
    });

    test('propagates a QRS failure rather than reporting no apps', async () => {
        Get.mockRejectedValue(new Error('401 Unauthorized'));

        await expect(listAppsByTag(OPTIONS)).rejects.toThrow('401 Unauthorized');
    });

    test('reports an unusable QRS reply as itself', async () => {
        // Through qrsGetList, so a reply that is not a list fails as a named
        // problem rather than as `result.body.map is not a function`.
        Get.mockResolvedValue({ statusCode: 200, body: { error: 'proxy failure' } });

        await expect(listAppsByTag(OPTIONS)).rejects.toThrow(/unusable response/);
    });
});

describe('the two platforms describe an app the same way', () => {
    // The asymmetry #986 was filed about. Cloud has always returned { id, name };
    // QSEoW returned bare ids, so a picker would have needed different code per
    // platform for no reason other than this.
    test('a tagged app has exactly the id and name keys, as on Cloud', async () => {
        withApps([{ id: 'app-a', name: 'Finance', published: true, stream: null }]);

        const [app] = await listAppsByTag(OPTIONS);

        expect(Object.keys(app).sort()).toEqual(['id', 'name']);
    });
});
