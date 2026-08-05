import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Only the --includesheetpart validation is under test here. The connection test that comes
// straight after it is mocked to throw, so a value that passes validation stops there instead
// of reaching the tenant.
jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    },
    setLoggingLevel: jest.fn(),
    bsiExecutablePath: '/test/path',
    isSea: false,
}));

jest.unstable_mockModule('../cloud-test-connection.js', () => ({
    qscloudTestConnection: jest.fn(() => {
        throw new Error('PAST_VALIDATION');
    }),
}));

jest.unstable_mockModule('../cloud-repo.js', () => ({ default: jest.fn() }));

jest.unstable_mockModule('../process-cloud-app.js', () => ({
    processCloudApp: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule('../../util/redact-secrets.js', () => ({
    redactOptions: jest.fn((o) => o),
}));

const { logger } = await import('../../../globals.js');
const { qscloudCreateThumbnails } = await import('../cloud-create-thumbnails.js');

const INVALID = 'Invalid --includesheetpart paramater';

/**
 * Runs the function with the given sheet-part value and reports whether the
 * --includesheetpart validation rejected it.
 *
 * The outcome is observable through the log rather than through a rejection, because the
 * function catches everything. Only this one check is of interest.
 *
 * @param {string|number|undefined} includesheetpart - Value to validate.
 *
 * @returns {Promise<boolean>} True when the value was rejected by this validation.
 */
async function rejectedByValidation(includesheetpart) {
    const options = {
        includesheetpart,
        loglevel: 'info',
        logLevel: 'info',
        tenanturl: 'test.eu.qlikcloud.com',
        apikey: 'test-key',
    };
    await qscloudCreateThumbnails(options, {}).catch(() => undefined);

    return logger.error.mock.calls.some((call) => String(call[0]).includes(INVALID));
}

describe('cloud-create-thumbnails.js — includesheetpart validation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test.each(['1', '2', '4'])('accepts the string "%s"', async (value) => {
        expect(await rejectedByValidation(value)).toBe(false);
    });

    // The numeric forms were previously accepted by explicit `!== 1 && !== 2 ...` comparisons.
    // Normalising with String() has to keep accepting them, or programmatic callers break.
    test.each([1, 2, 4])('still accepts the number %s after normalisation', async (value) => {
        expect(await rejectedByValidation(value)).toBe(false);
    });

    // '3' is valid for QSEoW but not for QS Cloud, which has no sheet part 3. The two
    // validators deliberately accept different sets.
    test.each(['3', 3, '5', 'abc', '', 0, undefined])('rejects %p', async (value) => {
        expect(await rejectedByValidation(value)).toBe(true);
    });
});
