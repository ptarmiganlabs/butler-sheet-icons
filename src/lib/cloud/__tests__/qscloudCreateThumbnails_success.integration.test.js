import { test, expect } from '@jest/globals';
import 'dotenv/config';

import { qscloudCreateThumbnails } from '../cloud-create-thumbnails.js';
import { browserInstalled } from '../../browser/browser-installed.js';
import { browserUninstallAll } from '../../browser/browser-uninstall.js';
import { assertEnv, getTestTimeout } from '../../util/env-check.js';
import { collectAppIds } from '../../commands/helpers.js';

const defaultTestTimeout = getTestTimeout(process.env);

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
    // Split with the CLI's own parser, so BSI_CLOUD_APP_ID=id1,id2 names two apps and is split
    // exactly as a real run would split it. The `?? ''` matters because this suite is driven
    // either by an app id or by a collection id: with the variable unset, a bare
    // `[process.env.BSI_CLOUD_APP_ID]` is `[undefined]`, and undefined would be pushed as if it
    // were an app to process. An empty string yields an empty list, which is what "not supplied"
    // should mean.
    appid: collectAppIds(process.env.BSI_CLOUD_APP_ID ?? ''),
    includesheetpart: process.env.BSI_INCLUDE_SHEET_PART || '1',
    browser: process.env.BSI_BROWSER || 'chrome',
    // These options bypass Commander, so the CLI default is not applied for them - the fallback
    // here is the default. It read 'latest', which is how this suite came to run against a Chrome
    // build that could not be driven while reporting no configuration difference (issue #878).
    browserVersion: process.env.BSI_BROWSER_VERSION || 'recommended',
    blurSheetStatus: process.env.BSI_BLUR_SHEET_STATUS || [],
    blurSheetTag: process.env.BSI_BLUR_SHEET_TAG || '',
    blurSheetNumber: process.env.BSI_BLUR_SHEET_NUMBER || '5',
    blurFactor: process.env.BSI_BLUR_FACTOR || '10',
};

/**
 * Create thumbnails with proper parameters
 * Should succeed
 * Set timeout based on BSI_TEST_TIMEOUT environment variable
 */
test(
    'qs cloud create sheet thumbnails, correct parameters (should succeed)',
    async () => {
        // Hard-fail fast on missing/empty prerequisites so a misconfigured
        // local dev box reports a clear env error rather than a bare
        // "Expected: true, Received: false" further down. Pass { diagnostic: true }
        // to surface raw byte info on secrets if a similar encoding bug shows up again.
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

        // Remove all installed browsers
        const uninstallRes1 = await browserUninstallAll(options);
        expect(uninstallRes1).toEqual(true);

        // There should now be zero installed browsers
        const installedBrowsers1 = await browserInstalled(options);
        expect(installedBrowsers1.length).toEqual(0);

        const data = await qscloudCreateThumbnails(options);

        expect(data).toBe(true);
    },
    defaultTestTimeout
);
