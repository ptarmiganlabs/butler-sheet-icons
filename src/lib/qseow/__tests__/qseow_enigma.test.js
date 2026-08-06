import { jest, describe, test, expect, beforeEach } from '@jest/globals';

const buildUrl = jest.fn().mockReturnValue('wss://sense.example.com:4747/app/test-app-id');

jest.unstable_mockModule('enigma.js/sense-utilities.js', () => ({
    default: { buildUrl },
}));

const WebSocket = jest.fn();

jest.unstable_mockModule('ws', () => ({
    default: WebSocket,
}));

const readFileSync = jest.fn((filename) => Buffer.from(`bytes-of:${filename}`));

jest.unstable_mockModule('fs-extra', () => ({
    default: { readFileSync },
}));

const SCHEMA = { structs: { Global: {} } };
const getEnigmaSchema = jest.fn().mockReturnValue(SCHEMA);

jest.unstable_mockModule('../../util/enigma-util.js', () => ({ getEnigmaSchema }));

const getCertFilePaths = jest.fn().mockReturnValue({
    fileCert: '/opt/bsi/cert/client.pem',
    fileCertKey: '/opt/bsi/cert/client_key.pem',
});

jest.unstable_mockModule('../../util/cert.js', () => ({ getCertFilePaths }));

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
    },
    bsiExecutablePath: '/opt/bsi',
}));

const { setupEnigmaConnection } = await import('../qseow-enigma.js');

const BASE_OPTIONS = {
    host: 'sense.example.com',
    engineport: '4747',
    prefix: '',
    secure: true,
    apiuserdir: 'INTERNAL',
    apiuserid: 'sa_api',
    certfile: './cert/client.pem',
    certkeyfile: './cert/client_key.pem',
    rejectUnauthorized: false,
    schemaversion: '12.2015.0',
};

/**
 * Runs `createSocket` and returns the options object handed to the `ws` constructor.
 *
 * @param {object} [optionOverrides] - Fields to merge over the base QSEoW options.
 *
 * @returns {object} The second argument passed to `new WebSocket(...)`.
 */
const socketOptionsFor = (optionOverrides = {}) => {
    const config = setupEnigmaConnection('test-app-id', { ...BASE_OPTIONS, ...optionOverrides });
    config.createSocket('wss://sense.example.com:4747/app/test-app-id');

    // The LAST call, not the first: a test that calls this helper twice must inspect the
    // socket it just built, otherwise the second case silently re-asserts the first.
    return WebSocket.mock.calls.at(-1)[1];
};

beforeEach(() => {
    jest.clearAllMocks();
    buildUrl.mockReturnValue('wss://sense.example.com:4747/app/test-app-id');
    getEnigmaSchema.mockReturnValue(SCHEMA);
    getCertFilePaths.mockReturnValue({
        fileCert: '/opt/bsi/cert/client.pem',
        fileCertKey: '/opt/bsi/cert/client_key.pem',
    });
    readFileSync.mockImplementation((filename) => Buffer.from(`bytes-of:${filename}`));
});

describe('setupEnigmaConnection (QSEoW)', () => {
    test('returns the schema loaded for the requested version', () => {
        const config = setupEnigmaConnection('test-app-id', BASE_OPTIONS);

        expect(getEnigmaSchema).toHaveBeenCalledWith(BASE_OPTIONS);
        expect(config.schema).toBe(SCHEMA);
    });

    test('builds the engine URL from host, port, prefix and app id', () => {
        setupEnigmaConnection('test-app-id', BASE_OPTIONS);

        expect(buildUrl).toHaveBeenCalledWith({
            host: 'sense.example.com',
            port: '4747',
            prefix: '',
            secure: true,
            appId: 'test-app-id',
        });
    });

    test('returns the URL that sense-utilities produced', () => {
        const config = setupEnigmaConnection('test-app-id', BASE_OPTIONS);

        expect(config.url).toBe('wss://sense.example.com:4747/app/test-app-id');
    });

    describe('secure flag coercion', () => {
        test('accepts boolean true', () => {
            setupEnigmaConnection('test-app-id', { ...BASE_OPTIONS, secure: true });

            expect(buildUrl.mock.calls[0][0].secure).toBe(true);
        });

        test('accepts the string "true", as commander supplies it', () => {
            setupEnigmaConnection('test-app-id', { ...BASE_OPTIONS, secure: 'true' });

            expect(buildUrl.mock.calls[0][0].secure).toBe(true);
        });

        test('treats boolean false as insecure', () => {
            setupEnigmaConnection('test-app-id', { ...BASE_OPTIONS, secure: false });

            expect(buildUrl.mock.calls[0][0].secure).toBe(false);
        });

        test('treats the string "false" as insecure', () => {
            setupEnigmaConnection('test-app-id', { ...BASE_OPTIONS, secure: 'false' });

            expect(buildUrl.mock.calls[0][0].secure).toBe(false);
        });
    });

    describe('createSocket', () => {
        test('is not called while building the config', () => {
            // The socket must only be opened when enigma.js asks for it.
            setupEnigmaConnection('test-app-id', BASE_OPTIONS);

            expect(WebSocket).not.toHaveBeenCalled();
        });

        test('opens the socket at the URL enigma.js supplies', () => {
            const config = setupEnigmaConnection('test-app-id', BASE_OPTIONS);
            config.createSocket('wss://elsewhere.example.com/app/other');

            expect(WebSocket.mock.calls[0][0]).toBe('wss://elsewhere.example.com/app/other');
        });

        test('sends the client certificate and key bytes', () => {
            const socketOptions = socketOptionsFor();

            expect(socketOptions.cert).toEqual(Buffer.from('bytes-of:/opt/bsi/cert/client.pem'));
            expect(socketOptions.key).toEqual(Buffer.from('bytes-of:/opt/bsi/cert/client_key.pem'));
        });

        test('reads the cert paths resolved by getCertFilePaths', () => {
            socketOptionsFor();

            expect(getCertFilePaths).toHaveBeenCalledWith(
                expect.objectContaining({ certfile: './cert/client.pem' })
            );
            expect(readFileSync).toHaveBeenCalledWith('/opt/bsi/cert/client.pem');
            expect(readFileSync).toHaveBeenCalledWith('/opt/bsi/cert/client_key.pem');
        });

        test('authenticates with the X-Qlik-User header', () => {
            const socketOptions = socketOptionsFor();

            expect(socketOptions.headers['X-Qlik-User']).toBe(
                'UserDirectory=INTERNAL;UserId=sa_api'
            );
        });

        test('reflects a non-default API user in the header', () => {
            const socketOptions = socketOptionsFor({
                apiuserdir: 'COMPANY',
                apiuserid: 'svc_bsi',
            });

            expect(socketOptions.headers['X-Qlik-User']).toBe(
                'UserDirectory=COMPANY;UserId=svc_bsi'
            );
        });

        test('accepts rejectUnauthorized as boolean true', () => {
            expect(socketOptionsFor({ rejectUnauthorized: true }).rejectUnauthorized).toBe(true);
        });

        test('accepts rejectUnauthorized as the string "true"', () => {
            expect(socketOptionsFor({ rejectUnauthorized: 'true' }).rejectUnauthorized).toBe(true);
        });

        test('defaults to not rejecting unauthorized certs', () => {
            // Self-signed Qlik Sense certs are the norm, so anything other than an
            // explicit "true" must leave verification off.
            expect(socketOptionsFor({ rejectUnauthorized: false }).rejectUnauthorized).toBe(false);
            expect(socketOptionsFor({ rejectUnauthorized: 'false' }).rejectUnauthorized).toBe(
                false
            );
        });

        test('reads the certificates lazily, once per socket', () => {
            setupEnigmaConnection('test-app-id', BASE_OPTIONS);

            expect(readFileSync).not.toHaveBeenCalled();
        });
    });

    test('propagates a schema-loading failure to the caller', () => {
        getEnigmaSchema.mockImplementation(() => {
            throw new Error('Unsupported Enigma.js schema version');
        });

        expect(() => setupEnigmaConnection('test-app-id', BASE_OPTIONS)).toThrow(
            'Unsupported Enigma.js schema version'
        );
    });

    test('propagates a certificate path failure to the caller', () => {
        getCertFilePaths.mockImplementation(() => {
            throw new Error('Failed to resolve certificate file paths');
        });

        expect(() => setupEnigmaConnection('test-app-id', BASE_OPTIONS)).toThrow(
            'Failed to resolve certificate file paths'
        );
    });
});
