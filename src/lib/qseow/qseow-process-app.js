import enigma from 'enigma.js';
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import qrsInteract from 'qrs-interact';
import path from 'path';
import { homedir } from 'os';
import { computeExecutablePath } from '@puppeteer/browsers';
import { Jimp } from 'jimp';

import { setupEnigmaConnection } from './qseow-enigma.js';
import { logger, sleep } from '../../globals.js';
import { qseowUploadToContentLibrary } from './qseow-upload.js';
import { qseowUpdateSheetThumbnails } from './qseow-updatesheets.js';
import { setupQseowQrsConnection } from './qseow-qrs.js';
import { browserInstall } from '../browser/browser-install.js';
import { determineSheetExcludeStatus } from './determine-sheet-exclude-status.js';

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

const xpathHubUserPageButton2024Nov =
    'xpath/.//*[@id="q-hub-toolbar"]/div[2]/div[5]/div/div/div/button/span/span';
const xpathLogoutButton2024Nov =
    'xpath/.//*[@id="q-hub-menu-override"]/ng-transclude/ul/li[6]/span[2]';

/**
 * Processes a Qlik Sense Enterprise on Windows (QSEoW) application to generate
 * and manage thumbnails for app sheets. It handles browser setup, logging in,
 * navigating through app sheets, capturing screenshots, and managing session
 * interactions with the Qlik engine.
 *
 * @param {string} appId - The ID of the QSEoW application to process.
 * @param {Object} options - Configuration options for processing the application.
 * @param {string} options.senseVersion - The version of Qlik Sense being used.
 * @param {string} options.imagedir - Directory path for storing image thumbnails.
 * @param {string} options.host - Host address of the Qlik server.
 * @param {string} options.logonuserdir - User directory for login.
 * @param {string} options.logonuserid - User ID for login.
 * @param {string} options.logonpwd - Password for login.
 * @param {string} options.excludeSheetTag - Tags for sheets to exclude from processing.
 * @param {Array<string>} options.excludeSheetNumber - Sheet numbers to exclude.
 * @param {Array<string>} options.excludeSheetTitle - Sheet titles to exclude.
 * @param {Array<string>} options.excludeSheetStatus - Sheet statuses to exclude.
 * @param {string} options.includesheetpart - Part of the sheet to include in screenshots.
 * @param {number} options.pagewait - Time to wait between page interactions.
 * @param {boolean|string} options.secure - Whether to use secure connections.
 * @param {string} options.prefix - URL prefix for accessing Qlik services.
 * @param {boolean|string} options.headless - Whether to run the browser in headless mode.
 * @param {number} options.blurFactor - Factor by which to blur images.
 */
export const qseowProcessApp = async (appId, options) => {
    // Get page timeout from options
    let pageTimeout = 90000; // 90 seconds
    if (options.browserPageTimeout && options.browserPageTimeout > 0) {
        pageTimeout = options.browserPageTimeout * 1000; // Convert to milliseconds
    }

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
    } else if (options.senseVersion === '2024-May') {
        xpathHubUserPageButton = xpathHubUserPageButton2024Feb;
        xpathLogoutButton = xpathLogoutButton2024Feb;
    } else if (options.senseVersion === '2024-Nov') {
        xpathHubUserPageButton = xpathHubUserPageButton2024Nov;
        xpathLogoutButton = xpathLogoutButton2024Nov;
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

        // Get metadata for the app sheets that should be exclude, blur etc based on sheet tags
        logger.debug(
            `GET tagSheetAppMetadata: app/object/full?filter=objectType eq 'sheet' and app.id eq ${appId} and tags.name eq '${options.excludeSheetTag}'`
        );
        let tagSheetAppMetadata = await qrsInteractInstance.Get(
            `app/object/full?filter=objectType eq 'sheet' and app.id eq ${appId} and tags.name eq '${options.excludeSheetTag}'`
        );
        tagSheetAppMetadata = tagSheetAppMetadata.body;

        // Create mapping between repo db sheet id and engine sheet id
        let mapRepoEngineSheetIdTmp1 = await qrsInteractInstance.Get(
            `app/object/full?filter=objectType eq 'sheet' and app.id eq ${appId}`
        );
        mapRepoEngineSheetIdTmp1 = mapRepoEngineSheetIdTmp1.body;

        // mapRepoEngineSheetIdTmp1 is an array of sheet objects, each object has properties called 'id' and 'engineObjectId'
        // Create a new bidirectional map between repo db sheet id and engine sheet id
        const mapRepoEngineSheetId = new Map();
        mapRepoEngineSheetIdTmp1.forEach((element) => {
            mapRepoEngineSheetId.set(element.id, element.engineObjectId);
            mapRepoEngineSheetId.set(element.engineObjectId, element.id);
        });

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

            const browserArgs = [
                '--proxy-bypass-list=*',
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--disable-setuid-sandbox',
                '--no-first-run',
                '--no-sandbox',
                '--no-zygote',
                '--ignore-certificate-errors',
                '--ignore-certificate-errors-spki-list',
                '--enable-features=NetworkService',
            ];
            if (process.platform !== 'win32') {
                browserArgs.push('--single-process');
            } else {
                logger.debug('Skipping --single-process flag on Windows to keep Chromium stable');
            }

            // Make sure browser is launched ok
            let browser;
            try {
                browser = await puppeteer.launch({
                    executablePath,
                    headless,
                    ignoreHTTPSErrors: true,
                    acceptInsecureCerts: true,
                    args: browserArgs,
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
            await page.setDefaultTimeout(pageTimeout);

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
                page.goto(appUrl, { waitUntil: 'networkidle2', timeout: pageTimeout }),
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

            // Loop over all sheets in app, processing each one unless excluded
            // eslint-disable-next-line no-restricted-syntax
            for (const sheet of sheetListObj.qAppObjectList.qItems) {
                // Get repository db sheet id from mapRepoEngineSheetIdTmp1, using sheet.qInfo.qId as key
                const repoDbSheetId = mapRepoEngineSheetId.get(sheet.qInfo.qId);
                const engineSheetId = sheet.qInfo.qId;

                // Should this sheet be processed, or is it on exclude list?
                // Options are
                // --exclude-sheet-tag <value>
                // --exclude-sheet-number <number...>
                // --exclude-sheet-title <title...>
                // --exclude-sheet-status <status...>

                let { excludeSheet, sheetIsHidden } = await determineSheetExcludeStatus(
                    app,
                    sheet,
                    options,
                    tagSheetAppMetadata,
                    iSheetNum,
                    repoDbSheetId,
                    engineSheetId,
                    logger
                );

                if (excludeSheet === true) {
                    logger.info(
                        `Excluded sheet: ${iSheetNum}: '${sheet.qMeta.title}', sheet id '${repoDbSheetId}', engine sheet id '${engineSheetId}', description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}', hidden '${sheetIsHidden}'`
                    );
                } else {
                    logger.info(
                        `Processing sheet ${iSheetNum}: '${sheet.qMeta.title}', sheet id '${repoDbSheetId}', engine sheet id '${engineSheetId}', description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}', hidden '${sheetIsHidden}'`
                    );

                    // Build URL to current sheet
                    const sheetUrl = `${appUrl}/sheet/${sheet.qInfo.qId}`;
                    logger.debug(`Sheet URL: ${sheetUrl}`);

                    // Open sheet in browser, then take screen shot
                    await Promise.all([
                        page.goto(sheetUrl, { waitUntil: 'networkidle2', timeout: pageTimeout }),
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
                    createdFiles.push({ sheetPos: iSheetNum, blurred: false, fileNameShort });

                    // Blur image and store as separate file
                    const fileNameBlurred = `${imgDir}/qseow/${appId}/thumbnail-${appId}-${iSheetNum}-blurred.png`;
                    const fileNameShortBlurred = `thumbnail-${appId}-${iSheetNum}-blurred.png`;

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
                            logger.error(`QSEOW CREATE BLURRED IMAGE (message): ${err.message}`);
                        }
                        if (err.stack) {
                            logger.error(`QSEOW CREATE BLURRED IMAGE (stack): ${err.stack}`);
                        }
                    }
                }
                iSheetNum += 1;
            }

            logger.verbose(`QSEoW APP: Done creating thumbnails. Opening hub at ${hubUrl}`);

            try {
                // Log out
                await Promise.all([
                    page.goto(hubUrl, { waitUntil: 'networkidle2', timeout: pageTimeout }),
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

        // Upload to QSEoW content library
        await qseowUploadToContentLibrary(createdFiles, appId, options);

        // Update sheets in app
        await qseowUpdateSheetThumbnails(createdFiles, appId, options);

        logger.info(`Done processing app ${appId}`);
    } catch (err) {
        if (err.stack) {
            logger.error(`QSEOW: qseowProcessApp (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`QSEOW: qseowProcessApp (message): ${err.message}`);
        } else {
            logger.error(`QSEOW: qseowProcessApp: ${err}`);
        }
    }
};
