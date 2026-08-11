import QlikSaas from '../../cloud/cloud-repo.js';
import { qscloudTestConnection } from '../../cloud/cloud-test-connection.js';
import { listCollections, listApps, listAppsByCollection } from '../../cloud/cloud-apps.js';
import { qscloudCreateThumbnails } from '../../cloud/cloud-create-thumbnails.js';

/** Key of the synthetic question asking how apps should be chosen. */
const APP_SOURCE = '_appSource';

/** Key of the synthetic question gating the long tail of options. */
const ADVANCED = '_advanced';

/** Key of the synthetic question gating the sheet exclude/blur filters. */
const FILTERING = '_filtering';

/**
 * Options that pick out particular sheets to skip or blur.
 *
 * Gated as a block behind one question. They are eight of this command's
 * twenty-five options and most runs use none of them - the common case is "every
 * sheet in the app" - so asking about each one individually is what turns a
 * short conversation into a long one.
 */
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

/** How apps can be picked, in the order the choices are offered. */
export const APP_SOURCES = Object.freeze({
    ALL: 'all',
    COLLECTION: 'collection',
    TYPED: 'typed',
});

/**
 * Label one app for a picker.
 *
 * The id is always shown, never truncated, and always marked as an id. App names
 * are **not unique** - two apps on the same tenant may legitimately share one,
 * and duplicates exist in practice - so a label showing the name alone is
 * ambiguous to the person choosing even though the value behind it is not.
 * Showing the full id also means it can be pasted straight into `--appid`, which
 * is the point of echoing the equivalent command line at the end.
 *
 * @param {{id: string, name: string}} app - The app to label.
 *
 * @returns {string} The label to show.
 */
export const labelForApp = (app) => `${app.name}  (id: ${app.id})`;

/**
 * Label one collection for a picker.
 *
 * The item count is worth showing because an empty collection is a dead end, and
 * seeing "0 items" before choosing it is better than a run that selects nothing.
 *
 * @param {object} collection - A collection as the tenant reported it.
 *
 * @returns {string} The label to show.
 */
export const labelForCollection = (collection) =>
    `${collection.name}  (${collection.itemCount ?? 0} items)`;

/** Options that only matter to someone who already knows they need them. */
const ADVANCED_KEYS = new Set([
    'schemaversion',
    'pagewait',
    'imagedir',
    'browser',
    'browserVersion',
    'browserPageTimeout',
    'headless',
    'loglevel',
]);

/** Which section each question belongs under, in the order the sections run. */
const GROUPS = [
    ['Connection', ['tenanturl', 'apikey', 'skipLogin', 'logonuserid', 'logonpwd']],
    ['Apps', [APP_SOURCE, 'collectionid', 'appid']],
    ['Sheets', ['includesheetpart']],
    ['Sheet filtering', [FILTERING, ...FILTER_KEYS]],
    ['Advanced', [ADVANCED, ...ADVANCED_KEYS]],
];

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
    commandPath: 'qscloud create-sheet-thumbnails',
    label: 'Create sheet thumbnails (Qlik Sense Cloud)',

    /**
     * Reshape the derived questions into a conversation.
     *
     * Three things happen here, in rough order of how much they matter.
     *
     * The API key carries a **probe**, so a wrong tenant url or key is reported
     * at the prompt where it was typed rather than after twenty more questions.
     * The probe also stashes the connected client, which is what lets the app
     * and collection questions offer what is actually on the tenant.
     *
     * The **long tail is gated** behind one question. Answering "no" to advanced
     * options takes this command from 25 questions to about 9, which is the
     * single biggest usability lever available - no amount of styling fixes a
     * flat list of 25.
     *
     * **App selection becomes a picker.** Typing a GUID from memory is the thing
     * this feature exists to remove, so the default is to choose from the apps
     * the tenant actually has, with typing one still available for anyone who
     * has the id to hand.
     *
     * Pure: specs in, specs out, no I/O. The network calls all live behind
     * `choices` and `probe`, which the driver invokes.
     *
     * @param {import('../../interactive/option-introspect.js').QuestionSpec[]} specs - Derived questions.
     *
     * @returns {Array} The questions to actually ask.
     */
    refine(specs) {
        const byKey = Object.fromEntries(specs.map((spec) => [spec.key, spec]));

        const connection = ['tenanturl', 'apikey', 'skipLogin', 'logonuserid', 'logonpwd']
            .map((key) => byKey[key])
            .filter(Boolean)
            .map((spec) =>
                spec.key === 'apikey'
                    ? {
                          ...spec,
                          needs: ['tenanturl'],
                          probe: async (ctx) => {
                              const saas = new QlikSaas({
                                  url: ctx.answers.tenanturl,
                                  token: ctx.answers.apikey,
                              });

                              // Throws on a bad url or key, which is exactly
                              // what the driver turns into a re-ask.
                              await qscloudTestConnection(
                                  { tenanturl: ctx.answers.tenanturl },
                                  saas
                              );

                              ctx.clients = { ...ctx.clients, tenant: saas };
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
            needs: ['apikey'],
            choices: [
                { name: 'Choose from all apps on the tenant', value: APP_SOURCES.ALL },
                { name: 'Choose a collection, then apps within it', value: APP_SOURCES.COLLECTION },
                { name: 'Type an app id', value: APP_SOURCES.TYPED },
            ],
        };

        const collection = {
            ...byKey.collectionid,
            type: 'select',
            message: 'Which collection?',
            needs: [APP_SOURCE],
            when: (ctx) => ctx.answers[APP_SOURCE] === APP_SOURCES.COLLECTION,
            choices: async (ctx) => {
                const collections = await listCollections(ctx.clients.tenant);

                return collections.map((entry) => ({
                    name: labelForCollection(entry),
                    value: entry.id,
                }));
            },
            fallback: { type: 'input', message: 'Collection id (could not fetch the list)' },
        };

        const app = {
            ...byKey.appid,
            type: 'checkbox',
            message: 'Which apps?',
            needs: [APP_SOURCE],
            // Typing an id stays possible, so this is the derived question
            // unchanged for anyone who already knows the id.
            when: (ctx) => ctx.answers[APP_SOURCE] !== APP_SOURCES.TYPED,
            choices: async (ctx) => {
                const apps =
                    ctx.answers[APP_SOURCE] === APP_SOURCES.COLLECTION
                        ? await listAppsByCollection(ctx.clients.tenant, ctx.answers.collectionid)
                        : await listApps(ctx.clients.tenant);

                return apps.map((entry) => ({ name: labelForApp(entry), value: entry.id }));
            },
            fallback: { type: 'list', message: 'App id(s) (could not fetch the list)' },
        };

        const typedApp = {
            ...byKey.appid,
            key: 'appid',
            when: (ctx) => ctx.answers[APP_SOURCE] === APP_SOURCES.TYPED,
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
            message: 'Configure advanced options (ports, schema version, timeouts, browser)?',
            default: false,
            required: false,
            variadic: false,
            secret: false,
        };

        const rest = specs.filter(
            (spec) =>
                !['tenanturl', 'apikey', 'skipLogin', 'logonuserid', 'logonpwd'].includes(
                    spec.key
                ) &&
                spec.key !== 'appid' &&
                spec.key !== 'collectionid'
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
                collection,
                app,
                typedApp,
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
    run: (options) => qscloudCreateThumbnails(options),
};
