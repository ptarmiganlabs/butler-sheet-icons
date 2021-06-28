'use strict';

var fs = require('fs');
var path = require('path');
var qrsInteract = require('qrs-interact');

const { logger, setLoggingLevel } = require('./globals.js');
const { setupQseowQrsConnection } = require('./qrs.js');

/**
 * 
 * @param {*} options 
 */
const qseowUploadToContentLibrary = async options => {
  try {
    // Set log level
    setLoggingLevel(options.loglevel);

    const qseowConfigQrs = setupQseowQrsConnection(options);
    const qrsInteractInstance = new qrsInteract(qseowConfigQrs);

    logger.debug('QSEoW QRS config: ' + JSON.stringify(qseowConfigQrs, null, 2));

    const iconFolderAbsolute = path.resolve(options.imagedir);
    const contentlibrary = options.contentlibrary;

    logger.info('Uploading images in folder: ' + iconFolderAbsolute);
    logger.info('Uploading images to Qlik Sense content library: ' + contentlibrary);

    let files = fs.readdirSync(iconFolderAbsolute);

    for (const file of files) {
      // Get complete path for file
      let fileFullPath = path.join(iconFolderAbsolute, file);
      let fileStat = fs.statSync(fileFullPath);

      if (fileStat.isFile() && file.substring(0, 4) === 'app-' && path.extname(file) === '.png') {
        logger.verbose(`Uploading file: ${file}`);

        var apiUrl =
          '/contentlibrary/' +
          encodeURIComponent(contentlibrary) +
          '/uploadfile?externalpath=' +
          file +
          '&overwrite=true';

        logger.debug('Thumbnail imague upload URL: ' + apiUrl);

        try {
          let fileData = fs.readFileSync(fileFullPath);
          qrsInteractInstance
            .Post(apiUrl, fileData, 'image/png')
            .then(result => {
              logger.debug('QSEoW image upload result=' + JSON.stringify(result));
              logger.verbose('QSEoW image upload done: ' + file);
            })
            .catch(err => {
              // Return error msg
              logger.error('Error uploading icon to content library: ' + err);
            });
        } catch (err) {
          logger.error(`UPLOAD 1: ${JSON.stringify(err, null, 2)}`);
        }
      } else if (fileStat.isDirectory()) {
        logger.verbose(fileFullPath + ' is a directory, skipping.');
      }
    }
  } catch (err) {
    logger.error(`UPLOAD 2: ${JSON.stringify(err, null, 2)}`);
  }
};

module.exports = {
  qseowUploadToContentLibrary,
};
