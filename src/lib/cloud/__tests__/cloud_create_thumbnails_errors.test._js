// filepath: /Users/goran/code/butler-sheet-icons/src/lib/cloud/__tests__/cloud_create_thumbnails_errors.test.js
import { test, expect, describe, jest, beforeEach } from '@jest/globals';
import 'dotenv/config';

import { qscloudCreateThumbnails } from '../cloud-create-thumbnails.js';
import QlikSaas from '../cloud-repo.js';
import { qscloudTestConnection } from '../cloud-test-connection.js';
import { processCloudApp } from '../process-cloud-app.js';
import { logger, setLoggingLevel } from '../../../globals.js';

// Mock dependencies
jest.mock('../cloud-repo.js');
jest.mock('../cloud-test-connection.js');
jest.mock('../process-cloud-app.js');
jest.mock('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
    },
    setLoggingLevel: jest.fn(),
    bsiExecutablePath: '/path/to/executable',
    isSea: false,
}));

describe('cloud-create-thumbnails.js error cases', () => {
    const defaultOptions = {
        tenanturl: 'https://test-tenant.eu.qlikcloud.com',
        apikey: 'test-api-key',
        loglevel: 'info',
        logonuserid: 'test-user',
        logonpwd: 'password',
        collectionid: '',
        appid: 'test-app-id',
        imagedir: './img',
        includesheetpart: '1',
        schemaversion: '12.612.0',
        browser: 'chrome',
        browserVersion: 'latest',
        headless: true,
        pagewait: 5,
    };

    const mockCollections = [
        {
            id: 'test-collection-id',
            name: 'Test Collection',
        },
        {
            id: 'another-collection-id',
            name: 'Another Collection',
        },
    ];

    const mockCollectionItems = [
        {
            id: 'item1',
            resourceType: 'app',
            resourceAttributes: {
                id: 'app-id-1',
            },
        },
        {
            id: 'item2',
            resourceType: 'not-an-app',
            resourceAttributes: {
                id: 'not-app-id',
            },
        },
        {
            id: 'item3',
            resourceType: 'app',
            resourceAttributes: {
                id: 'app-id-2',
            },
        },
    ];

    let mockGet;
    let mockSaasInstance;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock QlikSaas methods
        mockGet = jest.fn();
        mockGet.mockImplementation((path) => {
            if (path === 'collections') {
                return Promise.resolve(mockCollections);
            }
            if (path === `collections/test-collection-id/items`) {
                return Promise.resolve(mockCollectionItems);
            }
            return Promise.resolve([]);
        });

        mockSaasInstance = {
            Get: mockGet,
        };

        QlikSaas.mockImplementation(() => mockSaasInstance);
        qscloudTestConnection.mockResolvedValue({ name: 'Test User' });
        processCloudApp.mockResolvedValue(true);
    });

    test('should handle invalid includesheetpart parameter', async () => {
        const options = { ...defaultOptions, includesheetpart: '3' }; // Invalid value

        const result = await qscloudCreateThumbnails(options);

        expect(result).toBe(false);
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('Invalid --includesheetpart')
        );
    });

    test('should handle connection test failure', async () => {
        qscloudTestConnection.mockRejectedValue(new Error('Connection test failed'));

        const result = await qscloudCreateThumbnails(defaultOptions);

        expect(result).toBe(false);
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('TEST CONNECTIVITY 1'));
    });

    test('should handle connection test failure with status code', async () => {
        const statusError = new Error('Connection test failed');
        statusError.status = 401;
        statusError.statusText = 'Unauthorized';
        qscloudTestConnection.mockRejectedValue(statusError);

        const result = await qscloudCreateThumbnails(defaultOptions);

        expect(result).toBe(false);
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('error code'));
    });

    test('should handle non-existent collection', async () => {
        const options = { ...defaultOptions, appid: '', collectionid: 'non-existent-id' };

        await expect(qscloudCreateThumbnails(options)).resolves.toBe(false);
        expect(mockGet).toHaveBeenCalledWith('collections');
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('does not exist'));
    });

    test('should skip non-app items in a collection', async () => {
        const options = { ...defaultOptions, appid: '', collectionid: 'test-collection-id' };

        const result = await qscloudCreateThumbnails(options);

        expect(result).toBe(true);
        expect(logger.verbose).toHaveBeenCalledWith(
            expect.stringContaining('Skipping collection item')
        );
        // Should process only the two app items from the collection
        expect(processCloudApp).toHaveBeenCalledTimes(2);
    });

    test('should handle error in processCloudApp', async () => {
        processCloudApp.mockRejectedValueOnce(new Error('Process app failed'));

        const result = await qscloudCreateThumbnails(defaultOptions);

        expect(result).toBe(true); // The main function should still return true as it catches errors
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('CLOUD PROCESS APP'));
    });

    test('should deduplicate app IDs when both appid and collectionid are specified', async () => {
        // Set up a scenario where both appid and collectionid are provided
        // and the specific appid is also part of the collection
        const options = {
            ...defaultOptions,
            appid: 'app-id-1', // This app ID is also in the collection
            collectionid: 'test-collection-id',
        };

        const result = await qscloudCreateThumbnails(options);

        expect(result).toBe(true);
        // Should only process unique app IDs (app-id-1 should only be processed once)
        expect(processCloudApp).toHaveBeenCalledTimes(2);
        expect(processCloudApp).toHaveBeenCalledWith('app-id-1', mockSaasInstance, options);
        expect(processCloudApp).toHaveBeenCalledWith('app-id-2', mockSaasInstance, options);
    });

    test('should handle empty app list gracefully', async () => {
        const options = { ...defaultOptions, appid: '', collectionid: '' };

        const result = await qscloudCreateThumbnails(options);

        expect(result).toBe(true);
        expect(processCloudApp).not.toHaveBeenCalled();
    });

    test('should handle different logLevel property name', async () => {
        const options = { ...defaultOptions, loglevel: undefined, logLevel: 'debug' };

        const result = await qscloudCreateThumbnails(options);

        expect(result).toBe(true);
        expect(setLoggingLevel).toHaveBeenCalledWith('debug');
    });
});
