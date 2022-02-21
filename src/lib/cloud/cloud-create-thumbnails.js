/* eslint-disable no-await-in-loop */
/* eslint-disable import/extensions */
const enigma = require('enigma.js');
const puppeteer = require('puppeteer');
const fs = require('fs');

const { setupEnigmaConnection } = require('./cloud-enigma.js');
const { logger, setLoggingLevel } = require('../../globals.js');
const { qscloudUploadToApp } = require('./cloud-upload.js');
const { qscloudUpdateSheetThumbnails } = require('./cloud-updatesheets.js');
const QlikSaas = require('./cloud-repo');

const selectorLoginPageUserName =
    '#lock-container > div > div > form > div > div > div:nth-child(3) > span > div > div > div > div > div > div > div > div > div > div.auth0-lock-input-block.auth0-lock-input-email > div.auth0-lock-input-wrap.auth0-lock-input-wrap-with-icon > input';
const selectorLoginPageUserPwd =
    '#lock-container > div > div > form > div > div > div:nth-child(3) > span > div > div > div > div > div > div > div > div > div > div.auth0-lock-input-block.auth0-lock-input-show-password > div > div.auth0-lock-input-wrap.auth0-lock-input-wrap-with-icon > input';
const selectorLoginPageLoginButton =
    '#lock-container > div > div > form > div > div > div.login-form--actions > button';

/**
 *
 * @param {*} appId
 * @param {*} saasInstance
 * @param {*} options
 */
const processCloudApp = async (appId, saasInstance, options) => {
    // Create image directory on disk for this app
    try {
        fs.mkdirSync(`${options.imagedir}/cloud/${appId}`, { recursive: true });
        logger.verbose(`Created cloud image directory '${options.imagedir}/cloud/${appId}'`);
    } catch (err) {
        logger.error(`CREATE THUMBNAILS 1: Error creating cloud image directory: ${err}`);
        throw Error('Error creating cloud image directory');
    }

    try {
        // Does the app have a thumbnail folder in its media library?
        const mediaList = await saasInstance.Get(`apps/${appId}/media/list`);

        if (
            mediaList.find((item) => {
                const thumbnailFolderExists =
                    item.type === 'directory' && item.name === 'thumbnails';
                return thumbnailFolderExists;
            })
        ) {
            // "thumbnails" folder exists in app's media library
            // Remove all existing thumbnail images from this app
            const existingThumbnails = await saasInstance.Get(
                `apps/${appId}/media/list/thumbnails`
            );

            // eslint-disable-next-line no-restricted-syntax
            for (const thumbnailImg of existingThumbnails) {
                if (thumbnailImg.type === 'image') {
                    const result = await saasInstance.Delete(
                        `apps/${appId}/media/files/thumbnails/${thumbnailImg.name}`
                    );
                    logger.debug(
                        `CLOUD PROCESS: Deleted existing file ${
                            thumbnailImg.name
                        }, result=${JSON.stringify(result, null, 2)}`
                    );
                }
            }
        }

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
            `Created session to Qlik Sense Cloud tenant ${options.tenanturl}, engine version is ${engineVersion.qComponentVersion}`
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
                headless: options.headless === true || options.headless.toLowerCase() === 'true',
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

            // Qlik cloud URL format:
            // https://<tenant FQDN>/sense/app/<app ID>>

            const appUrl = `https://${options.tenanturl}/sense/app/${appId}`;
            logger.debug(`App URL: ${appUrl}`);

            await Promise.all([
                page.goto(appUrl),
                page.waitForNavigation({ waitUntil: ['networkidle2'] }),
            ]);

            await page.waitForTimeout(options.pagewait * 1000);
            await page.screenshot({ path: `${imgDir}/cloud/${appId}/loginpage-1.png` });

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
                page.waitForNavigation({ waitUntil: 'networkidle2' }),
            ]);
            await page.waitForTimeout(options.pagewait * 1000);

            // Take screenshot of app overview page
            await page.screenshot({ path: `${imgDir}/cloud/${appId}/overview-1.png` });

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
                createdFiles.push(fileNameShort);

                iSheetNum += 1;
            }

            await browser.close();
            logger.verbose('Closed virtual browser');
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
        logger.error(`CLOUD APP: ${err}`);
    }
};

/**
 *
 * @param {*} options
 * @returns
 */
const qscloudCreateThumbnails = async (options) => {
    try {
        // Set log level
        setLoggingLevel(options.loglevel);

        logger.info('Starting creation of thumbnails for Qlik Sense Cloud');
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
                logger.error(`QSEOW PROCESS APP: ${err}`);
            }
        }

        return true;
    } catch (err) {
        logger.error(`CREATE THUMBNAILS 2: ${JSON.stringify(err, null, 2)}`);
        return false;
    }
};

module.exports = {
    qscloudCreateThumbnails,
};

