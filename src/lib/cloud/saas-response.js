import { CloudError } from '../util/errors.js';

/**
 * Reads a list-shaped response from Qlik Sense Cloud and returns it as an array.
 *
 * The Cloud twin of `qseow/qrs-response.js`, and the single place that interprets what the
 * repository client resolved with.
 *
 * Only a `{ data: [...] }` envelope reaches a caller as an array. Everything else arrives as
 * whatever the tenant sent, because `request()` in `cloud-repo-request.js` unwraps the
 * `{ data, status }` envelope `makeRequest` built and hands back the body itself. Traced
 * against that code, a 200 response reaches this helper as:
 *
 * | Body sent by the tenant     | What arrives here            |
 * | --------------------------- | ---------------------------- |
 * | `{ data: [...] }`           | the array - the expected case |
 * | an HTML page from a proxy   | a string                     |
 * | `{}` or an error document   | an object                    |
 * | nothing at all              | `{ data: '', status }`       |
 *
 * All of these resolve. None reject. So call sites that went straight to `.map()` threw
 * `TypeError: allCollections.map is not a function` from inside Butler Sheet Icons, naming a
 * local variable and nothing an operator can act on (issue #935).
 *
 * **HTTP error statuses do not come through here at all.** Axios rejects on 4xx and 5xx - no
 * `validateStatus` override exists - so 401, 403, 404 and 502 take the rejection path and keep
 * the diagnosis the interceptor in `cloud-repo-request.js` attached to them. The status check
 * below therefore only ever describes a *successful* response that carried no body, which is
 * the one shape where the status survives the unwrap.
 *
 * @param {object} saasInstance - Configured QlikSaas client.
 * @param {string} apiPath - Cloud API path, e.g. `collections` or `items?resourceType=app`.
 *
 * @returns {Promise<Array<object>>} The response, when it is a list. Empty when nothing matched.
 *
 * @throws {CloudError} When the response is not a list. An empty list and an unusable response
 *   are different answers: `[]` is returned, anything else throws, so a broken tenant cannot
 *   look like a successful run that simply had no work to do.
 */
export const saasGetList = async (saasInstance, apiPath) => {
    const result = await saasInstance.Get(apiPath);

    if (Array.isArray(result)) {
        return result;
    }

    // The one shape that keeps its status through the unwrap in `request()`: a success response
    // with an empty body. Saying "answered with no content" is more use than "got object", which
    // is all the shape check below could say about it.
    const status = result?.status;
    if (status !== undefined) {
        throw new CloudError(
            `Qlik Sense Cloud returned status ${status} and an empty body for "${apiPath}", expected a list`
        );
    }

    const shape = result === null ? 'null' : typeof result;

    throw new CloudError(
        `Qlik Sense Cloud returned an unusable response for "${apiPath}": expected a list, got ${shape}`
    );
};
