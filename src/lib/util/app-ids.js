/**
 * Normalise whatever `options.appid` holds into a list of app ids.
 *
 * `--appid` is variadic, so Commander always stores an array and the workers could in
 * principle spread it directly. They do not, for one specific reason: **a string is
 * iterable**. `appIdsToProcess.push(...'test-app-id')` does not throw - it pushes eleven
 * single-character app ids, and the run then fails eleven times over ids that were never
 * asked for. Anything still holding the pre-#895 string shape would fail that way,
 * silently and confusingly, rather than loudly.
 *
 * So this is a boundary guard, not a second parsing rule. The splitting and trimming of
 * user input belongs to `collectAppIds` in `src/lib/commands/helpers.js`; all this does is
 * make the wrong shape safe.
 *
 * An empty array is deliberately not special-cased: `[]` is truthy, which is why the
 * `if (options.appid)` guards that used to wrap these pushes stopped meaning anything the
 * moment the option became variadic, and were removed rather than left to read like
 * checks.
 *
 * @param {string[]|string|undefined} appid - The `appid` option, in any shape it has ever had.
 *
 * @returns {string[]} App ids to process, empty when none were supplied.
 */
export const toAppIdList = (appid) => {
    if (Array.isArray(appid)) {
        return appid;
    }

    if (typeof appid === 'string' && appid.trim().length > 0) {
        return [appid.trim()];
    }

    return [];
};
