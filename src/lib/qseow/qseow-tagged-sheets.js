import qrsInteract from 'qrs-interact';
import { logger } from '../../globals.js';
import { setupQseowQrsConnection } from './qseow-qrs.js';
import { QseowError } from '../util/errors.js';
import { qrsFilterAnyOf, qrsPathWithFilter, toFilterValueList } from './qrs-filter.js';
import { qrsGetList, qrsGetCount } from './qrs-response.js';

/**
 * Looks up the sheets in an app that carry any of the supplied tags.
 *
 * Both `--exclude-sheet-tag` and `--blur-sheet-tag` need exactly this, against the same endpoint,
 * differing only in which option supplies the tags. They are kept as two separate queries rather
 * than one combined lookup because the two rules have to stay distinguishable: a sheet carrying
 * the exclude tag must not become a blurred sheet, and vice versa.
 *
 * Only worth asking when tags were actually supplied. Querying with none used to ask for a tag
 * literally named `undefined`, which costs a round trip per app and, on a site that happens to
 * have a tag by that name, would act on sheets nobody nominated.
 *
 * @param {object} qrsInteractInstance - Configured `qrs-interact` instance.
 * @param {string} appSheetsFilter - Filter term restricting results to sheets in one app.
 * @param {string|string[]|undefined} tagOption - Raw CLI option value naming the tags.
 * @param {string} optionName - The option's CLI spelling, used only in log messages.
 *
 * @returns {Promise<Array<object>>} Sheet metadata objects exposing `engineObjectId`, empty when
 *     no tags were supplied.
 *
 * @throws {Error} When QRS answers with something that is not a list (a `QseowError` from `qrsGetList`).
 */
export const getSheetsTaggedWith = async (
    qrsInteractInstance,
    appSheetsFilter,
    tagOption,
    optionName
) => {
    // Variadic options arrive as arrays, so the tag term has to be an `or` group over every tag
    // given: interpolating the array produced `tags.name eq 'A,B'`, one literal matching no tag.
    const tags = toFilterValueList(tagOption);

    if (tags.length === 0) {
        logger.debug(`No ${optionName} supplied, skipping the QRS lookup for tagged sheets`);
        return [];
    }

    const tagFilter = `${appSheetsFilter} and ${qrsFilterAnyOf('tags.name', tags)}`;
    logger.debug(`GET sheets tagged for ${optionName}: app/object/full?filter=${tagFilter}`);

    // Through qrsGetList: the count logged below is taken with `.length`, and a reply that is not
    // a list answers that with a plausible number rather than failing - a quoted JSON string would
    // report its character count as though that many sheets carried the tag.
    const taggedSheets = await qrsGetList(
        qrsInteractInstance,
        qrsPathWithFilter('app/object/full', tagFilter)
    );

    // Report the count at the default log level whenever the option was used. A misspelled tag
    // otherwise produces a run byte-identical to one where the option was never passed - the
    // silent-no-op that made issue #840 hard to notice - and for the blur rule that means
    // publishing readable thumbnails the operator believed were hidden.
    //
    // Deliberately info rather than warn: a run spanning many apps will legitimately find no
    // tagged sheets in most of them, and a per-app warning for a normal outcome is the kind of
    // noise that teaches operators to ignore warnings. A mistyped tag shows up as a trail of
    // zeroes across every app instead.
    logger.info(
        `Sheets carrying a tag named by ${optionName}: ${taggedSheets.length} (tags: ${tags.join(', ')})`
    );

    return taggedSheets;
};

/**
 * How many app ids go into one QRS filter or-group.
 *
 * Each id contributes ~55-60 percent-encoded characters to the query string,
 * and QRS sits behind http.sys, whose default request limits reject URLs
 * around 16 KB - roughly 250-300 ids in one group. Chunking at 50 keeps every
 * request comfortably small while still counting a large tag selection in a
 * handful of constant-size responses.
 */
const PLAN_FACT_ID_CHUNK = 50;

/**
 * Splits a list into chunks of at most {@link PLAN_FACT_ID_CHUNK} entries.
 *
 * @param {string[]} values - The list.
 *
 * @returns {string[][]} The chunks, in order.
 */
const chunked = (values) => {
    const chunks = [];
    for (let i = 0; i < values.length; i += PLAN_FACT_ID_CHUNK) {
        chunks.push(values.slice(i, i + PLAN_FACT_ID_CHUNK));
    }

    return chunks;
};

/**
 * A parenthesised or-group over app ids for a QRS filter.
 *
 * App ids are interpolated unquoted, matching every other GUID filter in this
 * file (`app.id eq ${appId}` below) - QRS parses bare GUIDs.
 *
 * @param {string} field - The QRS field, e.g. `id` or `app.id`.
 * @param {string[]} ids - The app ids.
 *
 * @returns {string} A parenthesised filter term.
 */
const idGroup = (field, ids) => `(${ids.map((id) => `${field} eq ${id}`).join(' or ')})`;

/**
 * The plan-time facts the run card's PLAN block shows for a QSEoW run: how
 * many of the selected apps are published, and how many sheets each tag rule
 * matches across all of them.
 *
 * The tag counts are the anti-#840 line: `tag "no-thumbnail" (0 sheets)`
 * printed before the first write is the cheapest possible fix for a mistyped
 * tag silently matching nothing. The per-app lookups still happen inside each
 * app's processing, through {@link getSheetsTaggedWith}, and remain the
 * counts the decisions are actually made from.
 *
 * Everything goes through the QRS `count` endpoints in id chunks: only
 * numbers are wanted, so fetching full repository entities to take `.length`
 * would move kilobytes per counted sheet, and one giant or-group over every
 * selected app would exceed the server's URL limits on exactly the mass tag
 * runs these counts exist for. The three fact groups are independent and run
 * in parallel.
 *
 * Failures degrade to nulls rather than failing the run: these numbers
 * decorate the plan, and a filter QRS rejects must not stop work the operator
 * asked for. The QRS being unreachable is not masked - every caller has
 * already talked to QRS to resolve its selection before calling this.
 *
 * @param {object} options - The run's options bag.
 * @param {string[]} appIds - The selected app ids, deduplicated or not.
 *
 * @returns {Promise<{publishedAppCount: number|null, excludeTagSheetCount: number|null, blurTagSheetCount: number|null}>}
 *     The counts; tag counts are null when the corresponding option was not used.
 */
export const readQseowPlanFacts = async (options, appIds) => {
    const facts = {
        publishedAppCount: null,
        excludeTagSheetCount: null,
        blurTagSheetCount: null,
    };

    const uniqueAppIds = [...new Set(appIds)];
    if (uniqueAppIds.length === 0) {
        return facts;
    }

    try {
        const qrsInteractInstance = new qrsInteract(setupQseowQrsConnection(options));

        const sumCounts = async (endpoint, filterForChunk) => {
            let sum = 0;
            for (const chunk of chunked(uniqueAppIds)) {
                sum += await qrsGetCount(
                    qrsInteractInstance,
                    qrsPathWithFilter(endpoint, filterForChunk(chunk))
                );
            }

            return sum;
        };

        const countTagged = (tagOption) => {
            const tags = toFilterValueList(tagOption);
            if (tags.length === 0) {
                return null;
            }

            return sumCounts(
                'app/object/count',
                (chunk) =>
                    `objectType eq 'sheet' and ${idGroup('app.id', chunk)} and ${qrsFilterAnyOf('tags.name', tags)}`
            );
        };

        [facts.publishedAppCount, facts.excludeTagSheetCount, facts.blurTagSheetCount] =
            await Promise.all([
                sumCounts('app/count', (chunk) => `${idGroup('id', chunk)} and published eq true`),
                countTagged(options.excludeSheetTag),
                countTagged(options.blurSheetTag),
            ]);
    } catch (err) {
        logger.verbose(
            `Could not read plan facts from QRS - the plan block will omit them: ${err?.message ?? err}`
        );
    }

    return facts;
};

/**
 * The QRS reads both the real per-app processor and the dry-run planner make
 * before opening an engine session: app metadata, the two tagged-sheet sets,
 * and the repo-db/engine sheet-id map.
 *
 * One function rather than two copies, because the dry run's whole promise is
 * "the same reads, in the same order" - a promise that was enforced only by
 * eyeballing two files until the copies diverged within a single PR. Anything
 * added here is automatically exercised by both modes.
 *
 * @param {string} appId - The QSEoW app to read.
 * @param {object} options - The run's options bag.
 *
 * @returns {Promise<{appMetadata: Array<object>, tagSheetAppMetadata: Array<object>, blurTagSheetAppMetadata: Array<object>, mapRepoEngineSheetId: Map<string, string>}>} The app context.
 *
 * @throws {QseowError} When the app does not exist in the repository.
 */
export const readQseowAppContext = async (appId, options) => {
    const qseowConfigQrs = setupQseowQrsConnection(options);

    const qrsInteractInstance = new qrsInteract(qseowConfigQrs);
    logger.debug(`QSEoW QRS config: ${JSON.stringify(qseowConfigQrs, null, 2)}`);

    // Get app top level metadata
    const appMetadataPath = qrsPathWithFilter('app', `id eq ${appId}`);
    logger.debug(`GET app top level metadata: ${appMetadataPath}`);
    const appMetadata = await qrsGetList(qrsInteractInstance, appMetadataPath);

    // An empty list is a real answer - the filter matched no app - but the reads of
    // appMetadata[0] further down sit inside the engine session, so leaving it unchecked
    // spends a session and an openDoc before failing with `Cannot read properties of
    // undefined`. In practice the engine refuses first, since the QRS lookup and the session
    // use the same service identity; this is here so the invariant holds for the next reader.
    if (appMetadata.length === 0) {
        throw new QseowError(
            `QSEoW app ${appId} was not found in the Qlik Sense repository. Check --appid, and that the account named by --apiuserdir/--apiuserid may read the app.`
        );
    }

    const appSheetsFilter = `objectType eq 'sheet' and app.id eq ${appId}`;

    // Get metadata for the app sheets that should be excluded based on sheet tags, and
    // separately for those that should be blurred. Two lookups, deliberately: the exclude tag
    // and the blur tag name different sets of sheets, and conflating them would blur every
    // sheet the operator asked to leave alone.
    const tagSheetAppMetadata = await getSheetsTaggedWith(
        qrsInteractInstance,
        appSheetsFilter,
        options.excludeSheetTag,
        '--exclude-sheet-tag'
    );

    const blurTagSheetAppMetadata = await getSheetsTaggedWith(
        qrsInteractInstance,
        appSheetsFilter,
        options.blurSheetTag,
        '--blur-sheet-tag'
    );

    // Create mapping between repo db sheet id and engine sheet id
    const repoSheets = await qrsGetList(
        qrsInteractInstance,
        qrsPathWithFilter('app/object/full', appSheetsFilter)
    );

    // repoSheets is an array of sheet objects, each object has properties called 'id' and
    // 'engineObjectId'. Bidirectional, so callers can resolve either direction.
    const mapRepoEngineSheetId = new Map();
    repoSheets.forEach((element) => {
        mapRepoEngineSheetId.set(element.id, element.engineObjectId);
        mapRepoEngineSheetId.set(element.engineObjectId, element.id);
    });

    return { appMetadata, tagSheetAppMetadata, blurTagSheetAppMetadata, mapRepoEngineSheetId };
};
