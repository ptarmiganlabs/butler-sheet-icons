import { test, expect, describe, jest, beforeEach, afterEach } from '@jest/globals';
import 'dotenv/config';

import { qscloudListCollections, qscloudVerifyCollectionExists } from '../cloud-collections.js';

// import QlikSaas from '../cloud-repo.js';

jest.unstable_mockModule('../../../globals', () => ({
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
const { logger, setLoggingLevel, bsiExecutablePath, isSea } = await import('../../../globals.js');

jest.unstable_mockModule('../cloud-repo.js', () => ({
    QlikSaas: jest.fn(),
}));
const QlikSaas = await import('../cloud-repo.js');

jest.unstable_mockModule('../cloud-test-connection.js', () => ({
    qscloudTestConnection: jest.fn(),
}));
const { qscloudTestConnection } = await import('../cloud-test-connection.js');

describe('cloud-collections.js', () => {
    const defaultOptions = {
        tenanturl: 'https://test-tenant.eu.qlikcloud.com',
        apikey: 'test-api-key',
        outputformat: 'table',
        loglevel: 'info',
        collectionid: 'test-collection-id',
    };

    const mockCollections = [
        {
            id: 'test-collection-id',
            name: 'Test Collection',
            description: 'A test collection',
            type: 'app',
            itemCount: 5,
            createdAt: '2023-01-01T00:00:00.000Z',
            updatedAt: '2023-01-02T00:00:00.000Z',
        },
        {
            id: 'another-collection-id',
            name: 'Another Collection',
            description: undefined,
            type: 'app',
            itemCount: 3,
            createdAt: '2023-02-01T00:00:00.000Z',
            updatedAt: '2023-02-02T00:00:00.000Z',
        },
    ];

    let mockGet;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock the Get method of QlikSaas
        // jest.spyOn(QlikSaas, 'Get');

        mockGet = jest.fn().mockResolvedValue(mockCollections);
        QlikSaas.mockImplementation(() => ({
            Get: mockGet,
        }));

        // mockGet = jest.fn().mockResolvedValue(mockCollections);
        // QlikSaas.mockImplementation(() => ({
        //     Get: mockGet,
        // }));

        // Mock the test connection function
        qscloudTestConnection.mockResolvedValue({ name: 'Test User' });
    });

    // describe('qscloudListCollections', () => {
    //     test('should list collections in table format successfully', async () => {
    //         const result = await qscloudListCollections(defaultOptions);

    //         expect(result).toBe(true);
    //         expect(QlikSaas).toHaveBeenCalledWith({
    //             url: defaultOptions.tenanturl,
    //             token: defaultOptions.apikey,
    //         });
    //         expect(setLoggingLevel).toHaveBeenCalledWith(defaultOptions.loglevel);
    //         expect(qscloudTestConnection).toHaveBeenCalled();
    //         expect(mockGet).toHaveBeenCalledWith('collections');
    //         expect(logger.info).toHaveBeenCalled();
    //     });

    //     test('should list collections in JSON format successfully', async () => {
    //         const options = { ...defaultOptions, outputformat: 'json' };
    //         const result = await qscloudListCollections(options);

    //         expect(result).toBe(true);
    //         expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Collections:'));
    //     });

    //     test('should handle error in QlikSaas creation', async () => {
    //         QlikSaas.mockImplementation(() => {
    //             throw new Error('Failed to create QlikSaas instance');
    //         });

    //         const result = await qscloudListCollections(defaultOptions);

    //         expect(result).toBe(false);
    //         expect(logger.error).toHaveBeenCalled();
    //     });

    //     test('should handle error in connection test', async () => {
    //         qscloudTestConnection.mockRejectedValue(new Error('Connection test failed'));

    //         const result = await qscloudListCollections(defaultOptions);

    //         expect(result).toBe(false);
    //         expect(logger.error).toHaveBeenCalled();
    //     });

    //     test('should handle error in fetching collections', async () => {
    //         mockGet.mockRejectedValue(new Error('Failed to fetch collections'));

    //         const result = await qscloudListCollections(defaultOptions);

    //         expect(result).toBe(false);
    //         expect(logger.error).toHaveBeenCalled();
    //     });

    //     test('should handle error with status code in connection test', async () => {
    //         const statusError = new Error('Connection test failed');
    //         statusError.status = 401;
    //         statusError.statusText = 'Unauthorized';
    //         qscloudTestConnection.mockRejectedValue(statusError);

    //         const result = await qscloudListCollections(defaultOptions);

    //         expect(result).toBe(false);
    //         expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('error code'));
    //     });
    // });

    describe('qscloudVerifyCollectionExists', () => {
        test('should return true when collection exists', async () => {
            const result = await qscloudVerifyCollectionExists(defaultOptions);

            expect(result).toBe(true);
            expect(QlikSaas).toHaveBeenCalledWith({
                url: defaultOptions.tenanturl,
                token: defaultOptions.apikey,
            });
            expect(mockGet).toHaveBeenCalledWith('collections');
        });

        // test('should return false when collection does not exist', async () => {
        //     const options = { ...defaultOptions, collectionid: 'non-existent-id' };
        //     const result = await qscloudVerifyCollectionExists(options);

        //     expect(result).toBe(false);
        // });

        // test('should throw error when fetching collections fails', async () => {
        //     mockGet.mockRejectedValue(new Error('Failed to fetch collections'));

        //     await expect(qscloudVerifyCollectionExists(defaultOptions)).rejects.toThrow();
        //     expect(logger.error).toHaveBeenCalled();
        // });
    });
});
