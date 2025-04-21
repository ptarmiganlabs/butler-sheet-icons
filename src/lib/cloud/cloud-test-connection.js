/* eslint-disable import/extensions */
const { logger } = require('../../globals.js');

/**
 * Tests connection to Qlik Sense Cloud by getting info about the user associated with the API key.
 *
 * @param {object} options - Configuration options for the connection test.
 * @param {string} options.tenanturl - URL of Qlik Sense Cloud tenant.
 * @param {string} options.apikey - API key for Qlik Sense Cloud tenant.
 * @param {string} options.logonuserid - user ID for Qlik Sense Cloud tenant.
 * @param {string} options.logonpwd - password for Qlik Sense Cloud tenant.
 * @param {string} options.loglevel - log level for the operation.
 * @param {QlikSaas} saasInstance - Instance of QlikSaas class.
 *
 * @returns {Promise<boolean>} - Resolves to true if connection is successful, false otherwise.
 *
 * @throws {Error} - Throws an error if there is an issue during the connection test.
 */
const qscloudTestConnection = async (options, saasInstance) => {
    // Test connection to QS Cloud by getting info about the user associated with the API key
    try {
        logger.info(`Testing connection to Qlik Sense Cloud...`);
        const res = await saasInstance.Get('users/me');
        logger.info(`Connection to tenant ${options.tenanturl} successful.`);
        logger.info(`    Tenant ID : ${res?.tenantId}`);
        logger.info(`    User name : ${res?.name}`);
        logger.info(`    User email: ${res?.email}`);
        logger.info(`    User ID   : ${res?.id}`);
        logger.debug(`Full user info: ${JSON.stringify(res, null, 2)}`);
    } catch (err) {
        return Promise.reject(err);
    }
    return true;
};

module.exports = {
    qscloudTestConnection,
};
