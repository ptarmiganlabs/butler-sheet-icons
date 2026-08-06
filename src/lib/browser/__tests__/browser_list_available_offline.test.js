import { jest, describe, test, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('axios', () => ({ default: jest.fn() }));
const axios = (await import('axios')).default;

jest.unstable_mockModule('@puppeteer/browsers', () => ({
    detectBrowserPlatform: jest.fn().mockResolvedValue('mac_arm'),
    canDownload: jest.fn().mockResolvedValue(true),
}));

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
const { logger } = await import('../../../globals.js');

const { browserListAvailable } = await import('../browser-list-available.js');

const OPTIONS = { browser: 'chrome', channel: 'stable', loglevel: 'info' };

/**
 * Runs the command with axios rejecting, and returns everything logged at error level.
 *
 * @param {unknown} rejection - Value axios should reject with.
 *
 * @returns {Promise<string>} Concatenated error-level log output.
 */
async function errorOutputWhenAxiosRejects(rejection) {
    axios.mockRejectedValue(rejection);
    await browserListAvailable({ ...OPTIONS }).catch(() => undefined);
    return logger.error.mock.calls.map((call) => String(call[0])).join('\n');
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('browserListAvailable — no internet connectivity (issue #785)', () => {
    test('explains a DNS failure instead of surfacing a raw error', async () => {
        const out = await errorOutputWhenAxiosRejects(
            Object.assign(new Error('getaddrinfo ENOTFOUND versionhistory.googleapis.com'), {
                code: 'ENOTFOUND',
            })
        );

        expect(out).toContain('Could not reach versionhistory.googleapis.com');
        expect(out).toContain('browser list-installed');
    });

    test('handles the exact TypeError reported from inside axios', async () => {
        // The reported symptom was `TypeError: Cannot read properties of undefined (reading
        // 'status')` thrown by axios itself, carrying no error code at all. Detection therefore
        // keys off the absent HTTP response rather than off `err.code`.
        const out = await errorOutputWhenAxiosRejects(
            new TypeError("Cannot read properties of undefined (reading 'status')")
        );

        expect(out).toContain('Could not reach versionhistory.googleapis.com');
        expect(out).not.toContain('TypeError');
    });

    test('reports the failure exactly twice, leaking none of the raw error text', async () => {
        // Asserting the precise set of lines, because an earlier version of this fix explained
        // the failure correctly and *then* let the rethrown error fall through to a generic
        // handler, which re-logged "Cannot read properties of undefined (reading 'status')" -
        // the exact string from the bug report. Checking only for the absence of the word
        // "TypeError" missed that, since the generic handler logs err.message.
        axios.mockRejectedValue(
            new TypeError("Cannot read properties of undefined (reading 'status')")
        );
        await browserListAvailable({ ...OPTIONS }).catch(() => undefined);

        const lines = logger.error.mock.calls.map((call) => String(call[0]));

        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain('Could not reach versionhistory.googleapis.com');
        expect(lines[1]).toContain('needs internet access');
        expect(lines.join('\n')).not.toContain('Cannot read properties');
        expect(lines.join('\n')).not.toContain('Error checking for available browsers');
    });

    test('explains an intercepted 200 response instead of throwing on a missing body', async () => {
        // A captive portal answering 200 with an HTML login page used to leave `versions`
        // undefined, then throw "Cannot read properties of undefined (reading 'length')".
        axios.mockResolvedValue({ data: '<html>Sign in to the network</html>' });
        await browserListAvailable({ ...OPTIONS }).catch(() => undefined);

        const out = logger.error.mock.calls.map((call) => String(call[0])).join('\n');

        expect(out).toContain('Unexpected response from versionhistory.googleapis.com');
        expect(out).toContain('captive portal');
        expect(out).not.toContain('Cannot read properties');
    });

    test.each([
        ['connection refused', 'ECONNREFUSED'],
        ['timeout', 'ETIMEDOUT'],
        ['connection reset', 'ECONNRESET'],
    ])('explains a %s failure', async (_label, code) => {
        const out = await errorOutputWhenAxiosRejects(Object.assign(new Error(code), { code }));

        expect(out).toContain('Could not reach versionhistory.googleapis.com');
    });

    test('never writes a stack trace at error level', async () => {
        const err = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
        const out = await errorOutputWhenAxiosRejects(err);

        // The original defect logged the message three times over plus a full stack trace.
        expect(out).not.toContain('at ');
        expect(logger.debug).toHaveBeenCalled();
    });

    test('reports an HTTP failure differently from an unreachable host', async () => {
        // The service answered, so the "you may be offline" advice would be actively misleading.
        const out = await errorOutputWhenAxiosRejects(
            Object.assign(new Error('Request failed with status code 503'), {
                response: { status: 503 },
            })
        );

        expect(out).toContain('returned HTTP 503');
        expect(out).not.toContain('Butler Sheet Icons needs internet access');
    });

    test('does not mislabel a local validation error as a connectivity problem', async () => {
        // Thrown before any request is made, so it must not attract network advice.
        await browserListAvailable({ ...OPTIONS, browser: 'not-a-browser' }).catch(() => undefined);

        const out = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
        expect(out).toContain('Invalid browser');
        expect(out).not.toContain('Could not reach');
        expect(axios).not.toHaveBeenCalled();
    });
});
