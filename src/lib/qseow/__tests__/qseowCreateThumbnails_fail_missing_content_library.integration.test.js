import { test, expect, describe } from '@jest/globals';
import 'dotenv/config';

import { qseowCreateThumbnails } from '../qseow-create-thumbnails.js';
import { assertEnv, getTestTimeout } from '../../util/env-check.js';

const defaultTestTimeout = getTestTimeout(process.env);

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
    imagedir: process.env.BSI_IAMGE_DIR || 'img',
    contentlibrary: process.env.BSI_CONTENT_LIBRARY,
    host: process.env.BSI_HOST,
    appid: process.env.BSI_APP_ID || 'a3e0f5d2-000a-464f-998d-33d333b175d7',
    apiuserdir: process.env.BSI_API_USER_DIR || 'Internal',
    apiuserid: process.env.BSI_API_USER_ID || 'sa_api',
    logonuserdir: process.env.BSI_LOGON_USER_DIR,
    logonuserid: process.env.BSI_LOGON_USER_ID,
    logonpwd: process.env.BSI_LOGON_PWD,
    includesheetpart: process.env.BSI_INCLUDE_SHEET_PART || 1,
    qliksensetag: process.env.BSI_QLIK_SENSE_TAG || '',
    senseVersion: process.env.BSI_SENSE_VERSION,
};

/**
 * Create thumbnails with non-existing content library specified
 * Should fail
 */
options.contentlibrary = 'abc 12';
test(
    'qseow create sheet thumbnails, non-existing content library (should fail)',
    async () => {
        // This test is intentionally lenient on cert/host requirements: it
        // exercises the "missing content library" code path which fails
        // before the cert files are used. Still require the connectivity
        // pieces that are needed to even reach the failure point.
        assertEnv(process.env, {
            mandatory: ['BSI_HOST', 'BSI_LOGON_USER_DIR', 'BSI_LOGON_USER_ID', 'BSI_LOGON_PWD'],
            secret: ['BSI_LOGON_PWD'],
            informational: [
                'BSI_LOG_LEVEL',
                'BSI_ENGINE_PORT',
                'BSI_QRS_PORT',
                'BSI_SCHEMA_VERSION',
                'BSI_CERT_FILE',
                'BSI_CERT_KEY_FILE',
                'BSI_PREFIX',
                'BSI_SECURE',
                'BSI_HEADLESS',
                'BSI_PAGE_WAIT',
                'BSI_IAMGE_DIR',
                'BSI_API_USER_DIR',
                'BSI_API_USER_ID',
                'BSI_APP_ID',
                'BSI_INCLUDE_SHEET_PART',
                'BSI_QLIK_SENSE_TAG',
                'BSI_SENSE_VERSION',
                'BSI_CONTENT_LIBRARY',
            ],
            label: 'qseow fail-missing-content-library test prerequisites not met',
        });

        const data = await qseowCreateThumbnails(options);
        expect(data).toBe(false);
    },
    defaultTestTimeout
);
