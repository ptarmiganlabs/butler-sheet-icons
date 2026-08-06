import axios from 'axios';
import FormData from 'form-data';
import { Readable } from 'stream';
import { logger } from '../../globals.js';

axios.interceptors.response.use(
    async (response) => {
        if (response.headers.location) {
            const redirectConfig = {
                method: 'get',
                responseType: 'arraybuffer',
                url: `${response.config.baseURL}${response.headers.location}`,
                headers: {
                    Authorization: response.config.headers.Authorization,
                },
            };

            const redirectData = await axios(redirectConfig);
            return redirectData;
        }

        return response;
    },
    (e) =>
        // `e.response` is absent whenever the request never reached the server - offline, DNS
        // failure, connection refused, TLS rejection. Reading `.status` off it unguarded turned
        // every such failure into `TypeError: Cannot read properties of undefined (reading
        // 'status')` raised from inside axios, which is the error reported in issue #785.
        //
        // This interceptor is registered on the shared axios instance, so it applied to every
        // HTTP request in the process - including the Chrome version lookup in
        // browser-list-available.js, which is where the report came from rather than from any
        // Qlik Cloud call.
        //
        // `code` and the response *status* are carried through so callers can still classify the
        // failure - getErrorCategory reads `err.code` and `err.response?.status`, and without
        // either it cannot tell "offline" from "the server said no".
        //
        // Only the status, never the response object itself: that carries `config`, and
        // `config.headers.Authorization` is the Qlik Cloud API token. Several callers log errors
        // with `JSON.stringify(err)`, so attaching the whole response would put the token on the
        // path to the log. The winston sanitiser would most likely catch it, but there is no
        // reason to depend on that.
        Promise.reject({
            status: e?.response?.status,
            statusText: e?.response?.statusText,
            message: e?.message ?? String(e),
            code: e?.code,
            response: e?.response ? { status: e.response.status } : undefined,
        })
);

/**
 * Takes a Buffer and returns a Readable Stream
 *
 * @param {Buffer} buffer The buffer to stream
 *
 * @returns {Readable} A Readable Stream
 */
function bufferToStream(buffer) {
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    return stream;
}

/**
 * Makes a request to the Qlik Cloud Repository API.
 *
 * @param {object} config - Axios config object.
 * @param {Array} [data] - Accumulated data from previous paginated requests. Defaults to `[]`.
 *
 * @returns {Promise<object|Array>} The response data.
 */
async function makeRequest(config, data = []) {
    let returnData = [...data];

    try {
        logger.debug(`CLOUD Sending request 1 using config: ${JSON.stringify(config)}`);
        const response = await axios(config);
        if (response.status) logger.debug(`CLOUD Got response 1 (status): ${response.status}`);
        if (response.statusText)
            logger.debug(`CLOUD Got response 1 (statusText): ${response.statusText}`);
        if (response.data)
            logger.debug(`CLOUD Got response 1 (data): ${JSON.stringify(response.data, null, 2)}`);
        if (response.headers)
            logger.debug(
                `CLOUD Got response 1 (headers): ${JSON.stringify(response.headers, null, 2)}`
            );

        // `response.data` is optional - the debug logging above already treats it as such - so
        // reading `.data` off it unguarded would throw on a response with no body.
        const body = response.data;

        if (body?.data) {
            returnData = [...returnData, ...body.data];
        } else {
            returnData = { data: body, status: response.status };
        }

        // Qlik Cloud has been seen to use both `links.next` and `links.Next`, which is why the
        // guard here accepts either. Reading `next.href` unconditionally afterwards meant a
        // response carrying only the capital form threw
        // `TypeError: Cannot read properties of undefined (reading 'href')` - the guard admitted
        // a shape the next line could not handle.
        const nextPageUrl = body?.links?.next?.href || body?.links?.Next?.Href;

        if (nextPageUrl) {
            config.url = nextPageUrl;
            return makeRequest(config, returnData);
        }
    } catch (err) {
        return Promise.reject(err);
    }

    // Original code:
    // await axios(config).then(async (d) => {
    //     if (d.data.data) returnData = [...returnData, ...d.data.data];
    //     if (!d.data.data) returnData = { data: d.data, status: d.status };

    //     if (d.data.links && (d.data.links.next || d.data.links.Next)) {
    //         config.url = d.data.links.next.href ? d.data.links.next.href : d.data.links.Next.Href;
    //         return makeRequest(config, returnData);
    //     }
    // });

    return returnData;
}

/**
 * Makes a request to the Qlik Cloud Repository API.
 *
 * @param {object} mainConfig - Configuration object for Qlik Cloud.
 * @param {string} path - Path to make the request to.
 * @param {string} type - HTTP method to use.
 * @param {object|Buffer} data - Data to send with the request.
 * @param {string} [contentType] - Content-Type of the request. Defaults to `application/json`.
 * @param {Buffer} [file] - File to send with the request.
 * @param {string} [fileName] - Name of the file.
 *
 * @returns {Promise<object|Array>} The response data.
 */
const request = async (
    mainConfig,
    path,
    type,
    data,
    contentType = 'application/json',
    file,
    fileName
) => {
    const config = {
        method: type,
        baseURL: mainConfig.baseURL,
        url: path ? `/api/v${mainConfig.version}/${path}` : `/api/v${mainConfig.version}`,
        headers: {
            Authorization: `Bearer ${mainConfig.token}`,
            'Content-Type': contentType,
        },
        data,
    };

    if (contentType === 'multipart/form-data') {
        if (path.toLowerCase().indexOf('extensions')) {
            const formData = new FormData();
            formData.append('file', bufferToStream(file), {
                contentType: 'application/x-zip-compressed',
                filename: fileName || 'extension.zip',
            });

            config.headers = { ...config.headers, ...formData.getHeaders() };
            config.data = formData;
        }
    }

    if (contentType === 'application/octet-stream') {
        config.data = bufferToStream(data);
    }

    logger.debug(`CLOUD About to make request to Qlik Cloud: ${JSON.stringify(config)}`);
    const response = await makeRequest(config);
    logger.debug(`CLOUD Got response from Qlik Cloud 2: ${JSON.stringify(response)}`);

    if (response.data) return response.data;
    if (type === 'post') return response.status;
    return response;
};

export default request;
