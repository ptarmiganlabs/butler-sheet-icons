import { test, expect, describe, beforeAll } from '@jest/globals';
import 'dotenv/config';

import { qscloudListCollections } from '../cloud-collections.js';
import { assertEnv, getTestTimeout } from '../../util/env-check.js';

// `qscloud list-collections` had no integration coverage at all, despite being one of the four
// commands Butler Sheet Icons exposes and the one administrators use to find the collection id
// they then pass to create-sheet-thumbnails. Read-only: nothing here modifies the tenant.

const defaultTestTimeout = getTestTimeout(process.env);

/**
 * Builds the standard options object, with per-test overrides applied last.
 *
 * @param {object} [overrides] - Option values to replace.
 *
 * @returns {object} Options for `qscloudListCollections`.
 */
const buildOptions = (overrides = {}) => ({
    loglevel: process.env.BSI_LOG_LEVEL || 'info',
    tenanturl: process.env.BSI_CLOUD_TENANT_URL,
    apikey: process.env.BSI_CLOUD_API_KEY,
    outputformat: 'table',
    ...overrides,
});

describe('qscloud list-collections', () => {
    beforeAll(() => {
        assertEnv(process.env, {
            mandatory: ['BSI_CLOUD_TENANT_URL', 'BSI_CLOUD_API_KEY'],
            secret: ['BSI_CLOUD_API_KEY'],
            informational: ['BSI_LOG_LEVEL'],
            label: 'qscloud list-collections test prerequisites not met',
        });
    });

    test.each([['table'], ['json']])(
        'lists collections in %s format',
        async (outputformat) => {
            const result = await qscloudListCollections(buildOptions({ outputformat }));

            expect(result).toBe(true);
        },
        defaultTestTimeout
    );

    test(
        'an invalid API key fails rather than reporting an empty list',
        async () => {
            const result = await qscloudListCollections(
                buildOptions({ apikey: 'not-a-valid-api-key' })
            );

            expect(result).toBe(false);
        },
        defaultTestTimeout
    );

    test(
        'an unreachable tenant fails',
        async () => {
            const result = await qscloudListCollections(
                buildOptions({ tenanturl: 'no-such-tenant.invalid' })
            );

            expect(result).toBe(false);
        },
        defaultTestTimeout
    );

    // Not tested here: an unrecognised --outputformat. Commander constrains the option with
    // .choices(['table','json']), so the value cannot reach this function from the CLI. Called
    // directly with something else, it prints nothing and still returns true - worth tightening,
    // but it is not a scenario an administrator can produce.
});
