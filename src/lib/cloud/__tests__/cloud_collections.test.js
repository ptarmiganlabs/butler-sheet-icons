import { jest, describe, test, expect, beforeEach } from '@jest/globals';

const Get = jest.fn();
const QlikSaas = jest.fn(function QlikSaasMock() {
    this.Get = Get;
});

jest.unstable_mockModule('../cloud-repo.js', () => ({ default: QlikSaas }));

const qscloudTestConnection = jest.fn().mockResolvedValue(true);

jest.unstable_mockModule('../cloud-test-connection.js', () => ({ qscloudTestConnection }));

jest.unstable_mockModule('../../util/redact-secrets.js', () => ({
    redactOptions: jest.fn((options) => options),
}));

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
    },
    setLoggingLevel: jest.fn(),
    bsiExecutablePath: '/opt/bsi',
    isSea: false,
}));

const { logger } = await import('../../../globals.js');
const { qscloudListCollections, qscloudVerifyCollectionExists } =
    await import('../cloud-collections.js');

const BASE_OPTIONS = {
    tenanturl: 'tenant.eu.qlikcloud.com',
    apikey: 'api-key',
    outputformat: 'table',
    loglevel: 'info',
};

const COLLECTIONS = [
    {
        name: 'Finance',
        description: 'Finance apps',
        id: 'collection-1',
        type: 'public',
        itemCount: 3,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-02-01T00:00:00Z',
    },
    {
        name: 'Sales',
        id: 'collection-2',
        type: 'private',
        itemCount: 1,
        createdAt: '2026-01-02T00:00:00Z',
        updatedAt: '2026-02-02T00:00:00Z',
    },
];

beforeEach(() => {
    jest.clearAllMocks();
    qscloudTestConnection.mockResolvedValue(true);
    Get.mockResolvedValue(COLLECTIONS);
});

describe('qscloudListCollections', () => {
    test('returns true after listing collections', async () => {
        await expect(qscloudListCollections({ ...BASE_OPTIONS })).resolves.toBe(true);
    });

    test('fetches the collections from the tenant', async () => {
        await qscloudListCollections({ ...BASE_OPTIONS });

        expect(Get).toHaveBeenCalledWith('collections');
    });

    test('builds the SaaS client from the tenant URL and API key', async () => {
        await qscloudListCollections({ ...BASE_OPTIONS });

        expect(QlikSaas).toHaveBeenCalledWith({
            url: 'tenant.eu.qlikcloud.com',
            token: 'api-key',
        });
    });

    describe('table output', () => {
        test('renders every collection name', async () => {
            await qscloudListCollections({ ...BASE_OPTIONS, outputformat: 'table' });

            const info = logger.info.mock.calls.map((call) => String(call[0])).join('\n');

            expect(info).toContain('Finance');
            expect(info).toContain('Sales');
        });

        test('renders a blank cell for a collection with no description', async () => {
            await qscloudListCollections({ ...BASE_OPTIONS, outputformat: 'table' });

            const info = logger.info.mock.calls.map((call) => String(call[0])).join('\n');

            // The Sales collection has no description; it must not show "undefined".
            expect(info).not.toContain('undefined');
        });

        test('includes the column headers', async () => {
            await qscloudListCollections({ ...BASE_OPTIONS, outputformat: 'table' });

            const info = logger.info.mock.calls.map((call) => String(call[0])).join('\n');

            expect(info).toContain('Item count');
        });
    });

    describe('json output', () => {
        test('renders the raw collection objects', async () => {
            await qscloudListCollections({ ...BASE_OPTIONS, outputformat: 'json' });

            const info = logger.info.mock.calls.map((call) => String(call[0])).join('\n');

            expect(info).toContain('"id": "collection-1"');
        });
    });

    test('still returns true for an unknown output format', async () => {
        // Format validation belongs to the command layer, not here.
        await expect(
            qscloudListCollections({ ...BASE_OPTIONS, outputformat: 'yaml' })
        ).resolves.toBe(true);
    });

    describe('failure paths', () => {
        test('returns false when the SaaS client cannot be built', async () => {
            QlikSaas.mockImplementationOnce(() => {
                throw new Error('API token parameter is required');
            });

            await expect(qscloudListCollections({ ...BASE_OPTIONS })).resolves.toBe(false);
        });

        test('returns false when the connection test fails', async () => {
            qscloudTestConnection.mockRejectedValue(new Error('401 Unauthorized'));

            await expect(qscloudListCollections({ ...BASE_OPTIONS })).resolves.toBe(false);
        });

        test('does not fetch collections when the connection test fails', async () => {
            qscloudTestConnection.mockRejectedValue(new Error('401 Unauthorized'));

            await qscloudListCollections({ ...BASE_OPTIONS });

            expect(Get).not.toHaveBeenCalled();
        });

        test('returns false when fetching the collections fails', async () => {
            Get.mockRejectedValue(new Error('500 Internal Server Error'));

            await expect(qscloudListCollections({ ...BASE_OPTIONS })).resolves.toBe(false);
        });

        test('returns false rather than rejecting when rendering blows up', async () => {
            Get.mockResolvedValue('not an array');

            await expect(
                qscloudListCollections({ ...BASE_OPTIONS, outputformat: 'table' })
            ).resolves.toBe(false);
        });

        test('logs the failure', async () => {
            Get.mockRejectedValue(new Error('500 Internal Server Error'));

            await qscloudListCollections({ ...BASE_OPTIONS });

            expect(logger.error).toHaveBeenCalled();
        });
    });
});

describe('qscloudVerifyCollectionExists', () => {
    test('returns true when the collection id is present', async () => {
        await expect(
            qscloudVerifyCollectionExists({ ...BASE_OPTIONS, collectionid: 'collection-2' })
        ).resolves.toBe(true);
    });

    test('returns false when the collection id is absent', async () => {
        await expect(
            qscloudVerifyCollectionExists({ ...BASE_OPTIONS, collectionid: 'collection-999' })
        ).resolves.toBe(false);
    });

    test('returns false when the tenant has no collections at all', async () => {
        Get.mockResolvedValue([]);

        await expect(
            qscloudVerifyCollectionExists({ ...BASE_OPTIONS, collectionid: 'collection-1' })
        ).resolves.toBe(false);
    });

    test('matches on id, not on name', async () => {
        await expect(
            qscloudVerifyCollectionExists({ ...BASE_OPTIONS, collectionid: 'Finance' })
        ).resolves.toBe(false);
    });

    test('rejects when the collections call fails', async () => {
        Get.mockRejectedValue(new Error('500 Internal Server Error'));

        await expect(
            qscloudVerifyCollectionExists({ ...BASE_OPTIONS, collectionid: 'collection-1' })
        ).rejects.toThrow(/COLLECTION EXISTS 1/);
    });

    test('keeps the underlying failure as the error cause', async () => {
        const apiError = new Error('500 Internal Server Error');
        Get.mockRejectedValue(apiError);

        let thrown;
        try {
            await qscloudVerifyCollectionExists({ ...BASE_OPTIONS, collectionid: 'collection-1' });
        } catch (err) {
            thrown = err;
        }

        expect(thrown.cause).toBe(apiError);
    });
});
