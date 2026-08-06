import { jest, describe, test, expect } from '@jest/globals';
import path from 'path';

const BSI_EXECUTABLE_PATH = path.resolve('/opt/butler-sheet-icons');

jest.unstable_mockModule('../../../globals.js', () => ({
    bsiExecutablePath: BSI_EXECUTABLE_PATH,
}));

const { getCertFilePaths } = await import('../cert.js');
const { CertError } = await import('../errors.js');

describe('getCertFilePaths', () => {
    test('resolves relative paths against the BSI executable directory', () => {
        const { fileCert, fileCertKey } = getCertFilePaths({
            certfile: './cert/client.pem',
            certkeyfile: './cert/client_key.pem',
        });

        expect(fileCert).toBe(path.join(BSI_EXECUTABLE_PATH, 'cert', 'client.pem'));
        expect(fileCertKey).toBe(path.join(BSI_EXECUTABLE_PATH, 'cert', 'client_key.pem'));
    });

    test('resolves a bare relative path with no leading "./"', () => {
        const { fileCert } = getCertFilePaths({
            certfile: 'cert/client.pem',
            certkeyfile: 'cert/client_key.pem',
        });

        expect(fileCert).toBe(path.join(BSI_EXECUTABLE_PATH, 'cert', 'client.pem'));
    });

    test('leaves absolute paths untouched', () => {
        const absoluteCert = path.resolve('/etc/qlik/client.pem');
        const absoluteKey = path.resolve('/etc/qlik/client_key.pem');

        const { fileCert, fileCertKey } = getCertFilePaths({
            certfile: absoluteCert,
            certkeyfile: absoluteKey,
        });

        expect(fileCert).toBe(absoluteCert);
        expect(fileCertKey).toBe(absoluteKey);
    });

    test('normalises paths that walk back up the tree', () => {
        const { fileCert } = getCertFilePaths({
            certfile: 'config/../cert/client.pem',
            certkeyfile: 'cert/client_key.pem',
        });

        expect(fileCert).toBe(path.join(BSI_EXECUTABLE_PATH, 'cert', 'client.pem'));
    });

    test('resolves the cert and the key independently of each other', () => {
        const absoluteKey = path.resolve('/etc/qlik/client_key.pem');

        const { fileCert, fileCertKey } = getCertFilePaths({
            certfile: 'cert/client.pem',
            certkeyfile: absoluteKey,
        });

        expect(fileCert).toBe(path.join(BSI_EXECUTABLE_PATH, 'cert', 'client.pem'));
        expect(fileCertKey).toBe(absoluteKey);
    });

    test('throws CertError when a path is not a string', () => {
        // The top-level safety net in butler-sheet-icons.js turns this into a crash
        // dump, so the typed error matters more than the message.
        expect(() =>
            getCertFilePaths({ certfile: 42, certkeyfile: 'cert/client_key.pem' })
        ).toThrow(CertError);
    });

    test('throws CertError when the cert path is missing entirely', () => {
        expect(() => getCertFilePaths({ certkeyfile: 'cert/client_key.pem' })).toThrow(CertError);
    });

    test('throws CertError when the key path is missing entirely', () => {
        expect(() => getCertFilePaths({ certfile: 'cert/client.pem' })).toThrow(CertError);
    });

    test('keeps the underlying failure as the error cause', () => {
        let thrown;
        try {
            getCertFilePaths({ certfile: 42, certkeyfile: 'cert/client_key.pem' });
        } catch (err) {
            thrown = err;
        }

        expect(thrown).toBeInstanceOf(CertError);
        // `instanceof TypeError` is unreliable here: under --experimental-vm-modules the
        // module under test runs in its own realm, so its TypeError is a different
        // constructor than the test file's. Match on the shape instead.
        expect(thrown.cause.name).toBe('TypeError');
        expect(thrown.cause.code).toBe('ERR_INVALID_ARG_TYPE');
    });
});
