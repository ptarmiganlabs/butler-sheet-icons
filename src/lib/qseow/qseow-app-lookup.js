import qrsInteract from 'qrs-interact';

import { logger } from '../../globals.js';
import { setupQseowQrsConnection } from './qseow-qrs.js';
import { qrsFilterAnyOf, qrsPathWithFilter } from './qrs-filter.js';

/**
 * Looks up the IDs of all QSEoW apps carrying a given tag.
 *
 * Shared by the two commands that accept `--qliksensetag`. They previously held byte-identical
 * copies of this block, which is the drift this repo keeps paying for - and duplication the
 * quality gate counts.
 *
 * @param {object} options - QSEoW options, as passed to the command.
 * @param {string|string[]} options.qliksensetag - Tag(s) an app must carry to be included.
 *     Callers are expected to have checked this is non-empty; an empty list throws rather than
 *     quietly selecting nothing or everything.
 * @param {string} options.host - Qlik Sense server hostname.
 * @param {number} options.qrsport - QRS port number.
 * @param {string} options.certfile - Path to the certificate file.
 * @param {string} options.certkeyfile - Path to the certificate key file.
 *
 * @returns {Promise<string[]>} IDs of the matching apps, empty if the tag matched nothing.
 */
export const getAppIdsByTag = async (options) => {
    const qseowConfigQrs = setupQseowQrsConnection(options);

    const qrsInteractInstance = new qrsInteract(qseowConfigQrs);
    logger.debug(`QSEoW QRS config: ${JSON.stringify(qseowConfigQrs, null, 2)}`);

    const filter = qrsFilterAnyOf('tags.name', options.qliksensetag);

    // Logged unencoded: this line exists so an administrator can see why a tag matched nothing,
    // and the percent-encoded form is least readable in exactly the case they are chasing - a
    // tag containing punctuation.
    logger.debug(`GETAPPS 1: app/full?filter=${filter}`);

    const result = await qrsInteractInstance.Get(qrsPathWithFilter('app/full', filter));

    return result.body.map((app) => app.id);
};
