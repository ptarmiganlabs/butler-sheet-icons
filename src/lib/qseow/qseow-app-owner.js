import qrsInteract from 'qrs-interact';

import { setupQseowQrsConnection } from './qseow-qrs.js';
import { qrsGetEntity, qrsGetList, qrsPut } from './qrs-response.js';
import { qrsFilterValue, qrsPathWithFilter } from './qrs-filter.js';
import { readQseowBrowserUser } from './qseow-app-session.js';
import { QseowError } from '../util/errors.js';
import { logger } from '../../globals.js';

/**
 * App owners on QSEoW, for `--change-app-owner` (issue #1209).
 *
 * The platform half of the owner change only: who owns an app, and how to give it to someone
 * else. Everything about *when* - the order of the steps, the wait, the restore and its retries,
 * what is logged and reported - lives in `util/temporary-app-owner.js`, shared with the Cloud
 * twin, so the two platforms cannot drift on the part that decides whether an app is left with
 * the wrong owner.
 *
 * Every call goes through QRS as the API user, which therefore needs the right to change app
 * owners - INTERNAL\sa_api has it, as does a RootAdmin.
 *
 * An app's owner is not all an owner change moves. QRS also hands every object in the app that
 * the previous owner had - sheets, stories, bookmarks, master items, the load script - to the new
 * owner (seen on Qlik Sense 31.62, May 2026). So the change back gives the temporary owner's own
 * objects in the app to the original owner, and this half also lists who owns which objects and
 * changes one object's owner, for the shared code to give those objects back.
 */

/**
 * A QRS id: of an app, an app object or a user.
 *
 * Checked before an id becomes part of a QRS path or filter. `--appid` is only split and trimmed
 * on its way in, and the other QRS calls carry ids inside a quoted filter value, where a wrong one
 * matches nothing; here an id is a path segment of a write, or an unquoted filter term.
 */
const QRS_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checks that an id is a QRS id before it is used.
 *
 * @param {string} id - The id.
 * @param {string} what - What it identifies, for the error message, e.g. `app`.
 *
 * @returns {string} The id.
 *
 * @throws {QseowError} When it is not a QRS id.
 */
const checkedId = (id, what) => {
    if (!QRS_ID_PATTERN.test(String(id))) {
        throw new QseowError(
            `"${id}" is not a Qlik Sense ${what} id, so BSI cannot read or change who owns it.`
        );
    }

    return id;
};

/**
 * The QRS path of one app.
 *
 * @param {string} appId - Qlik Sense app id.
 *
 * @returns {string} e.g. `app/2d3f…`.
 *
 * @throws {QseowError} When the id is not an app id.
 */
const appPath = (appId) => `app/${checkedId(appId, 'app')}`;

/**
 * The QRS path of one app object - a sheet, a story, a bookmark and so on.
 *
 * @param {string} objectId - QRS id of the app object.
 *
 * @returns {string} e.g. `app/object/5f2a…`.
 *
 * @throws {QseowError} When the id is not a QRS id.
 */
const objectPath = (objectId) => `app/object/${checkedId(objectId, 'app object')}`;

/**
 * An owner as the shared owner-change code handles it, built from a QRS user reference.
 *
 * @param {object} user - A condensed QRS user: an app's `owner`, or an entry from `user`.
 *
 * @returns {{id: string, label: string, reference: object}} The owner. `reference` is what QRS is
 *     given when this user is made an app's owner again: the condensed user, as QRS described it
 *     - the way Ctrl-Q writes owners too.
 */
const asOwner = (user) => ({
    id: user.id,
    label: `${user.userDirectory}\\${user.userId}`,
    reference: {
        id: user.id,
        userDirectory: user.userDirectory,
        userId: user.userId,
        name: user.name,
    },
});

/**
 * Looks up the user that is to own the apps while they are processed.
 *
 * Done once, before the first app (#1099's rule: a run that cannot work should stop before it
 * changes anything). A user who has never signed in to Qlik Sense has no QRS record yet, and so
 * cannot be made an owner.
 *
 * @param {object} options - QSEoW command options.
 * @param {object} user - Who to look up.
 * @param {string} user.userDirectory - User directory.
 * @param {string} user.userId - User id.
 * @param {string} source - Where the name came from, for the error message, e.g.
 *     `--logonuserdir and --logonuserid`.
 *
 * @returns {Promise<{id: string, label: string, reference: object}>} The user, as an owner.
 *
 * @throws {QseowError} When QRS has no such user, or more than one.
 */
export const findQseowOwner = async (options, { userDirectory, userId }, source) => {
    const qrs = new qrsInteract(setupQseowQrsConnection(options));
    const filter = `userDirectory eq '${qrsFilterValue(userDirectory)}' and userId eq '${qrsFilterValue(userId)}'`;
    const users = await qrsGetList(qrs, qrsPathWithFilter('user', filter));

    if (users.length === 0) {
        throw new QseowError(
            `--change-app-owner: Qlik Sense has no user ${userDirectory}\\${userId} (from ${source}), so it cannot be made an app's owner. ` +
                `Check the user directory and user id, or sign in to Qlik Sense once as that user so it gets a user record.`
        );
    }

    if (users.length > 1) {
        throw new QseowError(
            `--change-app-owner: Qlik Sense has ${users.length} users matching ${userDirectory}\\${userId} (from ${source}), so BSI cannot tell which one should own the apps.`
        );
    }

    return asOwner(users[0]);
};

/**
 * Decides who owns each app while it is processed: the browser login user.
 *
 * With form login that is `--logonuserdir` and `--logonuserid`. With `--skip-login` it is whoever
 * the virtual proxy signs the browser in as, which only a sign-in can tell - so a real run signs
 * in once to find out, and a dry run, which opens no browser, leaves it unknown.
 *
 * @param {object} options - QSEoW command options.
 * @param {object} run - The run.
 * @param {boolean} run.dryRun - Whether this is a dry run.
 *
 * @returns {Promise<{id: string, label: string, reference: object}|null>} The owner, or null on a
 *     dry run with `--skip-login`.
 *
 * @throws {QseowError} When the user cannot be found, or the browser cannot sign in.
 */
export const resolveQseowOwnerTarget = async (options, { dryRun }) => {
    let target;

    if (options.skipLogin === true) {
        if (dryRun) {
            return null;
        }

        target = await findQseowOwner(
            options,
            await readQseowBrowserUser(options),
            'the account the virtual proxy signed the browser in as'
        );
    } else {
        target = await findQseowOwner(
            options,
            { userDirectory: options.logonuserdir, userId: options.logonuserid },
            '--logonuserdir and --logonuserid'
        );
    }

    logger.info(
        `QSEOW: --change-app-owner: ${target.label} will own each app while it is processed. The API user ${options.apiuserdir}\\${options.apiuserid} still makes every write. Changing an app's owner also moves the objects in it, so any that ${target.label} already owns in an app are given back to ${target.label} after the app's owner is restored.`
    );

    return target;
};

/**
 * Reads an app's name and owner.
 *
 * @param {object} options - QSEoW command options.
 * @param {string} appId - Qlik Sense app id.
 *
 * @returns {Promise<{appName: string, owner: object, keepReason: null}>} What the shared code
 *     needs before it changes anything. QSEoW has no app whose owner must be left alone - a
 *     published app is re-owned like any other - so `keepReason` is always null.
 *
 * @throws {QseowError} When the app cannot be read, or QRS does not say who owns it.
 */
const inspectQseowApp = async (options, appId) => {
    const app = await qrsGetEntity(
        new qrsInteract(setupQseowQrsConnection(options)),
        appPath(appId)
    );

    if (!app.owner?.id) {
        throw new QseowError(`QRS did not say who owns app ${appId}.`);
    }

    return { appName: app.name ?? appId, owner: asOwner(app.owner), keepReason: null };
};

/**
 * Reads only who owns an app now - the check before each restore attempt.
 *
 * @param {object} options - QSEoW command options.
 * @param {string} appId - Qlik Sense app id.
 *
 * @returns {Promise<string>} The owner's QRS user id.
 *
 * @throws {QseowError} When the app cannot be read, or QRS does not say who owns it.
 */
const currentQseowOwnerId = async (options, appId) =>
    (await inspectQseowApp(options, appId)).owner.id;

/**
 * Makes `owner` the owner of one QRS entity - an app or an app object.
 *
 * Reads the entity again first, rather than reusing an earlier read: QRS checks `modifiedDate` on
 * a write, and the entity moves under BSI - an app's owner change moves the app and its objects,
 * and so does the save at the end of the app.
 *
 * @param {object} options - QSEoW command options.
 * @param {string} path - QRS path of the entity, already checked.
 * @param {{reference: object}} owner - The new owner, as built by this module.
 *
 * @returns {Promise<void>} Resolves once QRS has accepted the change.
 *
 * @throws {QseowError|Error} When QRS refuses or cannot be reached.
 */
const writeQseowOwner = async (options, path, owner) => {
    const entity = await qrsGetEntity(new qrsInteract(setupQseowQrsConnection(options)), path);

    await qrsPut(
        new qrsInteract(setupQseowQrsConnection(options, { contentType: 'application/json' })),
        path,
        { ...entity, owner: owner.reference }
    );
};

/**
 * Lists the objects in an app that one user owns.
 *
 * Used twice per app: before the owner change, to learn which objects the temporary owner already
 * has - the change back would hand them to the original owner - and after the restore, to find
 * which of them it did hand over.
 *
 * @param {object} options - QSEoW command options.
 * @param {string} appId - Qlik Sense app id.
 * @param {string} ownerId - QRS user id of the owner.
 *
 * @returns {Promise<Array<{id: string, name: string, objectType: string}>>} The objects. Load
 *     script, data model and similar objects have no name.
 *
 * @throws {QseowError|Error} When an id is not a QRS id, or QRS refuses or cannot be reached.
 */
const listQseowObjectsOwnedBy = async (options, appId, ownerId) => {
    const filter = `app.id eq ${checkedId(appId, 'app')} and owner.id eq ${checkedId(ownerId, 'user')}`;
    const objects = await qrsGetList(
        new qrsInteract(setupQseowQrsConnection(options)),
        qrsPathWithFilter('app/object', filter)
    );

    return objects.map((object) => ({
        id: object.id,
        name: object.name ?? '',
        objectType: object.objectType ?? '',
    }));
};

/**
 * The QSEoW half of the owner change, in the shape `withTemporaryAppOwner` takes.
 *
 * @param {object} options - QSEoW command options.
 *
 * @returns {object} `inspect`, `currentOwnerId`, `change` and `manualFix`, plus - because an owner
 *     change moves objects on QSEoW - `objectsOwnedBy`, `changeObjectOwner` and `manualObjectFix`.
 */
export const qseowAppOwners = (options) => ({
    inspect: (appId) => inspectQseowApp(options, appId),
    currentOwnerId: (appId) => currentQseowOwnerId(options, appId),
    // Async, so an id that is not one rejects like any other failure instead of throwing.
    change: async (appId, owner) => writeQseowOwner(options, appPath(appId), owner),
    manualFix: (appId, owner) =>
        `In the QMC, open Apps, edit app ${appId} and set its owner back to ${owner.label}.`,
    objectsOwnedBy: (appId, ownerId) => listQseowObjectsOwnedBy(options, appId, ownerId),
    changeObjectOwner: async (objectId, owner) =>
        writeQseowOwner(options, objectPath(objectId), owner),
    manualObjectFix: (objectList, owner) =>
        `In the QMC, open App objects and set the owner of each of these back to ${owner.label}: ${objectList}.`,
});
