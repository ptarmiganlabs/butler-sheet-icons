import fs from 'fs';
import path from 'path';
import qrsInteract from 'qrs-interact';

import { logger, setLoggingLevel } from '../../globals.js';
import { QseowError } from '../util/errors.js';
import { setupQseowQrsConnection } from './qseow-qrs.js';
import { logError } from '../util/log-error.js';

/**
 * Upload files to a Qlik Sense Enterprise on Windows (QSEoW) content library.
 *
 * @param {Array<object>} filesToUpload - Array of files to be uploaded, each file
 *     represented as an object with properties `fileNameShort` (short name of
 *     the file, without path), and `fileNameFull` (full name of the file,
 *     including path).
 * @param {string} appId - ID of the app to which the files will be uploaded.
 * @param {object} options - Object containing options for the upload. Must
 *     contain the following properties:
 *     - `loglevel` (string): Log level for the upload operation. One of 'error',
 *         'warn', 'info', 'verbose', 'debug', 'silly'. Default is 'info'.
 *     - `contentlibrary` (string): Name of the content library where the files
 *         will be uploaded.
 *     - `imagedir` (string): Directory where the files to be uploaded are
 *         located. Must contain a subdirectory named `qseow` with a subdirectory
 *         named after the app ID, which contains the files to be uploaded.
 *
 * @returns {Promise<void>} Resolves only when every qualifying file was uploaded. This
 *     previously claimed to resolve to a boolean; it never returned one.
 *
 * @throws {QseowError} When any file failed to upload, or the upload could not be set up
 *     at all. The caller must not go on to point sheets at images that are not there.
 */
export const qseowUploadToContentLibrary = async (filesToUpload, appId, options) => {
    let uploadedCount = 0;
    let failedCount = 0;

    try {
        setLoggingLevel(options.loglevel);

        logger.debug(
            `Files will be uploaded to Qlik Sense content library ${options.contentlibrary}`
        );
        filesToUpload.forEach((file) => logger.debug(JSON.stringify(file)));

        const qseowConfigQrs = setupQseowQrsConnection(options);

        const qrsInteractInstance = new qrsInteract(qseowConfigQrs);

        logger.debug(`QSEoW QRS config: ${JSON.stringify(qseowConfigQrs, null, 2)}`);

        const iconFolderAbsolute = path.resolve(`${options.imagedir}/qseow/${appId}`);

        const { contentlibrary } = options;

        logger.info(`Uploading images in folder: ${iconFolderAbsolute}`);
        logger.info(`Uploading images to Qlik Sense content library: ${contentlibrary}`);

        logger.debug(`Files to be uploaded to QSEoW`);
        filesToUpload.forEach((file) => logger.debug(JSON.stringify(file)));

        for (const file of filesToUpload) {
            // Each file is isolated so one bad image does not skip the ones after it.
            // Failures are counted rather than ignored - see the throw below the loop.
            try {
                logger.verbose(`Uploading file: ${JSON.stringify(file)}`);

                // Get complete path for file
                const fileFullPath = path.join(iconFolderAbsolute, file.fileNameShort);
                logger.debug(`fileFullPath: ${fileFullPath}`);

                const fileStat = fs.statSync(fileFullPath);
                logger.silly(`fileStat: ${JSON.stringify(fileStat, null, 2)}`);

                if (
                    fileStat.isFile() &&
                    file.fileNameShort.substring(0, 10) === 'thumbnail-' &&
                    path.extname(file.fileNameShort) === '.png'
                ) {
                    const apiUrl = `/contentlibrary/${encodeURIComponent(
                        contentlibrary
                    )}/uploadfile?externalpath=${file.fileNameShort}&overwrite=true`;

                    logger.debug(`Thumbnail imague upload URL: ${apiUrl}`);

                    const fileData = fs.readFileSync(fileFullPath);

                    const result = await qrsInteractInstance.Post(apiUrl, fileData, 'image/png');
                    logger.debug(`QSEoW image upload result=${JSON.stringify(result)}`);
                    logger.verbose(`QSEoW image upload done: ${JSON.stringify(file)}`);

                    uploadedCount += 1;
                } else if (fileStat.isDirectory()) {
                    logger.verbose(`${fileFullPath} is a directory, skipping.`);
                }
            } catch (err) {
                failedCount += 1;
                logError('QSEOW UPLOAD 1', err);
            }
        }
    } catch (err) {
        logError('QSEOW UPLOAD 2', err);

        // Rethrow: returning normally here told the caller every image was in place, and
        // it went on to point every sheet at files that had never been uploaded.
        throw new QseowError(
            `Failed to upload sheet thumbnails to content library ${options.contentlibrary}`,
            { cause: err }
        );
    }

    // Individual failures were logged above but must still fail the app. Sheets that had
    // working icons keep them, rather than being pointed at images that are not there.
    if (failedCount > 0) {
        throw new QseowError(
            `Failed to upload ${failedCount} of ${failedCount + uploadedCount} thumbnail image(s) to content library ${options.contentlibrary}`
        );
    }
};
