/* eslint-disable no-param-reassign */
const axios = require('axios');
const FormData = require('form-data');
const { Readable } = require('stream');

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
    (e) => {
        throw Error({
            status: e.response.status,
            statusText: e.response.statusText,
            message: e.message,
        });
    }
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
        const response = await axios(config);
        if (response.data.data) returnData = [...returnData, ...response.data.data];
        if (!response.data.data) returnData = { data: response.data, status: response.status };

        if (response.data.links && (response.data.links.next || response.data.links.Next)) {
            config.url = response.data.links.next.href
                ? response.data.links.next.href
                : response.data.links.Next.Href;
            return makeRequest(config, returnData);
        }
    } catch (e) {
        throw Error({
            message: 'Error in request to Qlik Cloud',
        });
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

    const response = await makeRequest(config);

    if (response.data) return response.data;
    if (type === 'post') return response.status;
    return response;
};
