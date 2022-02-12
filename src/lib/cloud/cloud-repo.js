#!/usr/bin/env node
const request = require('./cloud-repo-request');

const qlikSaas = function QlikSaas(config) {
    if (!config.url) throw { message: 'URL parameter is required' };
    if (!config.token) throw { message: 'API token parameter is required' };
    if (!config.version) config.version = 1;

    config.baseURL = `https://${config.url}`;

    this.Get = async function (path) {
        if (!path) throw { message: `"path" parameter is missing` };

        return await request(config, path, 'get');
    };

    this.Delete = async function (path) {
        if (!path) throw { message: `"path" parameter is missing` };

        return await request(config, path, 'delete');
    };

    this.Patch = async function ({
        path,
        data = {},
        contentType = 'application/json',
        file = '',
        fileName = '',
    }) {
        if (!path) throw { message: `"path" parameter is missing` };
        if (!data && !file) throw { message: `"data" and/or "file" parameter is missing` };

        return await request(config, path, 'patch', data, contentType, file, fileName);
    };

    this.Post = async function ({
        path,
        data = {},
        contentType = 'application/json',
        file = '',
        fileName = '',
    }) {
        if (!path) throw { message: `"path" parameter is missing` };

        return await request(config, path, 'post', data, contentType, file, fileName);
    };

    this.Put = async function ({ path, data = {}, contentType = 'application/json', file = '' }) {
        if (!path) throw { message: `"path" parameter is missing` };

        return await request(config, path, 'put', data, contentType, file);
    };
};

module.exports = qlikSaas;
