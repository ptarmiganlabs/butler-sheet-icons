import { setupEnigmaConnection } from './qseow-enigma.js';
import { logger } from '../../globals.js';
import { qseowUploadToContentLibrary } from './qseow-upload.js';
import { qseowUpdateSheetThumbnails } from './qseow-updatesheets.js';
import { determineSheetExcludeStatus } from './determine-sheet-exclude-status.js';
import { determineSheetBlurStatus } from './determine-sheet-blur-status.js';
import { readQseowAppContext } from './qseow-tagged-sheets.js';
import { QseowError } from '../util/errors.js';
import { launchBrowserForApp, closeBrowserQuietly } from '../browser/browser-launch.js';
import {
    sortSheetsByRank,
    getSheetList,
    SHEET_LIST_FIELDS_WITH_SHOW_CONDITION,
} from '../util/sheet-list.js';
import { withEngineSession } from '../util/engine-session.js';
import { isInterrupted } from '../util/interrupt.js';
import { isAbortArtifact } from '../util/abort-artifact.js';
import { createAppImageDir } from '../util/image-dir.js';
import { activeLiveView } from '../util/run-live.js';
import { addAppToReport, recordPlannedSheet, recordAppOutcome } from '../util/run-report.js';
import { appProgressLine, sheetProgressLine } from '../util/run-report-render.js';
import { captureSheetImage, blurSheetImage } from './sheet-screenshot.js';
import { qseowLogoutQuietly } from './qseow-logout.js';
import { getQseowHubSelectors } from './qseow-selectors.js';
import { logError, describeWithCauses } from '../util/log-error.js';
import { openQseowAppOverviewPage, captureQseowOverviewAfter } from './qseow-app-session.js';
import { parseTrueFalseOption } from '../util/true-false-option.js';

/**
 * Processes a Qlik Sense Enterprise on Windows (QSEoW) application to generate
 * and manage thumbnails for app sheets. It handles browser setup, logging in,
 * navigating through app sheets, capturing screenshots, and managing session
 * interactions with the Qlik engine.
 *
 * @param {string} appId - The ID of the QSEoW application to process.
 * @param {object} options - Configuration options for processing the application.
 * @param {string} options.senseVersion - The version of Qlik Sense being used.
 * @param {string} options.imagedir - Directory path for storing image thumbnails.
 * @param {string} options.host - Host address of the Qlik server.
 * @param {string} options.logonuserdir - User directory for login.
 * @param {string} options.logonuserid - User ID for login.
 * @param {string} options.logonpwd - Password for login.
 * @param {string|string[]} options.excludeSheetTag - Tags for sheets to exclude from processing.
 * @param {string|string[]} options.blurSheetTag - Tags for sheets whose thumbnail should be blurred.
 * @param {Array<string>} options.excludeSheetNumber - Sheet numbers to exclude.
 * @param {Array<string>} options.excludeSheetTitle - Sheet titles to exclude.
 * @param {Array<string>} options.excludeSheetStatus - Sheet statuses to exclude.
 * @param {string} options.includesheetpart - Part of the sheet to include in screenshots.
 * @param {number} options.pagewait - Time to wait between page interactions.
 * @param {boolean|string} options.secure - Whether to use secure connections.
 * @param {string} options.prefix - URL prefix for accessing Qlik services.
 * @param {boolean|string} options.headless - Whether to run the browser in headless mode.
 * @param {number} options.blurFactor - Factor by which to blur images.
 * @param {object} [report] - Run report from `createRunReport`; per-sheet
 *     decisions and outcome counts are recorded onto it as they happen. The
 *     progress lines and the run verdict render from these records.
 *
 * @returns {Promise<void>} Resolves when thumbnail generation, upload, and sheet-property updates for the app are complete.
 */
export const qseowProcessApp = async (appId, options, report = null) => {
    // Get page timeout from options
    let pageTimeout = 90000; // 90 seconds
    if (options.browserPageTimeout && options.browserPageTimeout > 0) {
        pageTimeout = options.browserPageTimeout * 1000; // Convert to milliseconds
    }

    // The version-specific user-menu selector is only needed if the API logout fallback runs. The
    // logout item itself is selected by its stable `tid`, not by its position in the menu.
    const hubSelectors = getQseowHubSelectors(options.senseVersion);
    if (!hubSelectors) {
        logger.error(
            `CREATE QSEoW THUMBNAILS: Invalid Sense version specified as parameter when starting Butler Sheet Icons: "${options.senseVersion}"`
        );
        throw new QseowError(`Invalid QSEoW Sense version specified: ${options.senseVersion}`);
    }
    const { userMenuButton: xpathHubUserPageButton, legacyLogoutButton } = hubSelectors;

    // Create image directory for this app
    let blurFailures = 0;

    createAppImageDir({
        imagedir: options.imagedir,
        platform: 'qseow',
        appId,
        logPrefix: 'QSEOW CREATE THUMBNAILS 1',
        ErrorClass: QseowError,
    });

    try {
        // Every QRS read shared with the dry-run planner lives in
        // readQseowAppContext, so the two modes cannot drift apart.
        const { appMetadata, tagSheetAppMetadata, blurTagSheetAppMetadata, mapRepoEngineSheetId } =
            await readQseowAppContext(appId, options);

        // Configure Enigma.js
        const configEnigma = setupEnigmaConnection(appId, options);
        const imgDir = options.imagedir;
        const createdFiles = [];
        let appEntry = null;

        await withEngineSession(
            configEnigma,
            {
                logPrefix: 'QSEOW PROCESS APP',
                loglevel: options.loglevel,
                connectionLabel: `server ${options.host}`,
                // These two logged the session line at info, and the default level is
                // info - demoting it would drop a line operators see on every run.
                sessionLogLevel: 'info',
            },
            async (global) => {
                const app = await global.openDoc(appId, '', '', '', false);
                logger.verbose(`Opened app ${appId}`);
                logger.verbose(`App name: "${appMetadata[0].name}"`);
                logger.verbose(`App is published: ${appMetadata[0].published}`);

                // Get list of app sheets
                const sheets = await getSheetList(app, SHEET_LIST_FIELDS_WITH_SHOW_CONDITION);

                // One line where four used to be: the name, count and publish
                // state under the `app i/n` line the app loop printed. The
                // individual facts moved to verbose above.
                logger.info(
                    appProgressLine({
                        name: appMetadata[0].name,
                        sheetCount: sheets.length,
                        published: appMetadata[0].published,
                    })
                );

                if (report) {
                    appEntry = addAppToReport(report, {
                        id: appId,
                        name: appMetadata[0].name,
                        sheetCount: sheets.length,
                    });
                }

                if (sheets.length > 0) {
                    let iSheetNum = 1;

                    const browser = await launchBrowserForApp(options, {
                        appId,
                        logPrefix: 'QSEOW',
                        appLabel: 'QSEoW app',
                        ErrorClass: QseowError,
                    });

                    // Declared outside the try so the `finally` can reach them even when the
                    // sign-in itself is what failed.
                    let signedInPage;
                    let signedInHubUrl;

                    try {
                        // The live `signed in` row (issue #1075) is bound to
                        // the real login below: it begins here and resolves
                        // only once the post-login navigation has settled.
                        activeLiveView()?.beginStep('signed in');
                        activeLiveView()?.appPhase('signin');

                        // The same helper opens the after-capture session further down, so
                        // the two logins cannot drift apart. `loginpage` is this session's
                        // screenshot stem; the after-capture uses `loginpage-after` so it
                        // cannot overwrite the evidence from this one.
                        const { page, appUrl, hubUrl } = await openQseowAppOverviewPage(
                            browser,
                            options,
                            appId,
                            { imgDir, pageTimeout, loginPagePrefix: 'loginpage' }
                        );

                        // Held for the `finally` below, which has to log this session out
                        // however this block ends.
                        signedInPage = page;
                        signedInHubUrl = hubUrl;

                        // Only now is the session real: the login click has
                        // navigated and the page has settled.
                        activeLiveView()?.stepDone(
                            'signed in',
                            `${options.logonuserdir}\\${options.logonuserid}`
                        );
                        activeLiveView()?.appPhase('sheets');

                        // Take screenshot of app overview page
                        await page.screenshot({
                            path: `${imgDir}/qseow/${appId}/overview-before.png`,
                        });

                        // Sort sheets
                        sortSheetsByRank(sheets);

                        // Loop over all sheets in app, processing each one unless excluded
                        for (const sheet of sheets) {
                            // The sheet boundary an interrupted run stops at,
                            // mirroring the `runOverSheets` check the Cloud
                            // twin gets for free (issue #1107). A capture
                            // failure already throws straight out of this bare
                            // loop, but a blur failure is caught per sheet and
                            // continues - so without this, shutdown would work
                            // through every remaining sheet failing each one.
                            if (isInterrupted()) {
                                throw new QseowError(
                                    `App ${appId} was abandoned when the run was interrupted, at sheet ${iSheetNum} of ${sheets.length}`
                                );
                            }

                            // Get repository db sheet id from mapRepoEngineSheetId, using sheet.qInfo.qId as key
                            const repoDbSheetId = mapRepoEngineSheetId.get(sheet.qInfo.qId);
                            const engineSheetId = sheet.qInfo.qId;

                            // Should this sheet be processed, or is it on exclude list?
                            // Options are
                            // --exclude-sheet-tag <value>
                            // --exclude-sheet-number <number...>
                            // --exclude-sheet-title <title...>
                            // --exclude-sheet-status <status...>

                            const { excludeSheet, excludeReason, sheetIsHidden } =
                                await determineSheetExcludeStatus(
                                    app,
                                    sheet,
                                    options,
                                    tagSheetAppMetadata,
                                    iSheetNum,
                                    repoDbSheetId,
                                    engineSheetId,
                                    logger
                                );

                            // The blur decision is applied later, in
                            // updatesheets - computed here as well, from the
                            // same module and the same inputs, so the progress
                            // line and the report can say `blurred` where the
                            // update step will use the blurred file.
                            const { blurSheet, blurReason } = excludeSheet
                                ? { blurSheet: false, blurReason: null }
                                : determineSheetBlurStatus(
                                      sheet,
                                      options,
                                      blurTagSheetAppMetadata,
                                      iSheetNum,
                                      logger
                                  );

                            // The ~230-column line with the sheet ids, description,
                            // approved/published/hidden fields lives at verbose now;
                            // the info line is the countable one-liner.
                            logger.verbose(
                                `${excludeSheet === true ? 'Excluded' : 'Processing'} sheet ${iSheetNum}: '${sheet.qMeta.title}', sheet id '${repoDbSheetId}', engine sheet id '${engineSheetId}', description '${sheet.qMeta.description}', approved '${sheet.qMeta.approved}', published '${sheet.qMeta.published}', hidden '${sheetIsHidden}'`
                            );

                            if (excludeSheet === true) {
                                // Recorded and logged immediately - the exclusion
                                // is already a fact.
                                if (appEntry) {
                                    recordPlannedSheet(appEntry, {
                                        n: iSheetNum,
                                        title: sheet.qMeta.title,
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
                                        title: sheet.qMeta.title,
                                        reason: excludeReason,
                                    })
                                );
                            } else {
                                const { fileName, fileNameShort } = await captureSheetImage(
                                    page,
                                    appUrl,
                                    imgDir,
                                    appId,
                                    sheet,
                                    iSheetNum,
                                    options,
                                    logger,
                                    pageTimeout
                                );

                                createdFiles.push({
                                    sheetPos: iSheetNum,
                                    blurred: false,
                                    fileNameShort,
                                });

                                try {
                                    const { fileNameShortBlurred } = await blurSheetImage(
                                        fileName,
                                        imgDir,
                                        appId,
                                        iSheetNum,
                                        options,
                                        logger
                                    );

                                    createdFiles.push({
                                        sheetPos: iSheetNum,
                                        blurred: true,
                                        fileNameShort: fileNameShortBlurred,
                                    });

                                    // Recorded and logged only now: both files
                                    // exist, so `captured` (or `blurred`) is a
                                    // fact rather than an intention. A sheet
                                    // whose capture or blur failed leaves no
                                    // row - the error lines tell that story.
                                    if (appEntry) {
                                        recordPlannedSheet(appEntry, {
                                            n: iSheetNum,
                                            title: sheet.qMeta.title,
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
                                            title: sheet.qMeta.title,
                                            reason: blurReason,
                                        })
                                    );
                                } catch (err) {
                                    logError(
                                        'QSEOW CREATE BLURRED IMAGE: Failed to create blurred image',
                                        err
                                    );

                                    // Drop this sheet entirely rather than leave the unblurred entry
                                    // behind. The blur decision is made later, in updatesheets, from
                                    // the CLI options alone - so leaving the entry meant the sheet was
                                    // repointed at a `-blurred.png` that was never created, giving a
                                    // broken icon. Dropping it means updatesheets skips the sheet and
                                    // it keeps the icon it already had.
                                    //
                                    // --blur-sheet-* is a redaction control, so falling back to the
                                    // plain screenshot is not an option either: it would publish the
                                    // unredacted image the operator asked to hide.
                                    for (let i = createdFiles.length - 1; i >= 0; i -= 1) {
                                        if (createdFiles[i].sheetPos === iSheetNum) {
                                            createdFiles.splice(i, 1);
                                        }
                                    }

                                    blurFailures += 1;
                                    logger.error(
                                        `QSEOW APP: Sheet ${iSheetNum} in app ${appId} was left unchanged because its blurred thumbnail could not be created`
                                    );
                                }
                            }
                            iSheetNum += 1;
                        }

                        logger.verbose(`QSEoW APP: Done creating thumbnails`);
                    } finally {
                        // In the `finally`, not at the end of the try: a failure anywhere in
                        // the sheet loop used to skip the logout entirely and strand the Qlik
                        // Sense session until it timed out. Closing the browser does not
                        // release it. Since a stranded session counts against the user's
                        // parallel-session limit, one failed run made the next likelier to
                        // fail, and a run of failures could take the server to the point where
                        // it refuses to open apps at all.
                        //
                        // The API path avoids a version- and privilege-dependent hub menu. The
                        // fallback remains available for virtual proxies or authentication
                        // modes that do not accept the browser-side QPS DELETE.
                        await qseowLogoutQuietly(
                            signedInPage,
                            {
                                prefix: options.prefix,
                                hubUrl: signedInHubUrl,
                                pageTimeout,
                                pagewait: options.pagewait,
                                senseVersion: options.senseVersion,
                            },
                            xpathHubUserPageButton,
                            legacyLogoutButton
                        );

                        await closeBrowserQuietly(browser, 'QSEOW');
                    }
                }
            }
        );
        logger.verbose(
            `Closed session after generating sheet thumbnail images for all sheets in QSEoW app ${appId} on host ${options.host}`
        );

        // Upload to QSEoW content library
        await qseowUploadToContentLibrary(createdFiles, appId, options);

        // Update sheets in app.
        // The blur-tag metadata is passed, never the exclude-tag metadata: they are queried on
        // different options, and handing the exclude set to the blur rule would blur sheets
        // carrying the *exclude* tag. See issue #840.
        let sheetsUpdated;
        // Wrapped so the interrupt path still records what landed (issue
        // #1107). The update writes and saves each sheet as it goes, so a
        // signal part-way through leaves real thumbnails in Sense; the throw
        // that follows would otherwise skip `recordAppOutcome` below and the
        // verdict would report zero for work that was done.
        try {
            sheetsUpdated = await qseowUpdateSheetThumbnails(
                createdFiles,
                appId,
                options,
                blurTagSheetAppMetadata
            );
        } catch (err) {
            recordAppOutcome(appEntry, {
                sheetsUpdated: err?.sheetsUpdated ?? 0,
                imagesDir: `${imgDir}/qseow/${appId}`,
                imageFileNames: createdFiles.map((file) => file.fileNameShort),
            });
            throw err;
        }

        // The sheets now point at their new thumbnails, which is the first moment an
        // overview screenshot can show the result rather than the starting state. The
        // main session logged out and closed long before this point - uploading and
        // assigning both happen after the browser is gone - so showing the result costs
        // a second sign-in. Opt out with --capture-overview-after false when running
        // over many apps, where that login is paid once per app.
        //
        // Never allowed to fail the run: the thumbnails are already created, uploaded and
        // assigned by now. Losing the evidence screenshot is worth a warning, not the
        // failure of work that has already succeeded.
        if (parseTrueFalseOption(options.captureOverviewAfter) && createdFiles.length > 0) {
            try {
                logger.info(
                    `QSEOW APP: Signing in again to capture the app overview after thumbnails were applied`
                );
                const afterImagePath = await captureQseowOverviewAfter(options, appId, {
                    imgDir,
                    pageTimeout,
                    userMenuButton: xpathHubUserPageButton,
                    legacyLogoutButton,
                });
                logger.verbose(`QSEOW APP: Wrote after-overview screenshot ${afterImagePath}`);
            } catch (err) {
                logger.warn(
                    `QSEOW APP: Could not capture the app overview after the update. The thumbnails themselves were applied successfully. ${describeWithCauses(err)}`
                );
            }
        }

        recordAppOutcome(appEntry, {
            sheetsUpdated,
            imagesDir: `${imgDir}/qseow/${appId}`,
            imageFileNames: createdFiles.map((file) => file.fileNameShort),
        });

        // The run card's verdict now closes the run; this line stays for
        // anyone debugging at verbose.
        logger.verbose(`Done processing app ${appId}`);
    } catch (err) {
        // An interrupted app is not a failed one, and this line is the
        // only thing on the shutdown path that says otherwise: the abort
        // that unwound the run arrives here as an ordinary error, and
        // `logError` prints it at error level with its cause chain. The app
        // loop already reports the abandonment at info, so this would be a
        // second, louder account of a Ctrl-C the operator asked for
        // (issue #1107).
        //
        // Narrowed to errors the teardown itself produced. Keyed on the flag
        // alone, a genuine failure that happened to be unwinding when the
        // signal landed lost its error line AND its cause chain - the run
        // could end with a real defect and no record of it anywhere.
        if (!isInterrupted() || !isAbortArtifact(err)) {
            logError('QSEOW: qseowProcessApp', err);
        }
        // Rethrow so the app loop can count this app as failed. Logging and returning
        // normally made a run in which every app failed look exactly like a clean run.
        throw err;
    }

    // Asserted last, and outside the try, so the sheets that did work are still uploaded
    // and applied.
    if (blurFailures > 0) {
        throw new QseowError(
            `Failed to create a blurred thumbnail for ${blurFailures} sheet(s) in app ${appId}`
        );
    }
};
