import path from 'node:path';

import { logger, appVersion, setLoggingLevel, bsiExecutablePath, isSea } from '../../globals.js';
import { redactOptions } from '../util/redact-secrets.js';
import { restoreLiveTerminal } from '../util/run-live.js';
import { qseowVerifyContentLibraryExists } from './qseow-contentlibrary.js';
import { qseowVerifyCertificatesExist } from './qseow-certificates.js';
import { qseowProcessApp } from './qseow-process-app.js';
import { qseowPlanApp } from './qseow-plan-app.js';
import { listAppsByTag } from './qseow-app-lookup.js';
import { readQseowPlanFacts } from './qseow-tagged-sheets.js';
import { toAppIdList } from '../util/app-ids.js';
import { QSEOW_SHEET_PARTS, QSEOW_SHEET_PART_LABELS } from './sheet-parts.js';
import { logError } from '../util/log-error.js';
import {
    runOverAppsWithReport,
    announceDryRun,
    emitRunHeader,
    startLiveRunView,
    buildSheetRules,
    buildSheetPartSection,
    buildBrowserPlanSection,
} from '../util/run-report.js';

/**
 * Create thumbnails for Qlik Sense Enterprise on Windows (QSEoW).
 *
 * @param {object} options - Object containing options for creating thumbnails.
 * @param {string} options.host - Hostname of QSEoW server.
 * @param {number} options.port - Port number of QSEoW server.
 * @param {string} options.username - Username for QSEoW server.
 * @param {string} options.userdirectory - User directory for QSEoW server.
 * @param {string} options.password - Password for QSEoW server.
 * @param {string} options.contentlibrary - Name of content library where thumbnails will be stored.
 * @param {string[]} options.appid - IDs of apps for which thumbnails will be created. Added to
 *     whatever `qliksensetag` matches rather than replacing it.
 * @param {string} options.qliksensetag - Tag for which apps will be processed.
 * @param {string} options.includesheetpart - Optional parameter to include sheet parts in the thumbnails. Values: 1, 2, 3, 4. Normalised to a string on entry, so a number is also accepted.
 * @param {string} options.certfile - Path to certificate file.
 * @param {string} options.certkeyfile - Path to certificate key file.
 * @param {string} options.loglevel - Log level for the operation.
 *
 * @returns {Promise<boolean>} Resolves to `true` if thumbnails were created successfully, `false` otherwise.
 */
export const qseowCreateThumbnails = async (options) => {
    try {
        setLoggingLevel(options.loglevel);

        // Emitted here rather than in the command handler: the wizard calls
        // this worker directly, and the header's rung must be decided from
        // the options the run actually uses - wizard answers included. The
        // decided rung is threaded through the whole run so the header and
        // the blocks cannot disagree.
        const rung = emitRunHeader({
            version: appVersion,
            jobLabel: 'QSEoW sheet thumbnails',
            options,
        });

        const dryRun = Boolean(options.dryRun);
        if (dryRun) {
            // Before anything connects: without this the log opens exactly like
            // a real run and the first dry-run marker arrives after the last app.
            announceDryRun('qseow create-sheet-thumbnails', rung);
        }

        // The live view (rung C, issue #1075). Null on every other rung and
        // on dry runs; every use below is optional-chained so this worker
        // reads identically with and without it.
        const live = startLiveRunView({ rung, dryRun });

        logger.info('Starting creation of thumbnails for Qlik Sense Enterprise on Windows (QSEoW)');
        logger.verbose(`Running as standalone app: ${isSea}`);
        logger.debug(`BSI executable path: ${bsiExecutablePath}`);
        logger.debug(`Options: ${JSON.stringify(redactOptions(options), null, 2)}`);

        const appIdsToProcess = [];

        // Commander always yields a string here (.default('1') and .env() both produce
        // strings), but programmatic and test callers may pass a number. Normalise once so the
        // check below - and the string-only sheet-part comparisons downstream in
        // qseow-process-app.js - see a consistent type.
        options.includesheetpart = String(options.includesheetpart);

        // CLI callers are validated at parse time by the .choices() on the option definition,
        // built from the same list. This check protects programmatic and test callers that
        // bypass Commander.
        if (!QSEOW_SHEET_PARTS.includes(options.includesheetpart)) {
            logger.error(
                `Invalid --includesheetpart paramater: ${options.includesheetpart}. Aborting`
            );
            throw Error('Invalid --includesheetpart paramater');
        }

        // Verify QSEoW certificates exist. The live rows here and below are
        // bound to these awaits - each resolves only when its real call has
        // returned, so a hang shows as the row that never resolves.
        live?.beginStep('certificates');
        const certsExist = await qseowVerifyCertificatesExist(options);
        if (certsExist === false) {
            live?.stepFailed('certificates');
            logger.error('Missing certificate file(s). Aborting');
            throw Error('Missing certificate file(s)');
        } else {
            live?.stepDone(
                'certificates',
                [path.basename(options.certfile), path.basename(options.certkeyfile)].join(live.sep)
            );
            logger.verbose(`Certificate files found`);
        }

        // Verify content library exists
        live?.beginStep('content library');
        const contentLibraryExists = await qseowVerifyContentLibraryExists(options);
        if (contentLibraryExists === false) {
            live?.stepFailed('content library', `"${options.contentlibrary}"`);
            logger.error(`Content library '${options.contentlibrary}' does not exist - aborting`);
            throw Error('Content library does not exist');
        } else {
            live?.stepDone('content library', `"${options.contentlibrary}" exists`);
            logger.verbose(`Content library '${options.contentlibrary}' exists`);
        }

        // Apps named directly. --appid is variadic, so this is a list.
        const namedAppIds = toAppIdList(options.appid);
        appIdsToProcess.push(...namedAppIds);

        // --appid and --qliksensetag are additive, not alternatives: apps named either
        // way are all processed. runOverApps() dedupes, so an app that is both named by
        // --appid and carries the tag is still processed once.
        live?.beginStep('app list');
        let taggedAppIds = [];
        const useTag = Boolean(options.qliksensetag && options.qliksensetag.length > 0);
        if (useTag) {
            // Get all apps matching the tag in --qliksensetag. listAppsByTag returns
            // { id, name } so a picker can label them; only the ids matter here.
            const taggedApps = await listAppsByTag(options);
            taggedAppIds = taggedApps.map((app) => app.id);
            appIdsToProcess.push(...taggedAppIds);
        }

        // Plan-time facts for the run card: published-app count and the tag
        // rules' match counts across the selected apps. Read-only, and
        // degrades to nulls rather than failing the run.
        const planFacts = await readQseowPlanFacts(options, appIdsToProcess);

        // Resolved only now, after every pre-run read: the row states what the
        // loop will actually iterate, not an intermediate list.
        live?.stepDone(
            'app list',
            [
                `${new Set(appIdsToProcess).size} apps`,
                `${namedAppIds.length} named`,
                ...(useTag ? [`${taggedAppIds.length} tagged`] : []),
            ].join(live.sep)
        );

        return await runOverAppsWithReport({
            command: 'qseow create-sheet-thumbnails',
            dryRun,
            rung,
            appIds: appIdsToProcess,
            namedAppIds,
            selectorAppIds: taggedAppIds,
            selector: useTag ? { option: 'qliksensetag', value: options.qliksensetag } : null,
            plan: {
                target: {
                    platform: 'qseow',
                    host: options.host,
                    port: options.port ?? null,
                    secure: options.secure,
                    prefix: options.prefix ?? '',
                    enginePort: options.engineport,
                    qrsPort: options.qrsport,
                    schemaVersion: options.schemaversion,
                },
                auth: {
                    apiUser: { directory: options.apiuserdir, userId: options.apiuserid },
                    certFile: options.certfile,
                    logonUser: { directory: options.logonuserdir, userId: options.logonuserid },
                },
                sheetPart: buildSheetPartSection(options.includesheetpart, QSEOW_SHEET_PART_LABELS),
                rules: buildSheetRules(options, {
                    includeTagRules: true,
                    excludeTagSheetCount: planFacts.excludeTagSheetCount,
                    blurTagSheetCount: planFacts.blurTagSheetCount,
                }),
                browser: buildBrowserPlanSection(options),
                output: { imageDir: options.imagedir, platformDir: 'qseow' },
                writes: {
                    kind: 'thumbnails',
                    contentLibrary: options.contentlibrary,
                    publishedAppCount: planFacts.publishedAppCount,
                },
            },
            logPrefix: { plan: 'QSEOW PLAN APP', process: 'QSEOW PROCESS APP' },
            emptySelectionHint: 'Check the --appid and --qliksensetag options.',
            planApp: (appId, report) => qseowPlanApp(appId, options, report),
            processApp: (appId, report) => qseowProcessApp(appId, options, report),
        });
    } catch (err) {
        // First, unconditionally: a throw mid-animation must hand the cursor
        // and the console transport back before anything else is logged.
        // No-op when no live view is active.
        restoreLiveTerminal();

        logError('QSEOW CREATE THUMBNAILS 2', err);

        return false;
    }
};
