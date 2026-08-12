import { logger } from '../../globals.js';
import { saasGetList } from './saas-response.js';

/**
 * Turn a batch of items-API entries into apps.
 *
 * Both sources of apps on a tenant - a collection's items, and the tenant-wide item list -
 * return the same item shape, so they map to apps the same way. Sharing this is what lets a
 * caller treat "apps in this collection" and "all apps" interchangeably, which is the whole
 * point of listing them: an app picker must not care where the list came from.
 *
 * `name` falls back to `id` because a picker showing a bare GUID is no better than asking
 * someone to type one.
 *
 * **App names are not unique** - only ids are. Two apps may legitimately share a name, so
 * anything acting on a choice must key on `id`; `name` is a label and nothing more.
 *
 * @param {Array<object>} items - Entries as returned by the items API.
 * @param {string} source - What is being listed, for the skipped-item log line.
 *
 * @returns {Array<{id: string, name: string}>} Apps, in the order the API returned them.
 */
const appsFromItems = (items, source) => {
    const apps = [];

    for (const item of items) {
        if (item?.resourceType === 'app') {
            // The test is for the app id, not merely for `resourceAttributes`: an entry carrying
            // `resourceAttributes: {}` passes an existence check and then contributes
            // `{ id: undefined }` to the list. That id survives dedupe in runOverApps as a
            // distinct entry, so the run ends up trying to process an app called `undefined` and
            // reporting it as a failure - the same anonymous failure saasGetList exists to
            // prevent, one level further in. Skipping keeps the rest of the list usable, and
            // warns rather than whispers because an app that should be here is now missing.
            if (!item.resourceAttributes?.id) {
                // The item id is what an administrator would search the tenant for, so it is
                // worth saying when there is one - and worth being explicit when there is not,
                // rather than interpolating `undefined` into the sentence.
                const label = item.id ? `item ${item.id}` : 'an item with no id of its own';

                logger.warn(
                    `Skipping ${source} ${label} as it claims to be an app but carries no app id`
                );
                continue;
            }

            apps.push({
                id: item.resourceAttributes.id,
                name: item.resourceAttributes.name ?? item.resourceAttributes.id,
            });
        } else {
            // Optional chaining throughout: the guard above admits a null or non-object entry to
            // this branch, and logging the skip must not itself be what crashes the run.
            logger.verbose(
                `Skipping ${source} item ${item?.id} as it is not an app: ${item?.resourceType}`
            );
        }
    }

    return apps;
};

/**
 * Returns every collection on the tenant.
 *
 * Deliberately a pass-through of what the API returned rather than a narrowed shape. Three
 * callers want different fields - the `list-collections` command renders seven of them in a
 * table and prints the raw objects for `--outputformat json`, while a picker needs only name
 * and item count - and narrowing here would either break the table or force a second request.
 * Passing the objects through unchanged also keeps that JSON output byte-identical to what it
 * has always printed.
 *
 * `id`, `name` and `itemCount` are always present. **`description` is not**: checked against a
 * real tenant, where all 17 collections came back without the key at all. That is why the
 * table in `cloud-collections.js` guards it with `=== undefined ? '' :` - load-bearing, not
 * defensive habit - and why nothing here invents an empty string to paper over it.
 *
 * @param {object} saasInstance - Configured QlikSaas client.
 *
 * @returns {Promise<Array<object>>} Collections on the tenant, as the API returned them. Each
 *     carries at least `id`, `name` and `itemCount`; `description` may be absent.
 *
 * @throws {import('../util/errors.js').CloudError} If the tenant did not answer with a list. See `saas-response.js` - an
 *     empty tenant returns `[]`, an unusable response says so.
 */
export const listCollections = async (saasInstance) => {
    // Through saasGetList, so a tenant that answers with an error document or an HTML page fails
    // as itself rather than as `TypeError: allCollections.map is not a function` in whichever
    // caller reached for `.map` first. Checking that the response *is* a list is not the same as
    // narrowing it - the objects inside are still passed through exactly as the API sent them,
    // which is what the paragraph above is about.
    const allCollections = await saasGetList(saasInstance, 'collections');
    logger.debug(`Collections:\n${JSON.stringify(allCollections, null, 2)}`);

    return allCollections;
};

/**
 * Returns every app on the tenant, not scoped to a collection.
 *
 * Uses the items API rather than `apps`, so entries arrive in the same shape a collection's
 * items do and go through the same mapping. Paging is handled a layer down - the request
 * helper follows `links.next` until the list is exhausted - so this is the whole tenant, not
 * the first page of it.
 *
 * @param {object} saasInstance - Configured QlikSaas client.
 *
 * @returns {Promise<Array<{id: string, name: string}>>} Apps on the tenant. `name` falls back
 *     to `id` when the API does not supply one.
 *
 * @throws {import('../util/errors.js').CloudError} If the tenant did not answer with a list.
 */
export const listApps = async (saasInstance) => {
    const items = await saasGetList(saasInstance, 'items?resourceType=app');

    return appsFromItems(items, 'tenant');
};

/**
 * Returns the apps in a Qlik Sense Cloud collection.
 *
 * The two commands that accept `--collectionid` previously held byte-identical copies of this
 * block — fetch collections, check the requested one exists, fetch its items, keep only apps.
 * Fixing a bug in one copy without the other was the repo's dominant defect pattern; a single
 * helper is the fix.
 *
 * @param {object} saasInstance - Configured QlikSaas client.
 * @param {string} collectionId - ID of the collection to query.
 *
 * @returns {Promise<Array<{id: string, name: string}>>} Apps in the collection. Each object
 *     carries at least `{ id, name }` so callers can display something more useful than a
 *     GUID. `name` falls back to `id` when the API does not supply one.
 *
 * @throws {Error} If the collection does not exist on the tenant. The message includes the
 *     requested collection ID so the caller can report it without re-extracting it.
 * @throws {import('../util/errors.js').CloudError} If the tenant did not answer either request with a list. Distinct from
 *     the above on purpose: "this collection is not here" and "the tenant is not answering
 *     usefully" send the operator to different places.
 */
export const listAppsByCollection = async (saasInstance, collectionId) => {
    const allCollections = await listCollections(saasInstance);

    const index = allCollections.map((e) => e.id).indexOf(collectionId);

    if (index === -1) {
        throw new Error(`Collection '${collectionId}' does not exist`);
    }

    const collectionItems = await saasGetList(saasInstance, `collections/${collectionId}/items`);

    return appsFromItems(collectionItems, 'collection');
};
