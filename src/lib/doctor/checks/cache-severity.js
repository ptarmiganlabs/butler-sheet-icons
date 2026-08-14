/**
 * Whether a problem with the browser cache actually stopped this run.
 *
 * Shared by every cache check, because getting it wrong in either direction breaks the command's
 * one job. `browser check` is documented as a deployment gate, so:
 *
 * - reporting a cache fault as an **error** when a browser was found and launched anyway fails a
 *   Sense server that works. A leftover build directory from an interrupted install, or an
 *   unreadable cache that a configured `--browser-executable-path` means nothing will ever read,
 *   both produced exactly that - a report saying `Launched: yes` and then `Result: FAILED`;
 * - reporting it as a **warning** when it is the reason nothing could be selected lets a broken
 *   machine pass.
 *
 * Two conditions, and both must hold for it to be a failure: the cache had to be the thing being
 * consulted, and nothing can have been selected in the end. The second is what the checks were
 * missing - they judged the cache's contents in isolation, never asking whether a browser was
 * found regardless.
 *
 * Note this deliberately does not ask *which* build was selected. A run that selected a browser is
 * a run that works, whatever else is lying about in the directory.
 *
 * @param {object} ctx - The check context.
 *
 * @returns {boolean} `true` when the cache problem is why this machine has no browser.
 */
export const failedTheRun = (ctx) => Boolean(ctx.cache.inUse) && !ctx.detection.selection;
