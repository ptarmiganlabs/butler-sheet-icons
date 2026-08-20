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
 * Lists the thumbnail images already in an app's media library.
 *
 * Three places needed this: the pre-flight clear before a capture run, the delete pass in
 * `cloud-remove-sheet-icons.js`, and that command's dry-run counterpart. All three carried their own
 * copy of the same folder predicate and the same two endpoints, and the last two are a real-run and
 * planner pair - so the dry run and the run it predicts could come to disagree about how many files
 * would be deleted. That is the drift ptarmiganlabs/butler-sheet-icons#1091 exists to remove.
 *
 * Returns only entries of type `image`; the folder listing also contains directories.
 *
 * @param {string} appId - Qlik Sense app ID.
 * @param {object} saasInstance - QlikSaas instance for the tenant.
 * @param {object} logger - Logger instance.
 * @param {string} logPrefix - Prefix for the error log, e.g. `'CREATE THUMBNAILS 2'`.
 *
 * @returns {Promise<object[]>} The thumbnail images, or an empty array when the app has no
 *     thumbnails folder at all.
 *
 * @throws {Error} When the folder exists but its contents cannot be listed. Acting on an app whose
 *     existing images are in an unknown state is worse than stopping.
 */
export const listExistingCloudThumbnails = async (appId, saasInstance, logger, logPrefix) => {
    // Does the app have a thumbnail folder in its media library?
    logger.verbose(`Getting media list for app ${appId}, media path is "apps/${appId}/media/list"`);
    const mediaList = await saasInstance.Get(`apps/${appId}/media/list`);

    const hasThumbnailFolder = mediaList.find((item) => {
        const thumbnailFolderExists = item.type === 'directory' && item.name === 'thumbnails';
        return thumbnailFolderExists;
    });

    if (!hasThumbnailFolder) {
        return [];
    }

    // "thumbnails" folder exists in app's media library
    logger.debug(`App ${appId} has a "thumbnails" folder in its media library`);

    let existingThumbnails;
    try {
        logger.verbose(
            `Getting existing thumbnails for app ${appId}, media path is "apps/${appId}/media/list/thumbnails"`
        );
        existingThumbnails = await saasInstance.Get(`apps/${appId}/media/list/thumbnails`);
    } catch (err) {
        logError(`${logPrefix}: Error getting existing thumbnails`, err);
        throw new Error('Error getting existing thumbnails', { cause: err });
    }

    return existingThumbnails.filter((item) => item.type === 'image');
};

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
 * @returns {Promise<number>} How many thumbnail images were deleted.
 *
 * @throws {Error} When the existing thumbnails cannot be listed or a delete fails.
 */
export const clearExistingCloudThumbnails = async (appId, saasInstance, logger) => {
    const existingThumbnails = await listExistingCloudThumbnails(
        appId,
        saasInstance,
        logger,
        'CREATE THUMBNAILS 2'
    );

    for (const thumbnailImg of existingThumbnails) {
        await deleteCloudAppThumbnail(thumbnailImg, appId, saasInstance, logger);
    }

    return existingThumbnails.length;
};
