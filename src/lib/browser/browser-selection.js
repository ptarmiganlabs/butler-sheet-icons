/**
 * Which cached build an operation acts on when several of them match.
 *
 * Its own module, with no imports at all, for one reason: the rule has to be shared between
 * `browser uninstall` and the wizard that drives it, and both of those are mocked by
 * `browser_wizards.test.js`. Living in either one would force that suite to stub the rule, and a
 * stub is a second implementation - which is the exact defect this module exists to prevent.
 * Nothing mocks a module that has no behaviour worth faking.
 */

/**
 * The build a removal targets when several platforms share one build id.
 *
 * `browser uninstall` can name only a browser and a build id, and removes one build per run, so
 * something has to choose between the entries that match. Three tiers, narrowest first:
 *
 * 1. Built for exactly this platform - the copy most likely to be the one in use.
 * 2. Failing that, one this machine can run at all: a 32-bit Windows build on 64-bit Windows, or
 *    an Intel macOS build on Apple Silicon. Without this tier the choice fell through to
 *    filesystem order and could land on a build that cannot run here while a runnable copy of the
 *    same id sat beside it - which is not what "prefer the build that can actually run here" ever
 *    meant.
 * 3. Failing that, the first match. Nothing here runs, so any of them will do.
 *
 * The uninstall wizard's picker calls this to name the build the run will choose. A row that
 * describes one build while the run removes another is the defect this rule exists to prevent,
 * and a copy of the expression in the wizard would let the two drift apart silently, since
 * nothing compares them.
 *
 * @param {Array<object>} matches - Inventory entries sharing a browser and build id.
 *
 * @returns {object} The entry to act on.
 */
export const buildToRemove = (matches) =>
    matches.find((build) => build.isCurrentPlatform) ??
    matches.find((build) => build.canRunHere) ??
    matches[0];
