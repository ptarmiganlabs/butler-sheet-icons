import { test, expect, describe, beforeAll } from '@jest/globals';
import 'dotenv/config';

import { qscloudCreateThumbnails } from '../cloud-create-thumbnails.js';
import { assertEnv, getTestTimeout } from '../../util/env-check.js';

// Failure paths for Qlik Sense Cloud. QSEoW has had a failure integration test since early on
// (a non-existing content library) while Cloud had only a success test, so a Cloud run that
// reported success while doing nothing had nothing watching it. That is not hypothetical: before
// PR #877, qscloudCreateThumbnails returned true unconditionally, and the success test passed
// throughout the period when the browser was completely broken (issue #878).
//
// Every case here fails on Butler Sheet Icons' own side or on a lookup, so nothing is modified on
// the tenant.

const defaultTestTimeout = getTestTimeout(process.env);

/**
 * Builds the standard options object, with per-test overrides applied last.
 *
 * @param {object} [overrides] - Option values to replace.
 *
 * @returns {object} Options for `qscloudCreateThumbnails`.
 */
const buildOptions = (overrides = {}) => ({
    loglevel: process.env.BSI_LOG_LEVEL || 'verbose',
    tenanturl: process.env.BSI_CLOUD_TENANT_URL,
    apikey: process.env.BSI_CLOUD_API_KEY,
    logonuserid: process.env.BSI_CLOUD_LOGON_USERID,
    logonpwd: process.env.BSI_CLOUD_LOGON_PWD,
    headless: process.env.BSI_HEADLESS || 'true',
    pagewait: process.env.BSI_PAGE_WAIT || '10',
    imagedir: process.env.BSI_IMAGE_DIR || 'img',
    schemaversion: process.env.BSI_CLOUD_SCHEMA_VERSION || '12.612.0',
    includesheetpart: process.env.BSI_INCLUDE_SHEET_PART || '1',
    browser: process.env.BSI_BROWSER || 'chrome',
    browserVersion: process.env.BSI_BROWSER_VERSION || 'recommended',
    blurSheetStatus: [],
    blurSheetTag: '',
    blurSheetNumber: '5',
    blurFactor: '10',
    ...overrides,
});

describe('qs cloud create sheet thumbnails - failure paths', () => {
    beforeAll(() => {
        assertEnv(process.env, {
            mandatory: ['BSI_CLOUD_TENANT_URL', 'BSI_CLOUD_API_KEY'],
            secret: ['BSI_CLOUD_API_KEY'],
            informational: ['BSI_LOG_LEVEL', 'BSI_HEADLESS', 'BSI_BROWSER', 'BSI_BROWSER_VERSION'],
            label: 'qscloud failure-path test prerequisites not met',
        });
    });

    /**
     * A bad API key must be caught by the connection test, before any app work starts.
     */
    test(
        'an invalid API key fails the run',
        async () => {
            const result = await qscloudCreateThumbnails(
                buildOptions({
                    apikey: 'not-a-valid-api-key',
                    appid: [process.env.BSI_CLOUD_APP_ID],
                })
            );

            expect(result).toBe(false);
        },
        defaultTestTimeout
    );

    /**
     * An unreachable tenant must fail rather than hang or report success.
     */
    test(
        'an unreachable tenant fails the run',
        async () => {
            const result = await qscloudCreateThumbnails(
                buildOptions({
                    tenanturl: 'no-such-tenant.invalid',
                    appid: [process.env.BSI_CLOUD_APP_ID],
                })
            );

            expect(result).toBe(false);
        },
        defaultTestTimeout
    );

    /**
     * An app id that does not exist gets past the connection test and fails during app
     * processing. This is the case that matters most: it proves a run in which every app fails
     * is reported as a failure, which is what PR #877 fixed and what this suite exists to keep
     * fixed.
     */
    test(
        'a non-existent app id fails the run',
        async () => {
            const result = await qscloudCreateThumbnails(
                buildOptions({ appid: ['00000000-0000-0000-0000-000000000000'] })
            );

            expect(result).toBe(false);
        },
        defaultTestTimeout
    );

    /**
     * A collection that does not exist selects no apps. Reporting success for "the operator
     * asked for apps and got none" is what `runOverApps` was changed to stop doing.
     */
    test(
        'a non-existent collection fails the run',
        async () => {
            const result = await qscloudCreateThumbnails(
                buildOptions({ collectionid: '000000000000000000000000' })
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
            const result = await qscloudCreateThumbnails(
                buildOptions({
                    appid: [process.env.BSI_CLOUD_APP_ID],
                    browserVersion: '99.0.1234.56',
                })
            );

            expect(result).toBe(false);
        },
        defaultTestTimeout
    );
});
