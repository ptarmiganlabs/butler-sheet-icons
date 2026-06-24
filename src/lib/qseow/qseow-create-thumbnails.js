import qrsInteract from 'qrs-interact';

import { logger, setLoggingLevel, bsiExecutablePath, isSea, sleep } from '../../globals.js';
import { qseowVerifyContentLibraryExists } from './qseow-contentlibrary.js';
import { qseowVerifyCertificatesExist } from './qseow-certificates.js';
import { setupQseowQrsConnection } from './qseow-qrs.js';
import { qseowProcessApp } from './qseow-process-app.js';

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
 * @param {number} options.includesheetpart - Optional parameter to include sheet parts in the thumbnails. Values: 1, 2, 3, 4.
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
        logger.debug(`Options: ${JSON.stringify(options, null, 2)}`);

        const appIdsToProcess = [];

        // If --includesheetpart has been specifed it should contain a valid value
        if (
            options.includesheetpart !== '1' &&
            options.includesheetpart !== '2' &&
            options.includesheetpart !== '3' &&
            options.includesheetpart !== '4' &&
            options.includesheetpart !== 1 &&
            options.includesheetpart !== 2 &&
            options.includesheetpart !== 3 &&
            options.includesheetpart !== 4
        ) {
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

        // Remove duplicates (if any) from list of app IDs that will be processed
        const uniqueAppIds = [...new Set(appIdsToProcess)];

        // Debug output of apps that will be processed
        logger.debug('Will process these app IDs:');
        uniqueAppIds.forEach((appId) => {
            logger.debug(appId);
        });

        // Process all apps

        for (const appId of uniqueAppIds) {
            try {
                logger.info(`--------------------------------------------------`);
                logger.info(`About to process app ${appId}`);

                await qseowProcessApp(appId, options);

                logger.verbose(`Done processing app ${appId}`);
            } catch (err) {
                if (err.stack) {
                    logger.error(`QSEOW PROCESS APP (stack): ${err.stack}`);
                } else if (err.message) {
                    logger.error(`QSEOW PROCESS APP (message): ${err.message}`);
                } else {
                    logger.error(`QSEOW PROCESS APP: ${err}`);
                }
            }
        }

        return true;
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
