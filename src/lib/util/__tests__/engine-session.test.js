import { jest, describe, test, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('enigma.js', () => ({ default: { create: jest.fn() } }));

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    },
}));

const enigma = (await import('enigma.js')).default;
const { logger } = await import('../../../globals.js');
const { withEngineSession } = await import('../engine-session.js');

const CTX = {
    logPrefix: 'TEST',
    loglevel: 'info',
    connectionLabel: 'server sense.example.com',
};

/**
 * Builds a mock enigma session and registers it with the mocked `enigma.create`.
 *
 * @param {object} overrides - Overrides for the session or global mocks.
 * @param {object} overrides.global - Replacement enigma `global` object.
 * @param {object} overrides.session - Extra properties merged onto the session.
 *
 * @returns {object} `{ session, global }` for assertions.
 */
const wireSession = ({ global: globalOverride, session: sessionOverride } = {}) => {
    const mockGlobal = globalOverride ?? {
        engineVersion: jest.fn().mockResolvedValue({ qComponentVersion: '12.34.5' }),
    };
    const session = {
        open: jest.fn().mockResolvedValue(mockGlobal),
        close: jest.fn().mockResolvedValue(true),
        on: jest.fn(),
        ...sessionOverride,
    };
    enigma.create.mockResolvedValue(session);

    return { session, global: mockGlobal };
};

beforeEach(() => {
    jest.clearAllMocks();
    enigma.create.mockReset();
});

describe('withEngineSession', () => {
    test('hands the callback the enigma global object', async () => {
        const { global } = wireSession();
        const seen = [];

        await withEngineSession({ url: 'wss://x' }, CTX, async (g) => {
            seen.push(g);
        });

        expect(seen).toEqual([global]);
    });

    test('returns whatever the callback resolves to', async () => {
        wireSession();

        await expect(withEngineSession({}, CTX, async () => 'the-result')).resolves.toBe(
            'the-result'
        );
    });

    test('closes the session on the happy path', async () => {
        const { session } = wireSession();

        await withEngineSession({}, CTX, async () => true);

        expect(session.close).toHaveBeenCalledTimes(1);
    });

    test('closes the session when the callback throws', async () => {
        // The leak this helper exists to make impossible.
        const { session } = wireSession();

        await expect(
            withEngineSession({}, CTX, async () => {
                throw new Error('body blew up');
            })
        ).rejects.toThrow('body blew up');

        expect(session.close).toHaveBeenCalledTimes(1);
    });

    test('closes the session when opening it fails', async () => {
        const { session } = wireSession();
        session.open.mockRejectedValue(new Error('handshake refused'));

        await expect(withEngineSession({}, CTX, async () => true)).rejects.toThrow(
            'handshake refused'
        );

        expect(session.close).toHaveBeenCalledTimes(1);
    });

    test('does not call the callback when the session cannot be opened', async () => {
        const { session } = wireSession();
        session.open.mockRejectedValue(new Error('handshake refused'));
        const fn = jest.fn();

        await expect(withEngineSession({}, CTX, fn)).rejects.toThrow();

        expect(fn).not.toHaveBeenCalled();
    });

    test('propagates a create failure without trying to close', async () => {
        // create() is outside the try on purpose - there is no session to release.
        enigma.create.mockRejectedValue(new Error('cannot reach engine'));

        await expect(withEngineSession({}, CTX, async () => true)).rejects.toThrow(
            'cannot reach engine'
        );
    });

    test('closes the session exactly once', async () => {
        const { session } = wireSession();

        await withEngineSession({}, CTX, async () => true);

        expect(session.close).toHaveBeenCalledTimes(1);
    });

    describe('a close that fails', () => {
        test('does not mask the error the callback threw', async () => {
            // Without this, `try { throw ORIGINAL } finally { await reject(CLOSE) }` propagates
            // CLOSE, and the operator is told the session would not close instead of why the app
            // actually failed.
            const { session } = wireSession();
            session.close.mockRejectedValue(new Error('close failed'));

            await expect(
                withEngineSession({}, CTX, async () => {
                    throw new Error('ORIGINAL failure');
                })
            ).rejects.toThrow('ORIGINAL failure');
        });

        test('is logged when it is swallowed, so it is not lost silently', async () => {
            const { session } = wireSession();
            session.close.mockRejectedValue(new Error('close failed'));

            await expect(
                withEngineSession({}, CTX, async () => {
                    throw new Error('ORIGINAL failure');
                })
            ).rejects.toThrow();

            const logged = logger.error.mock.calls.map((c) => String(c[0])).join('\n');
            expect(logged).toContain('close failed');
            expect(logged).toContain('TEST');
        });

        test('still propagates when the callback succeeded', async () => {
            // Nothing to mask here, so the close failure is the app's failure - as before.
            const { session } = wireSession();
            session.close.mockRejectedValue(new Error('close failed'));

            await expect(withEngineSession({}, CTX, async () => 'ok')).rejects.toThrow(
                'close failed'
            );
        });
    });

    describe('silly traffic logging', () => {
        test('attaches no traffic handlers below silly', async () => {
            const { session } = wireSession();

            await withEngineSession({}, { ...CTX, loglevel: 'debug' }, async () => true);

            expect(session.on).not.toHaveBeenCalled();
        });

        test('attaches both traffic handlers at silly', async () => {
            const { session } = wireSession();

            await withEngineSession({}, { ...CTX, loglevel: 'silly' }, async () => true);

            expect(session.on).toHaveBeenCalledWith('traffic:sent', expect.any(Function));
            expect(session.on).toHaveBeenCalledWith('traffic:received', expect.any(Function));
        });

        test('pretty-prints received traffic, settling the 4-vs-2 split', async () => {
            // Four modules pretty-printed received traffic and two logged the raw object. The
            // majority form wins, so `silly` output is now identical everywhere.
            const { session } = wireSession();
            const log = jest.spyOn(console, 'log').mockImplementation(() => {});

            await withEngineSession({}, { ...CTX, loglevel: 'silly' }, async () => true);
            const received = session.on.mock.calls.find(([e]) => e === 'traffic:received')[1];
            received({ a: 1 });

            expect(log).toHaveBeenCalledWith('received:', JSON.stringify({ a: 1 }, null, 2));
            log.mockRestore();
        });
    });

    test('logs the engine version against the supplied connection label', async () => {
        wireSession();

        await withEngineSession({}, CTX, async () => true);

        const logged = logger.verbose.mock.calls.map((c) => String(c[0])).join('\n');
        expect(logged).toContain('Created session to server sense.example.com');
        expect(logged).toContain('engine version is 12.34.5');
    });
});
