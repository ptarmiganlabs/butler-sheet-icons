import { getLoggingLevel, setLoggingLevel } from '../../globals.js';

/**
 * Run something with the console logger held quiet.
 *
 * The console transport and the prompts write to the same stream, and
 * `@inquirer` redraws its current line as the user types. A `logger.info` firing
 * mid-prompt therefore lands in the middle of a redraw and corrupts it. Rather
 * than trying to interleave the two, they are kept from overlapping at all.
 *
 * This is needed because live-data fetches during a wizard call worker code
 * that logs - listing installed browsers, fetching versions - and that code has
 * no idea a prompt is on screen.
 *
 * Pin-and-restore only, deliberately. Capturing suppressed output and replaying
 * it afterwards is worth doing when the fetches are long and chatty, which is
 * phase 2's Qlik connections; for phase 1 it would be machinery with nothing to
 * carry. The level is restored in a `finally`, so a throwing fetch cannot leave
 * the logger muted for the rest of the run.
 *
 * @template T
 * @param {() => Promise<T>|T} fn - The work to run quietly.
 * @param {object} [options] - Options.
 * @param {string} [options.level] - Level to hold the console at. Defaults to `error`.
 *
 * @returns {Promise<T>} Whatever `fn` returned.
 */
export const withQuietLogging = async (fn, { level = 'error' } = {}) => {
    const previous = getLoggingLevel();

    setLoggingLevel(level);

    try {
        return await fn();
    } finally {
        setLoggingLevel(previous);
    }
};
