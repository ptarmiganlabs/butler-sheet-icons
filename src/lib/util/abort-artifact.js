/**
 * Tells an error the shutdown caused from one it merely interrupted.
 *
 * Shutdown works by breaking things on purpose: the browser is closed under
 * the run and pending sleeps are aborted, so whatever the run was awaiting
 * rejects. Those rejections arrive in the same `catch` blocks a genuine
 * failure does, and for a while the code told them apart by asking only
 * whether a signal had been received - which quietly meant "any error
 * unwinding when the signal landed was the signal's doing".
 *
 * That is wrong in the case that matters. An app failing on a real server
 * error at the moment `docker stop` arrives was filed as abandoned rather than
 * failed, dropped out of the verdict's failure count, and lost its error line
 * and cause chain - so a run could end with a real defect that left no trace
 * anywhere in the output. Deciding per error rather than per run is what fixes
 * it (issue #1107).
 *
 * Recognition is by shape, matching what the two teardown mechanisms actually
 * produce. That is the same approach - and the same trade - as
 * `isSessionLevelFailure` in `sheet-list.js`, which this deliberately mirrors
 * rather than reinventing: a message can always be worded differently by a
 * future dependency, and the failure mode of a miss is a shutdown that reports
 * an abandoned app as failed. Noisy, but never silent, which is the direction
 * to be wrong in.
 */

/**
 * Message fragments produced by closing the browser out from under a page.
 *
 * Puppeteer rejects every pending protocol call when its connection goes, and
 * these are the wordings it uses. Lower-cased before matching.
 */
const ABORT_MESSAGE_FRAGMENTS = [
    'target closed',
    'session closed',
    'protocol error',
    'browser has disconnected',
    'connection closed',
    'the operation was aborted',
];

/**
 * Reports whether an error is one the shutdown itself produced.
 *
 * @param {Error|unknown} err - The error to classify.
 *
 * @returns {boolean} `true` when this error looks like teardown fallout rather
 *     than a genuine failure.
 */
export const isAbortArtifact = (err) => {
    // What `sleep()` rejects with once the interrupt controller fires. Exact,
    // not a guess: this one is a real type, set by Node.
    if (err?.name === 'AbortError' || err?.code === 'ABORT_ERR') {
        return true;
    }

    const message = typeof err?.message === 'string' ? err.message.toLowerCase() : '';

    if (ABORT_MESSAGE_FRAGMENTS.some((fragment) => message.includes(fragment))) {
        return true;
    }

    // Errors are wrapped as they travel up - the processors rethrow through
    // typed platform errors with the original attached - so the shape has to be
    // looked for down the chain too, not only at the top.
    return err?.cause ? isAbortArtifact(err.cause) : false;
};
