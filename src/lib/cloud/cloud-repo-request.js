/* eslint-disable no-param-reassign */
const axios = require('axios');
const FormData = require('form-data');
const { Readable } = require('stream');
const { logger } = require('../../globals');

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
        // eslint-disable-next-line prefer-promise-reject-errors
        Promise.reject({
            status: e.response.status,
            statusText: e.response.statusText,
            message: e.message,
        })
);

function bufferToStream(buffer) {
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    return stream;
}

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

        if (response.data.data) returnData = [...returnData, ...response.data.data];
        if (!response.data.data) returnData = { data: response.data, status: response.status };

        if (response.data.links && (response.data.links.next || response.data.links.Next)) {
            config.url = response.data.links.next.href
                ? response.data.links.next.href
                : response.data.links.Next.Href;
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

module.exports = async (
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
