/* eslint-disable import/extensions */
const fs = require('fs');
const path = require('path');
const qrsInteract = require('qrs-interact');

const { logger, setLoggingLevel } = require('./globals.js');
const { setupQseowQrsConnection } = require('./qrs.js');

/**
 *
 * @param {*} filesToUpload
 * @param {*} options
 */
const qseowUploadToContentLibrary = async (filesToUpload, options) => {
    try {
        // Set log level
        setLoggingLevel(options.loglevel);

        logger.debug(`Files up to upload to Qlik Sense content library ${options.contentlibrary}`);
        filesToUpload.forEach((file) => logger.debug(file));

        const qseowConfigQrs = setupQseowQrsConnection(options);
        // eslint-disable-next-line new-cap
        const qrsInteractInstance = new qrsInteract(qseowConfigQrs);

        logger.debug(`QSEoW QRS config: ${JSON.stringify(qseowConfigQrs, null, 2)}`);

        const iconFolderAbsolute = path.resolve(options.imagedir);
        const { contentlibrary } = options;

        logger.info(`Uploading images in folder: ${iconFolderAbsolute}`);
        logger.info(`Uploading images to Qlik Sense content library: ${contentlibrary}`);

        // eslint-disable-next-line no-restricted-syntax
        for (const file of filesToUpload) {
            logger.debug(`File to upload: ${file}`);

            // Get complete path for file
            const fileFullPath = path.join(iconFolderAbsolute, file);
            logger.debug(`fileFullPath: ${fileFullPath}`);

            const fileStat = fs.statSync(fileFullPath);
            logger.silly(`fileStat: ${JSON.stringify(fileStat, null, 2)}`);

            if (
                fileStat.isFile() &&
                file.substring(0, 4) === 'app-' &&
                path.extname(file) === '.png'
            ) {
                logger.verbose(`Uploading file: ${file}`);

                const apiUrl = `/contentlibrary/${encodeURIComponent(
                    contentlibrary
                )}/uploadfile?externalpath=${file}&overwrite=true`;

                logger.debug(`Thumbnail imague upload URL: ${apiUrl}`);

                try {
                    const fileData = fs.readFileSync(fileFullPath);

                    // eslint-disable-next-line no-await-in-loop
                    const result = await qrsInteractInstance.Post(apiUrl, fileData, 'image/png');
                    logger.debug(`QSEoW image upload result=${JSON.stringify(result)}`);
                    logger.verbose(`QSEoW image upload done: ${file}`);
                } catch (err) {
                    logger.error(`UPLOAD 1: ${JSON.stringify(err, null, 2)}`);
                }
            } else if (fileStat.isDirectory()) {
                logger.verbose(`${fileFullPath} is a directory, skipping.`);
            }
        }
    } catch (err) {
        logger.error(`UPLOAD 2: ${JSON.stringify(err, null, 2)}`);
    }
};

module.exports = {
    qseowUploadToContentLibrary,
};
