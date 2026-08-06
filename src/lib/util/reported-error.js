/**
 * Marker for errors whose cause has already been explained to the user.
 *
 * Butler Sheet Icons layers several `catch` blocks over the same failure: a module that knows why
 * something failed, then the command handler that invoked it. Without a way to tell that the
 * cause has already been reported, each layer logs its own version and the operator ends up with
 * the same failure described three or four times, usually with a stack trace attached. That is
 * what made an offline `browser list-available` run unreadable in issue #785.
 *
 * The pattern is: whichever layer can actually explain the failure logs a useful message and
 * calls `markReported(err)`. Outer layers call `alreadyReported(err)` and stay quiet when it is
 * true, letting the error propagate without re-describing it.
 */

/**
 * Symbol used to tag an error as already explained.
 *
 * A Symbol rather than a plain property so the marker never appears in `JSON.stringify` output,
 * in `Object.keys`, or anywhere else that enumerates an error's own properties.
 */
const FAILURE_REPORTED = Symbol('butler-sheet-icons.failureReported');

/**
 * Records that a failure has been explained to the user, so outer handlers do not repeat it.
 *
 * Values that cannot carry a property (strings, numbers, `null`) are ignored rather than throwing,
 * since a `catch` block cannot assume it was handed an `Error`.
 *
 * @param {Error|unknown} err - The error to mark.
 *
 * @returns {Error|unknown} The same value, for convenient use in `throw markReported(err)`.
 */
export function markReported(err) {
    if (err && typeof err === 'object' && Object.isExtensible(err)) {
        err[FAILURE_REPORTED] = true;
    }

    return err;
}

/**
 * Reports whether a more specific handler has already explained this failure.
 *
 * @param {Error|unknown} err - The error to test.
 *
 * @returns {boolean} `true` when the failure has already been logged for the user.
 */
export function alreadyReported(err) {
    return Boolean(err && typeof err === 'object' && err[FAILURE_REPORTED]);
}
