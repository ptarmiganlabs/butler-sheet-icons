import { jest, describe, test, expect, beforeEach } from '@jest/globals';

/**
 * Tests for the Qlik Cloud half of `--change-app-owner` (issue #1209): reading and changing an
 * app's owner over the REST API, which apps keep their owner, and finding the user who is to own
 * the apps.
 */

const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
};
jest.unstable_mockModule('../../../globals.js', () => ({ logger }));

const readCloudBrowserUser = jest.fn();
jest.unstable_mockModule('../cloud-app-session.js', () => ({ readCloudBrowserUser }));

const { cloudAppOwners, cloudUserLabel, resolveCloudOwnerTarget } =
    await import('../cloud-app-owner.js');
const { CloudError } = await import('../../util/errors.js');

const APP = 'app-1';
const ANNA = { id: 'u-anna', name: 'Anna', email: 'anna@example.com' };

/**
 * A QlikSaas stand-in answering GETs from a map of paths.
 *
 * @param {object} answers - Path to response; a function is called, an Error is thrown.
 *
 * @returns {object} The client.
 */
const saasAnswering = (answers) => ({
    Get: jest.fn(async (path) => {
        const answer = answers[path];

        if (answer instanceof Error || (answer && answer.status >= 400)) {
            throw answer;
        }
        if (answer === undefined) {
            throw { status: 404, statusText: 'Not Found', message: `no answer for ${path}` };
        }

        return answer;
    }),
    Put: jest.fn().mockResolvedValue({ attributes: {} }),
});

/**
 * The app read, with the given attributes over a shared-space default.
 *
 * @param {object} [attributes] - Attributes to set.
 *
 * @returns {object} The `GET apps/{id}` answer.
 */
const appRead = (attributes = {}) => ({
    attributes: { id: APP, name: 'Sales', ownerId: 'u-anna', spaceId: 'space-1', ...attributes },
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe('cloudUserLabel', () => {
    test.each([
        [{ name: 'Anna', email: 'anna@example.com' }, 'Anna <anna@example.com>'],
        [{ name: 'anna@example.com', email: 'anna@example.com' }, 'anna@example.com'],
        [{ email: 'anna@example.com' }, 'anna@example.com'],
        [{}, 'u-anna'],
    ])('names %o as %s', (user, label) => {
        expect(cloudUserLabel(user, 'u-anna')).toBe(label);
    });
});

describe('cloudAppOwners', () => {
    test('reads the app name and owner, naming the owner from the users API', async () => {
        const saas = saasAnswering({ [`apps/${APP}`]: appRead(), 'users/u-anna': ANNA });

        await expect(cloudAppOwners(saas).inspect(APP)).resolves.toEqual({
            appName: 'Sales',
            owner: { id: 'u-anna', label: 'Anna <anna@example.com>' },
            keepReason: null,
        });
    });

    test('names the owner by id when the users API will not say who it is', async () => {
        const saas = saasAnswering({ [`apps/${APP}`]: appRead() });

        expect((await cloudAppOwners(saas).inspect(APP)).owner).toEqual({
            id: 'u-anna',
            label: 'u-anna',
        });
    });

    test('keeps the owner of a published app', async () => {
        const saas = saasAnswering({
            [`apps/${APP}`]: appRead({ publishTime: '2026-10-01T08:00:00Z' }),
            'users/u-anna': ANNA,
        });

        expect((await cloudAppOwners(saas).inspect(APP)).keepReason).toContain('published');
    });

    test('keeps the owner of an app in a personal space', async () => {
        const saas = saasAnswering({
            [`apps/${APP}`]: appRead({ spaceId: '' }),
            'users/u-anna': ANNA,
        });

        expect((await cloudAppOwners(saas).inspect(APP)).keepReason).toContain('personal space');
    });

    test.each([
        ['', 'personal space'],
        ['space-1', null],
    ])(
        'asks the catalogue which space the app is in when the app read does not say (%p)',
        async (spaceId, reason) => {
            const read = appRead();
            delete read.attributes.spaceId;
            const saas = saasAnswering({
                [`apps/${APP}`]: read,
                'users/u-anna': ANNA,
                [`items?resourceType=app&resourceId=${APP}`]: [{ resourceId: APP, spaceId }],
            });

            const { keepReason } = await cloudAppOwners(saas).inspect(APP);

            if (reason === null) {
                expect(keepReason).toBeNull();
            } else {
                expect(keepReason).toContain(reason);
            }
        }
    );

    test('refuses when the catalogue has no item for the app', async () => {
        const read = appRead();
        delete read.attributes.spaceId;
        const saas = saasAnswering({
            [`apps/${APP}`]: read,
            'users/u-anna': ANNA,
            [`items?resourceType=app&resourceId=${APP}`]: [],
        });

        await expect(cloudAppOwners(saas).inspect(APP)).rejects.toThrow('no catalogue item');
    });

    test('refuses an app it cannot read, keeping the reason', async () => {
        const forbidden = {
            status: 403,
            statusText: 'Forbidden',
            message: 'Request failed with status code 403',
        };
        const saas = saasAnswering({ [`apps/${APP}`]: forbidden });

        const err = await cloudAppOwners(saas)
            .inspect(APP)
            .catch((e) => e);

        expect(err).toBeInstanceOf(CloudError);
        expect(err.message).toContain(`Could not read app ${APP}`);
        expect(err.cause).toBe(forbidden);
    });

    test('changes the owner with PUT apps/{id}/owner', async () => {
        const saas = saasAnswering({});

        await cloudAppOwners(saas).change(APP, { id: 'u-joe', label: 'Joe' });

        expect(saas.Put).toHaveBeenCalledWith({
            path: `apps/${APP}/owner`,
            data: { ownerId: 'u-joe' },
        });
    });

    test('says who it could not make the owner when Qlik Cloud refuses', async () => {
        const saas = saasAnswering({});
        const forbidden = { status: 403, message: 'Request failed with status code 403' };
        saas.Put.mockRejectedValueOnce(forbidden);

        const err = await cloudAppOwners(saas)
            .change(APP, { id: 'u-joe', label: 'Joe' })
            .catch((e) => e);

        expect(err).toBeInstanceOf(CloudError);
        expect(err.message).toBe(`Qlik Cloud did not make Joe the owner of app ${APP}`);
        expect(err.cause).toBe(forbidden);
    });

    test('reads only the owner id before a restore', async () => {
        const saas = saasAnswering({ [`apps/${APP}`]: appRead() });

        await expect(cloudAppOwners(saas).currentOwnerId(APP)).resolves.toBe('u-anna');
        expect(saas.Get).toHaveBeenCalledTimes(1);
    });
});

describe('resolveCloudOwnerTarget', () => {
    const JOE = { id: 'u-joe', name: 'Joe', email: 'joe@example.com' };

    test('is the user the browser signs in as', async () => {
        readCloudBrowserUser.mockResolvedValue(JOE);
        const saas = saasAnswering({ 'users/me': JOE });

        await expect(resolveCloudOwnerTarget({}, saas, { dryRun: false })).resolves.toEqual({
            id: 'u-joe',
            label: 'Joe <joe@example.com>',
        });
        expect(logger.warn).not.toHaveBeenCalled();
    });

    test('warns when the API key belongs to someone else, who still makes the writes', async () => {
        readCloudBrowserUser.mockResolvedValue(JOE);
        const saas = saasAnswering({ 'users/me': ANNA });

        await resolveCloudOwnerTarget({}, saas, { dryRun: false });

        const warning = logger.warn.mock.calls.map(([line]) => line).join('\n');
        expect(warning).toContain('the browser signs in as Joe <joe@example.com>');
        expect(warning).toContain('The API key belongs to Anna <anna@example.com>');
    });

    test('a dry run leaves it unknown rather than open a browser', async () => {
        await expect(
            resolveCloudOwnerTarget({}, saasAnswering({}), { dryRun: true })
        ).resolves.toBeNull();
        expect(readCloudBrowserUser).not.toHaveBeenCalled();
    });
});
