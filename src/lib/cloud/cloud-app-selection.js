import { logger } from '../../globals.js';
import { listAppsByCollection } from './cloud-apps.js';
import { toAppIdList } from '../util/app-ids.js';

/**
 * Resolves which Cloud apps a command should run over, with the provenance the
 * run report records.
 *
 * `--appid` and `--collectionid` are additive, not alternatives: apps named
 * either way are all processed, and `runOverApps()` dedupes, so an app that is
 * both named and in the collection is still processed once. Shared by
 * create-sheet-thumbnails and remove-sheet-icons, which carried identical
 * copies of this block.
 *
 * @param {object} saasInstance - QlikSaas object.
 * @param {object} options - The command's options bag.
 * @param {string[]} [options.appid] - Apps named directly.
 * @param {string} [options.collectionid] - Collection whose apps are added.
 *
 * @returns {Promise<{appIds: string[], namedAppIds: string[], selectorAppIds: string[], selector: {option: string, value: string}|null}>}
 *     The selection, shaped for `runOverAppsWithReport`.
 */
export const resolveCloudAppSelection = async (saasInstance, options) => {
    const namedAppIds = toAppIdList(options.appid);
    const appIds = [...namedAppIds];

    let selectorAppIds = [];
    const useCollection = Boolean(options.collectionid && options.collectionid.length > 0);
    if (useCollection) {
        const apps = await listAppsByCollection(saasInstance, options.collectionid);
        logger.verbose(`Collection '${options.collectionid}' exists`);
        selectorAppIds = apps.map((app) => app.id);
        appIds.push(...selectorAppIds);
    }

    return {
        appIds,
        namedAppIds,
        selectorAppIds,
        selector: useCollection ? { option: 'collectionid', value: options.collectionid } : null,
    };
};
