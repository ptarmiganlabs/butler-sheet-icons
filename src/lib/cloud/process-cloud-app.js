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
import { createAppImageDir } from '../util/image-dir.js';
import { activeLiveView } from '../util/run-live.js';
import { determineSheetExcludeStatus } from './determine-sheet-exclude-status.js';
import { determineSheetBlurStatus } from './determine-sheet-blur-status.js';
import { addAppToReport, recordPlannedSheet, recordAppOutcome } from '../util/run-report.js';
import { appProgressLine, sheetProgressLine } from '../util/run-report-render.js';
import { logError } from '../util/log-error.js';

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
 * @param {object} [report] - Run report from `createRunReport`; per-sheet
 *     decisions and outcome counts are recorded onto it as they happen. The
 *     progress lines and the run verdict render from these records.
 *
 * @returns {Promise<void>} Resolves when thumbnail generation, upload, and property updates for the app have completed (or thrown, which is logged by the caller).
 */
export const processCloudApp = async (appId, saasInstance, options, report = null) => {
    // Get page timeout from options
    let pageTimeout = 90000; // 90 seconds
    if (options.browserPageTimeout && options.browserPageTimeout > 0) {
        pageTimeout = options.browserPageTimeout * 1000; // Convert to milliseconds
    }

    let sheetRun;
    let appEntry = null;

    // Create image directory on disk for this app
    createAppImageDir({
        imagedir: options.imagedir,
        platform: 'cloud',
        appId,
        logPrefix: 'CREATE THUMBNAILS 1',
        ErrorClass: CloudError,
    });
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
                logError('CREATE THUMBNAILS 2: Error getting existing thumbnails', err);
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
                logger.verbose(`Opened app ${appId}`);
                logger.verbose(`App name: "${appMetadata.attributes.name}"`);
                logger.verbose(`App is published: ${appIsPublished}`);

                // Get list of app sheets
                const sheets = await getSheetList(app, SHEET_LIST_FIELDS_WITH_SHOW_CONDITION);

                // One line where four used to be: the name, count and publish
                // state under the `app i/n` line the app loop printed. The
                // individual facts moved to verbose above.
                logger.info(
                    appProgressLine({
                        name: appMetadata.attributes.name,
                        sheetCount: sheets.length,
                        published: appIsPublished,
                    })
                );

                if (report) {
                    appEntry = addAppToReport(report, {
                        id: appId,
                        name: appMetadata.attributes.name,
                        sheetCount: sheets.length,
                    });
                }

                if (sheets.length > 0) {
                    const browser = await launchBrowserForApp(options, {
                        appId,
                        logPrefix: 'CLOUD APP',
                        appLabel: 'Qlik Sense Cloud app',
                        ErrorClass: CloudError,
                    });

                    try {
                        // The live `signed in` row (issue #1075) is bound to
                        // the real login below - mirrors the QSEoW twin.
                        activeLiveView()?.beginStep('signed in');
                        activeLiveView()?.appPhase('signin');

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
                        //
                        // `skipLogin`, not `skiplogin`: Commander camel-cases a hyphenated long
                        // flag, so `--skip-login` lands on `options.skipLogin`. Reading the
                        // run-together spelling gave `undefined`, so this branch was unreachable
                        // and login was always attempted - see issue #890.
                        if (options.skipLogin === true) {
                            activeLiveView()?.stepDone('signed in', 'skipped (--skip-login)');
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

                            // Only now is the session real: the login click
                            // has navigated and the page has settled.
                            activeLiveView()?.stepDone('signed in', options.logonuserid ?? '');
                        }
                        activeLiveView()?.appPhase('sheets');
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
                                const { excludeSheet, excludeReason, sheetIsHidden } =
                                    await determineSheetExcludeStatus(
                                        app,
                                        sheet,
                                        options,
                                        appIsPublished,
                                        iSheetNum,
                                        logger
                                    );

                                // The blur decision is applied later, in
                                // updatesheets - computed here as well, from
                                // the same module and the same inputs, so the
                                // progress line and the report can say
                                // `blurred` where the update step will use the
                                // blurred file.
                                const { blurSheet, blurReason } = excludeSheet
                                    ? { blurSheet: false, blurReason: null }
                                    : determineSheetBlurStatus(sheet, options, iSheetNum, logger);

                                // The ~230-column line with the sheet id, description,
                                // approved/published/hidden fields lives at verbose now;
                                // the info line is the countable one-liner.
                                logger.verbose(
                                    `${excludeSheet === true ? 'Excluded' : 'Processing'} sheet ${iSheetNum}: '${sheet?.qMeta?.title}', ID ${sheet?.qInfo?.qId}, description '${sheet?.qMeta?.description}', approved '${sheet?.qMeta?.approved === true}', published '${sheet?.qMeta?.published === true}', hidden '${sheetIsHidden}'`
                                );

                                if (excludeSheet === true) {
                                    if (appEntry) {
                                        recordPlannedSheet(appEntry, {
                                            n: iSheetNum,
                                            title: sheet?.qMeta?.title,
                                            excludeSheet,
                                            excludeReason,
                                            blurSheet,
                                            blurReason,
                                        });
                                    }
                                    logger.info(
                                        sheetProgressLine({
                                            n: iSheetNum,
                                            total: sheets.length,
                                            label: 'excluded',
                                            title: sheet?.qMeta?.title,
                                            reason: excludeReason,
                                        })
                                    );

                                    return SHEET_SKIPPED;
                                }

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

                                // Recorded and logged only now, for the same
                                // reason: `captured` must be a fact, not an
                                // intention.
                                if (appEntry) {
                                    recordPlannedSheet(appEntry, {
                                        n: iSheetNum,
                                        title: sheet?.qMeta?.title,
                                        excludeSheet,
                                        excludeReason,
                                        blurSheet,
                                        blurReason,
                                    });
                                }
                                logger.info(
                                    sheetProgressLine({
                                        n: iSheetNum,
                                        total: sheets.length,
                                        label: blurSheet ? 'blurred' : 'captured',
                                        title: sheet?.qMeta?.title,
                                        reason: blurReason,
                                    })
                                );

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
        const sheetsUpdated = await qscloudUpdateSheetThumbnails(createdFiles, appId, options);

        recordAppOutcome(appEntry, {
            sheetsUpdated,
            imagesDir: `${imgDir}/cloud/${appId}`,
            imageFileNames: createdFiles.flatMap((file) =>
                [file.fileNameShort, file.fileNameShortBlurred].filter(Boolean)
            ),
        });

        // The run card's verdict now closes the run; this line stays for
        // anyone debugging at verbose.
        logger.verbose(`Done processing app ${appId}`);
    } catch (err) {
        logError('CLOUD APP', err);
        // Rethrow so the app loop can count this app as failed. Logging and returning
        // normally made a run in which every app failed look exactly like a clean run.
        throw err;
    }

    // Asserted last, and outside the try, so the sheets that did work are still uploaded
    // and applied. A sheet whose thumbnail could not be produced simply keeps the icon it
    // had; the app is still reported as failed.
    sheetRun?.assertAllProcessed();
};
