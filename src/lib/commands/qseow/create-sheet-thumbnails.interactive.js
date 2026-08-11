import { qseowVerifyCertificatesExist } from '../../qseow/qseow-certificates.js';
import { qseowVerifyContentLibraryExists } from '../../qseow/qseow-contentlibrary.js';
import { listAppsByTag, listAllApps } from '../../qseow/qseow-app-lookup.js';
import { qseowCreateThumbnails } from '../../qseow/qseow-create-thumbnails.js';

/** Key of the synthetic question asking how apps should be chosen. */
const APP_SOURCE = '_appSource';

/** Key of the synthetic question gating the sheet exclude/blur filters. */
const FILTERING = '_filtering';

/** Key of the synthetic question gating the long tail of options. */
const ADVANCED = '_advanced';

/** How apps can be picked, in the order the choices are offered. */
export const APP_SOURCES = Object.freeze({
    ALL: 'all',
    TAG: 'tag',
    TYPED: 'typed',
});

/**
 * Label one app for a picker.
 *
 * Identical in shape to the Cloud wizard's, deliberately: the two platforms
 * describe an app the same way, so the labels must too. App names are **not
 * unique** - three are duplicated on the QSEoW test server alone - so the id is
 * always shown, always marked as an id, and never truncated. Untruncated also
 * means it can be pasted straight into `--appid`.
 *
 * @param {{id: string, name: string}} app - The app to label.
 *
 * @returns {string} The label to show.
 */
export const labelForApp = (app) => `${app.name}  (id: ${app.id})`;

/** Options that pick out particular sheets to skip or blur. */
const FILTER_KEYS = new Set([
    'excludeSheetStatus',
    'excludeSheetTag',
    'excludeSheetNumber',
    'excludeSheetTitle',
    'blurSheetStatus',
    'blurSheetTag',
    'blurSheetNumber',
    'blurSheetTitle',
    'blurFactor',
]);

/**
 * Options that only matter to someone who already knows they need them.
 *
 * Larger than the Cloud set because QSEoW carries the ports, the TLS switches and
 * the virtual proxy prefix as well. All twelve have defaults that work against a
 * stock installation, which is what makes gating them safe rather than merely
 * convenient.
 */
const ADVANCED_KEYS = new Set([
    'loglevel',
    'engineport',
    'qrsport',
    'port',
    'schemaversion',
    'rejectUnauthorized',
    'secure',
    'prefix',
    'headless',
    'pagewait',
    'imagedir',
    'senseVersion',
    'browser',
    'browserVersion',
    'browserPageTimeout',
]);

/** Which section each question belongs under, in the order the sections run. */
const GROUPS = [
    [
        'Connection',
        [
            'host',
            'certfile',
            'certkeyfile',
            'apiuserdir',
            'apiuserid',
            'logonuserdir',
            'logonuserid',
            'logonpwd',
        ],
    ],
    ['Apps', [APP_SOURCE, 'qliksensetag', 'appid']],
    ['Sheets', ['includesheetpart', 'contentlibrary']],
    ['Sheet filtering', [FILTERING, ...FILTER_KEYS]],
    ['Advanced', [ADVANCED, ...ADVANCED_KEYS]],
];

/** Questions asked before anything else, in this order. */
const CONNECTION_KEYS = GROUPS[0][1];

/**
 * Work out which section a question belongs to.
 *
 * @param {string} key - The question's key.
 *
 * @returns {string|undefined} The section heading, if the key has one.
 */
const groupFor = (key) => GROUPS.find(([, keys]) => [...keys].includes(key))?.[0];

/**
 * Order questions by section, keeping declaration order within each one.
 *
 * @param {Array} specs - Questions to order.
 *
 * @returns {Array} The same questions, grouped.
 */
const bySection = (specs) => {
    const order = GROUPS.map(([name]) => name);

    return [...specs].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
};

export default {
    commandPath: 'qseow create-sheet-thumbnails',
    label: 'Create sheet thumbnails (Qlik Sense Enterprise on Windows)',

    /**
     * Reshape the derived questions into a conversation.
     *
     * The QSEoW twin of the Cloud wizard, and deliberately the same shape: two
     * gates, an app picker, and a probe that reports a bad answer where it was
     * given. Where it differs is what can go wrong first.
     *
     * QSEoW authenticates with **certificate files on disk**, so the first thing
     * that can be wrong is a path - and `qseowVerifyCertificatesExist()` says so
     * at the certificate prompt rather than after the credentials, the app
     * selection and everything else have been answered. The content library is
     * checked the same way, because a missing one aborts the run after every
     * screenshot has already been taken.
     *
     * This command declares 36 options, the most in the CLI, which is what makes
     * the gating matter more here than anywhere else.
     *
     * Pure: specs in, specs out. The network and filesystem calls live behind
     * `choices` and `probe`, which the driver invokes.
     *
     * @param {import('../../interactive/option-introspect.js').QuestionSpec[]} specs - Derived questions.
     *
     * @returns {Array} The questions to actually ask.
     */
    refine(specs) {
        const byKey = Object.fromEntries(specs.map((spec) => [spec.key, spec]));

        const connection = CONNECTION_KEYS.map((key) => byKey[key])
            .filter(Boolean)
            .map((spec) =>
                spec.key === 'certkeyfile'
                    ? {
                          ...spec,
                          needs: ['certfile'],
                          probe: async (ctx) => {
                              const ok = await qseowVerifyCertificatesExist(ctx.answers);

                              if (!ok) {
                                  // The helper logs which file is missing; this
                                  // is what the prompt itself shows.
                                  throw new Error(
                                      'Certificate file(s) not found. Check --certfile and --certkeyfile.'
                                  );
                              }
                          },
                      }
                    : spec
            );

        const appSource = {
            key: APP_SOURCE,
            type: 'select',
            message: 'Which apps should be updated?',
            required: true,
            variadic: false,
            secret: false,
            needs: ['logonpwd'],
            choices: [
                { name: 'Choose from all apps on the server', value: APP_SOURCES.ALL },
                { name: 'Choose a tag, then apps carrying it', value: APP_SOURCES.TAG },
                { name: 'Type an app id', value: APP_SOURCES.TYPED },
            ],
        };

        const tag = {
            ...byKey.qliksensetag,
            needs: [APP_SOURCE],
            when: (ctx) => ctx.answers[APP_SOURCE] === APP_SOURCES.TAG,
        };

        const app = {
            ...byKey.appid,
            type: 'checkbox',
            message: 'Which apps?',
            needs: [APP_SOURCE],
            when: (ctx) => ctx.answers[APP_SOURCE] !== APP_SOURCES.TYPED,
            choices: async (ctx) => {
                const apps =
                    ctx.answers[APP_SOURCE] === APP_SOURCES.TAG
                        ? await listAppsByTag(ctx.answers)
                        : await listAllApps(ctx.answers);

                return apps.map((entry) => ({ name: labelForApp(entry), value: entry.id }));
            },
            fallback: { type: 'list', message: 'App id(s) (could not fetch the list)' },
        };

        const typedApp = {
            ...byKey.appid,
            key: 'appid',
            when: (ctx) => ctx.answers[APP_SOURCE] === APP_SOURCES.TYPED,
        };

        const contentLibrary = {
            ...byKey.contentlibrary,
            probe: async (ctx) => {
                const exists = await qseowVerifyContentLibraryExists(ctx.answers);

                if (!exists) {
                    throw new Error(
                        `Content library '${ctx.answers.contentlibrary}' does not exist on ${ctx.answers.host}.`
                    );
                }
            },
        };

        const filteringGate = {
            key: FILTERING,
            type: 'confirm',
            message: 'Exclude or blur any sheets?',
            default: false,
            required: false,
            variadic: false,
            secret: false,
        };

        const advancedGate = {
            key: ADVANCED,
            type: 'confirm',
            message: 'Configure advanced options (ports, certificates, schema version, browser)?',
            default: false,
            required: false,
            variadic: false,
            secret: false,
        };

        const rest = specs.filter(
            (spec) =>
                !CONNECTION_KEYS.includes(spec.key) &&
                !['appid', 'qliksensetag', 'contentlibrary'].includes(spec.key)
        );

        const gated = rest.map((spec) => {
            if (ADVANCED_KEYS.has(spec.key)) {
                return { ...spec, when: (ctx) => ctx.answers[ADVANCED] === true };
            }

            if (FILTER_KEYS.has(spec.key)) {
                return { ...spec, when: (ctx) => ctx.answers[FILTERING] === true };
            }

            return spec;
        });

        return bySection(
            [
                ...connection,
                appSource,
                tag,
                app,
                typedApp,
                contentLibrary,
                filteringGate,
                advancedGate,
                ...gated,
            ].map((spec) => ({ ...spec, group: spec.group ?? groupFor(spec.key) }))
        );
    },

    /**
     * Run the command with the options the wizard produced.
     *
     * @param {object} options - Commander-shaped options bag.
     *
     * @returns {Promise<boolean>} Whether the run succeeded.
     */
    run: (options) => qseowCreateThumbnails(options),
};
