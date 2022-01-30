/* eslint-disable no-await-in-loop */
/* eslint-disable import/extensions */
const enigma = require('enigma.js');
const puppeteer = require('puppeteer');
const fs = require('fs');
const qrsInteract = require('qrs-interact');

const { setupEnigmaConnection } = require('./enigma.js');
const { logger, setLoggingLevel } = require('./globals.js');
const { qseowUploadToContentLibrary } = require('./upload.js');
const { qseowVerifyContentLibraryExists } = require('./contentlibrary.js');
const { qseowUpdateSheetThumbnails } = require('./updatesheets.js');
const { qseowVerifyCertificatesExist } = require('./certificates.js');
const { setupQseowQrsConnection } = require('./qrs.js');

const selectorLoginPageUserName = '#username-input';
const selectorLoginPageUserPwd = '#password-input';
const selectorLoginPageLoginButton = '#loginbtn';

/**
 *
 * @param {*} appId
 * @param {*} g
 * @param {*} options
 */
const processApp = async (appId, g, options) => {
    // eslint-disable-next-line no-unused-vars

    // Configure Enigma.js
    const configEnigma = setupEnigmaConnection(appId, options);
    const imgDir = options.imagedir;

    const session = await enigma.create(configEnigma);
    if (options.loglevel === 'silly') {
        // eslint-disable-next-line no-console
        session.on('traffic:sent', (data) => console.log('sent:', data));
        session.on('traffic:received', (data) =>
            // eslint-disable-next-line no-console
            console.log('received:', JSON.stringify(data, null, 2))
        );
    }

    const global = await session.open();

    const engineVersion = await global.engineVersion();
    logger.verbose(
        `Created session to server ${options.host}, engine version is ${engineVersion.qComponentVersion}`
    );

    const app = await global.openDoc(appId, '', '', '', false);
    logger.info(`Opened app ${appId}`);

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

    const createdFiles = [];

    if (sheetListObj.qAppObjectList.qItems.length > 0) {
        // sheetListObj.qAppObjectList.qItems[] now contains array of app sheets.
        logger.info(`Number of sheets in app: ${sheetListObj.qAppObjectList.qItems.length}`);

        let iSheetNum = 1;
        const browser = await puppeteer.launch({
            headless: options.headless === 'true',
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
            appUrl = `${appUrl}https://`;
        } else {
            appUrl = `${appUrl}http://`;
        }

        if (options.prefix && options.prefix.length > 0) {
            appUrl = `${appUrl + options.host}/${options.prefix}/sense/app/${appId}`;
        } else {
            appUrl = `${appUrl + options.host}/sense/app/${appId}`;
        }

        logger.debug(`App URL: ${appUrl}`);

        await Promise.all([
            page.goto(appUrl),
            page.waitForNavigation({ waitUntil: ['networkidle2'] }),
        ]);

        await page.waitForTimeout(options.pagewait * 1000);
        await page.screenshot({ path: `${imgDir}/loginpage-1.png` });

        // Enter credentials
        // User
        await page.click(selectorLoginPageUserName, {
            button: 'left',
            clickCount: 1,
            delay: 10,
        });
        const user = `${options.logonuserdir}\\${options.logonuserid}`;
        await page.keyboard.type(user);

        // Pwd
        await page.click(selectorLoginPageUserPwd, {
            button: 'left',
            clickCount: 1,
            delay: 10,
        });
        await page.keyboard.type(options.logonpwd);

        await page.screenshot({ path: `${imgDir}/loginpage-2.png` });

        // Click login button and wait for page to load
        await Promise.all([
            page.click(selectorLoginPageLoginButton, {
                button: 'left',
                clickCount: 1,
                delay: 10,
            }),
            page.waitForNavigation({ waitUntil: 'networkidle2' }),
        ]);
        await page.waitForTimeout(options.pagewait * 1000);

        // Take screenshot of app overview page
        await page.screenshot({ path: `${imgDir}/app-${appId}-overview-1.png` });

        // Sort sheets
        sheetListObj.qAppObjectList.qItems.sort((sheet1, sheet2) => {
            if (sheet1.qData.rank < sheet2.qData.rank) return -1;
            if (sheet1.qData.rank > sheet2.qData.rank) return 1;
            return 0;
        });

        // eslint-disable-next-line no-restricted-syntax
        for (const sheet of sheetListObj.qAppObjectList.qItems) {
            logger.info(
                `Processing sheet ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}'`
            );
            // Build URL to current sheet
            const sheetUrl = `${appUrl}/sheet/${sheet.qInfo.qId}`;
            logger.debug(`Sheet URL: ${sheetUrl}`);

            // Open sheet in browser, then take screen shot
            await Promise.all([
                page.goto(sheetUrl),
                page.waitForNavigation({ waitUntil: 'networkidle2' }),
            ]);

            await page.waitForTimeout(options.pagewait * 1000);
            const fileName = `${imgDir}/app-${appId}-sheet-${iSheetNum}.png`;
            const fileNameShort = `app-${appId}-sheet-${iSheetNum}.png`;

            let selector = '';
            if (options.includesheetpart === '1') {
                // 1: Only chart part of sheet (no sheet title, selections or app info)
                selector = '#grid-wrap';
            } else if (options.includesheetpart === '2') {
                // 2: Include sheet title  (no selections or app info)
                selector = '#qv-stage-container > div > div.qv-panel-content.flex-row';
            } else if (options.includesheetpart === '3') {
                // 3: Include sheet title and selection bar (no app info)
                selector = '#qv-stage-container > div';
            } else if (options.includesheetpart === '4') {
                // 4: Take screen shot of entire sheet, including sheet title, top menu and status bars.
                // or: await page.screenshot({ path: fileName });
                selector = '#qv-page-container';
            }

            // Ensure that the element we're interested in is loaded
            await page.waitForSelector(selector);
            const sheetMainPart = await page.$(selector);
            await sheetMainPart.screenshot({
                path: fileName,
            });
            createdFiles.push(fileNameShort);

            iSheetNum += 1;
        }

        await browser.close();
        logger.verbose('Closed virtual browser');
    }

    if ((await session.close()) === true) {
        logger.verbose(
            `Closed session after generating sheet thumbnail images for all sheets in QSEoW app ${appId} on host ${options.host}`
        );
    } else {
        logger.error(`Error closing session for QSEoW app ${appId} on host ${options.host}`);
    }

    // Upload to  QSEoW content library
    await qseowUploadToContentLibrary(createdFiles, options);

    // Update sheets in app
    await qseowUpdateSheetThumbnails(createdFiles, appId, options);

    logger.info(`Done processing app ${appId}`);
};

/**
 *
 * @param {*} options
 * @returns
 */
const qseowCreateThumbnails = async (options) => {
    try {
        // Set log level
        setLoggingLevel(options.loglevel);

        logger.info('Starting creation of thumbnails for Qlik Sense Enterprise on Windows (QSEoW)');
        logger.debug(`Options: ${JSON.stringify(options, null, 2)}`);

        // If --includesheetpart has been specifed it should contain a valid value
        if (
            options.includesheetpart !== '1' &&
            options.includesheetpart !== '2' &&
            options.includesheetpart !== '3' &&
            options.includesheetpart !== '4' &&
            options.includesheetpart !== 1 &&
            options.includesheetpart !== 2 &&
            options.includesheetpart !== 3 &&
            options.includesheetpart !== 4
        ) {
            logger.error(
                `Invalid --includesheetpart paramater: ${options.includesheetpart}. Aborting`
            );
            throw Error('Invalid --includesheetpart paramater');
        }

        // Verify QSEoW certificates exist
        const certsExist = await qseowVerifyCertificatesExist(options);
        if (certsExist === false) {
            logger.error('Missing certificate file(s). Aborting');
            throw Error('Missing certificate file(s)');
        } else {
            logger.verbose(`Certificate files found`);
        }

        // Verify content library exists
        const contentLibraryExists = await qseowVerifyContentLibraryExists(options);
        if (contentLibraryExists === false) {
            logger.error(`Content library '${options.contentlibrary}' does not exist - aborting`);
            throw Error('Content library does not exist');
        } else {
            logger.verbose(`Content library '${options.contentlibrary}' exists`);
        }

        // Verify that image directory exist. Create it if not.
        try {
            logger.debug('Checking if specified image directory exists');
            if (fs.existsSync(options.imagedir)) {
                logger.verbose(
                    `Image directory already exists, will not create it: ${options.imagedir}`
                );
            } else {
                logger.verbose(
                    `Image directory does not exist, trying to create it: ${options.imagedir}`
                );

                // Create image directory
                fs.mkdirSync(options.imagedir, { recursive: true });
                logger.verbose(`Created image directory '${options.imagedir}'`);
            }
        } catch (err) {
            logger.error(
                `CREATE THUMBNAILS 1: Error checking existence/creation of image directory: ${err}`
            );

            throw Error('Error checking existence/creation of image directory');
        }

        // If --qliksensetag exists we should loop over all matching apps.
        // If --qliksensetag does not exist the app specified by --appid should be processed.

        if (options.qliksensetag && options.qliksensetag.length > 0) {
            // Get all apps matching the tag in --qliksensetag
            const qseowConfigQrs = setupQseowQrsConnection(options);

            // eslint-disable-next-line new-cap
            const qrsInteractInstance = new qrsInteract(qseowConfigQrs);
            logger.debug(`QSEoW QRS config: ${JSON.stringify(qseowConfigQrs, null, 2)}`);

            logger.debug(`GETAPPS 1: app/full?filter=tags.name eq '${options.qliksensetag}'`);
            const result = await qrsInteractInstance.Get(
                `app/full?filter=tags.name eq '${options.qliksensetag}'`
            );

            // Process all apps with this tag
            // eslint-disable-next-line no-restricted-syntax
            for (const app of result.body) {
                logger.info(`--------------------------------------------------`);
                logger.info(`About to process app ${app.id}`);

                await processApp(app.id, global, options);
                logger.verbose(`Done processing app ${app.id}`);
            }
        } else {
            await processApp(options.appid, global, options);
        }

        return true;
    } catch (err) {
        logger.error(`CREATE THUMBNAILS 2: ${err}`);
        return false;
    }
};

module.exports = {
    qseowCreateThumbnails,
};
