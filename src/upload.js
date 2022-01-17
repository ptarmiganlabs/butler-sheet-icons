/* eslint-disable import/extensions */
const fs = require('fs');
const path = require('path');
const qrsInteract = require('qrs-interact');

const { logger, setLoggingLevel } = require('./globals.js');
const { setupQseowQrsConnection } = require('./qrs.js');

/**
 *
 * @param {*} options
 */
const qseowUploadToContentLibrary = async (options) => {
    try {
        // Set log level
        setLoggingLevel(options.loglevel);

        const qseowConfigQrs = setupQseowQrsConnection(options);
        // eslint-disable-next-line new-cap
        const qrsInteractInstance = new qrsInteract(qseowConfigQrs);

        logger.debug(`QSEoW QRS config: ${JSON.stringify(qseowConfigQrs, null, 2)}`);

        const iconFolderAbsolute = path.resolve(options.imagedir);
        const { contentlibrary } = options;

        logger.info(`Uploading images in folder: ${iconFolderAbsolute}`);
        logger.info(`Uploading images to Qlik Sense content library: ${contentlibrary}`);

        const files = fs.readdirSync(iconFolderAbsolute);

        // eslint-disable-next-line no-restricted-syntax
        for (const file of files) {
            // Get complete path for file
            const fileFullPath = path.join(iconFolderAbsolute, file);
            const fileStat = fs.statSync(fileFullPath);

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
                    qrsInteractInstance
                        .Post(apiUrl, fileData, 'image/png')
                        .then((result) => {
                            logger.debug(`QSEoW image upload result=${JSON.stringify(result)}`);
                            logger.verbose(`QSEoW image upload done: ${file}`);
                        })
                        .catch((err) => {
                            // Return error msg
                            logger.error(`Error uploading icon to content library: ${err}`);
                        });
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
