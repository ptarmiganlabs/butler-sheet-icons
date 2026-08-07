import qrsInteract from 'qrs-interact';

import { logger, setLoggingLevel, bsiExecutablePath, isSea } from '../../globals.js';
import { redactOptions } from '../util/redact-secrets.js';
import { qseowVerifyContentLibraryExists } from './qseow-contentlibrary.js';
import { qseowVerifyCertificatesExist } from './qseow-certificates.js';
import { setupQseowQrsConnection } from './qseow-qrs.js';
import { qseowProcessApp } from './qseow-process-app.js';
import { runOverApps } from '../util/run-over-apps.js';

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
 * @param {string} options.appid - ID of app for which thumbnails will be created.
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
        // Set log level
        if (options.loglevel === undefined || options.logLevel) {
            options.loglevel = options.logLevel;
        }
        setLoggingLevel(options.loglevel);

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

        // If --includesheetpart has been specifed it should contain a valid value
        if (!['1', '2', '3', '4'].includes(options.includesheetpart)) {
            logger.error(
                `Invalid --includesheetpart paramater: ${options.includesheetpart}. Aborting`
            );
            throw Error('Invalid --includesheetpart paramater');
        }

        // Verify QSEoW certificates exist
        const certsExist = await qseowVerifyCertificatesExist(options);
        if (certsExist === false) {
            logger.error('Missing certificate file(s). Aborting');
            throw Error('Missing certificate file(s)');
        } else {
            logger.verbose(`Certificate files found`);
        }

        // Verify content library exists
        const contentLibraryExists = await qseowVerifyContentLibraryExists(options);
        if (contentLibraryExists === false) {
            logger.error(`Content library '${options.contentlibrary}' does not exist - aborting`);
            throw Error('Content library does not exist');
        } else {
            logger.verbose(`Content library '${options.contentlibrary}' exists`);
        }

        // Is there a specific app ID specified?
        if (options.appid) {
            appIdsToProcess.push(options.appid);
        }

        // If --qliksensetag exists we should loop over all matching apps.
        // If --qliksensetag does not exist the app specified by --appid should be processed.
        if (options.qliksensetag && options.qliksensetag.length > 0) {
            // Get all apps matching the tag in --qliksensetag
            const qseowConfigQrs = setupQseowQrsConnection(options);

            const qrsInteractInstance = new qrsInteract(qseowConfigQrs);
            logger.debug(`QSEoW QRS config: ${JSON.stringify(qseowConfigQrs, null, 2)}`);

            logger.debug(`GETAPPS 1: app/full?filter=tags.name eq '${options.qliksensetag}'`);
            const result = await qrsInteractInstance.Get(
                `app/full?filter=tags.name eq '${options.qliksensetag}'`
            );

            // Add all apps with this tag

            for (const app of result.body) {
                appIdsToProcess.push(app.id);
            }
        }

        const { total, failed } = await runOverApps(
            appIdsToProcess,
            {
                logPrefix: 'QSEOW PROCESS APP',
                emptySelectionHint: 'Check the --appid and --qliksensetag options.',
            },
            (appId) => qseowProcessApp(appId, options)
        );

        // An app the worker could not finish, or a selection that resolved to no
        // apps at all, is a failed run - not a successful one with error text in it.
        return total > 0 && failed === 0;
    } catch (err) {
        if (err.stack) {
            logger.error(`QSEOW CREATE THUMBNAILS 2 (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`QSEOW CREATE THUMBNAILS 2 (message): ${err.message}`);
        } else {
            logger.error(`QSEOW CREATE THUMBNAILS 2: ${err}`);
        }

        return false;
    }
};
