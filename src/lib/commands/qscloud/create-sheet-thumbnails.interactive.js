import QlikSaas from '../../cloud/cloud-repo.js';
import { qscloudTestConnection } from '../../cloud/cloud-test-connection.js';
import { listCollections, listApps, listAppsByCollection } from '../../cloud/cloud-apps.js';
import { qscloudCreateThumbnails } from '../../cloud/cloud-create-thumbnails.js';
import {
    gate,
    gatedBy,
    inSections,
    openingOn,
    isSupplied,
    appSourceQuestion,
    appPickerQuestion,
    typedAppQuestion,
    resolvesToApps,
    markPerRun,
    APP_SOURCE,
    APP_SOURCES,
    SHEET_FILTER_KEYS,
} from '../../interactive/spec-ops.js';
import { labelForApp, labelForCollection } from '../../interactive/labels.js';

// Re-exported so a reader following this wizard finds the labels and the route
// vocabulary it uses without having to know they are shared with the QSEoW twin.
export { labelForApp, labelForCollection, APP_SOURCES };

/** Key of the synthetic question gating the sheet exclude/blur filters. */
const FILTERING = '_filtering';

/** Key of the synthetic question gating the long tail of options. */
const ADVANCED = '_advanced';

/** What the collection route is called wherever it has to be named in a sentence. */
const GROUPING_LABEL = 'a collection';

/** Questions asked before anything else, in this order. */
const CONNECTION_KEYS = ['tenanturl', 'apikey', 'skipLogin', 'logonuserid', 'logonpwd'];

/** Options that only matter to someone who already knows they need them. */
const ADVANCED_KEYS = [
    'loglevel',
    'schemaversion',
    'pagewait',
    'imagedir',
    'captureOverviewAfter',
    'browser',
    'browserVersion',
    'browserPageTimeout',
    'browserCacheDir',
    'browserExecutablePath',
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
     * @param {object} [context] - What the command line and environment already supplied.
     * @param {object} [context.answers] - Those values, keyed by option name. Used as the starting
     *     point for the app and collection questions, which are asked again rather than skipped.
     *
     * @returns {Array} The questions to actually ask.
     */
    refine(specs, { answers = {} } = {}) {
        const byKey = Object.fromEntries(specs.map((spec) => [spec.key, spec]));

        const connection = CONNECTION_KEYS.map((key) => byKey[key])
            .filter(Boolean)
            .map((spec) =>
                spec.key === 'apikey'
                    ? {
                          ...spec,
                          needs: ['tenanturl'],
                          // The connection test proves both: a wrong tenant url
                          // fails the request outright, a wrong key fails it with
                          // a 401. So a passing check has confirmed the url as
                          // surely as the key, and says so.
                          checks: ['tenanturl', 'apikey'],
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

        const appSource = appSourceQuestion({
            needs: ['apikey'],
            groupingKey: 'collectionid',
            groupingChoice: 'Update every app in a collection',
        });

        // A collection is not an alternative to naming apps, it is a second way
        // of naming them: the run covers everything --appid names *and* every
        // app in the collection. So a collection that is already set changes
        // what the run does no matter which route is taken here, and hiding it
        // behind the collection route would let it add apps the operator was
        // never shown.
        const collection = {
            ...openingOn(
                {
                    ...byKey.collectionid,
                    type: 'select',
                    message: 'Which collection?',
                    hint: 'Every app in it is updated, on top of any apps named below.',
                },
                answers.collectionid
            ),
            needs: [APP_SOURCE],
            // Asked on the collection route because that is how apps are being
            // chosen there - and on every other route when a collection was
            // already supplied, because it still applies there and the banner
            // has just promised it would be asked about rather than skipped.
            when: (ctx) =>
                ctx.answers[APP_SOURCE] === APP_SOURCES.GROUPED || isSupplied(answers.collectionid),
            choices: async (ctx) => {
                const collections = await listCollections(ctx.clients.tenant);
                const picked = collections.map((entry) => ({
                    name: labelForCollection(entry),
                    value: entry.id,
                }));

                // Off the collection route this question exists only because a
                // collection was already supplied, so "I do not want it after
                // all" has to be expressible. A select with no such choice would
                // make a supplied collection impossible to drop. On the
                // collection route it is how apps are being chosen, so there is
                // nothing for "none" to mean.
                return ctx.answers[APP_SOURCE] === APP_SOURCES.GROUPED
                    ? picked
                    : [{ name: 'None - do not add a collection', value: '' }, ...picked];
            },
            probe: resolvesToApps({
                groupingKey: 'collectionid',
                resolve: (ctx) =>
                    listAppsByCollection(ctx.clients.tenant, ctx.answers.collectionid),
                whenEmpty: (value) => `Collection '${value}' holds no apps.`,
                whenFound: (count, value) =>
                    `${count} app(s) are in collection '${value}' and will be updated.`,
            }),
            fallback: { type: 'input', message: 'Collection id (could not fetch the list)' },
        };

        const app = appPickerQuestion({
            spec: byKey.appid,
            supplied: answers.appid,
            groupingKey: 'collectionid',
            groupingLabel: GROUPING_LABEL,
            listApps: (ctx) => listApps(ctx.clients.tenant),
            label: labelForApp,
        });

        // The derived question unchanged, for anyone who already knows the id.
        const typedApp = typedAppQuestion({
            spec: byKey.appid,
            supplied: answers.appid,
            groupingKey: 'collectionid',
            groupingLabel: GROUPING_LABEL,
        });

        const rest = specs
            .filter(
                (spec) =>
                    !CONNECTION_KEYS.includes(spec.key) &&
                    !['appid', 'collectionid'].includes(spec.key)
            )
            // Both gates get what was already supplied, not just the filters.
            // A gate that does not know cannot show a supplied value, and a
            // per-run option inside a gated block would then be announced as
            // asked about and never asked - the exact defect this wizard was
            // rewritten to remove, re-armed by nothing more than moving a key
            // into PER_RUN_KEYS.
            .map(gatedBy(ADVANCED, ADVANCED_KEYS, answers))
            .map(gatedBy(FILTERING, SHEET_FILTER_KEYS, answers));

        // markPerRun last, over everything: PER_RUN_KEYS in spec-ops.js is the
        // one statement of which options describe this run rather than this
        // environment, and applying it here means no question can be left out
        // of the classification by being built somewhere else in this file.
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
            ].map(markPerRun),
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
