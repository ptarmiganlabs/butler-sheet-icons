import { logger, appVersion, setLoggingLevel, bsiExecutablePath, isSea } from '../../globals.js';
import { redactOptions } from '../util/redact-secrets.js';
import QlikSaas from './cloud-repo.js';
import { qscloudTestConnection } from './cloud-test-connection.js';
import { processCloudApp } from './process-cloud-app.js';
import { cloudPlanApp } from './cloud-plan-app.js';
import { resolveCloudAppSelection } from './cloud-app-selection.js';
import {
    runOverAppsWithReport,
    announceDryRun,
    emitRunHeader,
    startLiveRunView,
    buildSheetRules,
    buildSheetPartSection,
    buildBrowserPlanSection,
} from '../util/run-report.js';
import { restoreLiveTerminal } from '../util/run-live.js';
import { CLOUD_SHEET_PARTS, CLOUD_SHEET_PART_LABELS } from './sheet-parts.js';
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

        // Emitted here rather than in the command handler: the wizard calls
        // this worker directly, and the header's rung must be decided from
        // the options the run actually uses - wizard answers included.
        const rung = emitRunHeader({
            version: appVersion,
            jobLabel: 'Qlik Sense Cloud sheet thumbnails',
            options,
        });

        const dryRun = Boolean(options.dryRun);
        if (dryRun) {
            // Before anything connects - mirrors the QSEoW twin.
            announceDryRun('qscloud create-sheet-thumbnails', rung);
        }

        // The live view (rung C, issue #1075) - wired at the same time as the
        // QSEoW twin, with the platform's own preflight sequence.
        const live = startLiveRunView({ rung, dryRun });

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

        // Test connection to QS Cloud by getting info about the user associated with the API key.
        // The live row is bound to this await - the Cloud twin of the QSEoW
        // certificate/library rows.
        live?.beginStep('tenant', options.tenanturl);
        try {
            const res = await qscloudTestConnection(options, saasInstance);
            live?.stepDone('tenant', options.tenanturl);
            logger.verbose(
                `Connection to tenant ${options.tenanturl} successful: ${JSON.stringify(res)}`
            );
        } catch (err) {
            // Restore before the error lines so they land on a sane terminal;
            // this branch returns without reaching the outer catch.
            live?.stepFailed('tenant', options.tenanturl);
            restoreLiveTerminal();
            logError('TEST CONNECTIVITY 1', err);
            if (err?.status && err?.statusText) {
                logger.error(`TEST CONNECTIVITY 1 (error code): ${err.status}="${err.statusText}"`);
            }

            return false;
        }

        // Selection resolution is shared with the other Cloud command; the
        // provenance it returns feeds the run report directly.
        live?.beginStep('app list');
        const selection = await resolveCloudAppSelection(saasInstance, options);
        live?.stepDone(
            'app list',
            [
                `${new Set(selection.appIds).size} apps`,
                `${selection.namedAppIds.length} named`,
                ...(selection.selector
                    ? [`${selection.selectorAppIds.length} from collection`]
                    : []),
            ].join(live.sep)
        );

        return await runOverAppsWithReport({
            command: 'qscloud create-sheet-thumbnails',
            dryRun,
            rung,
            ...selection,
            plan: {
                target: { platform: 'cloud', tenantUrl: options.tenanturl },
                auth: {
                    apiKey: true,
                    logonUserId: options.logonuserid ?? null,
                    skipLogin: options.skipLogin === true,
                },
                sheetPart: buildSheetPartSection(options.includesheetpart, CLOUD_SHEET_PART_LABELS),
                // No tag rules: Cloud cannot tag individual sheets, and the
                // warning above already covers a tag option that was supplied.
                rules: buildSheetRules(options),
                browser: buildBrowserPlanSection(options),
                output: { imageDir: options.imagedir, platformDir: 'cloud' },
                writes: { kind: 'thumbnails', contentLibrary: null, publishedAppCount: null },
            },
            logPrefix: { plan: 'CLOUD PLAN APP', process: 'CLOUD PROCESS APP' },
            emptySelectionHint: 'Check the --appid and --collectionid options.',
            planApp: (appId, report) => cloudPlanApp(appId, saasInstance, options, report),
            processApp: (appId, report) => processCloudApp(appId, saasInstance, options, report),
        });
    } catch (err) {
        // First, unconditionally: a throw mid-animation must hand the cursor
        // and the console transport back before anything else is logged.
        restoreLiveTerminal();

        logError('CLOUD CREATE THUMBNAILS 2', err);

        return false;
    }
};
