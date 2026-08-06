/**
 * The SEA (single-executable application) branch of `getEnigmaSchema`.
 *
 * This lives in its own file because `isSea` is imported from `globals.js` and Jest
 * fixes a mocked module's namespace at import time — a mutable flag or getter shared
 * with enigma-util.test.js would always read back as its initial value.
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

const readFileSync = jest.fn();

jest.unstable_mockModule('node:fs', () => ({
    default: { readFileSync },
    readFileSync,
}));

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
    },
    isSea: true,
}));

const { getEnigmaSchema } = await import('../enigma-util.js');
const { EnigmaError } = await import('../errors.js');

beforeEach(() => {
    jest.clearAllMocks();
    readFileSync.mockReturnValue('{}');
});

describe('getEnigmaSchema when running as a SEA binary', () => {
    test('never reads the schema from node_modules', () => {
        // node_modules is not shipped inside the packaged binary, so falling back to
        // the filesystem here would break every SEA release.
        expect(() => getEnigmaSchema({ schemaversion: '12.2015.0' })).toThrow(EnigmaError);

        expect(readFileSync).not.toHaveBeenCalled();
    });

    test('reports an unusable embedded asset as an EnigmaError', () => {
        // Asset lookup can only succeed inside a real SEA binary; under Jest it fails,
        // and that failure must surface as the typed error the crash handler expects.
        let thrown;
        try {
            getEnigmaSchema({ schemaversion: '12.2015.0' });
        } catch (err) {
            thrown = err;
        }

        expect(thrown).toBeInstanceOf(EnigmaError);
        expect(thrown.message).toContain('Failed to load Enigma.js schema');
        expect(thrown.cause).toBeDefined();
    });

    test('still rejects an unsupported schema version before looking for an asset', () => {
        expect(() => getEnigmaSchema({ schemaversion: '99.99.99' })).toThrow(
            /99\.99\.99.*Supported/s
        );
    });
});
