import fs from 'fs';
import { setupEnigmaConnection } from './cloud-enigma.js';
import { logger, sleep } from '../../globals.js';
import { qscloudUploadToApp } from './cloud-upload.js';
import { qscloudUpdateSheetThumbnails } from './cloud-updatesheets.js';
import { deleteCloudAppThumbnail } from './cloud-delete-thumbnails.js';
import { takeSheetScreenshot } from './sheet-screenshot.js';
import { CloudError } from '../util/errors.js';
import { launchBrowserForApp, closeBrowserQuietly } from '../browser/browser-launch.js';
import {
    runOverSheets,
    SHEET_SKIPPED,
    sortSheetsByRank,
    getSheetList,
    SHEET_LIST_FIELDS_WITH_SHOW_CONDITION,
} from '../util/sheet-list.js';
import { withEngineSession } from '../util/engine-session.js';
import { determineSheetExcludeStatus } from './determine-sheet-exclude-status.js';

// Selector paths to elements on login page
const selectorLoginPageUserName = '[id="\u0031-email"]';
const selectorLoginPageUserPwd = '[id="\u0031-password"]';
const selectorLoginPageLoginButton = '[id="\u0031-submit"]';

/**
 * Process a single Qlik Sense Cloud app.
 *
 * @param {string} appId - App ID of the app to process.
 * @param {import('./cloud-test-connection.js').QlikSaasInstance} saasInstance - QlikSaas object.
 * @param {object} options - Options object.
 *
 * @returns {Promise<void>} Resolves when thumbnail generation, upload, and property updates for the app have completed (or thrown, which is logged by the caller).
 */
export const processCloudApp = async (appId, saasInstance, options) => {
    // Get page timeout from options
    let pageTimeout = 90000; // 90 seconds
    if (options.browserPageTimeout && options.browserPageTimeout > 0) {
        pageTimeout = options.browserPageTimeout * 1000; // Convert to milliseconds
    }

    let sheetRun;

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
        throw new Error('Error creating cloud image directory', { cause: err });
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
                throw new Error('Error getting existing thumbnails', { cause: err });
            }

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
        const createdFiles = [];

        await withEngineSession(
            configEnigma,
            {
                logPrefix: 'CLOUD PROCESS APP',
                loglevel: options.loglevel,
                connectionLabel: `Qlik Sense Cloud tenant ${options.tenanturl}`,
                // These two logged the session line at info, and the default level is
                // info - demoting it would drop a line operators see on every run.
                sessionLogLevel: 'info',
            },
            async (global) => {
                const app = await global.openDoc(appId, '', '', '', false);
                logger.info(`Opened app ${appId}`);
                logger.info(`App name: "${appMetadata.attributes.name}"`);
                logger.info(`App is published: ${appMetadata.attributes.published}`);

                // Get list of app sheets
                const sheets = await getSheetList(app, SHEET_LIST_FIELDS_WITH_SHOW_CONDITION);

                if (sheets.length > 0) {
                    // sheets[] now contains array of app sheets.
                    logger.info(`Number of sheets in app: ${sheets.length}`);

                    const browser = await launchBrowserForApp(options, {
                        appId,
                        logPrefix: 'CLOUD APP:',
                        appLabel: 'Qlik Sense Cloud app',
                        ErrorClass: CloudError,
                    });

                    try {
                        const page = await browser.newPage();
                        // Thumbnails should be 410x270 pixels, so set the viewport to a multiple of this.
                        await page.setViewport({
                            width: 1230,
                            height: 810,
                            deviceScaleFactor: 1,
                        });
                        // Set default timeout for all page operations to 90 seconds
                        await page.setDefaultTimeout(pageTimeout);

                        // Qlik Sense cloud URL format:
                        // https://<tenant FQDN>/sense/app/<app ID>>
                        const appUrl = `https://${options.tenanturl}/sense/app/${appId}`;
                        logger.debug(`App URL: ${appUrl}`);
                        await Promise.all([
                            page.goto(appUrl, { waitUntil: 'networkidle2', timeout: pageTimeout }),
                        ]);
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
                                delay: 10,
                            });
                            const user = `${options.logonuserid}`;
                            await page.keyboard.type(user);
                            // Pwd
                            await page.click(selectorLoginPageUserPwd, {
                                button: 'left',
                                delay: 10,
                            });
                            await page.keyboard.type(options.logonpwd);
                            await page.screenshot({
                                path: `${imgDir}/cloud/${appId}/loginpage-2.png`,
                            });
                            // Click login button and wait for page to load
                            await Promise.all([
                                page.click(selectorLoginPageLoginButton, {
                                    button: 'left',
                                    delay: 10,
                                }),
                                page.waitForNavigation({
                                    waitUntil: 'networkidle2',
                                    timeout: pageTimeout,
                                }),
                            ]);
                            await sleep(options.pagewait * 1000);
                        }
                        // Take screenshot of app overview page
                        await page.screenshot({ path: `${imgDir}/cloud/${appId}/overview-1.png` });
                        // Sort sheets
                        sortSheetsByRank(sheets);

                        // Loop over all sheets in app
                        sheetRun = await runOverSheets(
                            sheets,
                            {
                                logPrefix: 'CLOUD APP',
                                appId,
                                action: 'create a thumbnail for',
                                ErrorClass: CloudError,
                            },
                            async (sheet, iSheetNum) => {
                                // Should this sheet be processed, or is it on exclude list?
                                // Options are
                                // --exclude-sheet-number <number...>
                                // --exclude-sheet-title <title...>
                                // --exclude-sheet-status <status...>
                                const { excludeSheet, sheetIsHidden } =
                                    await determineSheetExcludeStatus(
                                        app,
                                        sheet,
                                        options,
                                        appIsPublished,
                                        iSheetNum,
                                        logger
                                    );

                                if (excludeSheet === true) {
                                    logger.info(
                                        `Excluded sheet: ${iSheetNum}: '${sheet?.qMeta?.title}', ID ${sheet?.qInfo?.qId}, description '${sheet?.qMeta?.description}', approved '${sheet?.qMeta?.approved === true}', published '${sheet?.qMeta?.published === true}', hidden '${sheetIsHidden}'`
                                    );

                                    return SHEET_SKIPPED;
                                }

                                logger.info(
                                    `Processing sheet ${iSheetNum}: '${sheet?.qMeta?.title}', ID ${sheet?.qInfo?.qId}, description '${sheet?.qMeta?.description}', approved '${sheet?.qMeta?.approved === true}', published '${sheet?.qMeta?.published === true}', hidden '${sheetIsHidden}'`
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

                                // Only reached when the screenshot, and any blur of it, succeeded. A
                                // sheet whose thumbnail could not be produced is left out of
                                // createdFiles entirely, so nothing later repoints it at an image that
                                // does not exist - it keeps the icon it already had.
                                createdFiles.push(createdFile);

                                return undefined;
                            }
                        );
                    } finally {
                        await closeBrowserQuietly(browser, 'CLOUD APP');
                    }
                }
            }
        );
        logger.verbose(
            `Closed session after generating sheet thumbnail images for all sheets in QS Cloud app ${appId} on tenant ${options.tenanturl}`
        );

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
        // Rethrow so the app loop can count this app as failed. Logging and returning
        // normally made a run in which every app failed look exactly like a clean run.
        throw err;
    }

    // Asserted last, and outside the try, so the sheets that did work are still uploaded
    // and applied. A sheet whose thumbnail could not be produced simply keeps the icon it
    // had; the app is still reported as failed.
    sheetRun?.assertAllProcessed();
};
