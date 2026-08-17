import qrsInteract from 'qrs-interact';
import { logger } from '../../globals.js';
import { setupQseowQrsConnection } from './qseow-qrs.js';
import { QseowError } from '../util/errors.js';
import { qrsFilterAnyOf, qrsPathWithFilter, toFilterValueList } from './qrs-filter.js';
import { qrsGetList } from './qrs-response.js';

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
