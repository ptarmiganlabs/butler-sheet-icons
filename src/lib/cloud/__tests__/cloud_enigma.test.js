import { jest, describe, test, expect, beforeEach } from '@jest/globals';

const buildUrl = jest.fn().mockReturnValue('wss://tenant.eu.qlikcloud.com/app/test-app-id');

jest.unstable_mockModule('enigma.js/sense-utilities.js', () => ({
    default: { buildUrl },
}));

const WebSocket = jest.fn();

jest.unstable_mockModule('ws', () => ({ default: WebSocket }));

const SCHEMA = { structs: { Global: {} } };
const getEnigmaSchema = jest.fn().mockReturnValue(SCHEMA);

jest.unstable_mockModule('../../util/enigma-util.js', () => ({ getEnigmaSchema }));

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
    },
}));

const { setupEnigmaConnection } = await import('../cloud-enigma.js');

const BASE_OPTIONS = {
    schemaversion: '12.2015.0',
    tenanturl: 'tenant.eu.qlikcloud.com',
    apikey: 'secret-api-key',
};

beforeEach(() => {
    jest.clearAllMocks();
    buildUrl.mockReturnValue('wss://tenant.eu.qlikcloud.com/app/test-app-id');
    getEnigmaSchema.mockReturnValue(SCHEMA);
});

describe('setupEnigmaConnection (Qlik Sense Cloud)', () => {
    test('returns the schema loaded for the requested version', () => {
        const config = setupEnigmaConnection('test-app-id', BASE_OPTIONS);

        expect(getEnigmaSchema).toHaveBeenCalledWith(BASE_OPTIONS);
        expect(config.schema).toBe(SCHEMA);
    });

    test('builds the engine URL from the tenant URL and app id', () => {
        setupEnigmaConnection('test-app-id', BASE_OPTIONS);

        expect(buildUrl).toHaveBeenCalledWith({
            host: 'tenant.eu.qlikcloud.com',
            secure: true,
            appId: 'test-app-id',
        });
    });

    test('always connects securely, since SaaS is TLS-only', () => {
        setupEnigmaConnection('test-app-id', { ...BASE_OPTIONS, secure: false });

        expect(buildUrl.mock.calls[0][0].secure).toBe(true);
    });

    test('returns the URL that sense-utilities produced', () => {
        const config = setupEnigmaConnection('test-app-id', BASE_OPTIONS);

        expect(config.url).toBe('wss://tenant.eu.qlikcloud.com/app/test-app-id');
    });

    describe('createSocket', () => {
        test('is not called while building the config', () => {
            setupEnigmaConnection('test-app-id', BASE_OPTIONS);

            expect(WebSocket).not.toHaveBeenCalled();
        });

        test('opens the socket at the URL enigma.js supplies', () => {
            const config = setupEnigmaConnection('test-app-id', BASE_OPTIONS);
            config.createSocket('wss://tenant.eu.qlikcloud.com/app/test-app-id');

            expect(WebSocket.mock.calls[0][0]).toBe(
                'wss://tenant.eu.qlikcloud.com/app/test-app-id'
            );
        });

        test('authenticates with a bearer token', () => {
            const config = setupEnigmaConnection('test-app-id', BASE_OPTIONS);
            config.createSocket('wss://tenant.eu.qlikcloud.com/app/test-app-id');

            expect(WebSocket.mock.calls[0][1].headers.Authorization).toBe('Bearer secret-api-key');
        });

        test('sends no client certificate, unlike the QSEoW variant', () => {
            const config = setupEnigmaConnection('test-app-id', BASE_OPTIONS);
            config.createSocket('wss://tenant.eu.qlikcloud.com/app/test-app-id');

            const socketOptions = WebSocket.mock.calls[0][1];

            expect(socketOptions.cert).toBeUndefined();
            expect(socketOptions.key).toBeUndefined();
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
});
