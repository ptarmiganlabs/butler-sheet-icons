import { logError } from '../util/log-error.js';

/**
 * Deletes a single thumbnail image from a Qlik Sense Cloud app's media library.
 *
 * @param {object} thumbnailImg - Thumbnail image object from the media library list.
 * @param {string} appId - App ID of the app to which the thumbnail belongs.
 * @param {object} saasInstance - Instance of the QlikSaas class, with the Qlik Sense Cloud tenant configured.
 * @param {object} logger - Logger instance.
 *
 * @returns {Promise<void>} Resolves when the thumbnail has been deleted (or has already been removed).
 */
export async function deleteCloudAppThumbnail(thumbnailImg, appId, saasInstance, logger) {
    try {
        logger.verbose(
            `Deleting existing thumbnail "${thumbnailImg.name}" for app ${appId}, media path is "apps/${appId}/media/files/thumbnails/${thumbnailImg.name}"`
        );
        const result = await saasInstance.Delete(
            `apps/${appId}/media/files/thumbnails/${thumbnailImg.name}`
        );
        logger.debug(
            `Deleted existing file ${thumbnailImg.name}, result=${JSON.stringify(result)}`
        );
    } catch (err) {
        // Applies the same split as `logError` in ../util/log-error.js, but through the logger
        // this function is given rather than the global one. The injected logger is this
        // function's contract with its caller, so the shared helper is deliberately not used.
        logger.error(
            `CREATE THUMBNAILS 3: Error deleting existing thumbnail: ${err?.message ?? err}`
        );
        if (err?.stack) {
            logger.debug(err.stack);
        }
        throw new Error('Error deleting existing thumbnail', { cause: err });
    }
}

/**
 * Removes every thumbnail already in an app's media library, before new ones are captured.
 *
 * Cloud clears the old images and QSEoW does not - a real difference between the platforms, not an
 * oversight, and one ptarmiganlabs/butler-sheet-icons#1091 records as staying per-platform. Pulled
 * out of `process-cloud-app.js` so that module's pre-flight is two named calls rather than forty
 * inline lines, which is what #1091 step 3 assumed was already true.
 *
 * The dry-run planner deliberately does not call this: planning an app must not change it.
 *
 * @param {string} appId - Qlik Sense app ID.
 * @param {object} saasInstance - QlikSaas instance for the tenant.
 * @param {object} logger - Logger instance.
 *
 * @returns {Promise<void>} Resolves once every existing thumbnail image has been deleted.
 *
 * @throws {Error} When the existing thumbnails cannot be listed. Capturing over an app whose old
 *     images are in an unknown state is worse than stopping.
 */
export const clearExistingCloudThumbnails = async (appId, saasInstance, logger) => {
    // Does the app have a thumbnail folder in its media library?
    logger.verbose(`Getting media list for app ${appId}, media path is "apps/${appId}/media/list"`);
    const mediaList = await saasInstance.Get(`apps/${appId}/media/list`);

    const hasThumbnailFolder = mediaList.find((item) => {
        const thumbnailFolderExists = item.type === 'directory' && item.name === 'thumbnails';
        return thumbnailFolderExists;
    });

    if (!hasThumbnailFolder) {
        return;
    }

    // "thumbnails" folder exists in app's media library
    logger.debug(`App ${appId} has a "thumbnails" folder in its media library`);

    // Remove all existing thumbnail images from this app
    let existingThumbnails;
    try {
        logger.verbose(
            `Getting existing thumbnails for app ${appId}, media path is "apps/${appId}/media/list/thumbnails"`
        );
        existingThumbnails = await saasInstance.Get(`apps/${appId}/media/list/thumbnails`);
    } catch (err) {
        logError('CREATE THUMBNAILS 2: Error getting existing thumbnails', err);
        throw new Error('Error getting existing thumbnails', { cause: err });
    }

    for (const thumbnailImg of existingThumbnails) {
        if (thumbnailImg.type === 'image') {
            await deleteCloudAppThumbnail(thumbnailImg, appId, saasInstance, logger);
        }
    }
};
