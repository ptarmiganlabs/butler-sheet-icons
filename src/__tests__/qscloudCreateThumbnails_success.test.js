const { qscloudCreateThumbnails } = require('../lib/cloud/cloud-create-thumbnails');

const defaultTestTimeout = process.env.BSI_TEST_TIMEOUT || 600000; // 10 minute default timeout

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
};

jest.setTimeout(defaultTestTimeout);

/**
 * Create thumbnails with proper parameters
 * Should succeed
 */
test('qs cloud create sheet thumbnails, correct parameters (should succeed)', async () => {
    const data = await qscloudCreateThumbnails(options);
    expect(data).toBe(true);
});
