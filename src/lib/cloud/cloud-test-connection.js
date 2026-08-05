import { logger } from '../../globals.js';

/**
 * A Qlik SaaS HTTP client, returned by the default export of `cloud-repo.js`.
 *
 * @typedef {object} QlikSaasInstance
 * @property {(path: string) => Promise<object>} Get - Issues a GET request to the given path.
 * @property {(path: string) => Promise<object>} Delete - Issues a DELETE request to the given path.
 * @property {(opts: object) => Promise<object>} Patch - Issues a PATCH request.
 * @property {(opts: object) => Promise<object>} Post - Issues a POST request.
 * @property {(opts: object) => Promise<object>} Put - Issues a PUT request.
 */

/**
 * Tests connection to Qlik Sense Cloud by getting info about the user associated with the API key.
 *
 * @param {object} options - Configuration options for the connection test.
 * @param {string} options.tenanturl - URL of Qlik Sense Cloud tenant.
 * @param {string} options.apikey - API key for Qlik Sense Cloud tenant.
 * @param {string} options.logonuserid - User ID for Qlik Sense Cloud tenant.
 * @param {string} options.logonpwd - Password for Qlik Sense Cloud tenant.
 * @param {string} options.loglevel - Log level for the operation.
 * @param {QlikSaasInstance} saasInstance - Instance of QlikSaas class.
 *
 * @returns {Promise<boolean>} Resolves to `true` if connection is successful, `false` otherwise.
 *
 * @throws {Error} Throws an error if there is an issue during the connection test.
 */
export const qscloudTestConnection = async (options, saasInstance) => {
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
