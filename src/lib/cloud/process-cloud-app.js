const enigma = require('enigma.js');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { homedir } = require('os');
const { computeExecutablePath } = require('@puppeteer/browsers');
const { setupEnigmaConnection } = require('./cloud-enigma.js');
const { logger, sleep } = require('../../globals.js');
const { qscloudUploadToApp } = require('./cloud-upload.js');
const { qscloudUpdateSheetThumbnails } = require('./cloud-updatesheets.js');
const { browserInstall } = require('../browser/browser-install.js');
const { deleteCloudAppThumbnail } = require('./cloud-delete-thumbnails.js');
const { takeSheetScreenshot } = require('./sheet-screenshot.js');

// Selector paths to elements on login page
const selectorLoginPageUserName = '[id="\u0031-email"]';
const selectorLoginPageUserPwd = '[id="\u0031-password"]';
const selectorLoginPageLoginButton = '[id="\u0031-submit"]';

/**
 * Process a single Qlik Sense Cloud app.
 *
 * @param {string} appId      App ID of the app to process.
 * @param {QlikSaas} saasInstance QlikSaas object.
 * @param {Object}  options    Options object.
 *
 * @returns {Promise<void>}
 */
const processCloudApp = async (appId, saasInstance, options) => {
    // Create image directory on disk for this app
    try {
        fs.mkdirSync(`${options.imagedir}/cloud/${appId}`, { recursive: true });
        logger.verbose(`Created cloud image directory '${options.imagedir}/cloud/${appId}'`);
    } catch (err) {
        if (err.stack) {
            logger.error(`CREATE THUMBNAILS 1 (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`CREATE THUMBNAILS 1 (message): ${err.message}`);
        } else {
            logger.error(`CREATE THUMBNAILS 1: Error creating cloud image directory: ${err}`);
        }
        throw Error('Error creating cloud image directory');
    }
    try {
        // Does the app have a thumbnail folder in its media library?
        logger.verbose(
            `Getting media list for app ${appId}, media path is "apps/${appId}/media/list"`
        );
        const mediaList = await saasInstance.Get(`apps/${appId}/media/list`);
        if (
            mediaList.find((item) => {
                const thumbnailFolderExists =
                    item.type === 'directory' && item.name === 'thumbnails';
                return thumbnailFolderExists;
            })
        ) {
            // "thumbnails" folder exists in app's media library
            logger.debug(`App ${appId} has a "thumbnails" folder in its media library`);
            // Remove all existing thumbnail images from this app
            let existingThumbnails;
            try {
                logger.verbose(
                    `Getting existing thumbnails for app ${appId}, media path is "apps/${appId}/media/list/thumbnails"`
                );
                existingThumbnails = await saasInstance.Get(`apps/${appId}/media/list/thumbnails`);
            } catch (err) {
                if (err.stack) {
                    logger.error(`CREATE THUMBNAILS 2 (stack): ${err.stack}`);
                } else if (err.message) {
                    logger.error(`CREATE THUMBNAILS 2 (message): ${err.message}`);
                } else {
                    logger.error(`CREATE THUMBNAILS 2: Error getting existing thumbnails: ${err}`);
                }
                throw Error('Error getting existing thumbnails');
            }
            // eslint-disable-next-line no-restricted-syntax
            for (const thumbnailImg of existingThumbnails) {
                if (thumbnailImg.type === 'image') {
                    await deleteCloudAppThumbnail(thumbnailImg, appId, saasInstance, logger);
                }
            }
        }

        // Get app name
        const appMetadata = await saasInstance.Get(`apps/${appId}`);

        // Is app published?
        // appMetadata.attributes.publishTime is a string like "2021-09-01T12:34:56.789Z"

        // If empty the app is not published
        const appIsPublished = !!appMetadata.attributes.publishTime;

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
        logger.info(
            `Created session to Qlik Sense Cloud tenant ${options.tenanturl}, engine version is ${engineVersion.qComponentVersion}`
        );
        const app = await global.openDoc(appId, '', '', '', false);
        logger.info(`Opened app ${appId}`);
        logger.info(`App name: "${appMetadata.attributes.name}"`);
        logger.info(`App is published: ${appMetadata.attributes.published}`);

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
                    showCondition: '/showCondition',
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

            // Get browser cache path
            const browserPath = path.join(homedir(), '.cache/puppeteer');
            logger.debug(`Browser cache path: ${browserPath}`);
            logger.info(`Downloading and installing browser...`);

            // Install browser
            // Returns true if browser installed successfully
            const browserInstallResult = await browserInstall(options);
            if (browserInstallResult === false) {
                logger.error(`CLOUD: Error installing browser. Exiting.`);
                process.exit(1);
            }
            logger.info(`Browser setup complete. Launching browser...`);
            const executablePath = computeExecutablePath({
                browser: browserInstallResult.browser,
                buildId: browserInstallResult.buildId,
                cacheDir: browserPath,
            });
            logger.verbose(`Using browser at ${executablePath}`);
            // Parse --headless option
            let headless = true;
            if (options.headless === 'true' || options.headless === true) {
                headless = 'new';
            } else if (options.headless === 'false' || options.headless === false) {
                headless = false;
            }
            // Make sure browser is launched ok
            let browser;
            try {
                browser = await puppeteer.launch({
                    executablePath,
                    headless,
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
            } catch (err) {
                if (err.stack) {
                    logger.error(
                        `CLOUD APP: Could not launch virtual browser (stack): ${err.stack}`
                    );
                } else if (err.message) {
                    logger.error(
                        `CLOUD APP: Could not launch virtual browser (message): ${err.message}`
                    );
                } else {
                    logger.error(`CLOUD APP: Could not launch virtual browser: ${err}. Exiting.`);
                }
                process.exit(1);
            }
            const page = await browser.newPage();
            // Thumbnails should be 410x270 pixels, so set the viewport to a multiple of this.
            await page.setViewport({
                width: 1230,
                height: 810,
                deviceScaleFactor: 1,
            });
            // Set default timeout for all page operations to 90 seconds
            await page.setDefaultTimeout(90000);
            // Qlik Sense cloud URL format:
            // https://<tenant FQDN>/sense/app/<app ID>>
            const appUrl = `https://${options.tenanturl}/sense/app/${appId}`;
            logger.debug(`App URL: ${appUrl}`);
            await Promise.all([page.goto(appUrl, { waitUntil: 'networkidle2', timeout: 90000 })]);
            await sleep(options.pagewait * 1000);
            await page.screenshot({ path: `${imgDir}/cloud/${appId}/loginpage-1.png` });
            // Should login be skipped?
            if (options.skiplogin === true) {
                logger.info('Skipping login as --skip-login is set to true');
            } else {
                // Enter credentials
                // User
                await page.click(selectorLoginPageUserName, {
                    button: 'left',
                    clickCount: 1,
                    delay: 10,
                });
                const user = `${options.logonuserid}`;
                await page.keyboard.type(user);
                // Pwd
                await page.click(selectorLoginPageUserPwd, {
                    button: 'left',
                    clickCount: 1,
                    delay: 10,
                });
                await page.keyboard.type(options.logonpwd);
                await page.screenshot({ path: `${imgDir}/cloud/${appId}/loginpage-2.png` });
                // Click login button and wait for page to load
                await Promise.all([
                    page.click(selectorLoginPageLoginButton, {
                        button: 'left',
                        clickCount: 1,
                        delay: 10,
                    }),
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 90000 }),
                ]);
                await sleep(options.pagewait * 1000);
            }
            // Take screenshot of app overview page
            await page.screenshot({ path: `${imgDir}/cloud/${appId}/overview-1.png` });
            // Sort sheets
            sheetListObj.qAppObjectList.qItems.sort((sheet1, sheet2) => {
                if (sheet1.qData.rank < sheet2.qData.rank) return -1;
                if (sheet1.qData.rank > sheet2.qData.rank) return 1;
                return 0;
            });

            // Loop over all sheets in app
            for (const sheet of sheetListObj.qAppObjectList.qItems) {
                // Should this sheet be processed, or is it on exclude list?
                // Options are
                // --exclude-sheet-number <number...>
                // --exclude-sheet-title <title...>
                // --exclude-sheet-status <status...>
                let excludeSheet = false;
                // Get published status of sheet
                let sheetPublished;
                if (sheet.qMeta?.published === undefined || sheet.qMeta.published === false) {
                    sheetPublished = false;
                } else {
                    sheetPublished = true;
                }
                // Get approved status of sheet
                let sheetApproved;
                if (sheet.qMeta?.approved === undefined || sheet.qMeta.approved === false) {
                    sheetApproved = false;
                } else {
                    sheetApproved = true;
                }
                // Should this sheet be excluded based on its published status?
                // Deal with public sheets first. Published and unpublished apps need to be handled differently.
                if (appIsPublished === true) {
                    // App is published
                    if (
                        sheetApproved === true &&
                        sheetPublished === true &&
                        options.excludeSheetStatus.includes('public')
                    ) {
                        excludeSheet = true;
                        logger.verbose(
                            `Excluded sheet (status public): ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheetApproved}', published '${sheetPublished}'`
                        );
                    }
                } else if (
                    sheetApproved === false &&
                    sheetPublished === true &&
                    options.excludeSheetStatus &&
                    options.excludeSheetStatus.includes('public')
                ) {
                    // App is not published. Public sheets in this case have approved===false and published===true
                    excludeSheet = true;
                    logger.verbose(
                        `Excluded sheet (status public): ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheetApproved}', published '${sheetPublished}'`
                    );
                }
                // Next check published sheets
                // Only applicable to published apps
                if (appIsPublished === true) {
                    if (
                        sheetApproved === false &&
                        sheetPublished === true &&
                        options.excludeSheetStatus &&
                        options.excludeSheetStatus.includes('published')
                    ) {
                        excludeSheet = true;
                        logger.verbose(
                            `Excluded sheet (status published): ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheetApproved}', published '${sheetPublished}'`
                        );
                    }
                }
                // Next check private sheets
                // Handled the same way for both published and unpublished apps
                if (
                    sheetApproved === false &&
                    sheetPublished === false &&
                    options.excludeSheetStatus &&
                    options.excludeSheetStatus.includes('private')
                ) {
                    excludeSheet = true;
                    logger.verbose(
                        `Excluded sheet (status private): ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheetApproved}', published '${sheetPublished}'`
                    );
                }
                // Is this sheet hidden?
                // Never process hidden sheets
                // Evaluate showCondition
                const showConditionCall = {
                    qExpression: sheet?.qData?.showCondition,
                };
                const showConditionEval = await app.evaluateEx(showConditionCall);
                const sheetIsHidden =
                    // eslint-disable-next-line no-unneeded-ternary
                    sheet.qData.showCondition &&
                    (sheet.qData.showCondition.toLowerCase() === 'false' ||
                        (showConditionEval?.qIsNumeric === true &&
                            showConditionEval?.qNumber === 0))
                        ? true
                        : false;
                if (sheetIsHidden === true && excludeSheet === false) {
                    excludeSheet = true;
                    logger.verbose(
                        `Excluded sheet (hidden): ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheetApproved}', published '${sheetPublished}', hidden '${sheetIsHidden}'`
                    );
                }
                // Is this sheet on the exclude list via sheet number?
                if (options.excludeSheetNumber && excludeSheet === false) {
                    // Does the sheet number match any of the numbers in options.excludeSheetNumber array?
                    // Take into account that iSheetNum is an integer, so we need to convert it to a string
                    if (options.excludeSheetNumber.includes(iSheetNum.toString())) {
                        excludeSheet = true;
                        logger.verbose(
                            `Excluded sheet (via sheet number): ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}', hidden '${sheetIsHidden}'`
                        );
                    }
                }
                // Is this sheet on the exclude list via sheet title?
                if (options.excludeSheetTitle && excludeSheet === false) {
                    // Does the sheet title match any of the titles options.excludeSheetTitle array?
                    if (options.excludeSheetTitle.includes(sheet.qMeta.title)) {
                        excludeSheet = true;
                        logger.verbose(
                            `Excluded sheet (via sheet title): ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}', hidden '${sheetIsHidden}'`
                        );
                    }
                }
                if (excludeSheet === true) {
                    logger.info(
                        `Excluded sheet: ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheetApproved}', published '${sheetPublished}', hidden '${sheetIsHidden}'`
                    );
                } else {
                    logger.info(
                        `Processing sheet ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheetApproved}', published '${sheetPublished}', hidden '${sheetIsHidden}'`
                    );

                    const createdFile = await takeSheetScreenshot(
                        page,
                        appUrl,
                        imgDir,
                        appId,
                        sheet,
                        iSheetNum,
                        options,
                        logger
                    );
                    createdFiles.push(createdFile);
                }
                iSheetNum += 1;
            }
            try {
                await browser.close();
                logger.verbose('Closed virtual browser');
            } catch (err) {
                if (err.stack) {
                    logger.error(
                        `CLOUD APP: Could not close virtual browser (stack): ${err.stack}`
                    );
                } else if (err.message) {
                    logger.error(
                        `CLOUD APP: Could not close virtual browser (message): ${err.message}`
                    );
                } else {
                    logger.error(`CLOUD APP: Could not close virtual browser: ${err}`);
                }
            }
        }
        if ((await session.close()) === true) {
            logger.verbose(
                `Closed session after generating sheet thumbnail images for all sheets in QS Cloud app ${appId} on tenant ${options.tenanturl}`
            );
        } else {
            logger.error(
                `Error closing session for QS Cloud app ${appId} on host ${options.tenanturl}`
            );
        }

        // Upload to QS Cloud app
        await qscloudUploadToApp(createdFiles, appId, options);

        // Update sheets in app
        await qscloudUpdateSheetThumbnails(createdFiles, appId, options);
        logger.info(`Done processing app ${appId}`);
    } catch (err) {
        if (err.stack) {
            logger.error(`CLOUD APP (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`CLOUD APP (message): ${err.message}`);
        } else {
            logger.error(`CLOUD APP: ${err.stack}`);
        }
    }
};

module.exports = { processCloudApp };
