import { logger } from '../../globals.js';
import { CloudError } from '../util/errors.js';

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
 * @returns {Promise<true>} Resolves to `true` when the API returned a user. There is no
 *     resolved-`false` path: an unusable connection rejects.
 *
 * @throws {CloudError} When the API answered but the response carries no user.
 * @throws {Error} Whatever the SaaS client threw when the call itself failed.
 */
export const qscloudTestConnection = async (options, saasInstance) => {
    // Test connection to QS Cloud by getting info about the user associated with the API key
    let res;
    try {
        logger.info(`Testing connection to Qlik Sense Cloud...`);
        res = await saasInstance.Get('users/me');
    } catch (err) {
        return Promise.reject(err);
    }

    // A response the API accepted but that carries no user is not a working connection.
    // Reporting it as one produced `Connection to tenant ... successful.` followed by four
    // lines of `undefined`, and the run then failed later for reasons that looked unrelated.
    // The guidance below is written for this specific call - a generic "check the id is
    // correct" would be nonsense here, as the operator supplied no id.
    if (!res || typeof res !== 'object' || res.id === undefined) {
        return Promise.reject(
            new CloudError(
                `Connection test to tenant ${options.tenanturl} returned a response with no user in it. ` +
                    `Check that --tenanturl points at a Qlik Sense Cloud tenant and that --apikey is a valid, unexpired API key for it.`
            )
        );
    }

    logger.info(`Connection to tenant ${options.tenanturl} successful.`);
    logger.info(`    Tenant ID : ${res.tenantId}`);
    logger.info(`    User name : ${res.name}`);
    logger.info(`    User email: ${res.email}`);
    logger.info(`    User ID   : ${res.id}`);
    logger.debug(`Full user info: ${JSON.stringify(res, null, 2)}`);

    return true;
};
