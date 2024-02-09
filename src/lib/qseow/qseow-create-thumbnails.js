/* eslint-disable no-await-in-loop */
/* eslint-disable import/extensions */
const enigma = require('enigma.js');
const puppeteer = require('puppeteer-core');
// const puppeteer = require('puppeteer');
const fs = require('fs');
const qrsInteract = require('qrs-interact');
const path = require('path');
const { homedir } = require('os');
const { computeExecutablePath } = require('@puppeteer/browsers');

const { setupEnigmaConnection } = require('./qseow-enigma.js');
const { logger, setLoggingLevel, bsiExecutablePath, isPkg, sleep } = require('../../globals.js');
const { qseowUploadToContentLibrary } = require('./qseow-upload.js');
const { qseowVerifyContentLibraryExists } = require('./qseow-contentlibrary.js');
const { qseowUpdateSheetThumbnails } = require('./qseow-updatesheets.js');
const { qseowVerifyCertificatesExist } = require('./qseow-certificates.js');
const { setupQseowQrsConnection } = require('./qseow-qrs.js');
const { browserInstall } = require('../browser/browser-install.js');

const selectorLoginPageUserName = '#username-input';
const selectorLoginPageUserPwd = '#password-input';
const selectorLoginPageLoginButton = '#loginbtn';

const xpathHubUserPageButtonPre2022Nov = '//*[@id="hub-sidebar"]/div[1]/div[1]/div/div/div';
const xpathLogoutButtonPre2022Nov =
    '//*[@id="q-hub-user-popover-override"]/ng-transclude/div[2]/button';

const xpathHubUserPageButton2022Nov =
    '//*[@id="q-hub-toolbar"]/header/div/div[5]/div/div/div/button';
const xpathLogoutButton2022Nov = '//*[@id="q-hub-menu-override"]/ng-transclude/ul/li[6]/span[2]';

const xpathHubUserPageButton2023Feb =
    '//*[@id="q-hub-toolbar"]/header/div/div[5]/div/div/div/button/span/span';
const xpathLogoutButton2023Feb = '//*[@id="q-hub-menu-override"]/ng-transclude/ul/li[5]/span[2]';

const xpathHubUserPageButton2023May =
    '//*[@id="q-hub-toolbar"]/div[2]/div[5]/div/div/div/button/span/span';
const xpathLogoutButton2023May = '//*[@id="q-hub-menu-override"]/ng-transclude/ul/li[6]/span[2]';

/**
 *
 * @param {*} appId
 * @param {*} g
 * @param {*} options
 */
const processQSEoWApp = async (appId, g, options) => {
    // Get correct XPaths to UI elements (user menu, logout button etc) in the Sense web UI
    // As Qlik update their Sense web client these xpaths may/will change.
    let xpathHubUserPageButton = null;
    let xpathLogoutButton = null;

    if (options.senseVersion === 'pre-2022-Nov') {
        xpathHubUserPageButton = xpathHubUserPageButtonPre2022Nov;
        xpathLogoutButton = xpathLogoutButtonPre2022Nov;
    } else if (options.senseVersion === '2022-Nov') {
        xpathHubUserPageButton = xpathHubUserPageButton2022Nov;
        xpathLogoutButton = xpathLogoutButton2022Nov;
    } else if (options.senseVersion === '2023-Feb') {
        xpathHubUserPageButton = xpathHubUserPageButton2023Feb;
        xpathLogoutButton = xpathLogoutButton2023Feb;
    } else if (options.senseVersion === '2023-May') {
        xpathHubUserPageButton = xpathHubUserPageButton2023May;
        xpathLogoutButton = xpathLogoutButton2023May;
    } else {
        logger.error(
            `CREATE QSEoW THUMBNAILS: Invalid Sense version specified as parameter when starting Butler Sheet Icons: "${options.senseVersion}"`
        );
        process.exit(1);
    }

    // Create image directory for this app
    try {
        fs.mkdirSync(`${options.imagedir}/qseow/${appId}`, { recursive: true });
        logger.verbose(`Created image QSEoW directory '${options.imagedir}/qseow/${appId}'`);
    } catch (err) {
        logger.error(`QSEOW CREATE THUMBNAILS 1: Error creating QSEoW image directory: ${err}`);
        if (err.message) {
            logger.error(`QSEOW CREATE THUMBNAILS 1 (message): ${err.message}`);
        }
        if (err.stack) {
            logger.error(`QSEOW CREATE THUMBNAILS 1 (stack): ${err.stack}`);
        }

        throw Error('Error creating QSEoW image directory');
    }

    try {
        // Get metadata about the app
        const qseowConfigQrs = setupQseowQrsConnection(options);

        // eslint-disable-next-line new-cap
        const qrsInteractInstance = new qrsInteract(qseowConfigQrs);
        logger.debug(`QSEoW QRS config: ${JSON.stringify(qseowConfigQrs, null, 2)}`);

        // Get app top level metadata
        logger.debug(`GET app top level metadata: app?filter=id eq ${appId}`);
        let appMetadata = await qrsInteractInstance.Get(`app?filter=id eq ${appId}`);
        appMetadata = appMetadata.body;

        // Get app objet metadata
        logger.debug(
            `GET tagExcludeSheetAppMetadata: app/object/full?filter=objectType eq 'sheet' and app.id eq ${appId} and tags.name eq '${options.excludeSheetTag}'`
        );
        let tagExcludeSheetAppMetadata = await qrsInteractInstance.Get(
            `app/object/full?filter=objectType eq 'sheet' and app.id eq ${appId} and tags.name eq '${options.excludeSheetTag}'`
        );
        tagExcludeSheetAppMetadata = tagExcludeSheetAppMetadata.body;

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
            `Created session to server ${options.host}, engine version is ${engineVersion.qComponentVersion}`
        );

        const app = await global.openDoc(appId, '', '', '', false);
        logger.info(`Opened app ${appId}`);
        logger.info(`App name: "${appMetadata[0].name}"`);
        logger.info(`App is published: ${appMetadata[0].published}`);

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
                logger.error(`QSEoW APP: Error installing browser. Exiting.`);
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
                logger.error(`QSEOW Could not launch virtual browser: ${err}. Exiting.`);
                if (err.message) {
                    logger.error(
                        `QSEOW Could not launch virtual browser (message): ${err.message}`
                    );
                }
                if (err.stack) {
                    logger.error(`QSEOW Could not launch virtual browser (stack): ${err.stack}`);
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

            let appUrl = '';
            let hubUrl = '';

            if (options.secure === 'true' || options.secure === true) {
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

            await sleep(options.pagewait * 1000);
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

            await sleep(options.pagewait * 1000);

            // Take screenshot of app overview page
            await page.screenshot({ path: `${imgDir}/qseow/${appId}/overview-1.png` });

            // Sort sheets
            sheetListObj.qAppObjectList.qItems.sort((sheet1, sheet2) => {
                if (sheet1.qData.rank < sheet2.qData.rank) return -1;
                if (sheet1.qData.rank > sheet2.qData.rank) return 1;
                return 0;
            });

            // Loop over all sheets in app
            // eslint-disable-next-line no-restricted-syntax
            for (const sheet of sheetListObj.qAppObjectList.qItems) {
                // Should this sheet be processed, or is it on exclude list?
                // Options are
                // --exclude-sheet-tag <value>
                // --exclude-sheet-number <number...>
                // --exclude-sheet-title <title...>

                let excludeSheet;

                // Is this sheet hidden?
                // Evaluate showCondition
                const showConditionCall = {
                    qExpression: sheet?.qData?.showCondition,
                };

                const showConditionEval = await app.evaluateEx(showConditionCall);

                if (
                    sheet.qData.showCondition &&
                    (sheet.qData.showCondition.toLowerCase() === 'false' ||
                        (showConditionEval?.qIsNumeric === true &&
                            showConditionEval?.qNumber === 0)) &&
                    excludeSheet === undefined
                ) {
                    excludeSheet = true;
                    logger.verbose(
                        `Excluded sheet (hidden): ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}'`
                    );
                }

                // Is this sheet on the exclude list via tags?
                if (options.excludeSheetTag && excludeSheet === undefined) {
                    // eslint-disable-next-line no-loop-func
                    excludeSheet = tagExcludeSheetAppMetadata.find((element) => {
                        try {
                            if (element.engineObjectId === sheet.qInfo.qId) {
                                logger.verbose(
                                    `Excluded sheet (via tag): ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}'`
                                );
                                return true;
                            }
                            return false;
                        } catch {
                            return false;
                        }
                    });
                }

                // Is this sheet on the exclude list via sheet number?
                if (options.excludeSheetNumber && excludeSheet === undefined) {
                    // eslint-disable-next-line no-loop-func
                    excludeSheet = options.excludeSheetNumber.find((element) => {
                        try {
                            if (parseInt(element, 10) === iSheetNum) {
                                logger.verbose(
                                    `Excluded sheet (via sheet number): ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}'`
                                );
                                return true;
                            }
                            return false;
                        } catch {
                            return false;
                        }
                    });
                }

                // Is this sheet on the exclude list via sheet title?
                if (options.excludeSheetTitle && excludeSheet === undefined) {
                    // eslint-disable-next-line no-loop-func
                    excludeSheet = options.excludeSheetTitle.find((element) => {
                        try {
                            if (element === sheet.qMeta.title) {
                                logger.verbose(
                                    `Excluded sheet (via sheet title): ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}'`
                                );
                                return true;
                            }
                            return false;
                        } catch {
                            return false;
                        }
                    });
                }

                if (excludeSheet !== undefined) {
                    logger.info(
                        `Excluded sheet: ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}'`
                    );
                } else {
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
                    createdFiles.push({ sheetPos: iSheetNum, fileNameShort });
                }
                iSheetNum += 1;
            }

            logger.verbose(`QSEoW APP: Done creating thumbnails. Opening hub at ${hubUrl}`);

            try {
                // Log out
                await Promise.all([
                    page.goto(hubUrl),
                    page.waitForNavigation({ waitUntil: ['networkidle2'] }),
                ]);
            } catch (err) {
                logger.error(`QSEOW: Could not open hub after generating thumbnail images: ${err}`);
                if (err.message) {
                    logger.error(
                        `QSEOW: Could not open hub after generating thumbnail images (message): ${err.message}`
                    );
                }
                if (err.stack) {
                    logger.error(
                        `QSEOW: Could not open hub after generating thumbnail images (stack): ${err.stack}`
                    );
                }
            }

            let elementHandle;
            try {
                // wait for user button to become visible, then click it to open the user menu
                await page.waitForXPath(xpathHubUserPageButton);
                // evaluate XPath expression of the target selector (it returns array of ElementHandle)
                elementHandle = await page.$x(xpathHubUserPageButton);

                await page.waitForTimeout(options.pagewait * 1000);

                // Click user button and wait for page to load
                await Promise.all([elementHandle[0].click()]);
            } catch (err) {
                logger.error(
                    `QSEOW: Error waiting for, or clicking, user button in hub default view: ${err}`
                );
                if (err.message) {
                    logger.error(
                        `QSEOW: Error waiting for, or clicking, user button in hub default view (message): ${err.message}`
                    );
                }
                if (err.stack) {
                    logger.error(
                        `QSEOW: Error waiting for, or clicking, user button in hub default view (stack): ${err.stack}`
                    );
                }
            }

            try {
                // Wait for logout button to become visible, then click it
                await page.waitForXPath(xpathLogoutButton);
                elementHandle = await page.$x(xpathLogoutButton);

                await page.waitForTimeout(options.pagewait * 1000);

                // Click logout button and wait for page to load
                await Promise.all([elementHandle[0].click()]);
                await page.waitForTimeout(options.pagewait * 1000);
            } catch (err) {
                logger.error(
                    `QSEOW: Error while waiting for, or clicking, logout button in hub's user menu: ${err}`
                );
                if (err.message) {
                    logger.error(
                        `QSEOW: Error while waiting for, or clicking, logout button in hub's user menu (message): ${err.message}`
                    );
                }
                if (err.stack) {
                    logger.error(
                        `QSEOW: Error while waiting for, or clicking, logout button in hub's user menu (stack): ${err.stack}`
                    );
                }
            }

            try {
                await browser.close();
                logger.verbose('Closed virtual browser');
            } catch (err) {
                logger.error(`QSEOW: Could not close virtual browser: ${err}`);
                if (err.message) {
                    logger.error(
                        `QSEOW: Could not close virtual browser (message): ${err.message}`
                    );
                }
                if (err.stack) {
                    logger.error(`QSEOW: Could not close virtual browser (stack): ${err.stack}`);
                }
            }
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
        logger.error(`QSEOW: processQSEoWApp: ${err}`);
        if (err.message) {
            logger.error(`QSEOW: processQSEoWApp (message): ${err.message}`);
        }
        if (err.stack) {
            logger.error(`QSEOW: processQSEoWApp (stack): ${err.stack}`);
        }
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
        logger.verbose(`Running as standalone app: ${isPkg}`);
        logger.debug(`BSI executable path: ${bsiExecutablePath}`);
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
                if (err.message) {
                    logger.error(`QSEOW PROCESS APP (message): ${err.message}`);
                }
                if (err.stack) {
                    logger.error(`QSEOW PROCESS APP (stack): ${err.stack}`);
                }
            }
        }

        return true;
    } catch (err) {
        logger.error(`QSEOW CREATE THUMBNAILS 2: ${err}`);
        if (err.message) {
            logger.error(`QSEOW CREATE THUMBNAILS 2 (message): ${err.message}`);
        }
        if (err.stack) {
            logger.error(`QSEOW CREATE THUMBNAILS 2 (stack): ${err.stack}`);
        }

        return false;
    }
};

module.exports = {
    qseowCreateThumbnails,
};
