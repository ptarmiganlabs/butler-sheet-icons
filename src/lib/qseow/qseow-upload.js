/* eslint-disable import/extensions */
import fs from 'fs';
import path from 'path';
import qrsInteract from 'qrs-interact';

import { logger, setLoggingLevel } from '../../globals.js';
import { setupQseowQrsConnection } from './qseow-qrs.js';

/**
 * Upload files to a Qlik Sense Enterprise on Windows (QSEoW) content library.
 *
 * @param {array} filesToUpload - Array of files to be uploaded, each file
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
 * @returns {Promise<boolean>} - true if the files were uploaded successfully,
 *     false otherwise.
 */
export const qseowUploadToContentLibrary = async (filesToUpload, appId, options) => {
    try {
        // Set log level
        if (options.loglevel === undefined || options.logLevel) {
            options.loglevel = options.logLevel;
        }
        setLoggingLevel(options.loglevel);

        logger.debug(
            `Files will be uploaded to Qlik Sense content library ${options.contentlibrary}`
        );
        filesToUpload.forEach((file) => logger.debug(JSON.stringify(file)));

        const qseowConfigQrs = setupQseowQrsConnection(options);
        // eslint-disable-next-line new-cap
        const qrsInteractInstance = new qrsInteract(qseowConfigQrs);

        logger.debug(`QSEoW QRS config: ${JSON.stringify(qseowConfigQrs, null, 2)}`);

        const iconFolderAbsolute = path.resolve(`${options.imagedir}/qseow/${appId}`);

        const { contentlibrary } = options;

        logger.info(`Uploading images in folder: ${iconFolderAbsolute}`);
        logger.info(`Uploading images to Qlik Sense content library: ${contentlibrary}`);

        logger.debug(`Files to be uploaded to QSEoW`);
        filesToUpload.forEach((file) => logger.debug(JSON.stringify(file)));

        // eslint-disable-next-line no-restricted-syntax
        for (const file of filesToUpload) {
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

                try {
                    const fileData = fs.readFileSync(fileFullPath);

                    // eslint-disable-next-line no-await-in-loop
                    const result = await qrsInteractInstance.Post(apiUrl, fileData, 'image/png');
                    logger.debug(`QSEoW image upload result=${JSON.stringify(result)}`);
                    logger.verbose(`QSEoW image upload done: ${JSON.stringify(file)}`);
                } catch (err) {
                    if (err.stack) {
                        logger.error(`QSEOW UPLOAD 1 (stack): ${err.stack}`);
                    } else if (err.message) {
                        logger.error(`QSEOW UPLOAD 1 (message): ${err.message}`);
                    } else {
                        logger.error(`QSEOW UPLOAD 1: ${JSON.stringify(err, null, 2)}`);
                    }
                }
            } else if (fileStat.isDirectory()) {
                logger.verbose(`${fileFullPath} is a directory, skipping.`);
            }
        }
    } catch (err) {
        if (err.stack) {
            logger.error(`QSEOW UPLOAD 2 (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`QSEOW UPLOAD 2 (message): ${err.message}`);
        } else {
            logger.error(`QSEOW UPLOAD 2: ${JSON.stringify(err, null, 2)}`);
        }
    }
};
