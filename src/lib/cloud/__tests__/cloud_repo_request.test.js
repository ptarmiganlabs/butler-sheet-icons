import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// The module registers a response interceptor on the shared axios instance at import time, so
// the mock has to expose that surface. The registered handlers are captured rather than
// discarded, because the error handler is itself under test.
const interceptors = { fulfilled: undefined, rejected: undefined };

jest.unstable_mockModule('axios', () => {
    const mockAxios = jest.fn();
    mockAxios.interceptors = {
        response: {
            use: jest.fn((onFulfilled, onRejected) => {
                interceptors.fulfilled = onFulfilled;
                interceptors.rejected = onRejected;
            }),
        },
    };
    return { default: mockAxios };
});
const axios = (await import('axios')).default;

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    },
}));

const request = (await import('../cloud-repo-request.js')).default;

const MAIN_CONFIG = { baseURL: 'https://tenant.eu.qlikcloud.com', version: '1', token: 'tkn' };

/**
 * Calls the module's default export with the fixed config used throughout these tests.
 *
 * @returns {Promise<object|Array>} Whatever the request resolves to.
 */
function get() {
    return request(MAIN_CONFIG, 'items', 'get');
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('cloud-repo-request pagination', () => {
    test('follows a lowercase links.next.href across pages', async () => {
        axios
            .mockResolvedValueOnce({
                status: 200,
                data: { data: [{ id: 1 }], links: { next: { href: '/page2' } } },
            })
            .mockResolvedValueOnce({ status: 200, data: { data: [{ id: 2 }] } });

        expect(await get()).toEqual([{ id: 1 }, { id: 2 }]);
        expect(axios).toHaveBeenCalledTimes(2);
        expect(axios.mock.calls[1][0].url).toBe('/page2');
    });

    test('follows a capitalised links.Next.Href', async () => {
        // The guard has always accepted `Next`, but the line after it read `next.href`
        // unconditionally, so a response using only the capitalised form threw
        // `TypeError: Cannot read properties of undefined (reading 'href')`.
        axios
            .mockResolvedValueOnce({
                status: 200,
                data: { data: [{ id: 1 }], links: { Next: { Href: '/page2' } } },
            })
            .mockResolvedValueOnce({ status: 200, data: { data: [{ id: 2 }] } });

        expect(await get()).toEqual([{ id: 1 }, { id: 2 }]);
        expect(axios.mock.calls[1][0].url).toBe('/page2');
    });

    test('stops when links is present but carries no next page', async () => {
        axios.mockResolvedValueOnce({ status: 200, data: { data: [{ id: 1 }], links: {} } });

        expect(await get()).toEqual([{ id: 1 }]);
        expect(axios).toHaveBeenCalledTimes(1);
    });

    test('does not throw on a response with no body', async () => {
        // `response.data` is optional - the module's own debug logging guards it - so reading
        // `.data` off it unguarded threw on an empty response.
        axios.mockResolvedValueOnce({ status: 204 });

        await expect(get()).resolves.toEqual({ data: undefined, status: 204 });
    });

    test('returns status and body when the payload is not a data array', async () => {
        axios.mockResolvedValueOnce({ status: 200, data: { id: 'single-object' } });

        expect(await get()).toEqual({ id: 'single-object' });
    });

    test('propagates a request failure to the caller', async () => {
        const boom = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
        axios.mockRejectedValueOnce(boom);

        await expect(get()).rejects.toBe(boom);
    });

    test('a truthy but non-iterable data field does not throw from the spread', async () => {
        // `{ data: <object> }` is how some gateways answer 200. The page accumulator used to
        // test `body.data` for truthiness and then spread it, so this threw
        // `TypeError: body.data is not iterable` from inside this module - before any caller
        // could say which endpoint or tenant produced it (issue #935). It is not a page of
        // results, so it now travels as an ordinary unrecognised body.
        axios.mockResolvedValueOnce({ status: 200, data: { data: { message: 'unavailable' } } });

        await expect(get()).resolves.toEqual({ data: { message: 'unavailable' } });
    });

    test('a data field that is a string is not spread into characters', async () => {
        // Strings are iterable, so a truthiness check would have spread `'oops'` into
        // ['o','o','p','s'] and returned it as four results.
        axios.mockResolvedValueOnce({ status: 200, data: { data: 'oops' } });

        await expect(get()).resolves.toEqual({ data: 'oops' });
    });
});

describe('axios error interceptor (root cause of issue #785)', () => {
    test('does not throw when the request never reached the server', async () => {
        // `e.response` is undefined offline. Reading `.status` off it raised
        // `TypeError: Cannot read properties of undefined (reading 'status')` from inside axios
        // - verbatim the error in the bug report. Because this interceptor is installed on the
        // shared axios instance, it affected every HTTP call in the process.
        const offline = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });

        const rejection = await interceptors.rejected(offline).catch((e) => e);

        expect(rejection.message).toBe('getaddrinfo ENOTFOUND');
        expect(rejection.status).toBeUndefined();
        expect(String(rejection.message)).not.toContain('Cannot read properties');
    });

    test('preserves code and response so the failure can still be classified', async () => {
        // getErrorCategory keys off `code` and `response.status`; dropping them left every
        // failure looking identical to callers.
        const offline = Object.assign(new Error('connect ECONNREFUSED'), {
            code: 'ECONNREFUSED',
        });

        const rejection = await interceptors.rejected(offline).catch((e) => e);

        expect(rejection.code).toBe('ECONNREFUSED');
    });

    test('still surfaces HTTP status and statusText when the server did answer', async () => {
        const httpError = Object.assign(new Error('Request failed with status code 403'), {
            response: { status: 403, statusText: 'Forbidden' },
        });

        const rejection = await interceptors.rejected(httpError).catch((e) => e);

        expect(rejection.status).toBe(403);
        expect(rejection.statusText).toBe('Forbidden');
        expect(rejection.message).toBe('Request failed with status code 403');
    });

    test('survives a non-Error rejection', async () => {
        const rejection = await interceptors.rejected('a bare string').catch((e) => e);

        expect(rejection.message).toBe('a bare string');
    });
});

describe('interceptor rejection shape is what downstream classification expects', () => {
    // The interceptor is installed on the *shared* axios instance, so every HTTP request in the
    // process - including the Chrome version lookup in browser-list-available.js - receives its
    // rejections in this shape rather than as raw axios errors.
    //
    // Those consumers mock axios wholesale in their own tests, which means the interceptor never
    // runs there and the coupling goes unchecked. That gap already hid a real defect: before the
    // interceptor passed `response` through, an HTTP 503 arrived with no `response` field and
    // browser-list-available reported it as "could not reach the host", while its own test
    // asserted the opposite and passed. These tests pin the contract from this side.

    /**
     * Runs an error through the real interceptor and returns the rejected value.
     *
     * @param {unknown} err - Error to feed the interceptor.
     *
     * @returns {Promise<object>} The transformed rejection.
     */
    const throughInterceptor = (err) => interceptors.rejected(err).catch((e) => e);

    test('an offline failure stays classifiable and reads as "no response"', async () => {
        const { getErrorCategory } = await import('../../util/error-categorizer.js');

        const rejection = await throughInterceptor(
            Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
        );

        // browser-list-available treats an absent `response` as "never reached the server".
        expect(Boolean(rejection.response)).toBe(false);
        expect(getErrorCategory(rejection)).toBe('host_not_found');
    });

    test('an HTTP failure keeps its status so it is not misreported as offline', async () => {
        const { getErrorCategory } = await import('../../util/error-categorizer.js');

        const rejection = await throughInterceptor(
            Object.assign(new Error('Request failed with status code 503'), {
                response: { status: 503, statusText: 'Service Unavailable' },
            })
        );

        expect(Boolean(rejection.response)).toBe(true);
        expect(rejection.response.status).toBe(503);
        expect(getErrorCategory(rejection)).toBe('http_5xx');
    });

    test('does not carry the API token into the rejected value', async () => {
        // config.headers.Authorization holds the bearer token, and several callers log errors
        // with JSON.stringify(err). Only the status is passed through, never the response object.
        const rejection = await throughInterceptor(
            Object.assign(new Error('Request failed with status code 403'), {
                response: {
                    status: 403,
                    config: { headers: { Authorization: 'Bearer SUPER-SECRET-TOKEN' } },
                    data: { detail: 'nope' },
                },
            })
        );

        expect(JSON.stringify(rejection)).not.toContain('SUPER-SECRET-TOKEN');
        expect(rejection.response).toEqual({ status: 403 });
    });
});

describe('multipart form-data path matching', () => {
    /**
     * Issues a multipart request and returns the axios config it produced.
     *
     * @param {string} path - Repository API path.
     *
     * @returns {Promise<object>} The config axios was called with.
     */
    async function multipartConfigFor(path) {
        axios.mockResolvedValueOnce({ status: 200, data: { data: [] } });
        await request(
            MAIN_CONFIG,
            path,
            'post',
            undefined,
            'multipart/form-data',
            Buffer.from('zip-bytes'),
            'ext.zip'
        );
        return axios.mock.calls[0][0];
    }

    test('builds form-data for a path containing "extensions"', async () => {
        const config = await multipartConfigFor('apps/123/media/extensions');

        // FormData sets its own multipart boundary header.
        expect(String(config.headers['content-type'] ?? '')).toContain('multipart/form-data');
    });

    test('builds form-data when "extensions" is at the start of the path', async () => {
        // indexOf returns 0 here, which is falsy, so the old check skipped the one case it was
        // written for and sent the raw buffer with a multipart content type.
        const config = await multipartConfigFor('extensions/upload');

        expect(String(config.headers['content-type'] ?? '')).toContain('multipart/form-data');
    });

    test('leaves a path without "extensions" alone', async () => {
        // indexOf returns -1 here, which is truthy, so the old check wrapped unrelated paths in
        // a FormData body labelled extension.zip.
        const config = await multipartConfigFor('apps/123/media/list');

        expect(String(config.headers['content-type'] ?? '')).not.toContain('boundary');
        expect(Buffer.isBuffer(config.data) || config.data === undefined).toBe(true);
    });
});
