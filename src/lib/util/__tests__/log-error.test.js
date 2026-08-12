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

    // The typed errors in ../errors.js are thrown with { cause } throughout, so the reason a
    // reader actually needs is usually one level down from the message.
    describe('cause chain', () => {
        test('appends the underlying cause', () => {
            const err = new Error('Failed to update sheet thumbnails in app abc', {
                cause: new Error('Not connected'),
            });

            logError('QSEOW UPDATE SHEETS', err);

            expect(logger.error).toHaveBeenCalledWith(
                'QSEOW UPDATE SHEETS: Failed to update sheet thumbnails in app abc [caused by: Not connected]'
            );
        });

        test('walks more than one level', () => {
            const err = new Error('outer', {
                cause: new Error('middle', { cause: new Error('root') }),
            });

            logError('CTX', err);

            expect(logger.error).toHaveBeenCalledWith('CTX: outer [caused by: middle: root]');
        });

        // Several call sites throw `new Error(\`PREFIX: ${err}\`, { cause: err })`.
        test('does not repeat a cause already quoted in the outer message', () => {
            const cause = new Error('Not connected');
            const err = new Error(`CONTENT LIBRARY 1: ${cause}`, { cause });

            logError('CTX', err);

            expect(logger.error).toHaveBeenCalledWith(
                'CTX: CONTENT LIBRARY 1: Error: Not connected'
            );
        });

        test('terminates on a cyclic cause chain', () => {
            const a = new Error('a');
            const b = new Error('b', { cause: a });
            a.cause = b;

            expect(() => logError('CTX', b)).not.toThrow();
            expect(logger.error).toHaveBeenCalledWith('CTX: b [caused by: a]');
        });

        // Regression: `.message` need not be a string. A non-string reaching the dedup's
        // substring match threw `TypeError: part.includes is not a function` out of the logger,
        // from inside a catch block - so the real error was lost and replaced by a crash.
        test('survives a non-string message alongside a cause', () => {
            const err = { message: { code: 401 }, cause: new Error('root reason') };

            expect(() => logError('CTX', err)).not.toThrow();
            expect(logger.error).toHaveBeenCalledWith('CTX: {"code":401} [caused by: root reason]');
        });

        test('survives a cause accessor that throws', () => {
            const err = new Error('outer');
            Object.defineProperty(err, 'cause', {
                get: () => {
                    throw new Error('cause getter exploded');
                },
            });

            expect(() => logError('CTX', err)).not.toThrow();
            expect(logger.error).toHaveBeenCalledWith('CTX: outer');
        });

        // Regression: the bound used to count kept entries, so causes collapsed by the dedup
        // advanced no counter and the chain was walked in full.
        test('follows at most MAX_CAUSE_DEPTH links when every cause reads the same', () => {
            let reads = 0;
            const make = (depth) => {
                const e = new Error('same');
                Object.defineProperty(e, 'cause', {
                    get: () => {
                        reads += 1;
                        return depth > 0 ? make(depth - 1) : undefined;
                    },
                });
                return e;
            };

            logError('CTX', make(1000));

            // One read per link followed, plus the read that ends the loop.
            expect(reads).toBeLessThanOrEqual(6);
            expect(logger.error).toHaveBeenCalledWith('CTX: same');
        });

        test('stops at the depth limit', () => {
            let err = new Error('root');
            for (let i = 0; i < 20; i += 1) {
                err = new Error(`level${i}`, { cause: err });
            }

            logError('CTX', err);

            const line = logger.error.mock.calls[0][0];
            expect(line).toContain('level19');
            expect(line).not.toContain('root');
        });
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
