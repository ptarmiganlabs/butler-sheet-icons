/* eslint-disable import/extensions */
const { logger } = require('../../globals.js');

/**
 *
 * @param {*} saasInstance
 * @returns
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
