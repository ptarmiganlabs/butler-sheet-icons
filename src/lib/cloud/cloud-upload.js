/* eslint-disable import/extensions */
const fs = require('fs');
const path = require('path');

const { logger, setLoggingLevel } = require('../../globals.js');
const QlikSaas = require('./cloud-repo');

/**
 *
 * @param {*} filesToUpload
 * @param {*} appId
 * @param {*} options
 */
const qscloudUploadToApp = async (filesToUpload, appId, options) => {
    try {
        // Set log level
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
                    logger.verbose(`QS Cloud image upload done: ${JSON.stringify(file)}`);
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
        logger.error(`CLOUD UPLOAD 2: ${JSON.stringify(err, null, 2)}`);
        if (err.message) {
            logger.error(`CLOUD UPLOAD 2 (stack): ${err.message}`);
        }
        if (err.stack) {
            logger.error(`CLOUD UPLOAD 2 (stack): ${err.stack}`);
        }
    }
};

module.exports = {
    qscloudUploadToApp,
};
