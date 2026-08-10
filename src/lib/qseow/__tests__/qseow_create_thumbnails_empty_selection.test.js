import { jest, describe, test, expect, beforeEach } from '@jest/globals';

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
    sleep: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../qseow-certificates.js', () => ({
    qseowVerifyCertificatesExist: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule('../qseow-qrs.js', () => ({
    setupQseowQrsConnection: jest.fn().mockReturnValue({ hostname: 'sense.example.com' }),
}));

jest.unstable_mockModule('../qseow-contentlibrary.js', () => ({
    qseowVerifyContentLibraryExists: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule('../../util/redact-secrets.js', () => ({
    redactOptions: jest.fn((o) => o),
}));

const { logger } = await import('../../../globals.js');
const { qseowCreateThumbnails } = await import('../qseow-create-thumbnails.js');

describe('qseow-create-thumbnails.js — no app selection', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('returns false when neither --appid nor --qliksensetag is provided', async () => {
        const result = await qseowCreateThumbnails(
            {
                includesheetpart: '1',
                loglevel: 'info',
                host: 'sense.example.com',
                engineport: '4747',
                qrsport: '4242',
                certfile: '/test/cert.pem',
                certkeyfile: '/test/key.pem',
                appid: '',
                qliksensetag: '',
            },
            {}
        );

        expect(result).toBe(false);

        const errors = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
        expect(errors).toContain('No apps to process');
        expect(errors).toContain('Check the --appid and --qliksensetag options');
    });
});
