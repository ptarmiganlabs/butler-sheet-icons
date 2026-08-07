import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import upath from 'upath';

const BSI_EXECUTABLE_PATH = '/opt/butler-sheet-icons';

const access = jest.fn();

jest.unstable_mockModule('fs', () => ({
    default: { promises: { access } },
    promises: { access },
}));

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
    },
    bsiExecutablePath: BSI_EXECUTABLE_PATH,
}));

const { logger } = await import('../../../globals.js');
const { qseowVerifyCertificatesExist } = await import('../qseow-certificates.js');

const RELATIVE_OPTIONS = {
    certfile: './cert/client.pem',
    certkeyfile: './cert/client_key.pem',
};

const EXPECTED_CERT = upath.join(BSI_EXECUTABLE_PATH, 'cert/client.pem');
const EXPECTED_KEY = upath.join(BSI_EXECUTABLE_PATH, 'cert/client_key.pem');

/**
 * Makes the mocked `fs.promises.access` succeed for the listed paths and fail for all others.
 *
 * @param {string[]} existingPaths - Paths that should be reported as accessible.
 *
 * @returns {void}
 */
const withExistingFiles = (existingPaths) => {
    access.mockImplementation(async (candidate) => {
        if (existingPaths.includes(candidate)) return undefined;
        throw new Error(`ENOENT: no such file or directory, access '${candidate}'`);
    });
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('qseowVerifyCertificatesExist', () => {
    test('returns true when both cert and key are present', async () => {
        withExistingFiles([EXPECTED_CERT, EXPECTED_KEY]);

        await expect(qseowVerifyCertificatesExist(RELATIVE_OPTIONS)).resolves.toBe(true);
    });

    test('returns false when the certificate is missing', async () => {
        withExistingFiles([EXPECTED_KEY]);

        await expect(qseowVerifyCertificatesExist(RELATIVE_OPTIONS)).resolves.toBe(false);
    });

    test('returns false when the key is missing', async () => {
        withExistingFiles([EXPECTED_CERT]);

        await expect(qseowVerifyCertificatesExist(RELATIVE_OPTIONS)).resolves.toBe(false);
    });

    test('returns false when neither file is present', async () => {
        withExistingFiles([]);

        await expect(qseowVerifyCertificatesExist(RELATIVE_OPTIONS)).resolves.toBe(false);
    });

    test('names the missing certificate file in the error log', async () => {
        withExistingFiles([EXPECTED_KEY]);

        await qseowVerifyCertificatesExist(RELATIVE_OPTIONS);

        const errors = logger.error.mock.calls.map((call) => String(call[0])).join('\n');

        expect(errors).toContain(EXPECTED_CERT);
        expect(errors).toContain('missing');
    });

    test('names the missing key file in the error log', async () => {
        withExistingFiles([EXPECTED_CERT]);

        await qseowVerifyCertificatesExist(RELATIVE_OPTIONS);

        const errors = logger.error.mock.calls.map((call) => String(call[0])).join('\n');

        expect(errors).toContain(EXPECTED_KEY);
        expect(errors).toContain('missing');
    });

    test('resolves relative paths against the BSI executable directory', async () => {
        withExistingFiles([EXPECTED_CERT, EXPECTED_KEY]);

        await qseowVerifyCertificatesExist(RELATIVE_OPTIONS);

        expect(access).toHaveBeenCalledWith(EXPECTED_CERT);
        expect(access).toHaveBeenCalledWith(EXPECTED_KEY);
    });

    test('leaves absolute paths untouched', async () => {
        withExistingFiles(['/etc/qlik/client.pem', '/etc/qlik/client_key.pem']);

        await expect(
            qseowVerifyCertificatesExist({
                certfile: '/etc/qlik/client.pem',
                certkeyfile: '/etc/qlik/client_key.pem',
            })
        ).resolves.toBe(true);

        expect(access).toHaveBeenCalledWith('/etc/qlik/client.pem');
    });

    test('decides absolute vs relative for cert and key independently', async () => {
        withExistingFiles(['/etc/qlik/client.pem', EXPECTED_KEY]);

        await expect(
            qseowVerifyCertificatesExist({
                certfile: '/etc/qlik/client.pem',
                certkeyfile: './cert/client_key.pem',
            })
        ).resolves.toBe(true);

        expect(access).toHaveBeenCalledWith('/etc/qlik/client.pem');
        expect(access).toHaveBeenCalledWith(EXPECTED_KEY);
    });

    test('returns false rather than throwing when path handling blows up', async () => {
        // A non-string cert path makes upath throw before any file is touched. The
        // command layer relies on a false return here, not on an exception.
        await expect(
            qseowVerifyCertificatesExist({ certfile: 42, certkeyfile: './cert/client_key.pem' })
        ).resolves.toBe(false);

        expect(logger.error).toHaveBeenCalled();
    });

    test('returns false when called with no options at all', async () => {
        await expect(qseowVerifyCertificatesExist(undefined)).resolves.toBe(false);
    });
});
