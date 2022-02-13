#!/usr/bin/env node
/* eslint-disable no-param-reassign */
const request = require('./cloud-repo-request');

const qlikSaas = function QlikSaas(config) {
    if (!config.url) throw Error({ message: 'URL parameter is required' });
    if (!config.token) throw Error({ message: 'API token parameter is required' });
    if (!config.version) config.version = 1;

    config.baseURL = `https://${config.url}`;

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
