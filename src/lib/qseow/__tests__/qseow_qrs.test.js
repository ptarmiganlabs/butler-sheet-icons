import { jest, describe, test, expect } from '@jest/globals';
import upath from 'upath';

const BSI_EXECUTABLE_PATH = '/opt/butler-sheet-icons';

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

const { setupQseowQrsConnection } = await import('../qseow-qrs.js');

const BASE_OPTIONS = {
    host: 'sense.example.com',
    qrsport: 4242,
    certfile: './cert/client.pem',
    certkeyfile: './cert/client_key.pem',
    apiuserdir: 'INTERNAL',
    apiuserid: 'sa_api',
};

describe('setupQseowQrsConnection', () => {
    test('passes host and QRS port straight through', () => {
        const config = setupQseowQrsConnection(BASE_OPTIONS);

        expect(config.hostname).toBe('sense.example.com');
        expect(config.portnumber).toBe(4242);
    });

    test('always connects directly to QRS, with no virtual proxy', () => {
        // BSI deliberately bypasses virtual proxies when talking to QRS.
        const config = setupQseowQrsConnection({ ...BASE_OPTIONS, prefix: 'some-proxy' });

        expect(config.virtualProxyPrefix).toBe('');
    });

    test('resolves relative cert paths against the BSI executable directory', () => {
        const config = setupQseowQrsConnection(BASE_OPTIONS);

        expect(config.certificates.certFile).toBe(
            upath.join(BSI_EXECUTABLE_PATH, 'cert/client.pem')
        );
        expect(config.certificates.keyFile).toBe(
            upath.join(BSI_EXECUTABLE_PATH, 'cert/client_key.pem')
        );
    });

    test('leaves absolute cert paths untouched', () => {
        const config = setupQseowQrsConnection({
            ...BASE_OPTIONS,
            certfile: '/etc/qlik/client.pem',
            certkeyfile: '/etc/qlik/client_key.pem',
        });

        expect(config.certificates.certFile).toBe('/etc/qlik/client.pem');
        expect(config.certificates.keyFile).toBe('/etc/qlik/client_key.pem');
    });

    test('decides absolute vs relative for cert and key independently', () => {
        const config = setupQseowQrsConnection({
            ...BASE_OPTIONS,
            certfile: '/etc/qlik/client.pem',
            certkeyfile: './cert/client_key.pem',
        });

        expect(config.certificates.certFile).toBe('/etc/qlik/client.pem');
        expect(config.certificates.keyFile).toBe(
            upath.join(BSI_EXECUTABLE_PATH, 'cert/client_key.pem')
        );
    });

    test('builds the X-Qlik-User header from the API user directory and id', () => {
        const config = setupQseowQrsConnection(BASE_OPTIONS);

        expect(config.headers['X-Qlik-User']).toBe('UserDirectory=INTERNAL;UserId=sa_api');
    });

    test('reflects a non-default API user in the header', () => {
        const config = setupQseowQrsConnection({
            ...BASE_OPTIONS,
            apiuserdir: 'COMPANY',
            apiuserid: 'svc_bsi',
        });

        expect(config.headers['X-Qlik-User']).toBe('UserDirectory=COMPANY;UserId=svc_bsi');
    });

    test('sets the png content type QRS expects for image uploads', () => {
        const config = setupQseowQrsConnection(BASE_OPTIONS);

        expect(config.headers['Content-Type']).toBe('png');
    });

    test('returns only the keys qrs-interact consumes', () => {
        const config = setupQseowQrsConnection(BASE_OPTIONS);

        expect(Object.keys(config).sort()).toEqual([
            'certificates',
            'headers',
            'hostname',
            'portnumber',
            'virtualProxyPrefix',
        ]);
    });
});
