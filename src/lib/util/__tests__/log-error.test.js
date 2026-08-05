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

const { logError, logWarn, logInfo, logVerbose, logDebug } = await import('../log-error.js');
const { logger } = await import('../../../globals.js');

describe('log-error (non-SEA)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('logError: logs message + stack separately', () => {
        const err = new Error('boom');
        logError('CTX', err);

        expect(logger.error).toHaveBeenCalledTimes(2);
        expect(logger.error).toHaveBeenNthCalledWith(1, 'CTX: boom');
        expect(logger.error).toHaveBeenNthCalledWith(2, expect.stringContaining('Stack trace:'));
        expect(logger.error.mock.calls[1][0]).toContain('Error: boom');
    });

    test('logError: skips stack when error has no stack', () => {
        const err = new Error('boom');
        err.stack = undefined;
        logError('CTX', err);

        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith('CTX: boom');
    });

    test('logError: handles non-Error throwables via toString()', () => {
        logError('CTX', 'just a string');

        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith('CTX: just a string');
    });

    test('logError: forwards plain message when no error provided', () => {
        logError('just a message');

        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith('just a message');
    });

    test('logWarn: logs at warn level', () => {
        const err = new Error('warn-me');
        logWarn('CTX', err);

        expect(logger.warn).toHaveBeenCalledTimes(2);
        expect(logger.warn.mock.calls[0][0]).toBe('CTX: warn-me');
    });

    test('logInfo / logVerbose / logDebug: route to the correct level', () => {
        const err = new Error('x');

        logInfo('CTX', err);
        logVerbose('CTX', err);
        logDebug('CTX', err);

        expect(logger.info).toHaveBeenCalledTimes(2);
        expect(logger.verbose).toHaveBeenCalledTimes(2);
        expect(logger.debug).toHaveBeenCalledTimes(2);
    });
});

describe('log-error (SEA mode)', () => {
    let seaLogger;
    let seaLogError;

    beforeEach(async () => {
        jest.resetModules();
        jest.unstable_mockModule('../../../globals.js', () => ({
            logger: {
                error: jest.fn(),
                warn: jest.fn(),
                info: jest.fn(),
                verbose: jest.fn(),
                debug: jest.fn(),
            },
            isSea: true,
        }));
        seaLogger = (await import('../../../globals.js')).logger;
        seaLogError = (await import('../log-error.js')).logError;
    });

    test('SEA mode: only the message is logged (no stack)', () => {
        const err = new Error('boom');
        seaLogError('CTX', err);

        expect(seaLogger.error).toHaveBeenCalledTimes(1);
        expect(seaLogger.error).toHaveBeenCalledWith('CTX: boom');
    });
});
