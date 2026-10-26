import { logger } from '../../globals.js';
import { CloudError } from '../util/errors.js';
import { describeWithCauses } from '../util/log-error.js';
import { saasGetList } from './saas-response.js';
import { readCloudBrowserUser } from './cloud-app-session.js';

/**
 * App owners on Qlik Cloud, for `--change-app-owner` (issue #1209).
 *
 * The platform half of the owner change only: who owns an app, whether its owner may be changed
 * at all, and how to give it to someone else. Everything about *when* lives in
 * `util/temporary-app-owner.js`, shared with the QSEoW twin.
 *
 * Every call goes through the REST API as the API key's user, which therefore needs the
 * `change_owner` privilege on each app - a tenant admin has it everywhere, an analytics admin in
 * shared and managed spaces.
 */

/**
 * How a Qlik Cloud user is named to an operator.
 *
 * @param {object} user - A user from the users API: `{ id, name, email }`.
 * @param {string} [fallbackId] - What to show when the user carries neither a name nor an email.
 *
 * @returns {string} e.g. `Anna Andersson <anna@example.com>`.
 */
export const cloudUserLabel = (user, fallbackId) => {
    const name = user?.name;
    const email = user?.email;

    if (name && email && name !== email) {
        return `${name} <${email}>`;
    }

    return name || email || fallbackId || user?.id;
};

/**
 * Decides who owns each app while it is processed: the user the browser signs in as.
 *
 * Read from the tenant by a sign-in at the start of the run, in both login modes: `--logonuserid`
 * is an email address, not the user id an owner change takes, and `--skip-login` names no one. A
 * dry run opens no browser, so there it stays unknown.
 *
 * Warns when the browser's user is not the API key's: the owner change is for the browser's
 * benefit, and every write is still made by the API key's user, who must still be able to make it.
 *
 * @param {object} options - Command options.
 * @param {object} saasInstance - Configured QlikSaas client, authenticated with the API key.
 * @param {object} run - The run.
 * @param {boolean} run.dryRun - Whether this is a dry run.
 *
 * @returns {Promise<{id: string, label: string}|null>} The owner, or null on a dry run.
 *
 * @throws {CloudError} When the browser cannot sign in, or the tenant does not say who it is.
 */
export const resolveCloudOwnerTarget = async (options, saasInstance, { dryRun }) => {
    if (dryRun) {
        return null;
    }

    const user = await readCloudBrowserUser(options);
    const target = { id: user.id, label: cloudUserLabel(user, user.id) };

    logger.info(
        `CLOUD: --change-app-owner: ${target.label} will own each app while it is processed.`
    );

    try {
        const apiUser = await saasInstance.Get('users/me');

        if (apiUser?.id && apiUser.id !== target.id) {
            logger.warn(
                `CLOUD: --change-app-owner: the browser signs in as ${target.label}, so that user owns each app while it is processed. The API key belongs to ${cloudUserLabel(apiUser, apiUser.id)}, which still makes every write and must still be allowed to.`
            );
        }
    } catch (err) {
        logger.debug(
            `CLOUD APP OWNER: could not read the API key's user: ${describeWithCauses(err)}`
        );
    }

    return target;
};

/**
 * The REST path of one app.
 *
 * @param {string} appId - Qlik Sense app id.
 *
 * @returns {string} e.g. `apps/2d3f…`.
 */
const appPath = (appId) => `apps/${encodeURIComponent(appId)}`;

/**
 * Names an owner for the log, from its user id.
 *
 * Best effort: the change and the restore work on the id alone, so a user the API key may not
 * look up is still an owner BSI can hand the app back to. Only the log line gets poorer.
 *
 * @param {object} saasInstance - Configured QlikSaas client.
 * @param {string} userId - Qlik Cloud user id.
 *
 * @returns {Promise<string>} The user's label, or the id itself.
 */
const ownerLabel = async (saasInstance, userId) => {
    try {
        return cloudUserLabel(
            await saasInstance.Get(`users/${encodeURIComponent(userId)}`),
            userId
        );
    } catch (err) {
        logger.debug(
            `CLOUD APP OWNER: could not look up user ${userId}: ${describeWithCauses(err)}`
        );

        return userId;
    }
};

/**
 * Which space an app is in; empty for a personal space.
 *
 * Qlik's app attributes do not promise a `spaceId`, so when the app read carries none the
 * catalogue item is asked instead, which does.
 *
 * @param {object} saasInstance - Configured QlikSaas client.
 * @param {string} appId - Qlik Sense app id.
 * @param {object} attributes - The app's attributes, from `GET apps/{id}`.
 *
 * @returns {Promise<string>} The space id, or `''` for a personal space.
 *
 * @throws {CloudError} When there is no catalogue item to ask.
 */
const spaceIdOf = async (saasInstance, appId, attributes) => {
    if (typeof attributes?.spaceId === 'string') {
        return attributes.spaceId;
    }

    const items = await saasGetList(
        saasInstance,
        `items?resourceType=app&resourceId=${encodeURIComponent(appId)}`
    );

    if (items.length === 0) {
        throw new CloudError(
            `Qlik Cloud has no catalogue item for app ${appId}, so BSI cannot tell which space it is in.`
        );
    }

    return items[0].spaceId ?? '';
};

/**
 * Why an app's owner must be left alone, if it must.
 *
 * Decided with Göran for #1209: these apps keep their owner and are processed exactly as they
 * would be without `--change-app-owner`, so the option never leaves them worse off.
 *
 * @param {object} saasInstance - Configured QlikSaas client.
 * @param {string} appId - Qlik Sense app id.
 * @param {object} attributes - The app's attributes, from `GET apps/{id}`.
 *
 * @returns {Promise<string|null>} The reason, worded to follow "its owner was left alone:", or
 *     null when the owner may be changed.
 */
const keepReasonFor = async (saasInstance, appId, attributes) => {
    // `publishTime`, not `published`: on Qlik Cloud `published` means "distributed from
    // client-managed", and a published app is the one with a publish time.
    if (attributes?.publishTime) {
        return "the app is published, and Qlik Cloud changes a published app's owner through its source app";
    }

    if ((await spaceIdOf(saasInstance, appId, attributes)) === '') {
        return 'the app is in a personal space, which belongs to its owner';
    }

    return null;
};

/**
 * Reads an app's attributes.
 *
 * @param {object} saasInstance - Configured QlikSaas client.
 * @param {string} appId - Qlik Sense app id.
 *
 * @returns {Promise<object>} The attributes, which name an owner.
 *
 * @throws {CloudError} When the app cannot be read, or the answer names no owner.
 */
const readAppAttributes = async (saasInstance, appId) => {
    let app;
    try {
        app = await saasInstance.Get(appPath(appId));
    } catch (err) {
        throw new CloudError(`Could not read app ${appId} to find out who owns it`, { cause: err });
    }

    if (!app?.attributes?.ownerId) {
        throw new CloudError(`Qlik Cloud did not say who owns app ${appId}.`);
    }

    return app.attributes;
};

/**
 * Reads an app's name, owner, and whether that owner must be left alone.
 *
 * @param {object} saasInstance - Configured QlikSaas client.
 * @param {string} appId - Qlik Sense app id.
 *
 * @returns {Promise<{appName: string, owner: {id: string, label: string}, keepReason: string|null}>}
 *     What the shared code needs before it changes anything.
 */
const inspectCloudApp = async (saasInstance, appId) => {
    const attributes = await readAppAttributes(saasInstance, appId);

    return {
        appName: attributes.name ?? appId,
        owner: {
            id: attributes.ownerId,
            label: await ownerLabel(saasInstance, attributes.ownerId),
        },
        keepReason: await keepReasonFor(saasInstance, appId, attributes),
    };
};

/**
 * Makes `owner` the owner of an app, with `PUT apps/{id}/owner`.
 *
 * @param {object} saasInstance - Configured QlikSaas client.
 * @param {string} appId - Qlik Sense app id.
 * @param {{id: string, label: string}} owner - The new owner.
 *
 * @returns {Promise<void>} Resolves once Qlik Cloud has accepted the change.
 *
 * @throws {CloudError} When Qlik Cloud refuses or cannot be reached.
 */
const changeCloudAppOwner = async (saasInstance, appId, owner) => {
    try {
        await saasInstance.Put({ path: `${appPath(appId)}/owner`, data: { ownerId: owner.id } });
    } catch (err) {
        throw new CloudError(`Qlik Cloud did not make ${owner.label} the owner of app ${appId}`, {
            cause: err,
        });
    }
};

/**
 * The Qlik Cloud half of the owner change, in the shape `withTemporaryAppOwner` takes.
 *
 * @param {object} saasInstance - Configured QlikSaas client, authenticated with the API key.
 *
 * @returns {object} `inspect`, `currentOwnerId`, `change` and `manualFix` for Qlik Cloud.
 */
export const cloudAppOwners = (saasInstance) => ({
    inspect: (appId) => inspectCloudApp(saasInstance, appId),
    currentOwnerId: async (appId) => (await readAppAttributes(saasInstance, appId)).ownerId,
    change: (appId, owner) => changeCloudAppOwner(saasInstance, appId, owner),
    manualFix: (appId, owner) =>
        `In the Administration activity center, open Content, find app ${appId} and change its owner back to ${owner.label}.`,
});
