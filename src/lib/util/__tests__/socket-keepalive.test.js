import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
    },
}));

const { logger } = await import('../../../globals.js');
const { attachSocketKeepalive } = await import('../socket-keepalive.js');

/**
 * Builds a stand-in for a `ws` WebSocket: an event emitter that records its pings.
 *
 * @param {object} [overrides] - Properties to merge onto the socket, e.g. a throwing `ping`.
 *
 * @returns {object} The fake socket, with `ping` as a jest mock.
 */
const fakeSocket = (overrides = {}) =>
    Object.assign(new EventEmitter(), { ping: jest.fn() }, overrides);

beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
});

afterEach(() => {
    jest.useRealTimers();
});

describe('attachSocketKeepalive', () => {
    test('returns the socket, so createSocket can wrap its constructor call', () => {
        const socket = fakeSocket();

        expect(attachSocketKeepalive(socket)).toBe(socket);
    });

    test('sends nothing before the socket is open', () => {
        const socket = fakeSocket();
        attachSocketKeepalive(socket, { intervalMs: 1000 });

        jest.advanceTimersByTime(10000);

        expect(socket.ping).not.toHaveBeenCalled();
    });

    test('pings on every interval once open', () => {
        const socket = fakeSocket();
        attachSocketKeepalive(socket, { intervalMs: 1000 });

        socket.emit('open');
        jest.advanceTimersByTime(3000);

        expect(socket.ping).toHaveBeenCalledTimes(3);
    });

    test('covers the gap a sheet screenshot leaves', () => {
        // The default has to fire inside the 25-40 s the browser spends per sheet, which is
        // the window issue #975's sockets died in. A default longer than that gap would leave
        // the connection idle for exactly as long as before.
        const socket = fakeSocket();
        attachSocketKeepalive(socket);

        socket.emit('open');
        jest.advanceTimersByTime(25000);

        expect(socket.ping).toHaveBeenCalled();
    });

    test('stops when the socket closes', () => {
        const socket = fakeSocket();
        attachSocketKeepalive(socket, { intervalMs: 1000 });

        socket.emit('open');
        jest.advanceTimersByTime(2000);
        socket.emit('close');
        jest.advanceTimersByTime(10000);

        expect(socket.ping).toHaveBeenCalledTimes(2);
    });

    test('stops on a socket error', () => {
        const socket = fakeSocket();
        attachSocketKeepalive(socket, { intervalMs: 1000 });

        socket.emit('open');
        jest.advanceTimersByTime(1000);
        // An emitter with no `error` listener throws on emit; the keepalive registers one, so
        // this also asserts the socket is not left to take the process down over a dead ping.
        socket.emit('error', new Error('boom'));
        jest.advanceTimersByTime(10000);

        expect(socket.ping).toHaveBeenCalledTimes(1);
    });

    test('does not hold the process open', () => {
        // An interval alone keeps Node running. A finished run with an unclosed socket would
        // hang on exit instead of ending.
        const socket = fakeSocket();
        const unref = jest.spyOn(global, 'setInterval');
        attachSocketKeepalive(socket, { intervalMs: 1000 });

        socket.emit('open');

        expect(unref.mock.results.at(-1).value.hasRef()).toBe(false);
        unref.mockRestore();
    });

    test('gives up quietly when a ping throws on a dying socket', () => {
        const socket = fakeSocket({
            ping: jest.fn(() => {
                throw new Error('WebSocket is not open');
            }),
        });
        attachSocketKeepalive(socket, { intervalMs: 1000 });

        socket.emit('open');
        jest.advanceTimersByTime(5000);

        // Tried once, then stood down - the engine call that follows reports the real problem.
        expect(socket.ping).toHaveBeenCalledTimes(1);
        expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('keepalive'));
    });

    test('leaves a socket with no ping support alone', () => {
        // A browser WebSocket has no ping method, and neither do some test doubles.
        const socket = Object.assign(new EventEmitter(), {});

        expect(() => attachSocketKeepalive(socket)).not.toThrow();
        expect(() => socket.emit('open')).not.toThrow();
    });
});
