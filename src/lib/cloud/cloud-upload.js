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
        filesToUpload.forEach((file) => logger.debug(file));

        // eslint-disable-next-line no-restricted-syntax
        for (const file of filesToUpload) {
            logger.verbose(`Uploading file: ${file}`);

            // Get complete path for file
            const fileFullPath = path.join(iconFolderAbsolute, file);
            logger.debug(`fileFullPath: ${fileFullPath}`);

            const fileStat = fs.statSync(fileFullPath);
            logger.silly(`fileStat: ${JSON.stringify(fileStat, null, 2)}`);

            if (
                fileStat.isFile() &&
                file.substring(0, 10) === 'thumbnail-' &&
                path.extname(file) === '.png'
            ) {
                logger.verbose(`Uploading file: ${file}`);

                const apiUrl = `apps/${appId}/media/files/thumbnails/${file}`;
                logger.debug(`Thumbnail imague upload URL: ${apiUrl}`);

                try {
                    const fileData = fs.readFileSync(fileFullPath);
                    // eslint-disable-next-line no-await-in-loop
                    const result = await saasInstance.Put({
                        path: apiUrl,
                        data: fileData,
                        contentType: 'application/octet-stream',
                    });

                    // const result = await qrsInteractInstance.Post(apiUrl, fileData, 'image/png');
                    logger.debug(`QS Cloud image upload result=${JSON.stringify(result)}`);
                    logger.verbose(`QS Cloud image upload done: ${file}`);
                } catch (err) {
                    logger.error(`CLOUD UPLOAD 1: ${JSON.stringify(err, null, 2)}`);
                }
            } else if (fileStat.isDirectory()) {
                logger.verbose(`${fileFullPath} is a directory, skipping.`);
            }
        }
    } catch (err) {
        logger.error(`CLOUD UPLOAD 2: ${JSON.stringify(err, null, 2)}`);
    }
};

module.exports = {
    qscloudUploadToApp,
};