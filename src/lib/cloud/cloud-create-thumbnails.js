import { logger, setLoggingLevel, bsiExecutablePath, isSea } from '../../globals.js';
import { redactOptions } from '../util/redact-secrets.js';
import QlikSaas from './cloud-repo.js';
import { qscloudTestConnection } from './cloud-test-connection.js';
import { processCloudApp } from './process-cloud-app.js';
import { cloudPlanApp } from './cloud-plan-app.js';
import { listAppsByCollection } from './cloud-apps.js';
import { toAppIdList } from '../util/app-ids.js';
import { runOverAppsWithReport, announceDryRun } from '../util/run-report.js';
import { CLOUD_SHEET_PARTS } from './sheet-parts.js';
import { logError } from '../util/log-error.js';

/**
 * Create thumbnails for Qlik Sense Cloud (QSC).
 *
 * @param {object} options - Object containing options for creating thumbnails.
 * @param {string} options.tenanturl - URL of Qlik Sense Cloud tenant.
 * @param {string} options.apikey - API key for Qlik Sense Cloud tenant.
 * @param {string} options.loglevel - Log level for the operation.
 * @param {string} options.logonuserid - User ID for Qlik Sense Cloud tenant.
 * @param {string} options.logonpwd - Password for Qlik Sense Cloud tenant.
 * @param {string} options.collectionid - ID of collection in Qlik Sense Cloud tenant.
 * @param {string[]} options.appid - IDs of apps in Qlik Sense Cloud tenant. Added to whatever
 *     `collectionid` matches rather than replacing it.
 * @param {string} options.imagedir - Directory where images will be stored.
 * @param {string} options.includesheetpart - Optional parameter to include sheet parts in the thumbnails. Values: 1, 2, 4. Normalised to a string on entry, so a number is also accepted.
 * @param {string} options.schemaversion - Version of the QS schema.
 * @param {string} options.browser - Name of browser to use for rendering thumbnails.
 * @param {string} options.browserVersion - Version of browser to use for rendering thumbnails.
 * @param {Array<string>} options.blurSheetStatus - Sheet statuses to blur. Variadic, and defaulted to `[]` by Commander.
 * @param {Array<string>} options.blurSheetNumber - Sheet numbers (1=first sheet) to blur.
 * @param {string|string[]} options.excludeSheetTag - Tags for sheets to exclude. Read only to warn: Qlik Sense Cloud cannot tag individual sheets, so the option is accepted and ignored.
 * @param {string|string[]} options.blurSheetTag - Tags for sheets whose thumbnail should be blurred. Read only to warn, for the same reason.
 * @param {string} options.blurFactor - Blur factor.
 *
 * @returns {Promise<boolean>} Resolves to `true` if thumbnails were created successfully, `false` otherwise.
 */
export const qscloudCreateThumbnails = async (options) => {
    try {
        setLoggingLevel(options.loglevel);

        const dryRun = Boolean(options.dryRun);
        if (dryRun) {
            // Before anything connects - mirrors the QSEoW twin.
            announceDryRun('qscloud create-sheet-thumbnails');
        }

        logger.info('Starting creation of thumbnails for Qlik Sense Cloud');
        logger.verbose(`Running as standalone app: ${isSea}`);
        logger.debug(`BSI executable path: ${bsiExecutablePath}`);
        logger.debug(`Options: ${JSON.stringify(redactOptions(options), null, 2)}`);

        // Qlik Sense Cloud has no way to tag an individual sheet, so the two tag-based sheet
        // rules cannot be honoured here. Both options are accepted by the parser for
        // compatibility with existing scripts, and both have always done nothing - say so rather
        // than let the operator believe a rule is in force. See issue #840.
        for (const [optionName, value] of [
            ['--exclude-sheet-tag', options.excludeSheetTag],
            ['--blur-sheet-tag', options.blurSheetTag],
        ]) {
            // Commander hands these over as a bare string, an array, or - from an empty
            // environment variable - an array holding one empty string. Only a real tag warns.
            const tags = (Array.isArray(value) ? value : [value]).filter(Boolean);

            if (tags.length > 0) {
                logger.warn(
                    `${optionName} is not supported for Qlik Sense Cloud and will be ignored: individual sheets cannot be tagged there. Use the sheet number, title or status options instead.`
                );
            }
        }

        const appIdsToProcess = [];

        // Commander always yields a string here (.default('1'), .env() and the .choices()
        // wrapper all produce strings), but programmatic and test callers may pass a number.
        // Normalise once so the check below - and the string-only sheet-part comparisons
        // downstream in sheet-screenshot.js - see a consistent type.
        options.includesheetpart = String(options.includesheetpart);

        // CLI callers are validated at parse time by the .choices() on the option definition,
        // built from the same list. This check protects programmatic and test callers that
        // bypass Commander.
        if (!CLOUD_SHEET_PARTS.includes(options.includesheetpart)) {
            logger.error(
                `Invalid --includesheetpart paramater: ${options.includesheetpart}. Aborting`
            );
            throw Error('Invalid --includesheetpart paramater');
        }

        // Get array of all available collections
        const cloudConfig = {
            url: options.tenanturl,
            token: options.apikey,
            // version: X, // optional. default is: 1
        };
        const saasInstance = new QlikSaas(cloudConfig);

        // Test connection to QS Cloud by getting info about the user associated with the API key
        try {
            const res = await qscloudTestConnection(options, saasInstance);
            logger.verbose(
                `Connection to tenant ${options.tenanturl} successful: ${JSON.stringify(res)}`
            );
        } catch (err) {
            logError('TEST CONNECTIVITY 1', err);
            if (err?.status && err?.statusText) {
                logger.error(`TEST CONNECTIVITY 1 (error code): ${err.status}="${err.statusText}"`);
            }

            return false;
        }

        // Apps named directly. --appid is variadic, so this is a list.
        const namedAppIds = toAppIdList(options.appid);
        appIdsToProcess.push(...namedAppIds);

        // --appid and --collectionid are additive, not alternatives: apps named either
        // way are all processed. runOverApps() dedupes, so an app that is both named by
        // --appid and in the collection is still processed once.
        let collectionAppIds = [];
        const useCollection = Boolean(options.collectionid && options.collectionid.length > 0);
        if (useCollection) {
            const apps = await listAppsByCollection(saasInstance, options.collectionid);
            logger.verbose(`Collection '${options.collectionid}' exists`);
            collectionAppIds = apps.map((app) => app.id);
            appIdsToProcess.push(...collectionAppIds);
        }

        return await runOverAppsWithReport({
            command: 'qscloud create-sheet-thumbnails',
            dryRun,
            appIds: appIdsToProcess,
            namedAppIds,
            selectorAppIds: collectionAppIds,
            selector: useCollection
                ? { option: 'collectionid', value: options.collectionid }
                : null,
            logPrefix: { plan: 'CLOUD PLAN APP', process: 'CLOUD PROCESS APP' },
            emptySelectionHint: 'Check the --appid and --collectionid options.',
            planApp: (appId, report) => cloudPlanApp(appId, saasInstance, options, report),
            processApp: (appId) => processCloudApp(appId, saasInstance, options),
        });
    } catch (err) {
        logError('CLOUD CREATE THUMBNAILS 2', err);

        return false;
    }
};
