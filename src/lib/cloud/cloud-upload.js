import fs from 'fs';
import path from 'path';

import { logger, setLoggingLevel } from '../../globals.js';
import { CloudError } from '../util/errors.js';
import QlikSaas from './cloud-repo.js';

/**
 * Uploads image files to a Qlik Sense Cloud app.
 *
 * @param {Array<object>} filesToUpload - Array of objects describing the files to be
 *     uploaded, each file represented as an object with properties `fileNameShort`
 *     (short name of the file, without path), `fileNameFull` (full name of the
 *     file, including path), and `fileNameShortBlurred` (short name of the blurred file).
 * @param {string} appId - The ID of the Qlik Sense Cloud app to which the files
 *     will be uploaded.
 * @param {object} options - Object containing options for the upload. Must
 *     contain the following properties:
 *     - `loglevel` (string): Log level for the upload operation. One of 'error',
 *         'warn', 'info', 'verbose', 'debug', 'silly'. Default is 'info'.
 *     - `tenanturl` (string): URL of the Qlik Sense Cloud tenant.
 *     - `apikey` (string): API key for authentication.
 *     - `imagedir` (string): Directory path for storing image thumbnails.
 *
 * @returns {Promise<void>} Resolves only when every qualifying file was uploaded.
 *
 * @throws {CloudError} When any file failed to upload, or the upload could not be set up
 *     at all. The caller must not go on to point sheets at images that are not there.
 */
export const qscloudUploadToApp = async (filesToUpload, appId, options) => {
    let uploadedCount = 0;
    let failedCount = 0;

    try {
        setLoggingLevel(options.loglevel);

        // Get array of all available collections
        const cloudConfig = {
            url: options.tenanturl,
            token: options.apikey,
            // version: X, // optional. default is: 1
        };
        const saasInstance = new QlikSaas(cloudConfig);

        logger.debug(`Qlik Sense Cloud API config: ${JSON.stringify(cloudConfig, null, 2)}`);

        const iconFolderAbsolute = path.resolve(`${options.imagedir}/cloud/${appId}`);

        logger.info(
            `Uploading images in folder: ${iconFolderAbsolute} to Qlik Sense Cloud app ${appId}`
        );

        logger.debug(`Files to be uploaded to Qlik Sense Cloud`);
        filesToUpload.forEach((file) => logger.debug(JSON.stringify(file)));

        for (const file of filesToUpload) {
            // Each file is isolated so one bad image does not skip the ones after it.
            // Failures are counted rather than ignored - see the throw below the loop.
            try {
                logger.info(`Uploading file: ${file.fileNameShort}`);

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
                    const apiUrl = `apps/${appId}/media/files/thumbnails/${file.fileNameShort}`;
                    logger.debug(`Thumbnail image upload URL: ${apiUrl}`);

                    const fileData = fs.readFileSync(fileFullPath);

                    const result = await saasInstance.Put({
                        path: apiUrl,
                        data: fileData,
                        contentType: 'application/octet-stream',
                    });

                    logger.debug(`QS Cloud image upload result=${JSON.stringify(result)}`);
                    logger.verbose(`Image upload done.`);

                    if (file.fileNameShortBlurred) {
                        const blurredFileFullPath = path.join(
                            iconFolderAbsolute,
                            file.fileNameShortBlurred
                        );
                        const blurredApiUrl = `apps/${appId}/media/files/thumbnails/${file.fileNameShortBlurred}`;
                        logger.debug(`Blurred thumbnail upload URL: ${blurredApiUrl}`);

                        const blurredFileData = fs.readFileSync(blurredFileFullPath);
                        const blurredResult = await saasInstance.Put({
                            path: blurredApiUrl,
                            data: blurredFileData,
                            contentType: 'application/octet-stream',
                        });

                        logger.debug(
                            `QS Cloud blurred image upload result=${JSON.stringify(blurredResult)}`
                        );
                        logger.verbose(`Blurred image upload done.`);
                    }

                    uploadedCount += 1;
                } else if (fileStat.isDirectory()) {
                    logger.verbose(`${fileFullPath} is a directory, skipping.`);
                }
            } catch (err) {
                failedCount += 1;
                logger.error(`CLOUD UPLOAD 1: ${JSON.stringify(err, null, 2)}`);
                if (err.message) {
                    logger.error(`CLOUD UPLOAD 1 (message): ${err.message}`);
                }
                if (err.stack) {
                    logger.error(`CLOUD UPLOAD 1 (stack): ${err.stack}`);
                }
            }
        }
    } catch (err) {
        if (err.stack) {
            logger.error(`CLOUD UPLOAD 2 (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`CLOUD UPLOAD 2 (message): ${err.message}`);
        } else {
            logger.error(`CLOUD UPLOAD 2: ${JSON.stringify(err, null, 2)}`);
        }

        // Rethrow: returning normally here told the caller every image was in place, and
        // it went on to point every sheet at files that had never been uploaded.
        throw new CloudError(`Failed to upload sheet thumbnails to Qlik Sense Cloud app ${appId}`, {
            cause: err,
        });
    }

    // Individual failures were logged above but must still fail the app. Sheets that had
    // working icons keep them, rather than being pointed at images that are not there.
    if (failedCount > 0) {
        throw new CloudError(
            `Failed to upload ${failedCount} of ${failedCount + uploadedCount} thumbnail image(s) to Qlik Sense Cloud app ${appId}`
        );
    }
};
