import { test, expect, describe, beforeAll } from '@jest/globals';
import 'dotenv/config';

import { qseowCreateThumbnails } from '../qseow-create-thumbnails.js';
import { assertEnv, getTestTimeout } from '../../util/env-check.js';

// Failure paths for QSEoW, matching the Qlik Sense Cloud set case for case. The two platforms are
// mirrors of each other, and a scenario covered on one but not the other is where this codebase
// has repeatedly grown divergent behaviour.
//
// The existing missing-content-library test stays where it is; it fails earlier than any of
// these, before certificates are even read.

const defaultTestTimeout = getTestTimeout(process.env);

/**
 * Builds the standard options object, with per-test overrides applied last.
 *
 * @param {object} [overrides] - Option values to replace.
 *
 * @returns {object} Options for `qseowCreateThumbnails`.
 */
const buildOptions = (overrides = {}) => ({
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
    browserVersion: process.env.BSI_BROWSER_VERSION || 'recommended',
    blurSheetStatus: [],
    blurSheetTag: '',
    blurSheetNumber: '5',
    blurFactor: '10',
    ...overrides,
});

describe('qseow create sheet thumbnails - failure paths', () => {
    beforeAll(() => {
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
                'BSI_PREFIX',
                'BSI_APP_ID',
                'BSI_BROWSER',
                'BSI_BROWSER_VERSION',
            ],
            label: 'qseow failure-path test prerequisites not met',
        });
    });

    /**
     * An app id that does not exist must be reported as a failed run. Before PR #877 a run in
     * which every app failed still reported success.
     */
    test(
        'a non-existent app id fails the run',
        async () => {
            const result = await qseowCreateThumbnails(
                buildOptions({ appid: ['00000000-0000-0000-0000-000000000000'] })
            );

            expect(result).toBe(false);
        },
        defaultTestTimeout
    );

    /**
     * An unreachable Sense host must fail rather than hang or report success.
     */
    test(
        'an unreachable host fails the run',
        async () => {
            const result = await qseowCreateThumbnails(
                buildOptions({ host: 'no-such-sense-host.invalid' })
            );

            expect(result).toBe(false);
        },
        defaultTestTimeout
    );

    /**
     * A certificate file that does not exist must fail with a clear outcome rather than an
     * unhandled rejection.
     */
    test(
        'a missing certificate file fails the run',
        async () => {
            const result = await qseowCreateThumbnails(
                buildOptions({ certfile: './cert/no-such-cert.pem' })
            );

            expect(result).toBe(false);
        },
        defaultTestTimeout
    );

    /**
     * A tag that matches no apps selects nothing. Reporting success for "the operator asked for
     * apps and got none" is what `runOverApps` was changed to stop doing.
     */
    test(
        'a tag matching no apps fails the run',
        async () => {
            const result = await qseowCreateThumbnails(
                buildOptions({ appid: '', qliksensetag: 'no-such-tag-exists-here' })
            );

            expect(result).toBe(false);
        },
        defaultTestTimeout
    );

    /**
     * A browser build that cannot be downloaded must fail the run rather than silently falling
     * back to some other build. Guards the exact-match behaviour introduced for issue #878.
     */
    test(
        'a browser version that does not exist fails the run',
        async () => {
            const result = await qseowCreateThumbnails(
                buildOptions({ browserVersion: '99.0.1234.56' })
            );

            expect(result).toBe(false);
        },
        defaultTestTimeout
    );
});
