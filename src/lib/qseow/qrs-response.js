import { QseowError } from '../util/errors.js';

/**
 * Reads a list-shaped response from QRS and returns its body as an array.
 *
 * The single place that interprets a `qrs-interact` response body. The library resolves a 200
 * with whatever `JSON.parse` produced, so a reverse proxy answering with an HTML error page, or
 * QRS answering with an error object, arrives as a perfectly ordinary resolved value. Call sites
 * that reached into `.body` directly each guessed differently about what that meant:
 *
 * - `body.length > 0` on an error object is `undefined > 0`, i.e. false, which reads as
 *   "nothing matched" and gets reported to the operator as "content library does not exist".
 * - `body.length > 0` on an HTML string is *true*, so a 502 page reads as a successful match.
 * - `body.map(...)` on either throws `TypeError: ... is not a function`, surfacing as an
 *   internal error that names nothing useful.
 *
 * An empty result and an unusable one are different answers, so they get different treatment
 * here: `[]` is returned, anything else throws.
 *
 * @param {object} qrsInteractInstance - A configured `qrs-interact` instance.
 * @param {string} apiUrl - QRS API path, e.g. `app/full?filter=...`.
 *
 * @returns {Promise<Array<object>>} The response body. Empty when nothing matched.
 *
 * @throws {QseowError} When the status is not a success, or the body is not an array. Treating
 *   either as "nothing matched" lets a broken QRS look like a successful run that simply had no
 *   work to do.
 */
export const qrsGetList = async (qrsInteractInstance, apiUrl) => {
    const result = await qrsInteractInstance.Get(apiUrl);

    // A non-success status is not an empty result. 403 in particular means the service account
    // may not read this, which the caller previously reported as "the content library does not
    // exist" - sending the operator to look for something that is there and readable by someone
    // else. Absent means absent; anything else says so.
    const status = result?.statusCode;
    if (status !== undefined && (status < 200 || status > 299)) {
        throw new QseowError(`QRS returned status ${status} for "${apiUrl}"`);
    }

    if (!Array.isArray(result?.body)) {
        const shape = result?.body === null ? 'null' : typeof result?.body;

        throw new QseowError(
            `QRS returned an unusable response for "${apiUrl}": expected a list, got ${shape}`
        );
    }

    return result.body;
};

/**
 * Reads a QRS `count` endpoint (`.../count?filter=...`) and returns the number.
 *
 * The count endpoints answer `{ "value": N }` - constant-size, however many
 * entities match - which is what makes them the right tool when only a number
 * is wanted: asking `app/object/full` for hundreds of full repository
 * entities in order to take `.length` moves kilobytes per counted sheet.
 *
 * Same interpretation discipline as {@link qrsGetList}: a non-success status
 * or a body without a numeric `value` throws rather than reading as zero -
 * "nothing matched" and "the answer is unusable" are different answers.
 *
 * @param {object} qrsInteractInstance - A configured `qrs-interact` instance.
 * @param {string} apiUrl - QRS count path, e.g. `app/object/count?filter=...`.
 *
 * @returns {Promise<number>} The count.
 *
 * @throws {QseowError} When the status is not a success, or the body carries
 *   no numeric `value`.
 */
export const qrsGetCount = async (qrsInteractInstance, apiUrl) => {
    const result = await qrsInteractInstance.Get(apiUrl);

    const status = result?.statusCode;
    if (status !== undefined && (status < 200 || status > 299)) {
        throw new QseowError(`QRS returned status ${status} for "${apiUrl}"`);
    }

    const value = result?.body?.value;
    if (typeof value !== 'number') {
        const shape = result?.body === null ? 'null' : typeof result?.body;

        throw new QseowError(
            `QRS returned an unusable response for "${apiUrl}": expected a count, got ${shape}`
        );
    }

    return value;
};

/**
 * Describes a parsed response body for an error message.
 *
 * @param {unknown} body - What `qrs-interact` resolved with.
 *
 * @returns {string} `null`, `array`, or the `typeof`.
 */
const shapeOf = (body) => {
    if (body === null) {
        return 'null';
    }

    return Array.isArray(body) ? 'array' : typeof body;
};

/**
 * Reads one QRS entity (`app/<id>`, `user/<id>`) and returns it.
 *
 * The single-entity twin of {@link qrsGetList}, with the same discipline: an answer that parses
 * but is not an entity - a list, a quoted string, `null` - throws rather than being read as one.
 * `qrsGetList` cannot serve here, because it rightly refuses anything that is not a list.
 *
 * @param {object} qrsInteractInstance - A configured `qrs-interact` instance.
 * @param {string} apiUrl - QRS API path, e.g. `app/<id>`.
 *
 * @returns {Promise<object>} The entity.
 *
 * @throws {QseowError} When the status is not a success, or the body is not a single object
 *   carrying an `id`.
 */
export const qrsGetEntity = async (qrsInteractInstance, apiUrl) => {
    const result = await qrsInteractInstance.Get(apiUrl);

    const status = result?.statusCode;
    if (status !== undefined && (status < 200 || status > 299)) {
        throw new QseowError(`QRS returned status ${status} for "${apiUrl}"`);
    }

    const body = result?.body;
    if (body === null || typeof body !== 'object' || Array.isArray(body) || !body.id) {
        throw new QseowError(
            `QRS returned an unusable response for "${apiUrl}": expected one entity, got ${shapeOf(body)}`
        );
    }

    return body;
};

/**
 * Writes one QRS entity with `PUT` and returns what QRS answered.
 *
 * `qrs-interact` already rejects anything but 200 and 204; the status is checked again here so
 * the guarantee does not rest on a dependency's internals, as {@link qrsGetList} does for reads.
 * The instance must be configured for a JSON body - see `setupQseowQrsConnection`'s
 * `contentType`.
 *
 * @param {object} qrsInteractInstance - A configured `qrs-interact` instance.
 * @param {string} apiUrl - QRS API path, e.g. `app/<id>`.
 * @param {object} body - The entity to write, including its current `modifiedDate`.
 *
 * @returns {Promise<object|string>} The body QRS answered with; empty for a 204.
 *
 * @throws {QseowError} When the status is not a success.
 */
export const qrsPut = async (qrsInteractInstance, apiUrl, body) => {
    const result = await qrsInteractInstance.Put(apiUrl, body);

    const status = result?.statusCode;
    if (status !== undefined && (status < 200 || status > 299)) {
        throw new QseowError(`QRS returned status ${status} for PUT "${apiUrl}"`);
    }

    return result?.body;
};
