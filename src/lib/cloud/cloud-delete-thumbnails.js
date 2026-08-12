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
