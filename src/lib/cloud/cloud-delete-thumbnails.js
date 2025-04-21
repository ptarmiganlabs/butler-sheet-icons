/**
 * Deletes a single thumbnail image from a Qlik Sense Cloud app's media library.
 *
 * @param {Object} thumbnailImg - Thumbnail image object from the media library list.
 * @param {string} appId - App ID of the app to which the thumbnail belongs.
 * @param {Object} saasInstance - Instance of the QlikSaas class, with the Qlik Sense Cloud tenant configured.
 * @param {Object} logger - Logger instance.
 *
 * @returns {Promise<void>}
 */
async function deleteCloudAppThumbnail(thumbnailImg, appId, saasInstance, logger) {
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
        if (err.stack) {
            logger.error(`CREATE THUMBNAILS 3 (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`CREATE THUMBNAILS 3 (message): ${err.message}`);
        } else {
            logger.error(`CREATE THUMBNAILS 3: Error deleting existing thumbnail: ${err}`);
        }
        throw Error('Error deleting existing thumbnail');
    }
}

module.exports = { deleteCloudAppThumbnail };
