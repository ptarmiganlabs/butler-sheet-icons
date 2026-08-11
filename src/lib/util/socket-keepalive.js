import { logger } from '../../globals.js';

/**
 * How often to ping an otherwise idle engine socket, in milliseconds.
 *
 * Chosen against what the screenshot paths do rather than against any documented limit: they
 * call the engine once per sheet and then hand over to the browser for 25-40 s, so the socket
 * goes quiet for that long every sheet. 20 s puts at least one frame in every such gap, which
 * is the point - a connection that is never idle for a full gap cannot be reaped for being
 * idle. Shorter buys nothing; longer leaves gaps unprotected.
 */
const DEFAULT_KEEPALIVE_INTERVAL_MS = 20000;

/**
 * Keeps an engine WebSocket from going silent while the caller is busy elsewhere.
 *
 * enigma.js never sends anything on its own, so between two engine calls the socket carries no
 * traffic at all. Anything on the path - a load balancer, a NAT table, a corporate firewall -
 * is then free to drop the connection as idle without telling either end, and the drop is only
 * discovered by the next request, which fails with `Not connected`. That is the shape of issue
 * #975: sessions dropped mid-app while the browser was taking a screenshot, and sessions four
 * times older survived in the same run, so it was never a lifetime limit.
 *
 * A ping frame is the standard answer and costs a few bytes per interval. It does not make a
 * dropped session recoverable - nothing here retries - it makes the drop less likely to happen
 * in the first place.
 *
 * Applied to both platforms even though only Qlik Sense Cloud has shown the fault. QSEoW
 * reaches its server over the LAN, where an idle socket has far less to survive, but the two
 * connection modules are twins and a divergence here would be one more thing to remember.
 *
 * @param {object} socket - A `ws` WebSocket. Anything without a `ping` method is left alone, so
 *     a browser `WebSocket` or a test double needs no special casing at the call site.
 * @param {object} [ctx] - Options.
 * @param {number} [ctx.intervalMs] - Ping interval. Defaults to 20 s; see above.
 *
 * @returns {object} The same socket, so `createSocket` can return the call directly.
 */
export const attachSocketKeepalive = (
    socket,
    { intervalMs = DEFAULT_KEEPALIVE_INTERVAL_MS } = {}
) => {
    if (typeof socket?.ping !== 'function' || typeof socket.on !== 'function') {
        return socket;
    }

    let timer;

    const stop = () => {
        if (timer) {
            clearInterval(timer);
            timer = undefined;
        }
    };

    socket.on('open', () => {
        timer = setInterval(() => {
            try {
                socket.ping();
            } catch (err) {
                // A socket that has died between the interval firing and the ping being sent
                // throws here. It is not this module's business to report that - the engine
                // call that follows will, with far more context - but an uncaught throw from a
                // timer callback would take the process down.
                logger.debug(`Engine socket keepalive ping failed: ${err?.message ?? err}`);
                stop();
            }
        }, intervalMs);

        // An interval alone is enough to keep Node alive. Without this, a run that finished
        // its work but left a socket unclosed would hang instead of exiting.
        timer.unref?.();
    });

    socket.on('close', stop);
    socket.on('error', stop);

    return socket;
};
