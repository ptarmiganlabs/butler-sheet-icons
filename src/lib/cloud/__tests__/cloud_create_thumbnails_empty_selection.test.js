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
    appVersion: '9.9.9-test',
    getLoggingLevel: jest.fn(() => 'info'),
    bsiExecutablePath: '/test/path',
    isSea: false,
}));

jest.unstable_mockModule('../cloud-test-connection.js', () => ({
    qscloudTestConnection: jest.fn().mockResolvedValue(true),
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

describe('cloud-create-thumbnails.js — no app selection', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('returns false when neither --appid nor --collectionid is provided', async () => {
        const result = await qscloudCreateThumbnails(
            {
                includesheetpart: '1',
                loglevel: 'info',
                tenanturl: 'test.eu.qlikcloud.com',
                apikey: 'test-key',
                appid: '',
                collectionid: '',
            },
            {}
        );

        expect(result).toBe(false);

        const errors = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
        expect(errors).toContain('No apps to process');
        expect(errors).toContain('Check the --appid and --collectionid options');
    });
});
