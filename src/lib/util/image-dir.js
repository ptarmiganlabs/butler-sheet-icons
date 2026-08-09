import fs from 'node:fs';

import { logger } from '../../globals.js';
import { markReported } from './reported-error.js';

/**
 * Creates the per-app image directory, and explains a permission failure rather than leaking it.
 *
 * Extracted from `process-cloud-app.js` and `qseow-process-app.js`, which carried the same six
 * lines with the same purpose and had already drifted apart in log shape - one logged the stack
 * first, the other the raw error first, and neither marked the failure as reported, so the same
 * problem was described twice on the way out.
 *
 * The reason it is worth a module of its own is the message. In the Docker image this `mkdir` is
 * the first thing that touches a bind-mounted host directory, and when the container user cannot
 * write there the operator gets `EACCES: permission denied, mkdir './img/cloud/<id>'` - which
 * names the syscall and nothing that would help them act (issue #915). The container adapts to the
 * mount's owner now, so this is the residue: a read-only mount, a root-owned one, or an explicit
 * `--user` pointed at a directory somebody else owns.
 *
 * @param {object} params - Parameters.
 * @param {string} params.imagedir - Value of `--imagedir`, as given by the user.
 * @param {string} params.platform - Platform segment of the path, `cloud` or `qseow`.
 * @param {string} params.appId - App the directory is being created for.
 * @param {string} params.logPrefix - Log line prefix without a trailing colon, e.g. `'CLOUD APP'`.
 * @param {Function} params.ErrorClass - Typed error to throw, e.g. `CloudError` or `QseowError`.
 *
 * @returns {string} The directory that was created.
 *
 * @throws {Error} An instance of `params.ErrorClass`, marked as already reported, with the original
 * error attached as `cause`.
 */
export const createAppImageDir = ({ imagedir, platform, appId, logPrefix, ErrorClass }) => {
    const dir = `${imagedir}/${platform}/${appId}`;

    try {
        fs.mkdirSync(dir, { recursive: true });
        logger.verbose(`Created ${platform} image directory '${dir}'`);

        return dir;
    } catch (err) {
        logPermissionAdvice(dir, logPrefix, err);

        throw markReported(
            new ErrorClass(`Could not create the image directory '${dir}'`, { cause: err })
        );
    }
};

/**
 * Explains why the image directory could not be created, and what to do about it.
 *
 * Message shape follows `logUnusableBrowser` in `browser-launch.js`: what failed, then the thing to
 * do next, with diagnostics demoted to debug so they do not bury the advice.
 *
 * The permission case gets its own text because the remedy is completely different from, say, a
 * full disk - and because in a container the cause is invisible from the message the OS provides.
 *
 * @param {string} dir - Directory that could not be created.
 * @param {string} logPrefix - Log line prefix, e.g. `'QSEOW'`.
 * @param {Error|unknown} err - The underlying failure.
 *
 * @returns {void}
 */
const logPermissionAdvice = (dir, logPrefix, err) => {
    const code = err?.code;

    if (code === 'EACCES' || code === 'EPERM') {
        logger.error(`${logPrefix}: No permission to create the image directory '${dir}'.`);

        if (isProbablyContainer()) {
            // Inside a container this is almost always the host/container user mismatch, and the
            // operator has no way to see that from the error the OS gave us.
            logger.error(
                `${logPrefix}: The directory is mounted from the host and is owned by a user this container cannot write as.`
            );
            logger.error(
                `${logPrefix}: Butler Sheet Icons normally adopts the owner of the mounted directory automatically. That is skipped when the directory is owned by root, or when the container was started with an explicit --user.`
            );
            logger.error(
                `${logPrefix}: Mount a directory you own, or start the container with --user "$(id -u):$(id -g)" and make sure that user can write to it.`
            );
        } else {
            logger.error(
                `${logPrefix}: Check that the account running Butler Sheet Icons can write to it, or point --imagedir somewhere it can.`
            );
        }
    } else if (code === 'EROFS') {
        logger.error(`${logPrefix}: The image directory '${dir}' is on a read-only filesystem.`);
        logger.error(
            `${logPrefix}: Point --imagedir at a writable location. In Docker, check the mount for a ":ro" flag.`
        );
    } else if (code === 'ENOENT') {
        // A read-only Docker mount arrives here rather than as EROFS: Node's recursive mkdir
        // reports the missing leaf instead of the read-only parent it could not create. Observed
        // with `-v vol:/nodeapp/img:ro`, so the advice has to cover both readings of ENOENT.
        logger.error(`${logPrefix}: Could not create the image directory '${dir}'.`);
        logger.error(
            `${logPrefix}: Check that the path given to --imagedir exists and is writable. In Docker, this is also what a read-only mount looks like - check the mount for a ":ro" flag.`
        );
    } else {
        logger.error(
            `${logPrefix}: Could not create the image directory '${dir}': ${err?.message ?? err}`
        );
    }

    logger.debug(err?.stack ?? String(err));
};

/**
 * Best-effort guess at whether this process is running inside a container.
 *
 * Only used to choose which advice to print, so a wrong answer costs a slightly less relevant
 * error message and nothing else. `detectDocker` in `browser-launch.js` answers the same question
 * for a decision that matters more and is correspondingly more thorough; this deliberately stays
 * synchronous, because it runs inside a `catch`.
 *
 * @returns {boolean} `true` when the process looks containerised.
 */
const isProbablyContainer = () => {
    try {
        return fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv');
    } catch {
        return false;
    }
};
