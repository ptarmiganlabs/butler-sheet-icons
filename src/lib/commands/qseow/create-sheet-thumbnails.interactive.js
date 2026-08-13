import { qseowVerifyCertificatesExist } from '../../qseow/qseow-certificates.js';
import { qseowVerifyContentLibraryExists } from '../../qseow/qseow-contentlibrary.js';
import { listAppsByTag, listAllApps } from '../../qseow/qseow-app-lookup.js';
import { qseowCreateThumbnails } from '../../qseow/qseow-create-thumbnails.js';
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
import { labelForApp } from '../../interactive/labels.js';

// Re-exported so a reader following this wizard finds the label and the route
// vocabulary it uses without having to know they are shared with the Cloud twin.
export { labelForApp, APP_SOURCES };

/** Key of the synthetic question gating the sheet exclude/blur filters. */
const FILTERING = '_filtering';

/** Key of the synthetic question gating the long tail of options. */
const ADVANCED = '_advanced';

/** What the tag route is called wherever it has to be named in a sentence. */
const GROUPING_LABEL = 'a tag';

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
    'browserCacheDir',
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
     * @param {object} [context] - What the command line and environment already supplied.
     * @param {object} [context.answers] - Those values, keyed by option name. Used as the starting
     *     point for the app and tag questions, which are asked again rather than skipped.
     *
     * @returns {Array} The questions to actually ask.
     */
    refine(specs, { answers = {} } = {}) {
        const byKey = Object.fromEntries(specs.map((spec) => [spec.key, spec]));

        const connection = CONNECTION_KEYS.map((key) => byKey[key])
            .filter(Boolean)
            .map((spec) =>
                spec.key === 'certkeyfile'
                    ? {
                          ...spec,
                          needs: ['certfile'],
                          // Both paths, because the helper checks both and this
                          // question only carries the probe by virtue of being
                          // the second of the pair - it cannot run until the key
                          // file is known. Reporting only `--certkeyfile` as
                          // checked hid the fact that `--certfile` had been
                          // verified just as thoroughly.
                          checks: ['certfile', 'certkeyfile'],
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

        const appSource = appSourceQuestion({
            needs: ['logonpwd'],
            groupingKey: 'qliksensetag',
            groupingChoice: 'Update every app carrying a tag',
        });

        // A tag is not an alternative to naming apps, it is a second way of
        // naming them: the run covers everything --appid names *and* everything
        // carrying the tag. So a tag that is already set changes what the run
        // does no matter which route is taken here, and hiding it behind the
        // tag route would let it add apps the operator was never shown.
        const tag = {
            ...openingOn(
                {
                    ...byKey.qliksensetag,
                    message: 'Which tag?',
                    hint: 'Every app carrying it is updated, on top of any apps named below. Leave empty for none.',
                },
                answers.qliksensetag
            ),
            needs: [APP_SOURCE],
            // Asked on the tag route because that is how apps are being chosen
            // there - and on every other route when a tag was already supplied,
            // because it still applies there and the banner has just promised it
            // would be asked about rather than skipped. Clearing it is how an
            // operator says "not this time".
            when: (ctx) =>
                ctx.answers[APP_SOURCE] === APP_SOURCES.GROUPED || isSupplied(answers.qliksensetag),
            probe: resolvesToApps({
                groupingKey: 'qliksensetag',
                resolve: (ctx) => listAppsByTag(ctx.answers),
                whenEmpty: (value) => `No apps on the server carry the tag '${value}'.`,
                whenFound: (count, value) =>
                    `${count} app(s) carry the tag '${value}' and will be updated.`,
            }),
        };

        const app = appPickerQuestion({
            spec: byKey.appid,
            supplied: answers.appid,
            groupingKey: 'qliksensetag',
            groupingLabel: GROUPING_LABEL,
            listApps: (ctx) => listAllApps(ctx.answers),
            label: labelForApp,
        });

        // The derived question unchanged, for anyone who already knows the id.
        const typedApp = typedAppQuestion({
            spec: byKey.appid,
            supplied: answers.appid,
            groupingKey: 'qliksensetag',
            groupingLabel: GROUPING_LABEL,
        });

        const contentLibrary = {
            ...byKey.contentlibrary,
            // What the probe actually reads, and therefore what can be at fault
            // when it fails. `setupQseowQrsConnection` builds the QRS connection
            // from exactly these, so when the library is supplied in a `.env`
            // file and the check fails, these are the other values worth
            // pointing at - a wrong host fails this check just as surely as a
            // deleted library does.
            //
            // `qrsport` is read too, but it is deliberately absent: it lives in
            // the Advanced section, which is asked *after* this question, so
            // declaring it here would fail `assertNeedsAreSatisfiable` - the
            // ordering graph correctly reporting issue #1047, where this check
            // reaches QRS with `qrsport` undefined rather than with whatever the
            // operator is about to set. Add it here as part of fixing that.
            needs: ['host', 'certfile', 'certkeyfile', 'apiuserdir', 'apiuserid'],
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
    run: (options) => qseowCreateThumbnails(options),
};
