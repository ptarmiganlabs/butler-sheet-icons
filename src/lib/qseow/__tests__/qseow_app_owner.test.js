import { jest, describe, test, expect, beforeEach } from '@jest/globals';

/**
 * Tests for the QSEoW half of `--change-app-owner` (issue #1209): the QRS calls that read and
 * change an app's owner, and finding the user who is to own the apps.
 *
 * `qrs-interact` is replaced by a recorder, so each test can see exactly which requests went to
 * QRS, in which order, with which body and which content type.
 */

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
    },
    bsiExecutablePath: '/bsi',
}));

const requests = [];
let respond;
jest.unstable_mockModule('qrs-interact', () => ({
    default: jest.fn(function QrsInteractMock(config) {
        this.Get = async (path) => {
            requests.push({ method: 'GET', path, contentType: config.headers['Content-Type'] });
            return respond('GET', path);
        };
        this.Put = async (path, body) => {
            requests.push({
                method: 'PUT',
                path,
                body,
                contentType: config.headers['Content-Type'],
            });
            return respond('PUT', path, body);
        };
    }),
}));

const readQseowBrowserUser = jest.fn();
jest.unstable_mockModule('../qseow-app-session.js', () => ({ readQseowBrowserUser }));

const { findQseowOwner, qseowAppOwners, resolveQseowOwnerTarget } =
    await import('../qseow-app-owner.js');
const { QseowError } = await import('../../util/errors.js');
const { logger } = await import('../../../globals.js');

const OPTIONS = {
    host: 'sense.example.com',
    qrsport: 4242,
    certfile: './cert/client.pem',
    certkeyfile: './cert/client_key.pem',
    apiuserdir: 'INTERNAL',
    apiuserid: 'sa_api',
    logonuserdir: 'ACME',
    logonuserid: 'joe',
};
const APP = '2d3f0000-0000-4000-8000-000000000001';
const ANNA = { id: 'u-anna', userDirectory: 'ACME', userId: 'anna', name: 'Anna' };
const JOE = { id: 'u-joe', userDirectory: 'ACME', userId: 'joe', name: 'Joe' };
const APP_ENTITY = {
    id: APP,
    name: 'Sales',
    modifiedDate: '2026-10-26T10:00:00.000Z',
    published: true,
    owner: ANNA,
    tags: [{ id: 't-1', name: 'BSI' }],
};

/**
 * The filter a QRS path carries, decoded.
 *
 * @param {string} path - A QRS path with `?filter=`.
 *
 * @returns {string} The filter expression.
 */
const filterOf = (path) => decodeURIComponent(path.split('?filter=')[1]);

beforeEach(() => {
    jest.clearAllMocks();
    requests.length = 0;
    respond = (method, path, body) => {
        if (path.startsWith('user?')) {
            return { statusCode: 200, body: [JOE] };
        }

        return { statusCode: 200, body: method === 'PUT' ? body : APP_ENTITY };
    };
});

describe('findQseowOwner', () => {
    test('looks the user up by directory and id, and returns it as an owner', async () => {
        const owner = await findQseowOwner(
            OPTIONS,
            { userDirectory: 'ACME', userId: 'joe' },
            '--logonuserdir and --logonuserid'
        );

        expect(requests).toHaveLength(1);
        expect(filterOf(requests[0].path)).toBe("userDirectory eq 'ACME' and userId eq 'joe'");
        expect(owner).toEqual({
            id: 'u-joe',
            label: 'ACME\\joe',
            reference: { id: 'u-joe', userDirectory: 'ACME', userId: 'joe', name: 'Joe' },
        });
    });

    test('escapes a quote in a user id, as every other QRS filter does', async () => {
        await findQseowOwner(OPTIONS, { userDirectory: 'ACME', userId: "o'brien" }, 'source');

        expect(filterOf(requests[0].path)).toBe(
            "userDirectory eq 'ACME' and userId eq 'o\\'brien'"
        );
    });

    test('refuses a user Qlik Sense does not know, naming where the name came from', async () => {
        respond = () => ({ statusCode: 200, body: [] });

        const err = await findQseowOwner(
            OPTIONS,
            { userDirectory: 'ACME', userId: 'joe' },
            '--logonuserdir and --logonuserid'
        ).catch((e) => e);

        expect(err).toBeInstanceOf(QseowError);
        expect(err.message).toContain('Qlik Sense has no user ACME\\joe');
        expect(err.message).toContain('--logonuserdir and --logonuserid');
        expect(err.message).toContain('sign in to Qlik Sense once as that user');
    });

    test('refuses an ambiguous answer rather than picking a user', async () => {
        respond = () => ({ statusCode: 200, body: [JOE, { ...JOE, id: 'u-joe-2' }] });

        await expect(
            findQseowOwner(OPTIONS, { userDirectory: 'ACME', userId: 'joe' }, 'source')
        ).rejects.toThrow('2 users matching ACME\\joe');
    });
});

describe('qseowAppOwners', () => {
    const owners = qseowAppOwners(OPTIONS);

    test('reads the app name and owner', async () => {
        await expect(owners.inspect(APP)).resolves.toEqual({
            appName: 'Sales',
            owner: {
                id: 'u-anna',
                label: 'ACME\\anna',
                reference: { id: 'u-anna', userDirectory: 'ACME', userId: 'anna', name: 'Anna' },
            },
            // A published app is re-owned like any other on QSEoW.
            keepReason: null,
        });
        expect(requests[0].path).toBe(`app/${APP}`);
    });

    test('refuses an id that is not an app id, before asking QRS', async () => {
        await expect(owners.inspect('../user')).rejects.toBeInstanceOf(QseowError);
        expect(requests).toHaveLength(0);
    });

    test('refuses an app QRS names no owner for', async () => {
        respond = () => ({ statusCode: 200, body: { ...APP_ENTITY, owner: null } });

        await expect(owners.inspect(APP)).rejects.toThrow(`QRS did not say who owns app ${APP}`);
    });

    test('changes the owner by writing back a fresh read of the app, as JSON', async () => {
        await owners.change(APP, { id: 'u-joe', label: 'ACME\\joe', reference: { id: 'u-joe' } });

        // Read first: QRS checks modifiedDate on a write, and the app moves under BSI.
        expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
            `GET app/${APP}`,
            `PUT app/${APP}`,
        ]);
        expect(requests[1].body).toEqual({ ...APP_ENTITY, owner: { id: 'u-joe' } });
        expect(requests[1].contentType).toBe('application/json');
        expect(requests[0].contentType).toBe('png');
    });

    test('reads only the owner id before a restore', async () => {
        await expect(owners.currentOwnerId(APP)).resolves.toBe('u-anna');
    });

    test('says how to give the app back in the QMC', () => {
        expect(owners.manualFix(APP, { label: 'ACME\\anna' })).toBe(
            `In the QMC, open Apps, edit app ${APP} and set its owner back to ACME\\anna.`
        );
    });
});

describe('qseowAppOwners - the objects an owner change moves', () => {
    const owners = qseowAppOwners(OPTIONS);
    const USER_ID = '7e1c0000-0000-4000-8000-0000000000aa';
    const OBJECT = '5f2a0000-0000-4000-8000-000000000002';

    test('lists the objects one user owns in an app, by owner id', async () => {
        respond = () => ({
            statusCode: 200,
            body: [
                { id: 'o-1', name: "Joe's notes", objectType: 'sheet', engineObjectId: 'abc' },
                { id: 'o-2', objectType: 'app_appscript' },
            ],
        });

        await expect(owners.objectsOwnedBy(APP, USER_ID)).resolves.toEqual([
            { id: 'o-1', name: "Joe's notes", objectType: 'sheet' },
            { id: 'o-2', name: '', objectType: 'app_appscript' },
        ]);
        expect(requests[0].path.startsWith('app/object?filter=')).toBe(true);
        expect(filterOf(requests[0].path)).toBe(`app.id eq ${APP} and owner.id eq ${USER_ID}`);
    });

    test('refuses an owner id that is not a QRS id, before asking QRS', async () => {
        // The ids are unquoted filter terms, so anything else could change what is matched.
        await expect(owners.objectsOwnedBy(APP, `${USER_ID} or 1 eq 1`)).rejects.toBeInstanceOf(
            QseowError
        );
        expect(requests).toHaveLength(0);
    });

    test('gives an object a new owner by writing back a fresh read of it, as JSON', async () => {
        const objectEntity = {
            id: OBJECT,
            name: "Joe's notes",
            modifiedDate: '2026-10-26T10:00:00.000Z',
            owner: ANNA,
        };
        respond = (method, path, body) => ({
            statusCode: 200,
            body: method === 'PUT' ? body : objectEntity,
        });

        await owners.changeObjectOwner(OBJECT, {
            id: 'u-joe',
            label: 'ACME\\joe',
            reference: { id: 'u-joe' },
        });

        expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
            `GET app/object/${OBJECT}`,
            `PUT app/object/${OBJECT}`,
        ]);
        expect(requests[1].body).toEqual({ ...objectEntity, owner: { id: 'u-joe' } });
        expect(requests[1].contentType).toBe('application/json');
    });

    test('refuses an object id that is not a QRS id, before asking QRS', async () => {
        await expect(
            owners.changeObjectOwner('../app/x', { reference: { id: 'u-joe' } })
        ).rejects.toBeInstanceOf(QseowError);
        expect(requests).toHaveLength(0);
    });

    test('says how to give objects back in the QMC', () => {
        expect(owners.manualObjectFix('sheet "Joe\'s notes" (o-1)', { label: 'ACME\\joe' })).toBe(
            `In the QMC, open App objects and set the owner of each of these back to ACME\\joe: sheet "Joe's notes" (o-1).`
        );
    });
});

describe('resolveQseowOwnerTarget', () => {
    test('with form login, is the logon user, without opening a browser', async () => {
        const target = await resolveQseowOwnerTarget(OPTIONS, { dryRun: false });

        expect(target.label).toBe('ACME\\joe');
        expect(filterOf(requests[0].path)).toBe("userDirectory eq 'ACME' and userId eq 'joe'");
        expect(readQseowBrowserUser).not.toHaveBeenCalled();
    });

    test('says at the start that the objects an owner change moves are given back', async () => {
        await resolveQseowOwnerTarget(OPTIONS, { dryRun: false });

        expect(logger.info).toHaveBeenCalledWith(
            expect.stringContaining(
                'any that ACME\\joe already owns in an app are given back to ACME\\joe'
            )
        );
    });

    test('with --skip-login, asks the browser who it signs in as', async () => {
        readQseowBrowserUser.mockResolvedValue({ userDirectory: 'CORP', userId: 'svc-bsi' });
        const options = {
            ...OPTIONS,
            skipLogin: true,
            logonuserdir: undefined,
            logonuserid: undefined,
        };

        await resolveQseowOwnerTarget(options, { dryRun: false });

        expect(readQseowBrowserUser).toHaveBeenCalledWith(options);
        expect(filterOf(requests[0].path)).toBe("userDirectory eq 'CORP' and userId eq 'svc-bsi'");
    });

    test('with --skip-login on a dry run, leaves it unknown rather than open a browser', async () => {
        await expect(
            resolveQseowOwnerTarget({ ...OPTIONS, skipLogin: true }, { dryRun: true })
        ).resolves.toBeNull();

        expect(readQseowBrowserUser).not.toHaveBeenCalled();
        expect(requests).toHaveLength(0);
    });
});
