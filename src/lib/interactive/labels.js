/**
 * How Qlik entities are described in a picker.
 *
 * Shared between the platforms deliberately. An administrator moving between a
 * QSEoW server and a Cloud tenant should read the same thing, and #986 was filed
 * because the two sides had already drifted once - QSEoW returning bare GUIDs
 * while Cloud returned names. Formatting them in each wizard would reintroduce
 * that drift one layer up, where it is harder to notice because both would look
 * reasonable on their own.
 */

/**
 * Label one app for a picker.
 *
 * The id is always shown, always marked as an id, and never truncated.
 *
 * **App names are not unique.** Only ids are, and duplicates are not theoretical:
 * three names are shared by two apps each on the QSEoW test server, so a label
 * showing the name alone is ambiguous to the person choosing even though the
 * value behind it is not. Showing the id only when names collide was considered
 * and rejected - it makes the label format depend on the contents of the list, so
 * the same app can be presented differently between two runs.
 *
 * Untruncated because the id is what gets pasted into `--appid` afterwards, which
 * is the point of echoing the equivalent command line; half an id cannot be.
 *
 * @param {{id: string, name: string}} app - The app to label.
 *
 * @returns {string} The label to show.
 */
export const labelForApp = (app) => `${app.name}  (id: ${app.id})`;

/**
 * Label one Qlik Sense Cloud collection for a picker.
 *
 * The item count is worth the space: an empty collection is a dead end, and
 * seeing `(0 items)` before choosing it is better than a run that selects
 * nothing and says so afterwards.
 *
 * @param {{name: string, itemCount?: number}} collection - The collection to label.
 *
 * @returns {string} The label to show.
 */
export const labelForCollection = (collection) =>
    `${collection.name}  (${collection.itemCount ?? 0} items)`;
