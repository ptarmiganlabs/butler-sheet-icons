import { qseowVerifyCertificatesExist } from '../../qseow/qseow-certificates.js';
import { qseowVerifyContentLibraryExists } from '../../qseow/qseow-contentlibrary.js';
import { listAppsByTag, listAllApps } from '../../qseow/qseow-app-lookup.js';
import { qseowCreateThumbnails } from '../../qseow/qseow-create-thumbnails.js';
import { gate, gatedBy, inSections, SHEET_FILTER_KEYS } from '../../interactive/spec-ops.js';
import { labelForApp } from '../../interactive/labels.js';

// Re-exported so a reader following this wizard finds the label it uses without
// having to know it is shared with the Cloud twin.
export { labelForApp };

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

/** Questions asked before anything else, in this order. */
const CONNECTION_KEYS = [
    'host',
    'certfile',
    'certkeyfile',
    'apiuserdir',
    'apiuserid',
    'logonuserdir',
    'logonuserid',
    'logonpwd',
];

/**
 * Options that only matter to someone who already knows they need them.
 *
 * Larger than the Cloud set because QSEoW carries the ports, the TLS switches and
 * the virtual proxy prefix as well. All of them have defaults that work against a
 * stock installation, which is what makes gating them safe rather than merely
 * convenient.
 */
const ADVANCED_KEYS = [
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
];

/** Which section each question belongs under, in the order the sections run. */
const SECTIONS = [
    ['Connection', CONNECTION_KEYS],
    ['Apps', [APP_SOURCE, 'qliksensetag', 'appid']],
    ['Sheets', ['contentlibrary', 'includesheetpart']],
    ['Sheet filtering', [FILTERING, ...SHEET_FILTER_KEYS]],
    ['Advanced', [ADVANCED, ...ADVANCED_KEYS]],
];

export default {
    commandPath: 'qseow create-sheet-thumbnails',
    label: 'Create sheet thumbnails (Qlik Sense Enterprise on Windows)',

    /**
     * Reshape the derived questions into a conversation.
     *
     * The QSEoW twin of the Cloud wizard, and deliberately the same shape: two
     * gates, an app picker, and probes that report a bad answer where it was
     * given. Both are built from the same helpers in `spec-ops.js`, so the two
     * conversations cannot drift apart in structure - only in the parts that are
     * genuinely different between the platforms.
     *
     * What differs is what can be wrong first. QSEoW authenticates with
     * **certificate files on disk**, so the first thing that can be wrong is a
     * path - and `qseowVerifyCertificatesExist()` says so at the certificate
     * prompt rather than after the credentials, the app selection and everything
     * else have been answered. The content library is checked the same way,
     * because a missing one aborts the run after every screenshot has already
     * been taken.
     *
     * This command declares 36 options, the most in the CLI, which is what makes
     * the gating matter more here than anywhere else: both gates declined, it
     * asks 14 questions.
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

        // The derived question unchanged, for anyone who already knows the id.
        const typedApp = {
            ...byKey.appid,
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

        const rest = specs
            .filter(
                (spec) =>
                    !CONNECTION_KEYS.includes(spec.key) &&
                    !['appid', 'qliksensetag', 'contentlibrary'].includes(spec.key)
            )
            .map(gatedBy(ADVANCED, ADVANCED_KEYS))
            .map(gatedBy(FILTERING, SHEET_FILTER_KEYS));

        return inSections(
            [
                ...connection,
                appSource,
                tag,
                app,
                typedApp,
                contentLibrary,
                gate({ key: FILTERING, message: 'Exclude or blur any sheets?' }),
                gate({
                    key: ADVANCED,
                    message:
                        'Configure advanced options (ports, certificates, schema version, browser)?',
                }),
                ...rest,
            ],
            SECTIONS
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
