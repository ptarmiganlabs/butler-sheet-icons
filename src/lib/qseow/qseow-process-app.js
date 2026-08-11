import qrsInteract from 'qrs-interact';
import { Jimp } from 'jimp';

import { setupEnigmaConnection } from './qseow-enigma.js';
import { logger, sleep } from '../../globals.js';
import { qseowUploadToContentLibrary } from './qseow-upload.js';
import { qseowUpdateSheetThumbnails } from './qseow-updatesheets.js';
import { setupQseowQrsConnection } from './qseow-qrs.js';
import { determineSheetExcludeStatus } from './determine-sheet-exclude-status.js';
import { QseowError } from '../util/errors.js';
import { launchBrowserForApp, closeBrowserQuietly } from '../browser/browser-launch.js';
import {
    sortSheetsByRank,
    getSheetList,
    SHEET_LIST_FIELDS_WITH_SHOW_CONDITION,
} from '../util/sheet-list.js';
import { withEngineSession } from '../util/engine-session.js';
import { createAppImageDir } from '../util/image-dir.js';
import { qrsFilterAnyOf, qrsPathWithFilter, toFilterValueList } from './qrs-filter.js';
import { qrsGetList } from './qrs-response.js';
import { QSEOW_SHEET_PART_SELECTORS } from './sheet-parts.js';
import { qseowLogout } from './qseow-logout.js';
import { getQseowHubSelectors } from './qseow-selectors.js';

/**
 * Looks up the sheets in an app that carry any of the supplied tags.
 *
 * Both `--exclude-sheet-tag` and `--blur-sheet-tag` need exactly this, against the same endpoint,
 * differing only in which option supplies the tags. They are kept as two separate queries rather
 * than one combined lookup because the two rules have to stay distinguishable: a sheet carrying
 * the exclude tag must not become a blurred sheet, and vice versa.
 *
 * Only worth asking when tags were actually supplied. Querying with none used to ask for a tag
 * literally named `undefined`, which costs a round trip per app and, on a site that happens to
 * have a tag by that name, would act on sheets nobody nominated.
 *
 * @param {object} qrsInteractInstance - Configured `qrs-interact` instance.
 * @param {string} appSheetsFilter - Filter term restricting results to sheets in one app.
 * @param {string|string[]|undefined} tagOption - Raw CLI option value naming the tags.
 * @param {string} optionName - The option's CLI spelling, used only in log messages.
 *
 * @returns {Promise<Array<object>>} Sheet metadata objects exposing `engineObjectId`, empty when
 *     no tags were supplied.
 *
 * @throws {QseowError} When QRS answers with something that is not a list.
 */
const getSheetsTaggedWith = async (qrsInteractInstance, appSheetsFilter, tagOption, optionName) => {
    // Variadic options arrive as arrays, so the tag term has to be an `or` group over every tag
    // given: interpolating the array produced `tags.name eq 'A,B'`, one literal matching no tag.
    const tags = toFilterValueList(tagOption);

    if (tags.length === 0) {
        logger.debug(`No ${optionName} supplied, skipping the QRS lookup for tagged sheets`);
        return [];
    }

    const tagFilter = `${appSheetsFilter} and ${qrsFilterAnyOf('tags.name', tags)}`;
    logger.debug(`GET sheets tagged for ${optionName}: app/object/full?filter=${tagFilter}`);

    // Through qrsGetList: the count logged below is taken with `.length`, and a reply that is not
    // a list answers that with a plausible number rather than failing - a quoted JSON string would
    // report its character count as though that many sheets carried the tag.
    const taggedSheets = await qrsGetList(
        qrsInteractInstance,
        qrsPathWithFilter('app/object/full', tagFilter)
    );

    // Report the count at the default log level whenever the option was used. A misspelled tag
    // otherwise produces a run byte-identical to one where the option was never passed - the
    // silent-no-op that made issue #840 hard to notice - and for the blur rule that means
    // publishing readable thumbnails the operator believed were hidden.
    //
    // Deliberately info rather than warn: a run spanning many apps will legitimately find no
    // tagged sheets in most of them, and a per-app warning for a normal outcome is the kind of
    // noise that teaches operators to ignore warnings. A mistyped tag shows up as a trail of
    // zeroes across every app instead.
    logger.info(
        `Sheets carrying a tag named by ${optionName}: ${taggedSheets.length} (tags: ${tags.join(', ')})`
    );

    return taggedSheets;
};

const selectorLoginPageUserName = '#username-input';
const selectorLoginPageUserPwd = '#password-input';
const selectorLoginPageLoginButton = '#loginbtn';

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
 *
 * @returns {Promise<void>} Resolves when thumbnail generation, upload, and sheet-property updates for the app are complete.
 */
export const qseowProcessApp = async (appId, options) => {
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
        // Get metadata about the app
        const qseowConfigQrs = setupQseowQrsConnection(options);

        const qrsInteractInstance = new qrsInteract(qseowConfigQrs);
        logger.debug(`QSEoW QRS config: ${JSON.stringify(qseowConfigQrs, null, 2)}`);

        // Get app top level metadata
        const appMetadataPath = qrsPathWithFilter('app', `id eq ${appId}`);
        logger.debug(`GET app top level metadata: ${appMetadataPath}`);
        const appMetadata = await qrsGetList(qrsInteractInstance, appMetadataPath);

        // An empty list is a real answer - the filter matched no app - but the two reads of
        // appMetadata[0] further down sit inside the engine session, so leaving it unchecked
        // spends a session and an openDoc before failing with `Cannot read properties of
        // undefined`. In practice the engine refuses first, since the QRS lookup and the session
        // use the same service identity; this is here so the invariant holds for the next reader.
        if (appMetadata.length === 0) {
            throw new QseowError(
                `QSEoW app ${appId} was not found in the Qlik Sense repository. Check --appid, and that the account named by --apiuserdir/--apiuserid may read the app.`
            );
        }

        const appSheetsFilter = `objectType eq 'sheet' and app.id eq ${appId}`;

        // Get metadata for the app sheets that should be excluded based on sheet tags, and
        // separately for those that should be blurred. Two lookups, deliberately: the exclude tag
        // and the blur tag name different sets of sheets, and conflating them would blur every
        // sheet the operator asked to leave alone.
        const tagSheetAppMetadata = await getSheetsTaggedWith(
            qrsInteractInstance,
            appSheetsFilter,
            options.excludeSheetTag,
            '--exclude-sheet-tag'
        );

        const blurTagSheetAppMetadata = await getSheetsTaggedWith(
            qrsInteractInstance,
            appSheetsFilter,
            options.blurSheetTag,
            '--blur-sheet-tag'
        );

        // Create mapping between repo db sheet id and engine sheet id
        const repoSheets = await qrsGetList(
            qrsInteractInstance,
            qrsPathWithFilter('app/object/full', appSheetsFilter)
        );

        // repoSheets is an array of sheet objects, each object has properties called 'id' and 'engineObjectId'
        // Create a new bidirectional map between repo db sheet id and engine sheet id
        const mapRepoEngineSheetId = new Map();
        repoSheets.forEach((element) => {
            mapRepoEngineSheetId.set(element.id, element.engineObjectId);
            mapRepoEngineSheetId.set(element.engineObjectId, element.id);
        });

        // Configure Enigma.js
        const configEnigma = setupEnigmaConnection(appId, options);
        const imgDir = options.imagedir;
        const createdFiles = [];

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
                logger.info(`Opened app ${appId}`);
                logger.info(`App name: "${appMetadata[0].name}"`);
                logger.info(`App is published: ${appMetadata[0].published}`);

                // Get list of app sheets
                const sheets = await getSheetList(app, SHEET_LIST_FIELDS_WITH_SHOW_CONDITION);

                if (sheets.length > 0) {
                    // sheets[] now contains array of app sheets.
                    logger.info(`Number of sheets in app: ${sheets.length}`);

                    let iSheetNum = 1;

                    const browser = await launchBrowserForApp(options, {
                        appId,
                        logPrefix: 'QSEOW',
                        appLabel: 'QSEoW app',
                        ErrorClass: QseowError,
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
                        // https://stackoverflow.com/questions/52163547/node-js-puppeteer-how-to-set-navigation-timeout
                        await page.setDefaultTimeout(pageTimeout);

                        // Assigned unconditionally just below; the empty initialiser was dead. It only passed
                        // lint before because no-useless-assignment skips code inside a try block, and the
                        // enclosing try is now the session callback.
                        let appUrl;
                        let hubUrl;

                        const scheme =
                            options.secure === 'true' || options.secure === true
                                ? 'https://'
                                : 'http://';

                        // --port is the web port, distinct from --engineport (4747) and --qrsport
                        // (4242). It was declared and parsed but never reached the URL, so a
                        // server on a non-standard web port could not be reached at all. Built
                        // once here rather than in each branch below, so the app and hub URLs
                        // cannot disagree about which host they are talking to.
                        const origin = options.port
                            ? `${scheme}${options.host}:${options.port}`
                            : `${scheme}${options.host}`;

                        if (options.prefix && options.prefix.length > 0) {
                            appUrl = `${origin}/${options.prefix}/sense/app/${appId}`;
                            hubUrl = `${origin}/${options.prefix}/hub`;
                        } else {
                            appUrl = `${origin}/sense/app/${appId}`;
                            hubUrl = `${origin}/hub`;
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
                            delay: 10,
                        });

                        const user = `${options.logonuserdir}\\${options.logonuserid}`;
                        await page.keyboard.type(user);

                        // Pwd
                        await page.click(selectorLoginPageUserPwd, {
                            button: 'left',
                            delay: 10,
                        });
                        await page.keyboard.type(options.logonpwd);

                        await page.screenshot({ path: `${imgDir}/qseow/${appId}/loginpage-2.png` });

                        // Click login button and wait for page to load
                        await Promise.all([
                            page.click(selectorLoginPageLoginButton, {
                                button: 'left',
                                delay: 10,
                            }),
                            page.waitForNavigation({ waitUntil: 'networkidle2' }),
                        ]);

                        await sleep(options.pagewait * 1000);

                        // Take screenshot of app overview page
                        await page.screenshot({ path: `${imgDir}/qseow/${appId}/overview-1.png` });

                        // Sort sheets
                        sortSheetsByRank(sheets);

                        // Loop over all sheets in app, processing each one unless excluded
                        for (const sheet of sheets) {
                            // Get repository db sheet id from mapRepoEngineSheetId, using sheet.qInfo.qId as key
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
                                    page.goto(sheetUrl, {
                                        waitUntil: 'networkidle2',
                                        timeout: pageTimeout,
                                    }),
                                ]);

                                await sleep(options.pagewait * 1000);

                                const fileName = `${imgDir}/qseow/${appId}/thumbnail-${appId}-${iSheetNum}.png`;
                                const fileNameShort = `thumbnail-${appId}-${iSheetNum}.png`;

                                // Which part of the sheet to capture. The map is the single source
                                // of truth for the values --includesheetpart accepts - see
                                // sheet-parts.js.
                                const selector =
                                    QSEOW_SHEET_PART_SELECTORS[options.includesheetpart];

                                // Ensure that the element we're interested in is loaded
                                await page.waitForSelector(selector);
                                const sheetMainPart = await page.$(selector);
                                await sheetMainPart.screenshot({
                                    path: fileName,
                                });
                                createdFiles.push({
                                    sheetPos: iSheetNum,
                                    blurred: false,
                                    fileNameShort,
                                });

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
                                        logger.error(
                                            `QSEOW CREATE BLURRED IMAGE (message): ${err.message}`
                                        );
                                    }
                                    if (err.stack) {
                                        logger.error(
                                            `QSEOW CREATE BLURRED IMAGE (stack): ${err.stack}`
                                        );
                                    }

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

                        // The API path avoids a version- and privilege-dependent hub menu. The
                        // fallback remains available for virtual proxies or authentication modes
                        // that do not accept the browser-side QPS DELETE.
                        await qseowLogout(
                            page,
                            {
                                prefix: options.prefix,
                                hubUrl,
                                pageTimeout,
                                pagewait: options.pagewait,
                                senseVersion: options.senseVersion,
                            },
                            xpathHubUserPageButton,
                            legacyLogoutButton
                        );
                    } finally {
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
        await qseowUpdateSheetThumbnails(createdFiles, appId, options, blurTagSheetAppMetadata);

        logger.info(`Done processing app ${appId}`);
    } catch (err) {
        if (err.stack) {
            logger.error(`QSEOW: qseowProcessApp (stack): ${err.stack}`);
        } else if (err.message) {
            logger.error(`QSEOW: qseowProcessApp (message): ${err.message}`);
        } else {
            logger.error(`QSEOW: qseowProcessApp: ${err}`);
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
