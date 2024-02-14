/* eslint-disable no-console */
const { test, expect, describe } = require('@jest/globals');

const { qscloudCreateThumbnails } = require('../lib/cloud/cloud-create-thumbnails');

const defaultTestTimeout = process.env.BSI_TEST_TIMEOUT || 1200000; // 20 minute default timeout

console.log(`Jest timeout: ${defaultTestTimeout}`);

const options = {
    loglevel: process.env.BSI_LOG_LEVEL || 'debug',
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
    browserVersion: process.env.BSI_BROWSER_VERSION || 'stable',
};

/**
 * Create thumbnails with proper parameters
 * Should succeed
 * Set timeout based on BSI_TEST_TIMEOUT environment variable
 */
test(
    'qs cloud create sheet thumbnails, correct parameters (should succeed)',
    async () => {
        const data = await qscloudCreateThumbnails(options);
        expect(data).toBe(true);
    },
    defaultTestTimeout
);
