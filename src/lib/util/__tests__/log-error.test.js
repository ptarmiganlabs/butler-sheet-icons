import { jest, describe, test, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
    },
    isSea: false,
}));

const { logError } = await import('../log-error.js');
const { logger } = await import('../../../globals.js');

describe('logError', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // The point of the helper: a user at the default log level sees the reason, not the stack.
    test('logs the reason at error level and the stack at debug level', () => {
        const err = new Error('boom');
        logError('CTX', err);

        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith('CTX: boom');

        expect(logger.debug).toHaveBeenCalledTimes(1);
        expect(logger.debug.mock.calls[0][0]).toContain('Error: boom');
    });

    // Guards the actual regression: no stack frame may reach `error` level, whatever else changes.
    test('never puts a stack frame on the error-level line', () => {
        logError('CTX', new Error('boom'));

        expect(logger.error.mock.calls[0][0]).not.toContain('    at ');
    });

    test('skips the debug line when the error carries no stack', () => {
        const err = new Error('boom');
        err.stack = undefined;
        logError('CTX', err);

        expect(logger.error).toHaveBeenCalledWith('CTX: boom');
        expect(logger.debug).not.toHaveBeenCalled();
    });

    test('handles a thrown string', () => {
        logError('CTX', 'just a string');

        expect(logger.error).toHaveBeenCalledWith('CTX: just a string');
        expect(logger.debug).not.toHaveBeenCalled();
    });

    // Several of the catch blocks this helper replaced had their own JSON.stringify fallback,
    // because '[object Object]' names nothing.
    test('JSON-encodes a thrown plain object', () => {
        logError('CTX', { code: 42, detail: 'nope' });

        expect(logger.error).toHaveBeenCalledWith('CTX: {"code":42,"detail":"nope"}');
    });

    test('falls back to String() for an object JSON cannot encode', () => {
        const circular = {};
        circular.self = circular;

        logError('CTX', circular);

        expect(logger.error).toHaveBeenCalledWith('CTX: [object Object]');
    });

    test('falls back to String() for an object with no enumerable properties', () => {
        logError('CTX', Object.create({}, { hidden: { value: 1, enumerable: false } }));

        expect(logger.error).toHaveBeenCalledWith('CTX: [object Object]');
    });

    // A null-prototype object has no toString(), so String() throws on it. The helper runs inside
    // catch blocks, so it must degrade rather than turn a reported error into a crash.
    test('does not throw on a value that cannot be stringified at all', () => {
        const noPrototype = Object.create(null);
        noPrototype.self = noPrototype; // also defeats JSON.stringify

        expect(() => logError('CTX', noPrototype)).not.toThrow();
        expect(logger.error).toHaveBeenCalledWith('CTX: [object Object]');
    });

    test('does not throw when reading .message throws', () => {
        const err = {};
        Object.defineProperty(err, 'message', {
            get: () => {
                throw new Error('message getter exploded');
            },
        });

        expect(() => logError('CTX', err)).not.toThrow();
    });

    test.each([
        ['undefined', undefined],
        ['null', null],
    ])('logs the message alone when the error is %s', (_label, value) => {
        logError('just a message', value);

        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith('just a message');
        expect(logger.debug).not.toHaveBeenCalled();
    });
});
