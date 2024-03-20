/* eslint-disable import/extensions */
const fs = require('fs');
const path = require('path');
const qrsInteract = require('qrs-interact');

const { logger, setLoggingLevel } = require('../../globals.js');
const { setupQseowQrsConnection } = require('./qseow-qrs.js');

/**
 *
 * @param {*} filesToUpload
 * @param {*} appId
 * @param {*} options
 */
const qseowUploadToContentLibrary = async (filesToUpload, appId, options) => {
    try {
        // Set log level
        if (options.loglevel === undefined || options.logLevel) {
            // eslint-disable-next-line no-param-reassign
            options.loglevel = options.logLevel;
        }
        setLoggingLevel(options.loglevel);

        logger.debug(`Files up to upload to Qlik Sense content library ${options.contentlibrary}`);
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

module.exports = {
    qseowUploadToContentLibrary,
};
