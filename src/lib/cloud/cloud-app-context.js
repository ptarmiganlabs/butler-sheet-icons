/**
 * Reads the per-app facts that both the real run and the dry-run planner need.
 *
 * These two lines existed twice - once in `process-cloud-app.js` and once in `cloud-plan-app.js`,
 * whose copy carried the comment "same read, same endpoint as the real run". That comment is an
 * accurate description of a duplication held together by review, which is the control
 * ptarmiganlabs/butler-sheet-icons#1091 says has been the failing one. QSEoW settled the same
 * question the other way: `readQseowAppContext` exists precisely "so the two modes cannot drift
 * apart", and this is Cloud adopting that.
 *
 * Deliberately a read and nothing else. Clearing the app's existing thumbnails is a side effect the
 * real run performs and the planner must not - see `clearExistingCloudThumbnails`.
 *
 * @param {string} appId - Qlik Sense app ID.
 * @param {object} saasInstance - QlikSaas instance for the tenant.
 *
 * @returns {Promise<{ appMetadata: object, appIsPublished: boolean }>} The app's metadata and
 *     whether it is published.
 */
export const readCloudAppContext = async (appId, saasInstance) => {
    // Get app name
    const appMetadata = await saasInstance.Get(`apps/${appId}`);

    // Is app published?
    // appMetadata.attributes.publishTime is a string like "2021-09-01T12:34:56.789Z"

    // If empty the app is not published
    const appIsPublished = !!appMetadata.attributes.publishTime;

    return { appMetadata, appIsPublished };
};
