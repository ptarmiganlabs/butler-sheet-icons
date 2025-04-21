#!/usr/bin/env node
/* eslint-disable no-param-reassign */
const request = require('./cloud-repo-request');

/**
 * Initializes a QlikSaas instance for interacting with a Qlik SaaS environment.
 *
 * @param {Object} config - Configuration object.
 * @param {string} config.url - The base URL of the Qlik SaaS environment. Must include protocol.
 * @param {string} config.token - API token for authentication.
 * @param {number} [config.version=1] - Optional API version, defaults to 1 if not provided.
 *
 * @throws Will throw an error if the URL or API token is not provided.
 *
 * @property {function} Get - Makes a GET request to the specified path.
 * @property {function} Delete - Makes a DELETE request to the specified path.
 * @property {function} Patch - Makes a PATCH request with the provided data or file.
 * @property {function} Post - Makes a POST request with the provided data or file.
 * @property {function} Put - Makes a PUT request with the provided data or file.
 */
const qlikSaas = function QlikSaas(config) {
    if (!config.url) throw Error({ message: 'URL parameter is required' });
    if (!config.token) throw Error({ message: 'API token parameter is required' });
    if (!config.version) config.version = 1;

    // Does the URL start with "http://" or "https://"?
    // If not, add "https://" to the beginning of the URL
    if (!config.url.startsWith('http://') && !config.url.startsWith('https://')) {
        config.url = `https://${config.url}`;
    }

    config.baseURL = config.url;

    this.Get = async (path) => {
        if (!path) throw Error({ message: `"path" parameter is missing` });

        return request(config, path, 'get');
    };

    this.Delete = async (path) => {
        if (!path) throw Error({ message: `"path" parameter is missing` });

        return request(config, path, 'delete');
    };

    this.Patch = async ({
        path,
        data = {},
        contentType = 'application/json',
        file = '',
        fileName = '',
    }) => {
        if (!path) throw Error({ message: `"path" parameter is missing` });
        if (!data && !file) throw Error({ message: `"data" and/or "file" parameter is missing` });

        return request(config, path, 'patch', data, contentType, file, fileName);
    };

    this.Post = async ({
        path,
        data = {},
        contentType = 'application/json',
        file = '',
        fileName = '',
    }) => {
        if (!path) throw Error({ message: `"path" parameter is missing` });

        return request(config, path, 'post', data, contentType, file, fileName);
    };

    this.Put = async ({ path, data = {}, contentType = 'application/json', file = '' }) => {
        if (!path) throw Error({ message: `"path" parameter is missing` });

        return request(config, path, 'put', data, contentType, file);
    };
};

module.exports = qlikSaas;
