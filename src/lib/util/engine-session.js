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
 * @param {string} [ctx.sessionLogLevel] - Level for that line, following the convention below.
 *     Defaults to `'verbose'`, so a caller that does not think about it stays quiet.
 *
 *     The rule is **who opened the app first**, not which platform or command:
 *
 *     - A command working on an app the operator named logs at `'info'` - the two screenshot
 *       paths and the two icon-removal commands. The default log level is `info`, so this is the
 *       line that tells an operator the run reached their app.
 *     - A step re-opening an app already reported by the caller above it logs at `'verbose'`.
 *       Only the two `*-updatesheets` modules qualify: they are called solely from the
 *       screenshot paths, which have already announced the same app. Repeating it at `info`
 *       would print every app twice on a default-level run.
 *
 *     Each module's `Opened app …` line follows the same rule, so the two lines in a module
 *     always agree. The removal commands used to mix them - session at `verbose`, `Opened app`
 *     at `info` - which is what made the split look accidental.
 * @param {Function} fn - Async callback receiving the enigma `global` object. Its resolved value
 *     is returned.
 *
 * @returns {Promise<unknown>} Whatever `fn` resolves to.
 *
 * @throws {Error} Whatever `fn` throws, or whatever `enigma.create`, `open()` or a close on an
 *     otherwise successful run throws.
 */
export const withEngineSession = async (configEnigma, ctx, fn) => {
    const { logPrefix, loglevel, connectionLabel, sessionLogLevel = 'verbose' } = ctx;

    // Outside the try: if this throws there is no session to release.
    const session = await enigma.create(configEnigma);

    let result;
    let bodyFailed = false;
    let bodyError;

    // Set immediately before the close below, so the `closed` handler can tell a session we
    // released from one that went away underneath us. See the handler for why enigma cannot
    // tell us that itself.
    let closeRequested = false;

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

        // Only for a close nobody here asked for. `closeRequested` is what makes that true:
        // enigma has two paths to this event and only one of them filters.
        //
        //   - `onRpcClosed`, the socket-died path, returns early on code 1000 and on a manual
        //     suspend. This is the path the guard below was once thought to be unnecessary for.
        //   - `session.close()` ends `this.rpc.close(...).then((evt) => this.emit('closed', evt))`
        //     - unconditional, with the default code 1000. Every deliberate release therefore
        //     emitted this warning, and every healthy run said the session had been closed from
        //     the other end and that whatever used it would now fail. Neither was true: one
        //     warning per session, two per app on the screenshot paths, on runs that worked.
        //
        // Worth a line of its own when it is real, because it fires when the socket dies whereas
        // the error surfaces later - up to 40 s later in the screenshot paths, which use the
        // engine once per sheet and spend the rest of the time in the browser. Issue #975 is
        // that gap: the log showed sheets failing with `Not connected` long after the event, and
        // nothing recorded the close code that would say what closed the connection. A warning
        // that also fires on every success is no use for that.
        session.on('closed', (evt) => {
            if (closeRequested) return;

            logger.warn(
                `${logPrefix}: The engine session to ${connectionLabel} was closed from the other end, code ${evt?.code}${evt?.reason ? `, reason "${evt.reason}"` : ''}. Whatever is still using this session will fail from here on.`
            );
        });

        const global = await session.open();

        const engineVersion = await global.engineVersion();
        logger[sessionLogLevel](
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
        closeRequested = true;
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
