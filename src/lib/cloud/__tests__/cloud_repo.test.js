import { jest, describe, test, expect, beforeEach } from '@jest/globals';

const request = jest.fn().mockResolvedValue({ ok: true });

jest.unstable_mockModule('../cloud-repo-request.js', () => ({ default: request }));

const QlikSaas = (await import('../cloud-repo.js')).default;

const BASE_CONFIG = { url: 'https://tenant.eu.qlikcloud.com', token: 'api-key' };

// The full config the request layer must receive. Asserting this rather than
// `expect.any(Object)` is what pins the API token and tenant URL to every outgoing
// request — `expect.any(Object)` also matches `{}`, i.e. no credentials at all.
// The constructor mutates the object it is handed, so this is its post-construction shape.
const EXPECTED_CONFIG = {
    url: 'https://tenant.eu.qlikcloud.com',
    token: 'api-key',
    version: 1,
    baseURL: 'https://tenant.eu.qlikcloud.com',
};

beforeEach(() => {
    jest.clearAllMocks();
    request.mockResolvedValue({ ok: true });
});

describe('QlikSaas', () => {
    describe('construction', () => {
        test('throws when no URL is supplied', () => {
            // Asserting the message, not just that it throws: the guard used to be
            // `throw Error({ message: ... })`, which produces the useless text
            // "[object Object]" — the operator never learned which parameter was missing.
            expect(() => new QlikSaas({ token: 'api-key' })).toThrow('URL parameter is required');
        });

        test('throws when no API token is supplied', () => {
            expect(() => new QlikSaas({ url: 'https://tenant.eu.qlikcloud.com' })).toThrow(
                'API token parameter is required'
            );
        });

        test('names the missing parameter for each verb guard', () => {
            const saas = new QlikSaas({ ...BASE_CONFIG });

            return Promise.all([
                expect(saas.Get()).rejects.toThrow('"path" parameter is missing'),
                expect(saas.Delete()).rejects.toThrow('"path" parameter is missing'),
                expect(saas.Post({})).rejects.toThrow('"path" parameter is missing'),
                expect(saas.Put({})).rejects.toThrow('"path" parameter is missing'),
                expect(saas.Patch({})).rejects.toThrow('"path" parameter is missing'),
            ]);
        });

        test('accepts a complete config', () => {
            expect(() => new QlikSaas({ ...BASE_CONFIG })).not.toThrow();
        });

        test('defaults the API version to 1', async () => {
            const config = { ...BASE_CONFIG };
            const saas = new QlikSaas(config);
            await saas.Get('users/me');

            expect(request.mock.calls[0][0].version).toBe(1);
        });

        test('keeps an explicitly supplied API version', async () => {
            const config = { ...BASE_CONFIG, version: 2 };
            const saas = new QlikSaas(config);
            await saas.Get('users/me');

            expect(request.mock.calls[0][0].version).toBe(2);
        });

        test('the config is already complete when the request is dispatched', async () => {
            // Jest stores the config by reference and the constructor mutates it, so
            // reading request.mock.calls after the fact cannot tell whether a field was
            // set before or after dispatch. Snapshot it inside the call instead.
            let atDispatch;
            request.mockImplementation(async (config) => {
                atDispatch = { ...config };
                return { ok: true };
            });

            const saas = new QlikSaas({ url: 'tenant.eu.qlikcloud.com', token: 'api-key' });
            await saas.Get('users/me');

            expect(atDispatch).toEqual(EXPECTED_CONFIG);
        });
    });

    describe('tenant URL handling', () => {
        test('prepends https:// to a bare hostname', async () => {
            const config = { url: 'tenant.eu.qlikcloud.com', token: 'api-key' };
            const saas = new QlikSaas(config);
            await saas.Get('users/me');

            expect(request.mock.calls[0][0].baseURL).toBe('https://tenant.eu.qlikcloud.com');
        });

        test('leaves an https:// URL alone', async () => {
            const config = { ...BASE_CONFIG };
            const saas = new QlikSaas(config);
            await saas.Get('users/me');

            expect(request.mock.calls[0][0].baseURL).toBe('https://tenant.eu.qlikcloud.com');
        });

        test('leaves an http:// URL alone rather than forcing TLS', async () => {
            const config = { url: 'http://tenant.internal', token: 'api-key' };
            const saas = new QlikSaas(config);
            await saas.Get('users/me');

            expect(request.mock.calls[0][0].baseURL).toBe('http://tenant.internal');
        });
    });

    describe('Get', () => {
        test('issues a get request for the given path', async () => {
            const saas = new QlikSaas({ ...BASE_CONFIG });
            await saas.Get('collections');

            expect(request).toHaveBeenCalledWith(EXPECTED_CONFIG, 'collections', 'get');
        });

        test('returns whatever the request layer resolves to', async () => {
            request.mockResolvedValue([{ id: 'collection-1' }]);
            const saas = new QlikSaas({ ...BASE_CONFIG });

            await expect(saas.Get('collections')).resolves.toEqual([{ id: 'collection-1' }]);
        });

        test('rejects when no path is given', async () => {
            const saas = new QlikSaas({ ...BASE_CONFIG });

            await expect(saas.Get()).rejects.toThrow();
            expect(request).not.toHaveBeenCalled();
        });

        test('propagates a request failure', async () => {
            request.mockRejectedValue(new Error('401 Unauthorized'));
            const saas = new QlikSaas({ ...BASE_CONFIG });

            await expect(saas.Get('collections')).rejects.toThrow('401 Unauthorized');
        });
    });

    describe('Delete', () => {
        test('issues a delete request for the given path', async () => {
            const saas = new QlikSaas({ ...BASE_CONFIG });
            await saas.Delete('apps/app-1/media/files/thumbnails/thumbnail-1.png');

            expect(request).toHaveBeenCalledWith(
                EXPECTED_CONFIG,
                'apps/app-1/media/files/thumbnails/thumbnail-1.png',
                'delete'
            );
        });

        test('rejects when no path is given', async () => {
            const saas = new QlikSaas({ ...BASE_CONFIG });

            await expect(saas.Delete()).rejects.toThrow();
        });
    });

    describe('Post', () => {
        test('defaults to an empty JSON body', async () => {
            const saas = new QlikSaas({ ...BASE_CONFIG });
            await saas.Post({ path: 'collections' });

            expect(request).toHaveBeenCalledWith(
                EXPECTED_CONFIG,
                'collections',
                'post',
                {},
                'application/json',
                '',
                ''
            );
        });

        test('passes data, content type and file through', async () => {
            const saas = new QlikSaas({ ...BASE_CONFIG });
            const file = Buffer.from('png-bytes');

            await saas.Post({
                path: 'apps/app-1/media/files/thumbnails/thumbnail-1.png',
                data: { a: 1 },
                contentType: 'application/octet-stream',
                file,
                fileName: 'thumbnail-1.png',
            });

            expect(request).toHaveBeenCalledWith(
                EXPECTED_CONFIG,
                'apps/app-1/media/files/thumbnails/thumbnail-1.png',
                'post',
                { a: 1 },
                'application/octet-stream',
                file,
                'thumbnail-1.png'
            );
        });

        test('rejects when no path is given', async () => {
            const saas = new QlikSaas({ ...BASE_CONFIG });

            await expect(saas.Post({})).rejects.toThrow();
        });
    });

    describe('Put', () => {
        test('issues a put request with the supplied payload', async () => {
            const saas = new QlikSaas({ ...BASE_CONFIG });
            const file = Buffer.from('png-bytes');

            await saas.Put({
                path: 'apps/app-1/media/files/thumbnails/thumbnail-1.png',
                data: file,
                contentType: 'application/octet-stream',
            });

            expect(request).toHaveBeenCalledWith(
                EXPECTED_CONFIG,
                'apps/app-1/media/files/thumbnails/thumbnail-1.png',
                'put',
                file,
                'application/octet-stream',
                ''
            );
        });

        test('rejects when no path is given', async () => {
            const saas = new QlikSaas({ ...BASE_CONFIG });

            await expect(saas.Put({})).rejects.toThrow();
        });
    });

    describe('Patch', () => {
        test('issues a patch request with the supplied payload', async () => {
            const saas = new QlikSaas({ ...BASE_CONFIG });

            await saas.Patch({ path: 'apps/app-1', data: { name: 'renamed' } });

            expect(request).toHaveBeenCalledWith(
                EXPECTED_CONFIG,
                'apps/app-1',
                'patch',
                { name: 'renamed' },
                'application/json',
                '',
                ''
            );
        });

        test('rejects when no path is given', async () => {
            const saas = new QlikSaas({ ...BASE_CONFIG });

            await expect(saas.Patch({})).rejects.toThrow();
        });
    });

    test('shares one config object across every verb', async () => {
        const saas = new QlikSaas({ url: 'tenant.eu.qlikcloud.com', token: 'api-key' });

        await saas.Get('users/me');
        await saas.Delete('apps/app-1');

        expect(request.mock.calls[0][0]).toBe(request.mock.calls[1][0]);
    });
});
