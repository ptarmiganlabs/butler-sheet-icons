/* eslint-disable no-await-in-loop */
/* eslint-disable import/extensions */
const enigma = require('enigma.js');
const puppeteer = require('puppeteer-core');
// const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { homedir } = require('os');
const { computeExecutablePath } = require('@puppeteer/browsers');
const { Jimp } = require('jimp');

const { setupEnigmaConnection } = require('./cloud-enigma.js');
const { logger, setLoggingLevel, bsiExecutablePath, isPkg, sleep } = require('../../globals.js');
const { qscloudUploadToApp } = require('./cloud-upload.js');
const { qscloudUpdateSheetThumbnails } = require('./cloud-updatesheets.js');
const QlikSaas = require('./cloud-repo');
const { browserInstall } = require('../browser/browser-install.js');
const { qscloudTestConnection } = require('./cloud-test-connection');

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
                    try {
                        logger.verbose(
                            `Deleting existing thumbnail "${thumbnailImg.name}" for app ${appId}, media path is "apps/${appId}/media/files/thumbnails/${thumbnailImg.name}"`
                        );
                        const result = await saasInstance.Delete(
                            `apps/${appId}/media/files/thumbnails/${thumbnailImg.name}`
                        );
                        logger.debug(
                            `Deleted existing file ${thumbnailImg.name}, result=${JSON.stringify(
                                result
                            )}`
                        );
                    } catch (err) {
                        if (err.stack) {
                            logger.error(`CREATE THUMBNAILS 3 (stack): ${err.stack}`);
                        } else if (err.message) {
                            logger.error(`CREATE THUMBNAILS 3 (message): ${err.message}`);
                        } else {
                            logger.error(
                                `CREATE THUMBNAILS 3: Error deleting existing thumbnail: ${err}`
                            );
                        }

                        throw Error('Error deleting existing thumbnail');
                    }
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
            // https://stackoverflow.com/questions/52163547/node-js-puppeteer-how-to-set-navigation-timeout
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
            // eslint-disable-next-line no-restricted-syntax
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

                    // Build URL to current sheet
                    const sheetUrl = `${appUrl}/sheet/${sheet.qInfo.qId}/state/analysis`;
                    logger.debug(`Sheet URL: ${sheetUrl}`);

                    // Open sheet in browser, then take screen shot
                    await Promise.all([
                        page.goto(sheetUrl, { waitUntil: 'networkidle2', timeout: 90000 }),
                    ]);

                    await sleep(options.pagewait * 1000);

                    const fileName = `${imgDir}/cloud/${appId}/thumbnail-${iSheetNum}.png`;
                    const fileNameShort = `thumbnail-${iSheetNum}.png`;

                    let selector = '';
                    if (options.includesheetpart === '1') {
                        // 1: Only chart part of sheet (no sheet title, selections or app info)
                        selector = '#grid-wrap';
                    } else if (options.includesheetpart === '2') {
                        // 2: Include sheet title  (no selections or app info)
                        selector = '#qs-page-container';
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

                    // Blur image and store as separate file
                    const fileNameBlurred = `${imgDir}/cloud/${appId}/thumbnail-${iSheetNum}-blurred.png`;
                    const fileNameShortBlurred = `thumbnail-${iSheetNum}-blurred.png`;

                    // Create blurred image from the already taken screenshot
                    // Load the image from disk, blur it, then save it back to disk with new name
                    try {
                        let blurFactor;

                        // Blur factor should be between 1 and 100
                        if (options?.blurFactor < 1) {
                            blurFactor = 1; // Min blur value
                        } else if (options?.blurFactor > 100) {
                            blurFactor = 100; // Max blur value
                        } else {
                            // Parse blur factor from options into an integer
                            blurFactor = parseInt(options?.blurFactor, 10);
                        }

                        // Use Jimp instead of Sharp
                        const image = await Jimp.read(fileName);
                        await image.blur(blurFactor).write(fileNameBlurred);

                        createdFiles.push({
                            sheetPos: iSheetNum,
                            blurred: true,
                            fileNameShort: fileNameShortBlurred,
                        });
                        logger.verbose(`Created blurred image: ${fileNameBlurred}`);
                    } catch (err) {
                        logger.error(`Failed to create blurred image: ${err}`);
                        if (err.message) {
                            logger.error(`CREATE BLURRED IMAGE (message): ${err.message}`);
                        }
                        if (err.stack) {
                            logger.error(`CREATE BLURRED IMAGE (stack): ${err.stack}`);
                        }
                    }
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

/**
 * Create thumbnails for Qlik Sense Cloud (QSC)
 * @param {object} options - Object containing options for creating thumbnails
 * @param {string} options.tenanturl - URL of Qlik Sense Cloud tenant
 * @param {string} options.apikey - API key for Qlik Sense Cloud tenant
 * @param {string} options.loglevel - log level for the operation
 * @param {string} options.logonuserid - user ID for Qlik Sense Cloud tenant
 * @param {string} options.logonpwd - password for Qlik Sense Cloud tenant
 * @param {string} options.collectionid - ID of collection in Qlik Sense Cloud tenant
 * @param {string} options.appid - ID of app in Qlik Sense Cloud tenant
 * @param {string} options.imagedir - directory where images will be stored
 * @param {string} options.includesheetpart - optional parameter to include sheet parts in the thumbnails. Values: 1, 2, 4
 * @param {string} options.schemaversion - version of the QS schema
 * @param {string} options.appid - ID of app in Qlik Sense Cloud tenant
 * @param {string} options.browser - name of browser to use for rendering thumbnails
 * @param {string} options.browserVersion - version of browser to use for rendering thumbnails
 * @param {string} options.blurSheetStatus - which sheet statuses should be blurred
 * @param {string} options.blurSheetTag - which sheet tags should be blurred
 * @param {string} options.blurSheetNumber - number of sheets to blur
 * @param {string} options.blurFactor - blur factor
 *
 * @returns {Promise<boolean>} - true if thumbnails were created successfully, false otherwise
 */
const qscloudCreateThumbnails = async (options) => {
    try {
        // Set log level
        if (options.loglevel === undefined || options.logLevel) {
            // eslint-disable-next-line no-param-reassign
            options.loglevel = options.logLevel;
        }
        setLoggingLevel(options.loglevel);

        logger.info('Starting creation of thumbnails for Qlik Sense Cloud');
        logger.verbose(`Running as standalone app: ${isPkg}`);
        logger.debug(`BSI executable path: ${bsiExecutablePath}`);
        logger.debug(`Options: ${JSON.stringify(options, null, 2)}`);

        const appIdsToProcess = [];

        // If --includesheetpart has been specifed it should contain a valid value
        if (
            options.includesheetpart !== '1' &&
            options.includesheetpart !== '2' &&
            options.includesheetpart !== '4' &&
            options.includesheetpart !== 1 &&
            options.includesheetpart !== 2 &&
            options.includesheetpart !== 4
        ) {
            logger.error(
                `Invalid --includesheetpart paramater: ${options.includesheetpart}. Aborting`
            );
            throw Error('Invalid --includesheetpart paramater');
        }

        // Get array of all available collections
        const cloudConfig = {
            url: options.tenanturl,
            token: options.apikey,
            // version: X, // optional. default is: 1
        };
        const saasInstance = new QlikSaas(cloudConfig);

        // Test connection to QS Cloud by getting info about the user associated with the API key
        try {
            const res = await qscloudTestConnection(options, saasInstance);
            logger.verbose(
                `Connection to tenant ${options.tenanturl} successful: ${JSON.stringify(res)}`
            );
        } catch (err) {
            if (err.stack) {
                logger.error(`TEST CONNECTIVITY 1 (stack): ${err.stack}`);
            } else if (err.message) {
                logger.error(`TEST CONNECTIVITY 1 (message): ${err.message}`);
                if (err.status && err.statusText) {
                    logger.error(
                        `TEST CONNECTIVITY 1 (error code): ${err.status}="${err.statusText}"`
                    );
                }
            } else {
                logger.error(`TEST CONNECTIVITY 1: ${err}`);
            }

            return false;
        }

        // Is there a specific app ID specified?
        if (options.appid) {
            appIdsToProcess.push(options.appid);
        }

        // If --collection exists we should loop over all matching apps.
        // If --collection does not exist the app specified by --appid should be processed.
        if (options.collectionid && options.collectionid.length > 0) {
            // Get index of specified collection among the existin ones.
            const allCollections = await saasInstance.Get('collections');
            logger.debug(`Collections:\n${JSON.stringify(allCollections, null, 2)}`);

            const index = allCollections.map((e) => e.id).indexOf(options.collectionid);

            if (index === -1) {
                // Collection not found
                logger.error(`Collection '${options.collectionid}' does not exist - aborting`);
                throw Error('Collection does not exist');
            } else {
                // Collection found
                logger.verbose(`Collection '${options.collectionid}' exists`);

                // Get all items within collection
                const collectionItems = await saasInstance.Get(
                    `collections/${options.collectionid}/items`
                );

                // Process all apps in this collection
                // eslint-disable-next-line no-restricted-syntax
                for (const item of collectionItems) {
                    // Is item an app?
                    if (item.resourceType === 'app') {
                        appIdsToProcess.push(item.resourceAttributes.id);
                    } else {
                        logger.verbose(
                            `Skipping collection item ${item.id} as it is not an app: ${item.resourceType}`
                        );
                    }
                }
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

                await processCloudApp(appId, saasInstance, options);

                logger.verbose(`Done processing app ${appId}`);
            } catch (err) {
                if (err.stack) {
                    logger.error(`CLOUD PROCESS APP (stack): ${err.stack}`);
                } else if (err.message) {
                    logger.error(`CLOUD PROCESS APP (message): ${err.message}`);
                } else {
                    logger.error(`CLOUD PROCESS APP: ${err}`);
                }
            }
        }

        return true;
    } catch (err) {
        if (err.stack) {
            logger.error(`CLOUD CREATE THUMBNAILS 2 (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`CLOUD CREATE THUMBNAILS 2 (message): ${err.message}`);
        } else {
            logger.error(`CLOUD CREATE THUMBNAILS 2: ${JSON.stringify(err, null, 2)}`);
        }

        return false;
    }
};

module.exports = {
    qscloudCreateThumbnails,
};
