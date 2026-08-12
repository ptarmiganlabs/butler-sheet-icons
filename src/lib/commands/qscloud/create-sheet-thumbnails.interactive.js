import QlikSaas from '../../cloud/cloud-repo.js';
import { qscloudTestConnection } from '../../cloud/cloud-test-connection.js';
import { listCollections, listApps, listAppsByCollection } from '../../cloud/cloud-apps.js';
import { qscloudCreateThumbnails } from '../../cloud/cloud-create-thumbnails.js';
import { gate, gatedBy, inSections, SHEET_FILTER_KEYS } from '../../interactive/spec-ops.js';
import { labelForApp, labelForCollection } from '../../interactive/labels.js';

// Re-exported so a reader following this wizard finds the labels it uses without
// having to know they are shared with the QSEoW twin.
export { labelForApp, labelForCollection };

/** Key of the synthetic question asking how apps should be chosen. */
const APP_SOURCE = '_appSource';

/** Key of the synthetic question gating the sheet exclude/blur filters. */
const FILTERING = '_filtering';

/** Key of the synthetic question gating the long tail of options. */
const ADVANCED = '_advanced';

/** How apps can be picked, in the order the choices are offered. */
export const APP_SOURCES = Object.freeze({
    ALL: 'all',
    COLLECTION: 'collection',
    TYPED: 'typed',
});

/** Questions asked before anything else, in this order. */
const CONNECTION_KEYS = ['tenanturl', 'apikey', 'skipLogin', 'logonuserid', 'logonpwd'];

/** Options that only matter to someone who already knows they need them. */
const ADVANCED_KEYS = [
    'loglevel',
    'schemaversion',
    'pagewait',
    'imagedir',
    'browser',
    'browserVersion',
    'browserPageTimeout',
    'browserCacheDir',
    'headless',
];

/** Which section each question belongs under, in the order the sections run. */
const SECTIONS = [
    ['Connection', CONNECTION_KEYS],
    ['Apps', [APP_SOURCE, 'collectionid', 'appid']],
    ['Sheets', ['includesheetpart']],
    ['Sheet filtering', [FILTERING, ...SHEET_FILTER_KEYS]],
    ['Advanced', [ADVANCED, ...ADVANCED_KEYS]],
];

export default {
    commandPath: 'qscloud create-sheet-thumbnails',
    label: 'Create sheet thumbnails (Qlik Sense Cloud)',

    /**
     * Reshape the derived questions into a conversation.
     *
     * The API key carries a **probe**, so a wrong tenant url or key is reported
     * at the prompt where it was typed rather than after twenty more questions.
     * The probe also stashes the connected client, which is what lets the app and
     * collection questions offer what the tenant actually holds.
     *
     * The **long tail is gated** twice, once for the sheet filters and once for
     * the technical options. Declining both takes this command from 25 options to
     * 10 questions, the single biggest usability lever available.
     *
     * **App selection becomes a picker.** Typing a GUID from memory is the thing
     * this feature exists to remove, so the default is to choose from the apps the
     * tenant actually has, with typing one still available.
     *
     * Pure: specs in, specs out. The network calls live behind `choices` and
     * `probe`, which the driver invokes.
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
                spec.key === 'apikey'
                    ? {
                          ...spec,
                          needs: ['tenanturl'],
                          probe: async (ctx) => {
                              const saas = new QlikSaas({
                                  url: ctx.answers.tenanturl,
                                  token: ctx.answers.apikey,
                              });

                              // Throws on a bad url or key, which is what the
                              // driver turns into a re-ask.
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

        // The derived question unchanged, for anyone who already knows the id.
        const typedApp = {
            ...byKey.appid,
            when: (ctx) => ctx.answers[APP_SOURCE] === APP_SOURCES.TYPED,
        };

        const rest = specs
            .filter(
                (spec) =>
                    !CONNECTION_KEYS.includes(spec.key) &&
                    !['appid', 'collectionid'].includes(spec.key)
            )
            .map(gatedBy(ADVANCED, ADVANCED_KEYS))
            .map(gatedBy(FILTERING, SHEET_FILTER_KEYS));

        return inSections(
            [
                ...connection,
                appSource,
                collection,
                app,
                typedApp,
                gate({ key: FILTERING, message: 'Exclude or blur any sheets?' }),
                gate({
                    key: ADVANCED,
                    message: 'Configure advanced options (schema version, timeouts, browser)?',
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
    run: (options) => qscloudCreateThumbnails(options),
};
