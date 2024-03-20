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

const xpathHubUserPageButtonPre2022Nov = 'xpath/.//*[@id="hub-sidebar"]/div[1]/div[1]/div/div/div';
const xpathLogoutButtonPre2022Nov =
    'xpath/.//*[@id="q-hub-user-popover-override"]/ng-transclude/div[2]/button';

const xpathHubUserPageButton2022Nov =
    'xpath/.//*[@id="q-hub-toolbar"]/header/div/div[5]/div/div/div/button';
const xpathLogoutButton2022Nov =
    'xpath/.//*[@id="q-hub-menu-override"]/ng-transclude/ul/li[6]/span[2]';

const xpathHubUserPageButton2023Feb =
    'xpath/.//*[@id="q-hub-toolbar"]/header/div/div[5]/div/div/div/button/span/span';
const xpathLogoutButton2023Feb =
    'xpath/.//*[@id="q-hub-menu-override"]/ng-transclude/ul/li[5]/span[2]';

const xpathHubUserPageButton2023May =
    'xpath/.//*[@id="q-hub-toolbar"]/div[2]/div[5]/div/div/div/button/span/span';
const xpathLogoutButton2023May =
    'xpath/.//*[@id="q-hub-menu-override"]/ng-transclude/ul/li[6]/span[2]';

const xpathHubUserPageButton2023Aug =
    'xpath/.//*[@id="q-hub-toolbar"]/div[2]/div[5]/div/div/div/button/span/span';
const xpathLogoutButton2023Aug =
    'xpath/.//*[@id="q-hub-menu-override"]/ng-transclude/ul/li[6]/span[2]';

const xpathHubUserPageButton2023Nov =
    'xpath/.//*[@id="q-hub-toolbar"]/div[2]/div[5]/div/div/div/button/span/span';
const xpathLogoutButton2023Nov =
    'xpath/.//*[@id="q-hub-menu-override"]/ng-transclude/ul/li[6]/span[2]';

const xpathHubUserPageButton2024Feb =
    'xpath/.//*[@id="q-hub-toolbar"]/div[2]/div[5]/div/div/div/button/span/span';
const xpathLogoutButton2024Feb =
    'xpath/.//*[@id="q-hub-menu-override"]/ng-transclude/ul/li[6]/span[2]';

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
    } else if (options.senseVersion === '2023-Aug') {
        xpathHubUserPageButton = xpathHubUserPageButton2023Aug;
        xpathLogoutButton = xpathLogoutButton2023Aug;
    } else if (options.senseVersion === '2023-Nov') {
        xpathHubUserPageButton = xpathHubUserPageButton2023Nov;
        xpathLogoutButton = xpathLogoutButton2023Nov;
    } else if (options.senseVersion === '2024-Feb') {
        xpathHubUserPageButton = xpathHubUserPageButton2024Feb;
        xpathLogoutButton = xpathLogoutButton2024Feb;
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
                if (err.stack) {
                    logger.error(`QSEOW Could not launch virtual browser (stack): ${err.stack}`);
                } else if (err.message) {
                    logger.error(
                        `QSEOW Could not launch virtual browser (message): ${err.message}`
                    );
                } else {
                    logger.error(`QSEOW Could not launch virtual browser: ${err}. Exiting.`);
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
            // https://stackoverflow.com/questions/52163547/node-js-puppeteer-how-to-set-navigation-timeout
            await page.setDefaultTimeout(90000);

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

            await Promise.all([page.goto(appUrl, { waitUntil: 'networkidle2', timeout: 90000 })]);

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
                // --exclude-sheet-status <status...>

                let excludeSheet = false;

                // Should this sheet be excluded based on its published status?
                // Deal with public sheets first
                if (
                    sheet.qMeta.approved === true &&
                    sheet.qMeta.published === true &&
                    options.excludeSheetStatus.includes('public')
                ) {
                    excludeSheet = true;
                    logger.verbose(
                        `Excluded sheet (status public): ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved ${sheet.qMeta.approved}, published ${sheet.qMeta.published}`
                    );
                }

                // Next check published sheets
                if (
                    sheet.qMeta.approved === false &&
                    sheet.qMeta.published === true &&
                    options.excludeSheetStatus.includes('published')
                ) {
                    excludeSheet = true;
                    logger.verbose(
                        `Excluded sheet (status published): ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved ${sheet.qMeta.approved}, published ${sheet.qMeta.published}`
                    );
                }

                // Next check private sheets
                if (
                    sheet.qMeta.approved === false &&
                    sheet.qMeta.published === false &&
                    options.excludeSheetStatus.includes('private')
                ) {
                    excludeSheet = true;
                    logger.verbose(
                        `Excluded sheet (status private): ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved ${sheet.qMeta.approved}, published ${sheet.qMeta.published}`
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
                        `Excluded sheet (hidden): ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}', hidden '${sheetIsHidden}'`
                    );
                }

                // Is this sheet on the exclude list via tags?
                // options.excludeSheetTag is an array of strings
                // tagExcludeSheetAppMetadata is an array of sheet objects, with the id property being the sheet id
                if (options.excludeSheetTag && excludeSheet === false) {
                    // Does the sheet id match any of the ids in tagExcludeSheetAppMetadata array?
                    // Set excludeSheet to true/false based on the result
                    excludeSheet = tagExcludeSheetAppMetadata.some(
                        (element) => element.engineObjectId === sheet.qInfo.qId
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
                        `Excluded sheet: ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}', hidden '${sheetIsHidden}'`
                    );
                } else {
                    logger.info(
                        `Processing sheet ${iSheetNum}: '${sheet.qMeta.title}', ID ${sheet.qInfo.qId}, description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}', hidden '${sheetIsHidden}'`
                    );
                    // Build URL to current sheet
                    const sheetUrl = `${appUrl}/sheet/${sheet.qInfo.qId}`;
                    logger.debug(`Sheet URL: ${sheetUrl}`);

                    // Open sheet in browser, then take screen shot
                    await Promise.all([
                        page.goto(sheetUrl, { waitUntil: 'networkidle2', timeout: 90000 }),
                    ]);

                    await sleep(options.pagewait * 1000);

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
                    page.goto(hubUrl, { waitUntil: 'networkidle2', timeout: 90000 }),
                ]);
            } catch (err) {
                if (err.stack) {
                    logger.error(
                        `QSEOW: Could not open hub after generating thumbnail images (stack): ${err.stack}`
                    );
                } else if (err.message) {
                    logger.error(
                        `QSEOW: Could not open hub after generating thumbnail images (message): ${err.message}`
                    );
                } else {
                    logger.error(
                        `QSEOW: Could not open hub after generating thumbnail images: ${err}`
                    );
                }
            }

            let elementHandle;
            try {
                // wait for user button to become visible, then click it to open the user menu
                await page.waitForSelector(xpathHubUserPageButton);
                // evaluate XPath expression of the target selector (it returns array of ElementHandle)
                elementHandle = await page.$$(xpathHubUserPageButton);

                await sleep(options.pagewait * 1000);

                // Click user button and wait for page to load
                await Promise.all([elementHandle[0].click()]);
            } catch (err) {
                if (err.stack) {
                    logger.error(
                        `QSEOW: Error waiting for, or clicking, user button in hub default view (stack): ${err.stack}`
                    );
                } else if (err.message) {
                    logger.error(
                        `QSEOW: Error waiting for, or clicking, user button in hub default view (message): ${err.message}`
                    );
                } else {
                    logger.error(
                        `QSEOW: Error waiting for, or clicking, user button in hub default view: ${err}`
                    );
                }
            }

            try {
                // Wait for logout button to become visible, then click it
                await page.waitForSelector(xpathLogoutButton);
                elementHandle = await page.$$(xpathLogoutButton);

                await sleep(options.pagewait * 1000);

                // Click logout button and wait for page to load
                await Promise.all([elementHandle[0].click()]);
                await sleep(options.pagewait * 1000);
            } catch (err) {
                if (err.stack) {
                    logger.error(
                        `QSEOW: Error while waiting for, or clicking, logout button in hub's user menu (stack): ${err.stack}`
                    );
                } else if (err.message) {
                    logger.error(
                        `QSEOW: Error while waiting for, or clicking, logout button in hub's user menu (message): ${err.message}`
                    );
                } else {
                    logger.error(
                        `QSEOW: Error while waiting for, or clicking, logout button in hub's user menu: ${err}`
                    );
                }
            }

            try {
                await browser.close();
                logger.verbose('Closed virtual browser');
            } catch (err) {
                if (err.stack) {
                    logger.error(`QSEOW: Could not close virtual browser (stack): ${err.stack}`);
                } else if (err.message) {
                    logger.error(
                        `QSEOW: Could not close virtual browser (message): ${err.message}`
                    );
                } else {
                    logger.error(`QSEOW: Could not close virtual browser: ${err}`);
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
        if (err.stack) {
            logger.error(`QSEOW: processQSEoWApp (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`QSEOW: processQSEoWApp (message): ${err.message}`);
        } else {
            logger.error(`QSEOW: processQSEoWApp: ${err}`);
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
                if (err.stack) {
                    logger.error(`QSEOW PROCESS APP (stack): ${err.stack}`);
                } else if (err.message) {
                    logger.error(`QSEOW PROCESS APP (message): ${err.message}`);
                } else {
                    logger.error(`QSEOW PROCESS APP: ${err}`);
                }
            }
        }

        return true;
    } catch (err) {
        if (err.stack) {
            logger.error(`QSEOW CREATE THUMBNAILS 2 (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`QSEOW CREATE THUMBNAILS 2 (message): ${err.message}`);
        } else {
            logger.error(`QSEOW CREATE THUMBNAILS 2: ${err}`);
        }

        return false;
    }
};

module.exports = {
    qseowCreateThumbnails,
};
