import qrsInteract from 'qrs-interact';

import { logger } from '../../globals.js';
import { setupQseowQrsConnection } from './qseow-qrs.js';
import { qrsGetList } from './qrs-response.js';
import { qrsFilterAnyOf, qrsPathWithFilter } from './qrs-filter.js';

/**
 * Reduce a QRS app entry to what a caller needs.
 *
 * Shared by both lookups so "apps with this tag" and "every app" describe an app
 * the same way - the property that lets a picker treat the two lists
 * interchangeably. `name` falls back to `id` on the off chance the reply omits
 * it; against a real server all 17 apps carried one.
 *
 * @param {object} app - An entry from `app/full`.
 *
 * @returns {{id: string, name: string}} The app.
 */
const asApp = (app) => ({ id: app.id, name: app.name ?? app.id });

/**
 * Looks up all QSEoW apps carrying a given tag.
 *
 * Shared by the two commands that accept `--qliksensetag`. They previously held byte-identical
 * copies of this block, which is the drift this repo keeps paying for - and duplication the
 * quality gate counts.
 *
 * Returns `{ id, name }` rather than bare ids, matching `listAppsByCollection()` on the Cloud
 * side. The QRS reply already carries the name and this used to discard it, which would have
 * left an app picker showing GUIDs on QSEoW and names on Cloud.
 *
 * **App names are not unique** - only ids are. Two apps may legitimately share a name, so
 * anything acting on a choice must key on `id`; `name` is a label and nothing more. `name`
 * falls back to `id` if the reply ever omits it.
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
 * @returns {Promise<Array<{id: string, name: string}>>} The matching apps, empty if the tag
 *     matched nothing.
 */
export const listAppsByTag = async (options) => {
    const qseowConfigQrs = setupQseowQrsConnection(options);

    const qrsInteractInstance = new qrsInteract(qseowConfigQrs);

    // The QRS config is deliberately not dumped here. Both callers reach qseow-process-app.js
    // or qseow-upload.js in the same run, and both log it there, so repeating it adds nothing -
    // and CodeQL flags the pattern as clear-text logging of environment-derived values
    // (js/clear-text-logging). Not worth adding a fourth copy to earn a fourth alert.
    const filter = qrsFilterAnyOf('tags.name', options.qliksensetag);

    // Logged unencoded: this line exists so an administrator can see why a tag matched nothing,
    // and the percent-encoded form is least readable in exactly the case they are chasing - a
    // tag containing punctuation.
    logger.debug(`GETAPPS 1: app/full?filter=${filter}`);

    // Through qrsGetList, so a QRS response that is not a list fails as itself rather than as
    // `TypeError: result.body.map is not a function` from somewhere further down.
    const apps = await qrsGetList(qrsInteractInstance, qrsPathWithFilter('app/full', filter));

    return apps.map(asApp);
};

/**
 * Returns every app the API user can see on the server.
 *
 * The QSEoW counterpart of `listApps()` on the Cloud side, and it exists for the
 * same reason: an app picker has to be able to offer a list when the operator has
 * neither a tag nor an app id to hand, which is the position a first-time user is
 * in. Unfiltered, so what comes back is scoped by what the certificate's account
 * may read - the same scoping every other QRS call in this codebase inherits.
 *
 * **App names are not unique** - only ids are. See {@link listAppsByTag}.
 *
 * @param {object} options - QSEoW options, as passed to the command.
 * @param {string} options.host - Qlik Sense server hostname.
 * @param {number} options.qrsport - QRS port number.
 * @param {string} options.certfile - Path to the certificate file.
 * @param {string} options.certkeyfile - Path to the certificate key file.
 *
 * @returns {Promise<Array<{id: string, name: string}>>} Every readable app.
 */
export const listAllApps = async (options) => {
    const qrsInteractInstance = new qrsInteract(setupQseowQrsConnection(options));

    const apps = await qrsGetList(qrsInteractInstance, 'app/full');

    return apps.map(asApp);
};
