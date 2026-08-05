#!/usr/bin/env node
import request from './cloud-repo-request.js';

/**
 * Initializes a QlikSaas instance for interacting with a Qlik SaaS environment.
 *
 * @param {object} config - Configuration object.
 * @param {string} config.url - The base URL of the Qlik SaaS environment. Must include protocol.
 * @param {string} config.token - API token for authentication.
 * @param {number} [config.version] - Optional API version. Defaults to `1` if not provided.
 *
 * @throws {Error} If the URL or API token is not provided.
 *
 * @property {Function} Get - Makes a GET request to the specified path.
 * @property {Function} Delete - Makes a DELETE request to the specified path.
 * @property {Function} Patch - Makes a PATCH request with the provided data or file.
 * @property {Function} Post - Makes a POST request with the provided data or file.
 * @property {Function} Put - Makes a PUT request with the provided data or file.
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

    /**
     * Issues a GET request to the given path.
     *
     * @param {string} path - Repository API path (relative to the SaaS base URL).
     *
     * @returns {Promise<object>} The parsed response payload.
     */
    this.Get = async (path) => {
        if (!path) throw Error({ message: `"path" parameter is missing` });

        return request(config, path, 'get');
    };

    /**
     * Issues a DELETE request to the given path.
     *
     * @param {string} path - Repository API path (relative to the SaaS base URL).
     *
     * @returns {Promise<object>} The parsed response payload.
     */
    this.Delete = async (path) => {
        if (!path) throw Error({ message: `"path" parameter is missing` });

        return request(config, path, 'delete');
    };

    /**
     * Issues a PATCH request with the provided data or file.
     *
     * @param {object} opts - Patch options.
     * @param {string} opts.path - Repository API path.
     * @param {object} [opts.data] - JSON body to send. Defaults to `{}`.
     * @param {string} [opts.contentType] - Request content type. Defaults to `application/json`.
     * @param {Buffer} [opts.file] - Optional file payload for multipart uploads. Defaults to `''`.
     * @param {string} [opts.fileName] - Optional file name for multipart uploads. Defaults to `''`.
     *
     * @returns {Promise<object>} The parsed response payload.
     */
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

    /**
     * Issues a POST request with the provided data or file.
     *
     * @param {object} opts - Post options.
     * @param {string} opts.path - Repository API path.
     * @param {object} [opts.data] - JSON body to send. Defaults to `{}`.
     * @param {string} [opts.contentType] - Request content type. Defaults to `application/json`.
     * @param {Buffer} [opts.file] - Optional file payload for multipart uploads. Defaults to `''`.
     * @param {string} [opts.fileName] - Optional file name for multipart uploads. Defaults to `''`.
     *
     * @returns {Promise<object>} The parsed response payload.
     */
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

    /**
     * Issues a PUT request with the provided data or file.
     *
     * @param {object} opts - Put options.
     * @param {string} opts.path - Repository API path.
     * @param {object} [opts.data] - JSON body to send. Defaults to `{}`.
     * @param {string} [opts.contentType] - Request content type. Defaults to `application/json`.
     * @param {Buffer} [opts.file] - Optional file payload for multipart uploads. Defaults to `''`.
     *
     * @returns {Promise<object>} The parsed response payload.
     */
    this.Put = async ({ path, data = {}, contentType = 'application/json', file = '' }) => {
        if (!path) throw Error({ message: `"path" parameter is missing` });

        return request(config, path, 'put', data, contentType, file);
    };
};

export default qlikSaas;
