/* eslint-disable no-await-in-loop */
/* eslint-disable import/extensions */
const enigma = require('enigma.js');
const puppeteer = require('puppeteer');
const fs = require('fs');
const qrsInteract = require('qrs-interact');
const path = require('path');

const { setupEnigmaConnection } = require('./qseow-enigma.js');
const { logger, setLoggingLevel } = require('../../globals.js');
const { qseowUploadToContentLibrary } = require('./qseow-upload.js');
const { qseowVerifyContentLibraryExists } = require('./qseow-contentlibrary.js');
const { qseowUpdateSheetThumbnails } = require('./qseow-updatesheets.js');
const { qseowVerifyCertificatesExist } = require('./qseow-certificates.js');
const { setupQseowQrsConnection } = require('./qseow-qrs.js');

const selectorLoginPageUserName = '#username-input';
const selectorLoginPageUserPwd = '#password-input';
const selectorLoginPageLoginButton = '#loginbtn';

const xpathHubUserPageButton = '//*[@id="hub-sidebar"]/div[1]/div[1]/div/div/div';
const xpathLogoutButton = '//*[@id="q-hub-user-popover-override"]/ng-transclude/div[2]/button';

/**
 *
 * @param {*} appId
 * @param {*} g
 * @param {*} options
 */
const processQSEoWApp = async (appId, g, options) => {
    // Create image directory for this app
    try {
        fs.mkdirSync(`${options.imagedir}/qseow/${appId}`, { recursive: true });
        logger.verbose(`Created image QSEoW directory '${options.imagedir}/qseow/${appId}'`);
    } catch (err) {
        logger.error(`CREATE THUMBNAILS 1: Error creating QSEoW image directory: ${err}`);
        throw Error('Error creating QSEoW image directory');
    }

    try {
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

        const isPkg = typeof process.pkg !== 'undefined';
        logger.debug(`Running as standalone app: ${isPkg}`);

        if (sheetListObj.qAppObjectList.qItems.length > 0) {
            // sheetListObj.qAppObjectList.qItems[] now contains array of app sheets.
            logger.info(`Number of sheets in app: ${sheetListObj.qAppObjectList.qItems.length}`);

            let iSheetNum = 1;

            // https://github.com/vercel/pkg/issues/204#issuecomment-536323464
            const executablePath =
                process.env.PUPPETEER_EXECUTABLE_PATH ||
                (process.pkg
                    ? path.join(
                          path.dirname(process.execPath),
                          'chromium',
                          ...puppeteer.executablePath().split(path.sep).slice(6) // /snapshot/project/node_modules/puppeteer/.local-chromium
                      )
                    : puppeteer.executablePath());
            logger.debug(`execPath: ${executablePath}`);

            const chromiumExecutablePath = isPkg ? executablePath : puppeteer.executablePath();
            logger.debug(`Using Chromium browser at ${chromiumExecutablePath}`);

            const browser = await puppeteer.launch({
                headless: options.headless === true || options.headless.toLowerCase() === 'true',
                executablePath: chromiumExecutablePath,
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
                width: 1230,
                height: 810,
                deviceScaleFactor: 1,
            });

            let appUrl = '';
            let hubUrl = '';

            if (options.secure === 'true') {
                appUrl = 'https://';
            } else {
                appUrl = 'http://';
            }
            hubUrl = appUrl;

            if (options.prefix && options.prefix.length > 0) {
                appUrl = `${appUrl + options.host}/${options.prefix}/sense/app/${appId}`;
                hubUrl = `${hubUrl + options.host}/${options.prefix}/hub`;
            } else {
                appUrl = `${appUrl + options.host}/sense/app/${appId}`;
                hubUrl = `${hubUrl + options.host}/hub`;
            }

            logger.debug(`App URL: ${appUrl}`);
            logger.debug(`Hub URL: ${hubUrl}`);

            await Promise.all([
                page.goto(appUrl),
                page.waitForNavigation({ waitUntil: ['networkidle2'] }),
            ]);

            await page.waitForTimeout(options.pagewait * 1000);
            await page.screenshot({ path: `${imgDir}/qseow/${appId}/loginpage-1.png` });

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

            await page.screenshot({ path: `${imgDir}/qseow/${appId}/loginpage-2.png` });

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
            await page.screenshot({ path: `${imgDir}/qseow/${appId}/overview-1.png` });

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
                const fileName = `${imgDir}/qseow/${appId}/thumbnail-${appId}-${iSheetNum}.png`;
                const fileNameShort = `thumbnail-${appId}-${iSheetNum}.png`;

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

            // Log out
            await Promise.all([
                page.goto(hubUrl),
                page.waitForNavigation({ waitUntil: ['networkidle2'] }),
            ]);

            // wait for element defined by XPath appear in page
            await page.waitForXPath(xpathHubUserPageButton);

            // evaluate XPath expression of the target selector (it returns array of ElementHandle)
            let elementHandle = await page.$x(xpathHubUserPageButton);

            await page.waitForTimeout(options.pagewait * 1000);

            // Click user button and wait for page to load
            await Promise.all([elementHandle[0].click()]);

            await page.waitForXPath(xpathLogoutButton);
            elementHandle = await page.$x(xpathLogoutButton);

            await page.waitForTimeout(options.pagewait * 1000);

            // Click logout button and wait for page to load
            await Promise.all([elementHandle[0].click()]);
            await page.waitForTimeout(options.pagewait * 1000);

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
        await qseowUploadToContentLibrary(createdFiles, appId, options);

        // Update sheets in app
        await qseowUpdateSheetThumbnails(createdFiles, appId, options);

        logger.info(`Done processing app ${appId}`);
    } catch (err) {
        logger.error(`QSEoW APP: ${err}`);
    }
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

        const appIdsToProcess = [];

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

        // Is there a specific app ID specified?
        if (options.appid) {
            appIdsToProcess.push(options.appid);
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

            // Add all apps with this tag
            // eslint-disable-next-line no-restricted-syntax
            for (const app of result.body) {
                appIdsToProcess.push(app.id);
            }
        }

        // Remove duplicates (if any) from list of app IDs that will be processed
        const uniqueAppIds = [...new Set(appIdsToProcess)];

        // Debug output of apps that will be processed
        logger.debug('Will process these app IDs:');
        uniqueAppIds.forEach((appId) => {
            logger.debug(appId);
        });

        // Process all apps
        // eslint-disable-next-line no-restricted-syntax
        for (const appId of uniqueAppIds) {
            try {
                logger.info(`--------------------------------------------------`);
                logger.info(`About to process app ${appId}`);

                await processQSEoWApp(appId, global, options);

                logger.verbose(`Done processing app ${appId}`);
            } catch (err) {
                logger.error(`QSEOW PROCESS APP: ${err}`);
            }
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
