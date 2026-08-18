import { test, expect } from '@jest/globals';
import 'dotenv/config';

import { qscloudRemoveSheetIcons } from '../cloud-remove-sheet-icons.js';
import { qscloudCreateThumbnails } from '../cloud-create-thumbnails.js';
import { setupEnigmaConnection } from '../cloud-enigma.js';
import QlikSaas from '../cloud-repo.js';
import { resolveCloudAppSelection } from '../cloud-app-selection.js';
import {
    readSheetIconState,
    sheetIdsWithIcon,
    sheetTitlesWithIcon,
} from '../../test-helpers/sheet-icon-state.js';
import { assertEnv, getTestTimeout } from '../../util/env-check.js';
import { collectAppIds } from '../../commands/helpers.js';

/**
 * `qscloud remove-sheet-icons` against a live Qlik Sense Cloud tenant.
 *
 * The QSEoW twin of this suite is the place to read first - the shape, and why a round trip
 * rather than removal in isolation, is argued there. Issue #911 asked for both.
 *
 * What differs on this platform is what removal actually does. QSEoW clears the sheets' icon
 * property and leaves the uploaded images in the content library; Cloud clears the property
 * **and deletes the thumbnail files from the app's media library**, in that order, so a failed
 * save cannot leave every sheet pointing at images that no longer exist. That second half has no
 * QSEoW equivalent and is asserted here on its own.
 *
 * The write-proof is also different. QSEoW can ask QRS for a per-sheet `modifiedDate`, which is a
 * service independent of the engine that made the change. Cloud has no QRS, and the per-sheet
 * `qMeta.modifiedDate` the engine reports is not usable in its place: measured against this
 * tenant it does not move when a sheet's thumbnail is written, so an assertion built on it would
 * pass for a working removal and for one that did nothing. The app-level `modifiedDate` does
 * move, and it is the app that `doSave()` writes, so that is what the no-op assertion rests on -
 * with the first removal as the control case that proves the field moves at all.
 */

const defaultTestTimeout = getTestTimeout(process.env);

// One options bag for both commands, as the create suite builds it. `remove-sheet-icons` ignores
// the browser, logon and rendering keys - it never opens the web UI - and reading the same values
// the create suite reads is what keeps the two halves of the round trip pointed at the same
// tenant and the same apps.
const options = {
    loglevel: process.env.BSI_LOG_LEVEL || 'verbose',
    tenanturl: process.env.BSI_CLOUD_TENANT_URL,
    apikey: process.env.BSI_CLOUD_API_KEY,
    logonuserid: process.env.BSI_CLOUD_LOGON_USERID,
    logonpwd: process.env.BSI_CLOUD_LOGON_PWD,
    collectionid: process.env.BSI_CLOUD_COLLECTION_ID,
    headless: process.env.BSI_HEADLESS || 'true',
    pagewait: process.env.BSI_PAGE_WAIT || '10',
    imagedir: process.env.BSI_IMAGE_DIR || 'img',
    schemaversion: process.env.BSI_CLOUD_SCHEMA_VERSION || '12.612.0',
    // Split with the CLI's own parser, and `?? ''` because this suite is driven either by an app
    // id or by a collection id: with the variable unset, a bare `[process.env.BSI_CLOUD_APP_ID]`
    // is `[undefined]`, which would be pushed as if it were an app to process.
    appid: collectAppIds(process.env.BSI_CLOUD_APP_ID ?? ''),
    includesheetpart: process.env.BSI_INCLUDE_SHEET_PART || '1',
    browser: process.env.BSI_BROWSER || 'chrome',
    // These options bypass Commander, so the CLI default is not applied for them - the fallback
    // here is the default. See the create suite: 'latest' is how that suite came to run against a
    // Chrome build it could not drive while reporting no configuration difference (issue #878).
    browserVersion: process.env.BSI_BROWSER_VERSION || 'recommended',
    blurSheetStatus: process.env.BSI_BLUR_SHEET_STATUS || [],
    blurSheetTag: process.env.BSI_BLUR_SHEET_TAG || '',
    blurSheetNumber: process.env.BSI_BLUR_SHEET_NUMBER || '5',
    blurFactor: process.env.BSI_BLUR_FACTOR || '10',
};

/**
 * Reads what icon every sheet of every app in the run currently carries.
 *
 * A fresh engine session per app, built from the same `setupEnigmaConnection` the command uses,
 * so the read cannot reach a different tenant than the write did.
 *
 * @param {string[]} appIds - The apps to read.
 *
 * @returns {Promise<object>} App id to sheet state, as `readSheetIconState` returns it.
 */
const readIconState = async (appIds) => {
    const state = {};

    for (const appId of appIds) {
        state[appId] = await readSheetIconState(setupEnigmaConnection(appId, options), appId, {
            logPrefix: 'CLOUD REMOVE ICONS ROUND TRIP',
            loglevel: options.loglevel,
            connectionLabel: `Qlik Sense Cloud tenant ${options.tenanturl}`,
        });
    }

    return state;
};

/**
 * How many image files each app currently has in its `thumbnails` media folder.
 *
 * An app that has never had thumbnails has no such folder at all, which is not an error and must
 * read as zero - the same distinction the command itself makes before it starts deleting.
 *
 * @param {object} saasInstance - QlikSaas object.
 * @param {string[]} appIds - The apps to count.
 *
 * @returns {Promise<object>} App id to image-file count.
 */
const readThumbnailMediaCounts = async (saasInstance, appIds) => {
    const counts = {};

    for (const appId of appIds) {
        const mediaList = await saasInstance.Get(`apps/${appId}/media/list`);
        const hasThumbnailFolder = mediaList.some(
            (item) => item.type === 'directory' && item.name === 'thumbnails'
        );

        if (!hasThumbnailFolder) {
            counts[appId] = 0;
            continue;
        }

        const thumbnails = await saasInstance.Get(`apps/${appId}/media/list/thumbnails`);
        counts[appId] = thumbnails.filter((item) => item.type === 'image').length;
    }

    return counts;
};

/**
 * Each app's `modifiedDate`, as the tenant reports it.
 *
 * @param {object} saasInstance - QlikSaas object.
 * @param {string[]} appIds - The apps to read.
 *
 * @returns {Promise<object>} App id to `modifiedDate`.
 */
const readAppModifiedDates = async (saasInstance, appIds) => {
    const dates = {};

    for (const appId of appIds) {
        const metadata = await saasInstance.Get(`apps/${appId}`);
        dates[appId] = metadata?.attributes?.modifiedDate;
    }

    return dates;
};

test(
    'qs cloud remove sheet icons, round trip against a live tenant (should succeed)',
    async () => {
        assertEnv(process.env, {
            mandatory: [
                'BSI_CLOUD_TENANT_URL',
                'BSI_CLOUD_API_KEY',
                'BSI_CLOUD_LOGON_USERID',
                'BSI_CLOUD_LOGON_PWD',
            ],
            xor: [['BSI_CLOUD_APP_ID', 'BSI_CLOUD_COLLECTION_ID']],
            secret: ['BSI_CLOUD_API_KEY', 'BSI_CLOUD_LOGON_PWD'],
            informational: [
                'BSI_LOG_LEVEL',
                'BSI_HEADLESS',
                'BSI_PAGE_WAIT',
                'BSI_IMAGE_DIR',
                'BSI_CLOUD_SCHEMA_VERSION',
                'BSI_INCLUDE_SHEET_PART',
                'BSI_BROWSER',
                'BSI_BROWSER_VERSION',
                'BSI_BLUR_SHEET_STATUS',
                'BSI_BLUR_SHEET_TAG',
                'BSI_BLUR_SHEET_NUMBER',
                'BSI_BLUR_FACTOR',
            ],
        });

        const saasInstance = new QlikSaas({ url: options.tenanturl, token: options.apikey });

        // Resolved through the command's own selection helper, so the read-back covers exactly
        // the apps the run will process - including whatever the collection currently holds.
        // Deduped: --appid and --collectionid are additive, and an app named both ways appears
        // twice here while `runOverApps` processes it once.
        const selection = await resolveCloudAppSelection(saasInstance, options);
        const appIds = [...new Set(selection.appIds)];
        expect(appIds.length).toBeGreaterThan(0);

        // ---------------------------------------------------------------------------------
        // Arrange: the apps must start with icons, or "every icon is gone" would pass without
        // the removal having done anything. See the QSEoW twin for why this is a branch rather
        // than an unconditional create.
        // ---------------------------------------------------------------------------------
        let iconsBefore = await readIconState(appIds);
        const anyIcon = (state) =>
            Object.values(state).some((sheets) => sheetIdsWithIcon(sheets).length > 0);

        if (!anyIcon(iconsBefore)) {
            console.log(
                'No sheet in the selected app(s) carries an icon. Creating thumbnails first, so the removal has something to remove.'
            );
            expect(await qscloudCreateThumbnails(options)).toBe(true);
            iconsBefore = await readIconState(appIds);
        }

        expect(anyIcon(iconsBefore)).toBe(true);

        const mediaBefore = await readThumbnailMediaCounts(saasInstance, appIds);
        const datesBefore = await readAppModifiedDates(saasInstance, appIds);

        // Every app that has icons must also have the media files behind them, or the media half
        // of the assertion below would be testing nothing.
        for (const appId of appIds) {
            if (sheetIdsWithIcon(iconsBefore[appId]).length > 0) {
                expect(mediaBefore[appId]).toBeGreaterThan(0);
            }
        }

        // ---------------------------------------------------------------------------------
        // Dry run first. It is the only safety net this command has - there is no undo - and on
        // this platform it also reads the media library it would delete from, so it has two
        // chances to write by accident. Costs seconds: no browser, no upload.
        // ---------------------------------------------------------------------------------
        expect(await qscloudRemoveSheetIcons({ ...options, dryRun: true })).toBe(true);

        expect(await readAppModifiedDates(saasInstance, appIds)).toEqual(datesBefore);
        expect(await readThumbnailMediaCounts(saasInstance, appIds)).toEqual(mediaBefore);

        const iconsAfterDryRun = await readIconState(appIds);
        for (const appId of appIds) {
            expect(sheetIdsWithIcon(iconsAfterDryRun[appId])).toEqual(
                sheetIdsWithIcon(iconsBefore[appId])
            );
        }

        // ---------------------------------------------------------------------------------
        // Act 1: remove the icons.
        // ---------------------------------------------------------------------------------
        expect(await qscloudRemoveSheetIcons(options)).toBe(true);

        const iconsAfterRemoval = await readIconState(appIds);
        const mediaAfterRemoval = await readThumbnailMediaCounts(saasInstance, appIds);
        const datesAfterRemoval = await readAppModifiedDates(saasInstance, appIds);

        for (const appId of appIds) {
            // No sheet carries an icon any more. Compared by title so a failure names the sheets
            // that still have one rather than printing URLs.
            expect(sheetTitlesWithIcon(iconsAfterRemoval[appId])).toEqual([]);

            // Removal clears a property; it must not have removed or added sheets.
            expect(iconsAfterRemoval[appId].map((sheet) => sheet.id).sort()).toEqual(
                iconsBefore[appId].map((sheet) => sheet.id).sort()
            );

            // The half QSEoW does not have: the thumbnail images are gone from the app's media
            // library too, not merely unreferenced.
            expect(mediaAfterRemoval[appId]).toBe(0);

            // Control case for the no-op assertion below, stated from both sides: an app that
            // carried icons was written, so the field the no-op rests on is one that does move -
            // and an app that carried none was not written at all.
            //
            // Guarded because the arrange step only guarantees that SOME selected app has icons.
            // An app with none is legitimately left untouched, and asserting unconditionally that
            // every app was written failed against the live tenant for exactly that reason.
            if (sheetIdsWithIcon(iconsBefore[appId]).length > 0) {
                expect(datesAfterRemoval[appId]).not.toBe(datesBefore[appId]);
            } else {
                expect(datesAfterRemoval[appId]).toBe(datesBefore[appId]);
            }
        }

        // ---------------------------------------------------------------------------------
        // Act 2: remove again. Issue #1113 - a second removal must write nothing and not save.
        // ---------------------------------------------------------------------------------
        expect(await qscloudRemoveSheetIcons(options)).toBe(true);

        // Not "no icons", which was already true before this run and would pass either way: the
        // question is whether anything was written. The control case above is what makes an
        // unchanged date evidence rather than a metric that never moves.
        expect(await readAppModifiedDates(saasInstance, appIds)).toEqual(datesAfterRemoval);
        expect(await readThumbnailMediaCounts(saasInstance, appIds)).toEqual(mediaAfterRemoval);

        // ---------------------------------------------------------------------------------
        // Restore, and close the round trip: the icons an administrator removed can be put back.
        // ---------------------------------------------------------------------------------
        expect(await qscloudCreateThumbnails(options)).toBe(true);

        const iconsRestored = await readIconState(appIds);
        const mediaRestored = await readThumbnailMediaCounts(saasInstance, appIds);

        for (const appId of appIds) {
            // The same sheets carry an icon again. The URLs are not compared: they are derived
            // from the app id and the sheet number, so they say nothing a fresh upload would not.
            expect(sheetIdsWithIcon(iconsRestored[appId])).toEqual(
                sheetIdsWithIcon(iconsBefore[appId])
            );

            // And the media files are back. Not compared to `mediaBefore`: removal deletes every
            // image in the folder, including ones left by earlier runs with different blur
            // options, so a restored count is legitimately lower than the count it replaced.
            if (sheetIdsWithIcon(iconsBefore[appId]).length > 0) {
                expect(mediaRestored[appId]).toBeGreaterThan(0);
            }
        }
    },
    defaultTestTimeout
);
