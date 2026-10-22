import { isSupplied } from '../util/option-values.js';

/**
 * @typedef {object} LoginCredential
 * @property {string} key - The options attribute, e.g. `logonuserid`.
 * @property {string} flag - The long flag that sets it, e.g. `--logonuserid`.
 * @property {string} envVar - The environment variable that can set it instead.
 */

/**
 * The QSEoW login form's credentials, as `checkLoginCredentials()` names them.
 *
 * Both platforms' lists live here, side by side, rather than beside the session code that types
 * them: the workers and the wizards both read them, and test suites mock the workers and the
 * session modules wholesale - a constant exported from either would be `undefined` wherever that
 * happens. The variable names duplicate the command declarations; `commands.test.js` pins the two
 * together.
 *
 * @type {LoginCredential[]}
 */
export const QSEOW_LOGON_CREDENTIALS = [
    { key: 'logonuserdir', flag: '--logonuserdir', envVar: 'BSI_QSEOW_CST_LOGON_USER_DIR' },
    { key: 'logonuserid', flag: '--logonuserid', envVar: 'BSI_QSEOW_CST_LOGON_USER_ID' },
    { key: 'logonpwd', flag: '--logonpwd', envVar: 'BSI_QSEOW_CST_LOGON_PWD' },
];

/**
 * The Qlik Sense Cloud login form's credentials. See {@link QSEOW_LOGON_CREDENTIALS}.
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
 * satisfies the requirement nor conflicts with `--skip-login`. Exported because the QSEoW wizard
 * asks the same question at its `--skip-login` prompt, and must answer it the same way the worker
 * does.
 *
 * @param {object} options - Options, or wizard answers, keyed by option attribute.
 * @param {LoginCredential[]} credentials - The platform's logon credentials.
 *
 * @returns {LoginCredential[]} The ones with a value.
 */
export const suppliedCredentials = (options, credentials) =>
    credentials.filter(({ key }) => isSupplied(options[key]));

/**
 * Names credentials the way an operator can find them: the flag and the variable, because a value
 * left in a shared `.env` is the likeliest way to supply one without meaning to.
 *
 * @param {LoginCredential[]} credentials - The credentials to name.
 *
 * @returns {string} E.g. `--logonuserid (BSI_QSEOW_CST_LOGON_USER_ID)`.
 */
export const describeCredentials = (credentials) =>
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
 * - **With `--skip-login`** nothing is typed into a login page, so a credential is at best unused
 *   and at worst a sign the operator expects a different identity than the one the browser will
 *   sign in as. `onConflict` says which: `'reject'` stops the run, `'warn'` says so and removes the
 *   values from `options`, so nothing downstream can use them by accident. Cloud warns rather than
 *   rejects only because its `--skip-login` predates this check and accepted credentials alongside
 *   it; refusing them there is a breaking change, which needs a major release (#1101).
 *
 * @param {object} options - Command options. Mutated only in `'warn'` mode, as described.
 * @param {object} params - Check parameters.
 * @param {LoginCredential[]} params.credentials - The platform's logon credentials.
 * @param {'reject'|'warn'} params.onConflict - What a credential alongside `--skip-login` does.
 * @param {string} params.logPrefix - Log prefix, e.g. `'QSEOW'`.
 * @param {Function} params.ErrorClass - Platform error class to throw.
 * @param {object} params.logger - Logger instance.
 *
 * @returns {void}
 *
 * @throws {Error} An instance of `ErrorClass` naming each offending flag and its variable.
 */
export const checkLoginCredentials = (
    options,
    { credentials, onConflict, logPrefix, ErrorClass, logger }
) => {
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

    const conflict =
        `${logPrefix}: --skip-login is set, so nothing is typed into a login page, but ` +
        `${describeCredentials(supplied)} ${supplied.length === 1 ? 'is' : 'are'} set as well.`;

    if (onConflict === 'reject') {
        throw new ErrorClass(
            `${conflict} Remove ${supplied.length === 1 ? 'it' : 'them'} - from the environment ` +
                'as well as the command line - or drop --skip-login.'
        );
    }

    logger.warn(
        `${conflict} ${supplied.length === 1 ? 'It is' : 'They are'} ignored. A future major ` +
            'release will refuse this combination.'
    );

    for (const { key } of supplied) {
        delete options[key];
    }
};
