import { test, expect } from '@jest/globals';
import 'dotenv/config';
import winston from 'winston';
import { Writable } from 'node:stream';

import { qseowCreateThumbnails } from '../qseow-create-thumbnails.js';
import { assertEnv, getTestTimeout } from '../../util/env-check.js';
import { logger } from '../../../globals.js';

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
    imagedir: process.env.BSI_IMAGE_DIR || 'img',
    contentlibrary: process.env.BSI_CONTENT_LIBRARY,
    host: process.env.BSI_HOST,
    appid: [process.env.BSI_APP_ID || 'a3e0f5d2-000a-464f-998d-33d333b175d7'],
    apiuserdir: process.env.BSI_API_USER_DIR || 'Internal',
    apiuserid: process.env.BSI_API_USER_ID || 'sa_api',
    logonuserdir: process.env.BSI_LOGON_USER_DIR,
    logonuserid: process.env.BSI_LOGON_USER_ID,
    logonpwd: process.env.BSI_LOGON_PWD,
    includesheetpart: process.env.BSI_INCLUDE_SHEET_PART || '1',
    qliksensetag: process.env.BSI_QLIK_SENSE_TAG || '',
    senseVersion: process.env.BSI_SENSE_VERSION,
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
 */
test(
    'qseow create sheet thumbnails, correct parameters (should succeed)',
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
                'BSI_QLIK_SENSE_TAG',
                'BSI_BROWSER',
                'BSI_BROWSER_VERSION',
                'BSI_BLUR_SHEET_STATUS',
                'BSI_BLUR_SHEET_TAG',
                'BSI_BLUR_SHEET_NUMBER',
                'BSI_BLUR_FACTOR',
            ],
        });

        const capturedErrors = [];
        const capture = new winston.transports.Stream({
            level: 'error',
            stream: new Writable({
                write(chunk, _encoding, callback) {
                    capturedErrors.push(String(chunk));
                    callback();
                },
            }),
        });
        logger.add(capture);

        let data;
        try {
            data = await qseowCreateThumbnails(options);
        } finally {
            logger.remove(capture);
        }

        expect(data).toBe(true);
        expect(capturedErrors.join('\n')).toBe('');
    },
    defaultTestTimeout
);
