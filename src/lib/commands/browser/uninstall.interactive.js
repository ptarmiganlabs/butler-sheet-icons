import { getBrowserInventory } from '../../browser/browser-inventory.js';
import { resolveBrowserCacheDir } from '../../browser/browser-paths.js';
import { browserUninstall } from '../../browser/browser-uninstall.js';

/** Key of the synthetic question that replaces the browser/version pair. */
const BUILD = '_build';

/**
 * Label one cached build for the picker.
 *
 * The platform is only worth naming when it is the reason a build cannot run
 * here. Repeating "mac_arm" against every row on a Mac is noise; saying it
 * against the one row that came from somewhere else is the whole point.
 *
 * Keyed on `canRunHere`, not `isCurrentPlatform`, because the claim being made
 * is about running the build. Those two differ: 64-bit Windows runs 32-bit
 * builds, and Apple Silicon runs Intel ones under Rosetta. Keying on the
 * narrower field told a Windows administrator that the `win32` build in their
 * cache "cannot run here" while browser detection was perfectly willing to use
 * it - the picker and the run disagreeing about the same build.
 *
 * @param {object} build - An entry from the browser inventory.
 *
 * @returns {string} The label to show.
 */
export const labelForBuild = (build) => {
    const base = `${build.browser}  ${build.buildId}`;

    return build.canRunHere
        ? `${base}  (${build.platform})`
        : `${base}  (built for ${build.platform} - cannot run here)`;
};

export default {
    commandPath: 'browser uninstall',
    label: 'Uninstall a browser from the cache',

    /**
     * Decline to run at all when the cache is empty.
     *
     * An empty cache is not a lookup that went wrong, it is a command with
     * nothing to do - and the generic empty-list handling cannot tell the two
     * apart. Left to it, the wizard offers the free-text fallback below, whose
     * prompt is `--browser-version`'s own help text, and no answer to it can
     * succeed: every one of them ends in "Browser not found in cache"
     * (issue #1013).
     *
     * `browser list-installed` already answers this question correctly on the
     * same machine, and says so in one line. This says the same thing.
     *
     * @param {object} [context] - What the command line and environment already supplied.
     * @param {object} [context.answers] - Those values, keyed by option name.
     *
     * @returns {Promise<{reason: string}|undefined>} A reason to stop, or `undefined` to carry on.
     */
    async precheck({ answers } = {}) {
        let inventory;

        try {
            // The same cache the command itself would use. Looking in the default
            // location while `--browser-cache-dir` names another one would declare
            // there is nothing to uninstall when there plainly is.
            inventory = await getBrowserInventory({ cacheDir: resolveBrowserCacheDir(answers) });
        } catch {
            // "Not found" and "found but unusable" are different answers and
            // must not share one. A cache that cannot be read is not an empty
            // cache, so this carries on and lets the question's own fallback
            // offer a typed build id - which is the whole point of that
            // fallback, and how an operator recovers.
            return undefined;
        }

        if (inventory.length > 0) {
            return undefined;
        }

        return {
            reason: 'No browsers installed, so there is nothing to uninstall. Use "butler-sheet-icons browser install" to install one.',
        };
    },

    /**
     * Ask which installed build to remove, rather than for a version from memory.
     *
     * Today this command takes `--browser` and `--browser-version`, both
     * mandatory, and the version has to be typed exactly. Nothing tells you
     * what is actually installed. One picker over the real cache replaces both
     * questions and makes a wrong answer impossible to give.
     *
     * A select rather than a checkbox: the command removes one build per
     * invocation, so a multi-select would mean several runs behind one
     * confirmation and several different "equivalent commands" - which is
     * exactly what the echoed line is supposed to make honest.
     *
     * @param {import('../../interactive/option-introspect.js').QuestionSpec[]} specs - Derived questions.
     *
     * @returns {Array} The questions to actually ask.
     */
    refine(specs) {
        const version = specs.find((spec) => spec.key === 'browserVersion');

        return [
            {
                key: BUILD,
                type: 'select',
                message: 'Which browser build should be removed?',
                required: true,
                variadic: false,
                secret: false,
                // This one question collects both of these, so a value already
                // supplied for either is not "not asked about again" - it is
                // asked about under another name, and overwritten by the
                // answer. Without saying so, the wizard announced that
                // --browser-version would be skipped and then asked for it
                // (issue #1013).
                replaces: ['browser', 'browserVersion'],
                choices: async ({ answers }) => {
                    const inventory = await getBrowserInventory({
                        cacheDir: resolveBrowserCacheDir(answers),
                    });

                    // Builds for other platforms stay selectable on purpose:
                    // wanting the disk space back is a perfectly good reason to
                    // remove a browser you cannot run.
                    return inventory.map((build) => ({
                        name: labelForBuild(build),
                        value: { browser: build.browser, buildId: build.buildId },
                    }));
                },
                fallback: {
                    type: 'input',
                    message: version?.message ?? 'Which build should be removed?',
                },
            },
        ];
    },

    /**
     * Map the picked build back onto the options the command expects.
     *
     * @param {object} answers - Answers from the wizard.
     *
     * @returns {object} Answers keyed by real option name.
     */
    finalize(answers) {
        const picked = answers[BUILD];

        // The fallback question answers with free text rather than a build.
        if (typeof picked === 'string') {
            return { browserVersion: picked };
        }

        return { browser: picked?.browser, browserVersion: picked?.buildId };
    },

    /**
     * Run the command with the options the wizard produced.
     *
     * @param {object} options - Commander-shaped options bag.
     *
     * @returns {Promise<boolean>} Whether the uninstall succeeded.
     */
    run: (options) => browserUninstall(options),
};
