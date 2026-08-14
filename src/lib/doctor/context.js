import os from 'node:os';

import { logger, isSea } from '../../globals.js';

/**
 * The facts every diagnostic check starts from.
 *
 * `ctx` is assembled once per run and handed to every check. Passing facts in, rather than letting
 * a check read the world for itself, is what makes checks unit-testable without mocking the
 * filesystem - and it is what lets the runner promise that a check never reaches the network.
 *
 * This module holds the part that is true of any subject. Area-specific facts are added by
 * whichever worker is running the checks: `browserCheck()` extends this with the browser cache,
 * the executable override, the cached builds and the launch result.
 */

/**
 * The account this process is running as.
 *
 * `os.userInfo()` throws when the effective uid has no passwd entry, which happens in slim
 * containers. The account is diagnostic information, not a reason to fail a diagnosis.
 *
 * @returns {string} The username, or a plain statement that it could not be determined.
 */
const currentUser = () => {
    try {
        return os.userInfo().username;
    } catch {
        return 'unknown';
    }
};

/**
 * Builds the context every check receives.
 *
 * `user`, `homeDir` and `cwd` are here deliberately, and they earn their place on Windows Server:
 * a scheduled task running as LocalSystem has a home directory under
 * `C:\Windows\system32\config\systemprofile` and a working directory of `C:\Windows\system32`.
 * That turns "the browser cache is empty" into a one-glance diagnosis. The working directory
 * matters for a second reason: `globals.js` loads `dotenv/config`, so a `.env` file beside the
 * executable may never be found under a scheduled task.
 *
 * @param {object} options - Resolved CLI options for the command being run.
 * @param {object} [extra] - Extra fields to merge in.
 * @param {string} [extra.hostPlatform] - Puppeteer's name for this machine's platform, when it
 * could be detected.
 *
 * @returns {object} The base context.
 */
export const buildBaseContext = (options, { hostPlatform } = {}) => ({
    options,
    // A snapshot rather than `process.env` itself, so a check cannot read a variable that was set
    // after the run began, and so the environment a report describes is the one it was made from.
    env: {
        PUPPETEER_CACHE_DIR: process.env.PUPPETEER_CACHE_DIR,
        PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH,
        BSI_BROWSER_CACHE_DIR: process.env.BSI_BROWSER_CACHE_DIR,
        BSI_BROWSER_EXECUTABLE_PATH: process.env.BSI_BROWSER_EXECUTABLE_PATH,
    },
    host: {
        hostPlatform,
        nodePlatform: process.platform,
        arch: process.arch,
        user: currentUser(),
        homeDir: os.homedir(),
        cwd: process.cwd(),
        isSea,
    },
    // For `debug` only. A check that logs anything a user is meant to read has taken over the
    // renderer's job, and the finding it should have returned is then invisible to JSON output.
    logger,
});
