import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import upath from 'upath';

const BSI_EXECUTABLE_PATH = '/opt/butler-sheet-icons';

const access = jest.fn();

// `constants` is part of the mock because the module now asks for R_OK rather than relying on
// access()'s default F_OK - an existing certificate that cannot be read is no use to a run that
// is about to read it.
const constants = { F_OK: 0, R_OK: 4 };

jest.unstable_mockModule('fs', () => ({
    default: { promises: { access }, constants },
    promises: { access },
    constants,
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
const { CertError } = await import('../../util/errors.js');

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
        // `code`, not just the message: real fs errors carry it, and the module distinguishes
        // "absent" (ENOENT) from "present but unreadable" on exactly that field.
        const err = new Error(`ENOENT: no such file or directory, access '${candidate}'`);
        err.code = 'ENOENT';
        throw err;
    });
};

/**
 * Makes every path report as present but unreadable, the way a permission problem looks.
 *
 * @returns {void}
 */
const withUnreadableFiles = () => {
    access.mockImplementation(async (candidate) => {
        const err = new Error(`EACCES: permission denied, access '${candidate}'`);
        err.code = 'EACCES';
        throw err;
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

        expect(access).toHaveBeenCalledWith(EXPECTED_CERT, constants.R_OK);
        expect(access).toHaveBeenCalledWith(EXPECTED_KEY, constants.R_OK);
    });

    test('leaves absolute paths untouched', async () => {
        withExistingFiles(['/etc/qlik/client.pem', '/etc/qlik/client_key.pem']);

        await expect(
            qseowVerifyCertificatesExist({
                certfile: '/etc/qlik/client.pem',
                certkeyfile: '/etc/qlik/client_key.pem',
            })
        ).resolves.toBe(true);

        expect(access).toHaveBeenCalledWith('/etc/qlik/client.pem', constants.R_OK);
    });

    test('decides absolute vs relative for cert and key independently', async () => {
        withExistingFiles(['/etc/qlik/client.pem', EXPECTED_KEY]);

        await expect(
            qseowVerifyCertificatesExist({
                certfile: '/etc/qlik/client.pem',
                certkeyfile: './cert/client_key.pem',
            })
        ).resolves.toBe(true);

        expect(access).toHaveBeenCalledWith('/etc/qlik/client.pem', constants.R_OK);
        expect(access).toHaveBeenCalledWith(EXPECTED_KEY, constants.R_OK);
    });

    test('throws rather than reporting a malformed path as a missing file', async () => {
        // A non-string cert path makes upath throw before any file is touched. Returning false
        // sent that through the caller's "Missing certificate file(s)" message, so the operator
        // went looking for a file when the real problem was the value they supplied. The command
        // layer still ends up returning false either way - verified against the real command -
        // but the logged reason now names the actual fault.
        await expect(
            qseowVerifyCertificatesExist({ certfile: 42, certkeyfile: './cert/client_key.pem' })
        ).rejects.toThrow(CertError);

        expect(logger.error).toHaveBeenCalled();
    });

    test('throws when called with no options at all', async () => {
        await expect(qseowVerifyCertificatesExist(undefined)).rejects.toThrow(CertError);
    });

    describe('a file that exists but cannot be read', () => {
        test('is not reported as missing', async () => {
            // The whole point of R_OK. With the default F_OK an unreadable certificate passed
            // this check and the run failed much later inside enigma, with a TLS error naming
            // neither the file nor the permission problem.
            withUnreadableFiles();

            await expect(qseowVerifyCertificatesExist(RELATIVE_OPTIONS)).rejects.toThrow(CertError);
        });

        test('says so in the log, rather than saying the file is missing', async () => {
            withUnreadableFiles();

            await expect(qseowVerifyCertificatesExist(RELATIVE_OPTIONS)).rejects.toThrow();

            const logged = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
            expect(logged).toContain('EACCES');
            expect(logged).not.toContain('missing');
        });

        test('asks for read access, not merely existence', async () => {
            withExistingFiles([EXPECTED_CERT, EXPECTED_KEY]);

            await qseowVerifyCertificatesExist(RELATIVE_OPTIONS);

            expect(access).toHaveBeenCalledWith(EXPECTED_CERT, constants.R_OK);
            expect(access.mock.calls.every((call) => call[1] === constants.R_OK)).toBe(true);
        });
    });
});
