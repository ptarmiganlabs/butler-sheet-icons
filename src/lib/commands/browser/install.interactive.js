import { fetchAvailableVersions } from '../../browser/browser-list-available.js';
import { browserInstall } from '../../browser/browser-install.js';
import { VERSION_RECOMMENDED } from '../../browser/browser-version.js';

/** Pinned entries offered before the published versions. */
export const RECOMMENDED_CHOICE = {
    name: 'Recommended - the build this version of Butler Sheet Icons is tested with',
    value: VERSION_RECOMMENDED,
};

export const STABLE_CHOICE = {
    name: 'Latest stable - whatever the vendor currently publishes',
    value: 'stable',
};

export default {
    commandPath: 'browser install',
    label: 'Install a browser into the cache',

    /**
     * Offer the published versions, newest first, without waiting for the slow check.
     *
     * `browserListAvailable` runs one availability request per version,
     * strictly serially, purely to decide the log level of each printed line -
     * hundreds of round trips before anything appears. The picker uses
     * `fetchAvailableVersions` instead and lets `browserInstall` make the one
     * check that matters, for the version actually chosen.
     *
     * A search rather than a select: nobody scrolls a list of several hundred
     * builds, and everybody can type `151.`.
     *
     * @param {import('../../interactive/option-introspect.js').QuestionSpec[]} specs - Derived questions.
     *
     * @returns {Array} The questions to actually ask.
     */
    refine(specs) {
        const browser = specs.find((spec) => spec.key === 'browser');
        const version = specs.find((spec) => spec.key === 'browserVersion');

        return [
            browser,
            {
                ...version,
                type: 'search',
                message: 'Which build should be installed?',
                needs: ['browser'],
                choices: async ({ answers }) => {
                    const published = await fetchAvailableVersions({
                        browser: answers.browser,
                        channel: 'stable',
                    });

                    return [
                        RECOMMENDED_CHOICE,
                        STABLE_CHOICE,
                        ...published.map((entry) => ({
                            name: entry.version,
                            value: entry.version,
                        })),
                    ];
                },
                // A version list needs the network. Falling back to free text
                // means an offline machine can still install a build whose id
                // the operator already knows.
                fallback: {
                    type: 'input',
                    message: 'Which build should be installed? (version list unavailable)',
                },
            },
        ];
    },

    /**
     * Run the command with the options the wizard produced.
     *
     * @param {object} options - Commander-shaped options bag.
     *
     * @returns {Promise<object>} The installed browser.
     */
    run: (options) => browserInstall(options),
};
