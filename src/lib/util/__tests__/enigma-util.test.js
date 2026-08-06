import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import path from 'path';

const readFileSync = jest.fn();

jest.unstable_mockModule('node:fs', () => ({
    default: { readFileSync },
    readFileSync,
}));

// Native Node.js run, i.e. not a packaged SEA binary. The SEA branch is covered
// separately in enigma-util_sea.test.js — `isSea` is read from the module namespace,
// which Jest fixes at import time, so the two cases cannot share one mock.
jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
    },
    isSea: false,
}));

const { logger } = await import('../../../globals.js');
const { getEnigmaSchema } = await import('../enigma-util.js');
const { EnigmaError } = await import('../errors.js');

const SUPPORTED_VERSIONS = [
    '12.170.2',
    '12.612.0',
    '12.936.0',
    '12.1306.0',
    '12.1477.0',
    '12.1657.0',
    '12.1823.0',
    '12.2015.0',
];

const SCHEMA = { structs: { Global: {} } };

beforeEach(() => {
    jest.clearAllMocks();
    readFileSync.mockReturnValue(JSON.stringify(SCHEMA));
});

describe('getEnigmaSchema', () => {
    describe('supported schema versions', () => {
        test.each(SUPPORTED_VERSIONS)('accepts version %s', (schemaversion) => {
            expect(getEnigmaSchema({ schemaversion })).toEqual(SCHEMA);
        });

        test('reads the schema from the enigma.js schemas directory', () => {
            getEnigmaSchema({ schemaversion: '12.2015.0' });

            const [schemaPath, encoding] = readFileSync.mock.calls[0];

            // The `schemas/` segment matters: without it the path does not exist, and
            // node:fs is mocked here so nothing else would notice.
            expect(schemaPath).toContain(path.join('enigma.js', 'schemas', '12.2015.0.json'));
            expect(encoding).toBe('utf8');
        });

        test('reads an absolute path, so the CWD does not matter', () => {
            getEnigmaSchema({ schemaversion: '12.2015.0' });

            const [schemaPath] = readFileSync.mock.calls[0];

            expect(schemaPath.startsWith('/') || /^[A-Za-z]:/.test(schemaPath)).toBe(true);
        });

        test('returns the parsed schema, not the raw JSON text', () => {
            const result = getEnigmaSchema({ schemaversion: '12.170.2' });

            expect(typeof result).toBe('object');
            expect(result).not.toBe(JSON.stringify(SCHEMA));
        });
    });

    describe('unsupported schema versions', () => {
        test('throws EnigmaError for a version that does not exist', () => {
            expect(() => getEnigmaSchema({ schemaversion: '99.99.99' })).toThrow(EnigmaError);
        });

        test('names the offending version and the supported ones in the message', () => {
            expect(() => getEnigmaSchema({ schemaversion: '99.99.99' })).toThrow(
                /99\.99\.99.*Supported/s
            );
        });

        test('lists every supported version in the message', () => {
            let message;
            try {
                getEnigmaSchema({ schemaversion: '99.99.99' });
            } catch (err) {
                message = err.message;
            }

            SUPPORTED_VERSIONS.forEach((version) => expect(message).toContain(version));
        });

        test('logs the supported versions so the user can act on it', () => {
            expect(() => getEnigmaSchema({ schemaversion: '99.99.99' })).toThrow(EnigmaError);

            const errors = logger.error.mock.calls.map((call) => String(call[0])).join('\n');

            expect(errors).toContain('Unsupported schema version specified: 99.99.99');
            expect(errors).toContain('Supported schema versions:');
        });

        test('never touches the filesystem for an unsupported version', () => {
            expect(() => getEnigmaSchema({ schemaversion: '99.99.99' })).toThrow(EnigmaError);

            expect(readFileSync).not.toHaveBeenCalled();
        });

        test('throws EnigmaError when no version is supplied at all', () => {
            expect(() => getEnigmaSchema({})).toThrow(EnigmaError);
        });

        test('does not double-wrap the unsupported-version error', () => {
            let thrown;
            try {
                getEnigmaSchema({ schemaversion: '99.99.99' });
            } catch (err) {
                thrown = err;
            }

            // The catch block rethrows an existing EnigmaError untouched rather than
            // nesting it inside a second "Failed to load" error.
            expect(thrown.message).not.toContain('Failed to load');
            expect(thrown.cause).toBeUndefined();
        });
    });

    describe('failures while loading the schema file', () => {
        test('wraps a filesystem error in EnigmaError', () => {
            readFileSync.mockImplementation(() => {
                throw new Error('ENOENT: no such file or directory');
            });

            expect(() => getEnigmaSchema({ schemaversion: '12.2015.0' })).toThrow(EnigmaError);
        });

        test('keeps the filesystem error as the cause', () => {
            const fsError = new Error('ENOENT: no such file or directory');
            readFileSync.mockImplementation(() => {
                throw fsError;
            });

            let thrown;
            try {
                getEnigmaSchema({ schemaversion: '12.2015.0' });
            } catch (err) {
                thrown = err;
            }

            expect(thrown.cause).toBe(fsError);
            expect(thrown.message).toContain('Failed to load Enigma.js schema');
        });

        test('wraps malformed JSON in EnigmaError', () => {
            readFileSync.mockReturnValue('{ not valid json');

            expect(() => getEnigmaSchema({ schemaversion: '12.2015.0' })).toThrow(EnigmaError);
        });
    });

    test('reads from the filesystem when not running as a SEA binary', () => {
        getEnigmaSchema({ schemaversion: '12.2015.0' });

        expect(readFileSync).toHaveBeenCalledTimes(1);
    });
});
