import { test, expect } from '@jest/globals';
import 'dotenv/config';
import qrsInteract from 'qrs-interact';

import { qseowRemoveSheetIcons } from '../qseow-remove-sheet-icons.js';
import { qseowCreateThumbnails } from '../qseow-create-thumbnails.js';
import { setupEnigmaConnection } from '../qseow-enigma.js';
import { setupQseowQrsConnection } from '../qseow-qrs.js';
import { qrsPathWithFilter } from '../qrs-filter.js';
import { qrsGetList } from '../qrs-response.js';
import {
    readSheetIconState,
    sheetIdsWithIcon,
    sheetTitlesWithIcon,
} from '../../test-helpers/sheet-icon-state.js';
import { assertEnv, getTestTimeout } from '../../util/env-check.js';
import { collectAppIds } from '../../commands/helpers.js';

/**
 * `qseow remove-sheet-icons` against a live QSEoW server.
 *
 * Removal is the one command with no undo, and until now nothing exercised it against a real
 * engine at all: the unit suites mock enigma.js, so a change to how the icon property is written
 * or to when the app is saved would have surfaced first on somebody's production app. Issue #911.
 *
 * ## Shape: a round trip, not removal in isolation
 *
 * The suite runs `remove-sheet-icons` and then `create-sheet-thumbnails`, because the pair is
 * what an administrator actually relies on - removal is the documented way back from a thumbnail
 * run applied to the wrong app, and the demo pipeline uses it as its reset step. Testing removal
 * alone would prove the icons went away without proving they can be put back.
 *
 * It also means the suite restores the fixture it consumes. The QSEoW integration suites share
 * one app and run under a single `bsi-qseow-*` concurrency group, and Jest's file order within
 * the run is not pinned, so a suite that left the app stripped would make the other suites'
 * results depend on which one happened to run first.
 *
 * ## What each assertion rests on
 *
 * - **The dry run writes nothing**: the same per-sheet QRS dates, unchanged across it. The dry
 *   run makes the same per-sheet engine reads the real run makes - deliberately, so it fails on
 *   the sheets the run would fail on - which is exactly the shape that could start writing
 *   without anyone noticing.
 * - **Icons are gone**: read back over a *fresh* engine session, opened after the command closed
 *   its own and saved the app. That is a claim about what the server kept, not about what the
 *   command believed it did.
 * - **The removal really wrote**: QRS `modifiedDate`, per sheet. This is the control case, and it
 *   is needed - the app-level `modifiedDate` does not move for a removal that genuinely clears
 *   and saves, so an assertion built on that would have been a metric that never moves, which
 *   passes for both a working removal and one that does nothing. Per-sheet dates move on exactly
 *   the sheets that carried an icon.
 * - **The second removal writes nothing** (issue #1113): the same per-sheet dates, unchanged
 *   across a re-run. Before that fix a re-run rewrote and saved every sheet it had already
 *   cleared - a visible, audited change on a published app, made by a command whose own dry run
 *   had just said it would do nothing. Two published doc pages now promise the no-op, so it is
 *   worth an assertion rather than trust.
 */

const defaultTestTimeout = getTestTimeout(process.env);

// One options bag for both commands, exactly as a CLI user's environment supplies one set of
// connection details to whichever command they run. `remove-sheet-icons` ignores the browser,
// logon and rendering keys - it never opens the web UI - and reading the same values the create
// suite reads is what keeps the two halves of the round trip pointed at the same server, app and
// content library.
const options = {
    loglevel: process.env.BSI_LOG_LEVEL || 'verbose',
    engineport: process.env.BSI_ENGINE_PORT || '4747',
    qrsport: process.env.BSI_QRS_PORT || '4242',
    schemaversion: process.env.BSI_SCHEMA_VERSION || '12.612.0',
    certfile: process.env.BSI_CERT_FILE || '../../cert/client.pem',
    certkeyfile: process.env.BSI_CERT_KEY_FILE || '../../cert/client_key.pem',
    prefix: process.env.BSI_PREFIX || '',
    secure: process.env.BSI_SECURE || 'true',
    headless: process.env.BSI_HEADLESS || 'true',
    pagewait: process.env.BSI_PAGE_WAIT || '3',
    imagedir: process.env.BSI_IMAGE_DIR || 'img',
    contentlibrary: process.env.BSI_CONTENT_LIBRARY,
    host: process.env.BSI_HOST,
    // Split with the CLI's own parser, so BSI_APP_ID=id1,id2 names two apps and is split exactly
    // as a real run would split it - rather than becoming one id containing a comma.
    appid: collectAppIds(process.env.BSI_APP_ID || 'a3e0f5d2-000a-464f-998d-33d333b175d7'),
    apiuserdir: process.env.BSI_API_USER_DIR || 'Internal',
    apiuserid: process.env.BSI_API_USER_ID || 'sa_api',
    logonuserdir: process.env.BSI_LOGON_USER_DIR,
    logonuserid: process.env.BSI_LOGON_USER_ID,
    logonpwd: process.env.BSI_LOGON_PWD,
    includesheetpart: process.env.BSI_INCLUDE_SHEET_PART || '1',
    // Deliberately empty: this suite selects apps by id only. A tag selection would silently
    // widen the blast radius of a destructive command to whatever the lab happens to have tagged.
    qliksensetag: '',
    senseVersion: process.env.BSI_SENSE_VERSION,
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
 * so the read cannot reach a different server than the write did.
 *
 * @returns {Promise<object>} App id to sheet state, as `readSheetIconState` returns it.
 */
const readIconState = async () => {
    const state = {};

    for (const appId of options.appid) {
        state[appId] = await readSheetIconState(setupEnigmaConnection(appId, options), appId, {
            logPrefix: 'QSEOW REMOVE ICONS ROUND TRIP',
            loglevel: options.loglevel,
            connectionLabel: `server ${options.host}`,
        });
    }

    return state;
};

/**
 * Per-sheet `modifiedDate` from QRS, for every app in the run.
 *
 * The write-proof, and independent of the engine the commands use. Keyed by `engineObjectId` so
 * it lines up with the sheet ids the engine read-back reports.
 *
 * @param {object} qrsInteractInstance - Configured `qrs-interact` instance.
 *
 * @returns {Promise<object>} App id to a map of sheet id to `modifiedDate`.
 */
const readSheetModifiedDates = async (qrsInteractInstance) => {
    const snapshot = {};

    for (const appId of options.appid) {
        // App ids are interpolated unquoted, matching every other GUID filter in this codebase -
        // QRS parses bare GUIDs. Through `qrsPathWithFilter` so the filter is encoded once.
        const sheets = await qrsGetList(
            qrsInteractInstance,
            qrsPathWithFilter('app/object/full', `app.id eq ${appId} and objectType eq 'sheet'`)
        );

        snapshot[appId] = Object.fromEntries(
            sheets.map((sheet) => [sheet.engineObjectId, sheet.modifiedDate])
        );
    }

    return snapshot;
};

/**
 * The sheet ids whose QRS `modifiedDate` differs between two snapshots, sorted.
 *
 * @param {object} before - Snapshot taken first.
 * @param {object} after - Snapshot taken second.
 *
 * @returns {string[]} Sorted sheet ids that were written between the two snapshots.
 */
const sheetIdsWritten = (before, after) =>
    Object.keys(after)
        .filter((sheetId) => after[sheetId] !== before[sheetId])
        .sort();

test(
    'qseow remove sheet icons, round trip against a live server (should succeed)',
    async () => {
        assertEnv(process.env, {
            mandatory: [
                'BSI_HOST',
                'BSI_CONTENT_LIBRARY',
                'BSI_LOGON_USER_DIR',
                'BSI_LOGON_USER_ID',
                'BSI_LOGON_PWD',
                'BSI_CERT_FILE',
                'BSI_CERT_KEY_FILE',
                'BSI_SENSE_VERSION',
            ],
            secret: ['BSI_LOGON_PWD'],
            informational: [
                'BSI_LOG_LEVEL',
                'BSI_ENGINE_PORT',
                'BSI_QRS_PORT',
                'BSI_SCHEMA_VERSION',
                'BSI_PREFIX',
                'BSI_SECURE',
                'BSI_HEADLESS',
                'BSI_PAGE_WAIT',
                'BSI_IMAGE_DIR',
                'BSI_API_USER_DIR',
                'BSI_API_USER_ID',
                'BSI_APP_ID',
                'BSI_INCLUDE_SHEET_PART',
                'BSI_BROWSER',
                'BSI_BROWSER_VERSION',
                'BSI_BLUR_SHEET_STATUS',
                'BSI_BLUR_SHEET_TAG',
                'BSI_BLUR_SHEET_NUMBER',
                'BSI_BLUR_FACTOR',
            ],
        });

        const qrsInteractInstance = new qrsInteract(setupQseowQrsConnection(options));

        // ---------------------------------------------------------------------------------
        // Arrange: the apps must start with icons, or "every icon is gone" would pass without
        // the removal having done anything.
        //
        // Normally they do - the suite restores them at the end, and the create suite shares the
        // fixture. The branch covers the run after one that was interrupted between the removal
        // and the restore, which would otherwise fail this suite on every subsequent run until
        // somebody restored the app by hand.
        // ---------------------------------------------------------------------------------
        let iconsBefore = await readIconState();
        const anyIcon = (state) =>
            Object.values(state).some((sheets) => sheetIdsWithIcon(sheets).length > 0);

        if (!anyIcon(iconsBefore)) {
            console.log(
                'No sheet in the selected app(s) carries an icon. Creating thumbnails first, so the removal has something to remove.'
            );
            expect(await qseowCreateThumbnails(options)).toBe(true);
            iconsBefore = await readIconState();
        }

        expect(anyIcon(iconsBefore)).toBe(true);

        const datesBefore = await readSheetModifiedDates(qrsInteractInstance);

        // ---------------------------------------------------------------------------------
        // Dry run first. It is the only safety net this command has - there is no undo - and it
        // makes the same per-sheet engine reads the real run makes, which is exactly the shape
        // that could start writing without anyone noticing. Costs seconds: no browser, no upload.
        // ---------------------------------------------------------------------------------
        expect(await qseowRemoveSheetIcons({ ...options, dryRun: true })).toBe(true);

        expect(await readSheetModifiedDates(qrsInteractInstance)).toEqual(datesBefore);

        const iconsAfterDryRun = await readIconState();
        for (const appId of options.appid) {
            expect(sheetIdsWithIcon(iconsAfterDryRun[appId])).toEqual(
                sheetIdsWithIcon(iconsBefore[appId])
            );
        }

        // ---------------------------------------------------------------------------------
        // Act 1: remove the icons.
        // ---------------------------------------------------------------------------------
        expect(await qseowRemoveSheetIcons(options)).toBe(true);

        const iconsAfterRemoval = await readIconState();
        const datesAfterRemoval = await readSheetModifiedDates(qrsInteractInstance);

        for (const appId of options.appid) {
            // No sheet carries an icon any more. Compared by title so a failure names the sheets
            // that still have one rather than printing URLs.
            expect(sheetTitlesWithIcon(iconsAfterRemoval[appId])).toEqual([]);

            // Removal clears a property; it must not have removed or added sheets.
            expect(iconsAfterRemoval[appId].map((sheet) => sheet.id).sort()).toEqual(
                iconsBefore[appId].map((sheet) => sheet.id).sort()
            );

            // The control case, from QRS rather than from the engine the command used: exactly
            // the sheets that carried an icon were written. Sheets that had none - the app's
            // hidden sheet on the lab fixture - must not have been touched.
            expect(sheetIdsWritten(datesBefore[appId], datesAfterRemoval[appId])).toEqual(
                sheetIdsWithIcon(iconsBefore[appId])
            );
        }

        // ---------------------------------------------------------------------------------
        // Act 2: remove again. Issue #1113 - a second removal must write nothing and not save.
        // ---------------------------------------------------------------------------------
        expect(await qseowRemoveSheetIcons(options)).toBe(true);

        // Not "no icons", which was already true before this run and would pass either way: the
        // question is whether anything was written, and QRS answers it. The control case above
        // is what makes an unchanged snapshot evidence rather than a metric that never moves.
        expect(await readSheetModifiedDates(qrsInteractInstance)).toEqual(datesAfterRemoval);

        // ---------------------------------------------------------------------------------
        // Restore, and close the round trip: the icons an administrator removed can be put back.
        // ---------------------------------------------------------------------------------
        expect(await qseowCreateThumbnails(options)).toBe(true);

        const iconsRestored = await readIconState();

        for (const appId of options.appid) {
            // The same sheets carry an icon again. The URLs are not compared: they encode the
            // content library, which the run's own options decide.
            expect(sheetIdsWithIcon(iconsRestored[appId])).toEqual(
                sheetIdsWithIcon(iconsBefore[appId])
            );
        }
    },
    defaultTestTimeout
);
