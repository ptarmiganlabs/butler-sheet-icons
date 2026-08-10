import { logger } from '../../globals.js';

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
 */
export const getAppIdsByCollection = async (saasInstance, collectionId) => {
    const allCollections = await saasInstance.Get('collections');
    logger.debug(`Collections:\n${JSON.stringify(allCollections, null, 2)}`);

    const index = allCollections.map((e) => e.id).indexOf(collectionId);

    if (index === -1) {
        throw new Error(`Collection '${collectionId}' does not exist`);
    }

    const collectionItems = await saasInstance.Get(`collections/${collectionId}/items`);

    const apps = [];
    for (const item of collectionItems) {
        if (item.resourceType === 'app') {
            apps.push({
                id: item.resourceAttributes.id,
                name: item.resourceAttributes.name ?? item.resourceAttributes.id,
            });
        } else {
            logger.verbose(
                `Skipping collection item ${item.id} as it is not an app: ${item.resourceType}`
            );
        }
    }

    return apps;
};
