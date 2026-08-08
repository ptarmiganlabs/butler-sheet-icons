import enigma from 'enigma.js';

import { logger } from '../../globals.js';

/**
 * Opens an engine session, hands the callback the global object, and always releases the session.
 *
 * Six modules hand-rolled this create/open/close sequence, and the copies had already drifted:
 * four pretty-printed received traffic at `silly` level while two logged the raw object, and two
 * of them closed only on the happy path, leaking the websocket for the life of the process on
 * every failing app.
 *
 * The session is closed in a `finally`, so the callback cannot leak it. That is also why the
 * callback should contain everything that needs the session and nothing that does not: in the
 * two `process-app` modules the thumbnail-update step opens its own session to the same app, and
 * pulling it inside this callback would hold two engine sessions per app - doubling licence
 * consumption, and failing at a per-user session ceiling after screenshots were already taken.
 * Keep such work after the call, not inside it.
 *
 * A close that rejects while the callback is already throwing is logged rather than thrown.
 * Otherwise it would replace the real cause, and the operator would be told the session could not
 * be closed instead of why the app failed. When the callback succeeded there is nothing to mask,
 * so a failing close still propagates, as it did before.
 *
 * @param {object} configEnigma - Fully-built enigma.js config. Built by the caller, because the
 *     two platforms construct it differently.
 * @param {object} ctx - Logging context.
 * @param {string} ctx.logPrefix - Prefix for error output, e.g. `'QSEOW UPDATE SHEETS'`.
 * @param {string} ctx.loglevel - Active log level; `'silly'` attaches the traffic handlers.
 * @param {string} ctx.connectionLabel - What was connected to, e.g. `'server sense.example.com'`
 *     or `'Qlik Sense Cloud tenant foo.eu.qlikcloud.com'`. Rendered into the existing
 *     `Created session to …, engine version is …` line.
 * @param {Function} fn - Async callback receiving the enigma `global` object. Its resolved value
 *     is returned.
 *
 * @returns {Promise<unknown>} Whatever `fn` resolves to.
 *
 * @throws {Error} Whatever `fn` throws, or whatever `enigma.create`, `open()` or a close on an
 *     otherwise successful run throws.
 */
export const withEngineSession = async (configEnigma, ctx, fn) => {
    const { logPrefix, loglevel, connectionLabel } = ctx;

    // Outside the try: if this throws there is no session to release.
    const session = await enigma.create(configEnigma);

    let result;
    let bodyFailed = false;
    let bodyError;

    try {
        // Inside the try, so that nothing between create and close can leak the session -
        // attaching a handler is not expected to throw, but the point of this helper is that
        // the answer does not depend on that.
        if (loglevel === 'silly') {
            session.on('traffic:sent', (data) => console.log('sent:', data));
            session.on('traffic:received', (data) =>
                console.log('received:', JSON.stringify(data, null, 2))
            );
        }

        const global = await session.open();

        const engineVersion = await global.engineVersion();
        logger.verbose(
            `Created session to ${connectionLabel}, engine version is ${engineVersion.qComponentVersion}`
        );

        result = await fn(global);
    } catch (err) {
        // Recorded rather than rethrown here, so the close below runs exactly once on every
        // path. A `finally` would do the same, but throwing the close error out of a `finally`
        // silently discards whichever completion was already pending - the very masking this
        // guards against, and what `no-unsafe-finally` warns about.
        bodyFailed = true;
        bodyError = err;
    }

    try {
        // enigma.js always resolves close() truthy; a real failure rejects.
        await session.close();
    } catch (closeErr) {
        if (!bodyFailed) {
            throw closeErr;
        }

        logger.error(
            `${logPrefix}: The app failed, and the engine session could not be closed either: ${closeErr?.message ?? closeErr}`
        );
    }

    if (bodyFailed) {
        // A separate flag rather than a truthiness check on bodyError: a thrown `undefined` is
        // still a failure, and must not be reported as success.
        throw bodyError;
    }

    return result;
};
