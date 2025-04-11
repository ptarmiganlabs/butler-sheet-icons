/* eslint-disable import/extensions */
const fs = require('fs');
const path = require('path');

const { logger, setLoggingLevel } = require('../../globals.js');
const QlikSaas = require('./cloud-repo');

/**
 * Uploads image files to a Qlik Sense Cloud app.
 *
 * @param {array} filesToUpload - Array of objects describing the files to be
 *     uploaded, each file represented as an object with properties `fileNameShort`
 *     (short name of the file, without path), and `fileNameFull` (full name of the
 *     file, including path).
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
 * @returns {Promise<void>} A promise that resolves when the files have been
 *     successfully uploaded to the Qlik Sense Cloud app.
 */
const qscloudUploadToApp = async (filesToUpload, appId, options) => {
    try {
        // Set log level
        if (options.loglevel === undefined || options.logLevel) {
            // eslint-disable-next-line no-param-reassign
            options.loglevel = options.logLevel;
        }
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

        // eslint-disable-next-line no-restricted-syntax
        for (const file of filesToUpload) {
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
                logger.debug(`Thumbnail imague upload URL: ${apiUrl}`);

                try {
                    const fileData = fs.readFileSync(fileFullPath);
                    // eslint-disable-next-line no-await-in-loop
                    const result = await saasInstance.Put({
                        path: apiUrl,
                        data: fileData,
                        contentType: 'application/octet-stream',
                    });

                    logger.debug(`QS Cloud image upload result=${JSON.stringify(result)}`);
                    logger.verbose(`Image upload done.`);
                } catch (err) {
                    logger.error(`CLOUD UPLOAD 1: ${JSON.stringify(err, null, 2)}`);
                    if (err.message) {
                        logger.error(`CLOUD UPLOAD 1 (stack): ${err.message}`);
                    }
                    if (err.stack) {
                        logger.error(`CLOUD UPLOAD 1 (stack): ${err.stack}`);
                    }
                }
            } else if (fileStat.isDirectory()) {
                logger.verbose(`${fileFullPath} is a directory, skipping.`);
            }
        }
    } catch (err) {
        if (err.stack) {
            logger.error(`CLOUD UPLOAD 2 (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`CLOUD UPLOAD 2 (stack): ${err.message}`);
        } else {
            logger.error(`CLOUD UPLOAD 2: ${JSON.stringify(err, null, 2)}`);
        }
    }
};

module.exports = {
    qscloudUploadToApp,
};
