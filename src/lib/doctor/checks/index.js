import { check as environment } from './environment.js';
import { check as browserExecutableOverride } from './browser-executable-override.js';
import { check as browserCachePlatform } from './browser-cache-platform.js';
import { check as browserCacheExecutable } from './browser-cache-executable.js';
import { check as browserSelection } from './browser-selection.js';
import { check as browserLaunch } from './browser-launch.js';

/**
 * The check registry.
 *
 * A flat array, in the order the report reads. **Adding a diagnostic is one new file and one entry
 * here** - no change to the runner, the renderer or any command. That property is the whole point
 * of the contract, and it is the acceptance test for it (§14). Anything that erodes it - a check
 * needing a special case in the runner, a finding needing bespoke formatting - means the contract
 * is wrong, not that the check is special.
 *
 * Order is deliberate and is what the reader sees: the machine first, then how a browser would be
 * found, then whether it runs. A check that would read oddly out of that sequence probably belongs
 * in a different section rather than at a different position.
 *
 * Each import is a literal specifier for the same reason the interactive registry's are: a
 * templated import is not statically analysable, so esbuild would not bundle the target and the
 * failure would appear only inside the packaged binary, on a user's machine.
 */
export const CHECKS = Object.freeze([
    environment,
    browserExecutableOverride,
    browserCachePlatform,
    browserCacheExecutable,
    browserSelection,
    browserLaunch,
]);

/**
 * The registered checks for a set of areas.
 *
 * @param {string[]} areas - Areas to include, e.g. `['environment', 'browser']`.
 *
 * @returns {import('../run-checks.js').Check[]} The matching checks, in registry order.
 */
export const checksForAreas = (areas) => CHECKS.filter((check) => areas.includes(check.area));
