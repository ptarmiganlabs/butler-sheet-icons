import os from 'node:os';

/**
 * The account this process is running as.
 *
 * One copy, because two places need it and must not disagree: the doctor reports it as diagnostic
 * information, and a `--skip-login` failure names it as the identity Windows authentication
 * offered. A scheduled task runs as its own account rather than as the administrator who created
 * it, so this is the least obvious fact in either report.
 *
 * `os.userInfo()` throws when the effective uid has no passwd entry, which happens in slim
 * containers. The account is diagnostic information, not a reason to fail.
 *
 * `os.userInfo()` has no field for the Windows domain, which is what tells `ACME\svc-bsi` from a
 * local account of the same name. Windows sets `USERDOMAIN` for every process, so `withDomain` reads
 * it there - on Windows only, where it means that.
 *
 * @param {object} [options] - Options.
 * @param {boolean} [options.withDomain] - Prefix the Windows domain, as `DOMAIN\user`.
 * @param {string} [options.platform] - Node platform identifier. Defaults to `process.platform`.
 * @param {object} [options.env] - Environment to read the domain from. Defaults to `process.env`.
 *
 * @returns {string} The account name, or `unknown` when it could not be determined.
 */
export const currentAccount = ({
    withDomain = false,
    platform = process.platform,
    env = process.env,
} = {}) => {
    let user;
    try {
        user = os.userInfo().username;
    } catch {
        return 'unknown';
    }

    const domain = withDomain && platform === 'win32' ? env.USERDOMAIN : undefined;

    return domain ? `${domain}\\${user}` : user;
};
