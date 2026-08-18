import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Only the --includesheetpart validation is under test here. The certificate check that comes
// straight after it is mocked to throw, so a value that passes validation stops there instead
// of reaching QRS.
jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    },
    setLoggingLevel: jest.fn(),
    appVersion: '9.9.9-test',
    getLoggingLevel: jest.fn(() => 'info'),
    bsiExecutablePath: '/test/path',
    isSea: false,
    sleep: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../qseow-certificates.js', () => ({
    qseowVerifyCertificatesExist: jest.fn(() => {
        throw new Error('PAST_VALIDATION');
    }),
}));

jest.unstable_mockModule('../../util/redact-secrets.js', () => ({
    redactOptions: jest.fn((o) => o),
}));

const { logger } = await import('../../../globals.js');
const { qseowCreateThumbnails } = await import('../qseow-create-thumbnails.js');

const INVALID = 'Invalid --includesheetpart paramater';

/**
 * Runs the function with the given sheet-part value and reports whether the
 * --includesheetpart validation rejected it.
 *
 * qseowCreateThumbnails catches everything and returns false, so the validation outcome is
 * observable through the log rather than through a rejection. Only this one check is of
 * interest — a valid value is one that does not trip it, whatever happens further down.
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
        certfile: '/test/cert.pem',
        certkeyfile: '/test/key.pem',
    };
    await qseowCreateThumbnails(options, {}).catch(() => undefined);

    return logger.error.mock.calls.some((call) => String(call[0]).includes(INVALID));
}

describe('qseow-create-thumbnails.js — includesheetpart validation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test.each(['1', '2', '3', '4'])('accepts the string "%s"', async (value) => {
        expect(await rejectedByValidation(value)).toBe(false);
    });

    // The numeric forms were previously accepted by explicit `!== 1 && !== 2 ...` comparisons.
    // Normalising with String() has to keep accepting them, or programmatic callers break.
    test.each([1, 2, 3, 4])('still accepts the number %s after normalisation', async (value) => {
        expect(await rejectedByValidation(value)).toBe(false);
    });

    test.each(['5', 'abc', '', 0, undefined])('rejects %p', async (value) => {
        expect(await rejectedByValidation(value)).toBe(true);
    });
});
