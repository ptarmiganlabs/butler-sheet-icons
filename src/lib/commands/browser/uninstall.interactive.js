import { getBrowserInventory } from '../../browser/browser-inventory.js';
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
 * @param {object} build - An entry from the browser inventory.
 *
 * @returns {string} The label to show.
 */
export const labelForBuild = (build) => {
    const base = `${build.browser}  ${build.buildId}`;

    return build.isCurrentPlatform
        ? `${base}  (${build.platform})`
        : `${base}  (built for ${build.platform} - cannot run here)`;
};

export default {
    commandPath: 'browser uninstall',
    label: 'Uninstall a browser from the cache',

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
                choices: async () => {
                    const inventory = await getBrowserInventory();

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
