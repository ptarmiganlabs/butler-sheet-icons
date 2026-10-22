import { isSupplied } from '../util/option-values.js';

/**
 * @typedef {object} LoginCredential
 * @property {string} key - The options attribute, e.g. `logonuserid`.
 * @property {string} flag - The long flag that sets it, e.g. `--logonuserid`.
 * @property {string} envVar - The environment variable that can set it instead.
 */

/**
 * The Qlik Sense Cloud login form's credentials, as `checkLoginCredentials()` names them.
 *
 * Kept here rather than beside the session code that types them: the worker and the wizard both
 * read them, and test suites mock the worker and the session module wholesale - a constant exported
 * from either would be `undefined` wherever that happens. The variable names duplicate the command
 * declaration; `commands.test.js` pins the two together.
 *
 * @type {LoginCredential[]}
 */
export const CLOUD_LOGON_CREDENTIALS = [
    { key: 'logonuserid', flag: '--logonuserid', envVar: 'BSI_QSCLOUD_CST_LOGON_USER_ID' },
    { key: 'logonpwd', flag: '--logonpwd', envVar: 'BSI_QSCLOUD_CST_LOGON_PWD' },
];

/**
 * The credentials that were actually given, in the list's order.
 *
 * Blank counts as not given - see `isSupplied` - so a bare `BSI_..._LOGON_PWD=` line neither
 * satisfies the requirement nor conflicts with `--skip-login`.
 *
 * @param {object} options - Options keyed by option attribute.
 * @param {LoginCredential[]} credentials - The platform's logon credentials.
 *
 * @returns {LoginCredential[]} The ones with a value.
 */
const suppliedCredentials = (options, credentials) =>
    credentials.filter(({ key }) => isSupplied(options[key]));

/**
 * Names credentials the way an operator can find them: the flag and the variable, because a value
 * left in a shared `.env` is the likeliest way to supply one without meaning to.
 *
 * @param {LoginCredential[]} credentials - The credentials to name.
 *
 * @returns {string} E.g. `--logonuserid (BSI_QSCLOUD_CST_LOGON_USER_ID)`.
 */
const describeCredentials = (credentials) =>
    credentials.map(({ flag, envVar }) => `${flag} (${envVar})`).join(', ');

/**
 * Checks the logon credentials against `--skip-login`, before the run connects to anything.
 *
 * Commander cannot express "required unless another option is set", so the credentials are not
 * mandatory to it and this is where the rule lives. It runs in the worker rather than a Commander
 * hook because the wizard calls the worker directly - a check on the command line alone would let
 * the wizard path start a run with no credentials and fail at the login page instead.
 *
 * - **Without `--skip-login`** every credential is required, as it was when Commander enforced it.
 * - **With `--skip-login`** nothing is typed into a login page, so a credential given anyway is
 *   unused. It is warned about and removed from `options`, so nothing downstream can use it by
 *   accident. Refusing it outright would be the stricter rule, but `--skip-login` accepted
 *   credentials alongside it until now, so refusing them is a breaking change that waits for a
 *   major release (#1198).
 *
 * @param {object} options - Command options. Credentials given with `--skip-login` are removed.
 * @param {object} params - Check parameters.
 * @param {LoginCredential[]} params.credentials - The platform's logon credentials.
 * @param {string} params.logPrefix - Log prefix, e.g. `'CLOUD'`.
 * @param {Function} params.ErrorClass - Platform error class to throw.
 * @param {object} params.logger - Logger instance.
 *
 * @returns {void}
 *
 * @throws {Error} An instance of `ErrorClass` naming each missing flag and its variable.
 */
export const checkLoginCredentials = (options, { credentials, logPrefix, ErrorClass, logger }) => {
    if (options.skipLogin !== true) {
        const given = suppliedCredentials(options, credentials);
        const missing = credentials.filter((credential) => !given.includes(credential));

        if (missing.length > 0) {
            throw new ErrorClass(
                `${logPrefix}: missing ${describeCredentials(missing)}. These are typed into the ` +
                    'Qlik Sense login page. Supply them, or use --skip-login if the browser is ' +
                    'signed in without a login page.'
            );
        }

        return;
    }

    const supplied = suppliedCredentials(options, credentials);

    if (supplied.length === 0) {
        return;
    }

    logger.warn(
        `${logPrefix}: --skip-login is set, so nothing is typed into a login page, but ` +
            `${describeCredentials(supplied)} ${supplied.length === 1 ? 'is' : 'are'} set as well. ` +
            `${supplied.length === 1 ? 'It is' : 'They are'} ignored. A future major release will ` +
            'refuse this combination.'
    );

    for (const { key } of supplied) {
        delete options[key];
    }
};
