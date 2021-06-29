'use strict';

const enigma = require('enigma.js');
const { setupEnigmaConnection } = require('./enigma.js');
const puppeteer = require('puppeteer');
var fs = require('fs');

const { logger, setLoggingLevel } = require('./globals.js');
const { qseowUploadToContentLibrary } = require('./upload.js');
const { qseowVerifyContentLibraryExists } = require('./contentlibrary.js');
const { qseowUpdateSheetThumbnails } = require('./updatesheets.js');
const { qseowVerifyCertificatesExist } = require('./certificates.js');

const selectorLoginPageUserName = '#username-input';
const selectorLoginPageUserPwd = '#password-input';
const selectorLoginPageLoginButton = '#loginbtn';

/**
 *
 * @param {*} options
 * @param {*} command
 * @returns
 */
const qseowCreateThumbnails = options => {
  return new Promise(async (resolve, reject) => {
    try {
      // Set log level
      setLoggingLevel(options.loglevel);

      logger.info('Starting creation of thumbnails for Qlik Sense Enterprise on Windows (QSEoW)');
      logger.debug('Options: ' + JSON.stringify(options, null, 2));

      // Verify QSEoW certificates exist
      let certsExist = await qseowVerifyCertificatesExist(options);
      if (certsExist === false) {
        logger.error('Missing certificate file(s). Aborting');
        throw('Missing certificate file(s)');
        resolve(false);
        // process.exit(1);
      } else {
        logger.verbose(`Certificate files found`);
      }

      // Verify content library exists
      let contentLibraryExists = await qseowVerifyContentLibraryExists(options);
      if (contentLibraryExists === false) {
        logger.error(`Content library '${options.contentlibrary}' does not exist - aborting`);
        throw('Content library does not exist')
        reject(false);
      } else {
        logger.verbose(`Content library '${options.contentlibrary}' exists`);
      }

      // Verify that image directory exist. Create it if not.
      try {
        logger.debug('Checking if specified image directory exists');
        if (fs.existsSync(options.imagedir)) {
          logger.verbose(`Image directory already exists, will not create it: ${options.imagedir}`);
        } else {
          logger.verbose(
            `Image directory does not exist, trying to create it: ${options.imagedir}`,
          );

          // Create image directory
          fs.mkdirSync(options.imagedir, { recursive: true });
          logger.verbose(`Created image directory '${options.imagedir}'`);
        }
      } catch (err) {
        logger.error(
          `CREATE THUMBNAILS 1: Error checking existence/creation of image directory: ${err}`,
        );

        resolve(false);
      }

      // Configure Enigma.js
      const configEnigma = setupEnigmaConnection(options);
      const imgDir = options.imagedir;

      const session = await enigma.create(configEnigma);
      if (options.loglevel === 'silly') {
        session.on('traffic:sent', data => console.log('sent:', data));
        session.on('traffic:received', data =>
          console.log('received:', JSON.stringify(data, null, 2)),
        );
      }

      const global = await session.open();

      const engineVersion = await global.engineVersion();
      logger.verbose(
        `Created session to server ${options.host}, engine version is ${engineVersion.qComponentVersion}`,
      );

      var app = await global.openDoc(options.appid, '', '', '', false);
      logger.info(`Opened app ${options.appid}`);

      // Get list of app sheets
      const appSheetsCall = {
        qInfo: {
          qId: 'SheetList',
          qType: 'SheetList',
        },
        qAppObjectListDef: {
          qType: 'sheet',
          qData: {
            title: '/qMetaDef/title',
            description: '/qMetaDef/description',
            thumbnail: '/thumbnail',
            cells: '/cells',
            rank: '/rank',
            columns: '/columns',
            rows: '/rows',
          },
        },
      };

      const genericListObj = await app.createSessionObject(appSheetsCall);
      const sheetListObj = await genericListObj.getLayout();

      if (sheetListObj.qAppObjectList.qItems.length > 0) {
        // sheetListObj.qAppObjectList.qItems[] now contains array of app sheets.
        logger.info(`Number of sheets in app: ${sheetListObj.qAppObjectList.qItems.length}`);

        let iSheetNum = 1;
        const browser = await puppeteer.launch({
          headless: options.headless === 'true' ? true : false,
          ignoreHTTPSErrors: true,
          acceptInsecureCerts: true,
          args: [
            '--proxy-bypass-list=*',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-setuid-sandbox',
            '--no-first-run',
            '--no-sandbox',
            '--no-zygote',
            '--single-process',
            '--ignore-certificate-errors',
            '--ignore-certificate-errors-spki-list',
            '--enable-features=NetworkService',
          ],
        });

        const page = await browser.newPage();

        // Thumbnails should be 410x270 pixels, so set the viewport to a multiple of this.
        await page.setViewport({
          width: 820,
          height: 540,
          deviceScaleFactor: 1,
        });

        let appUrl = '';

        if (options.secure === 'true') {
          appUrl = appUrl + 'https://';
        } else {
          appUrl = appUrl + 'http://';
        }

        if (options.prefix.length > 0) {
          appUrl = appUrl + options.host + '/' + options.prefix + '/sense/app/' + options.appid;
        } else {
          appUrl = appUrl + options.host + '/sense/app/' + options.appid;
        }

        logger.debug(`App URL: ${appUrl}`);

        await Promise.all([
          page.goto(appUrl),
          page.waitForNavigation({ waitUntil: ['networkidle2'] }),
        ]);

        await page.waitForTimeout(options.pagewait * 1000);
        await page.screenshot({ path: imgDir + '/loginpage-1.png' });

        // Enter credentials
        // User
        await page.click(selectorLoginPageUserName, { button: 'left', clickCount: 1, delay: 10 });
        let user = options.logonuserdir + '\\' + options.logonuserid;
        await page.keyboard.type(user);

        // Pwd
        await page.click(selectorLoginPageUserPwd, { button: 'left', clickCount: 1, delay: 10 });
        await page.keyboard.type(options.logonpwd);

        await page.screenshot({ path: imgDir + '/loginpage-2.png' });

        // Click login button and wait for page to load
        await Promise.all([
          page.click(selectorLoginPageLoginButton, { button: 'left', clickCount: 1, delay: 10 }),
          page.waitForNavigation({ waitUntil: 'networkidle2' }),
        ]);
        await page.waitForTimeout(options.pagewait * 1000);

        // Take screenshot of app overview page
        await page.screenshot({ path: imgDir + '/appoverview-1.png' });

        // Sort sheets
        sheetListObj.qAppObjectList.qItems.sort(function (sheet1, sheet2) {
          if (sheet1.qData.rank < sheet2.qData.rank) return -1;
          else if (sheet1.qData.rank > sheet2.qData.rank) return 1;
          else return 0;
        });

        for (const sheet of sheetListObj.qAppObjectList.qItems) {
          logger.info(
            `Processing sheet ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}'`,
          );
          // Build URL to current sheet
          let sheetUrl = appUrl + '/sheet/' + sheet.qInfo.qId;
          logger.debug(`Sheet URL: ${sheetUrl}`);

          // Open sheet in browser, then take screen shot
          await Promise.all([
            page.goto(sheetUrl),
            page.waitForNavigation({ waitUntil: 'networkidle2' }),
          ]);

          await page.waitForTimeout(options.pagewait * 1000);
          let fileName = `${imgDir}/app-${options.appid}-sheet-${iSheetNum}.png`;
          await page.screenshot({ path: fileName });

          iSheetNum++;
        }

        await browser.close();
        logger.verbose('Closed virtual browser');
      }

      if ((await session.close()) == true) {
        logger.verbose(
          `Closed session after generating sheet thumbnail images for all sheets in QSEoW app ${options.appid} on host ${options.host}`,
        );
      } else {
        logger.error(
          `Error closing session for QSEoW app ${options.appid} on host ${options.host}`,
        );
      }

      // Upload to  QSEoW content library
      await qseowUploadToContentLibrary(options);

      // Update sheets in app
      await qseowUpdateSheetThumbnails(options);

      logger.info('Done');

      resolve(true);
    } catch (err) {
      logger.error(`CREATE THUMBNAILS 2: ${JSON.stringify(err, null, 2)}`);

      reject(false);
    }
  });
};

module.exports = {
  qseowCreateThumbnails,
};
