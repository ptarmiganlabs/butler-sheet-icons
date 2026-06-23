import { test, expect } from '@jest/globals';
import 'dotenv/config';

import { qscloudCreateThumbnails } from '../cloud-create-thumbnails.js';
import { browserInstalled } from '../../browser/browser-installed.js';
import { browserUninstallAll } from '../../browser/browser-uninstall.js';
import { assertEnv, getTestTimeout } from '../../util/env-check.js';

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
    appid: process.env.BSI_CLOUD_APP_ID,
    includesheetpart: process.env.BSI_INCLUDE_SHEET_PART || 1,
    browser: process.env.BSI_BROWSER || 'chrome',
    browserVersion: process.env.BSI_BROWSER_VERSION || 'latest',
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
