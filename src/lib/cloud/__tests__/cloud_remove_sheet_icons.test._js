// filepath: /Users/goran/code/butler-sheet-icons/src/lib/cloud/__tests__/cloud_remove_sheet_icons.test.js
import { test, expect, describe, jest, beforeEach, afterEach } from '@jest/globals';
import 'dotenv/config';
import enigma from 'enigma.js';

import { qscloudRemoveSheetIcons } from '../cloud-remove-sheet-icons.js';
import { setupEnigmaConnection } from '../cloud-enigma.js';
import QlikSaas from '../cloud-repo.js';
import { qscloudTestConnection } from '../cloud-test-connection.js';

// Mock dependencies
jest.mock('enigma.js');
jest.mock('../cloud-enigma.js');

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

jest.mock('../cloud-repo.js');
jest.mock('../cloud-test-connection.js');

describe('cloud-remove-sheet-icons.js', () => {
    const defaultOptions = {
        tenanturl: 'https://test-tenant.eu.qlikcloud.com',
        apikey: 'test-api-key',
        loglevel: 'info',
        appid: 'test-app-id',
        collectionid: '',
    };

    const collectionOptions = {
        ...defaultOptions,
        appid: '',
        collectionid: 'test-collection-id',
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

    const mockMediaList = [
        {
            type: 'directory',
            name: 'thumbnails',
        },
        {
            type: 'directory',
            name: 'other',
        },
    ];

    const mockThumbnailsList = [
        {
            type: 'image',
            name: 'thumbnail1.png',
        },
        {
            type: 'image',
            name: 'thumbnail2.png',
        },
    ];

    // Mock sheet list
    const mockSheetList = {
        qAppObjectList: {
            qItems: [
                {
                    qInfo: {
                        qId: 'sheet1',
                    },
                    qMeta: {
                        title: 'Sheet 1',
                        description: 'First sheet',
                    },
                    qData: {
                        rank: 1,
                    },
                },
                {
                    qInfo: {
                        qId: 'sheet2',
                    },
                    qMeta: {
                        title: 'Sheet 2',
                        description: 'Second sheet',
                    },
                    qData: {
                        rank: 2,
                    },
                },
            ],
        },
    };

    // Mock sheet properties
    const mockSheetProperties = {
        thumbnail: {
            qStaticContentUrlDef: {
                qUrl: 'some-url',
            },
        },
    };

    let mockSaasInstance;
    let mockGet;
    let mockDelete;
    let mockSession;
    let mockGlobal;
    let mockApp;
    let mockGenericListObj;
    let mockSheetObj;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock QlikSaas methods
        mockGet = jest.fn();
        mockDelete = jest.fn();

        // Set up responses for different API calls
        mockGet.mockImplementation((path) => {
            if (path === 'collections') {
                return Promise.resolve(mockCollections);
            }
            if (path === `collections/${collectionOptions.collectionid}/items`) {
                return Promise.resolve(mockCollectionItems);
            }
            if (path.includes('/media/list') && !path.includes('/thumbnails')) {
                return Promise.resolve(mockMediaList);
            }
            if (path.includes('/media/list/thumbnails')) {
                return Promise.resolve(mockThumbnailsList);
            }
            return Promise.resolve([]);
        });

        mockSaasInstance = {
            Get: mockGet,
            Delete: mockDelete,
        };

        QlikSaas.mockImplementation(() => mockSaasInstance);
        qscloudTestConnection.mockResolvedValue({ name: 'Test User' });

        // Mock Enigma.js
        mockSheetObj = {
            getProperties: jest.fn().mockResolvedValue(mockSheetProperties),
            setProperties: jest.fn().mockResolvedValue({ result: 'success' }),
        };

        mockApp = {
            openDoc: jest.fn(),
            createSessionObject: jest.fn().mockResolvedValue(mockGenericListObj),
            getObject: jest.fn().mockResolvedValue(mockSheetObj),
            doSave: jest.fn().mockResolvedValue(true),
        };

        mockGlobal = {
            engineVersion: jest.fn().mockResolvedValue({ qComponentVersion: '1.0.0' }),
            openDoc: jest.fn().mockResolvedValue(mockApp),
        };

        mockGenericListObj = {
            getLayout: jest.fn().mockResolvedValue(mockSheetList),
        };

        mockSession = {
            open: jest.fn().mockResolvedValue(mockGlobal),
            close: jest.fn().mockResolvedValue(true),
            on: jest.fn(),
        };

        enigma.create.mockResolvedValue(mockSession);
        setupEnigmaConnection.mockReturnValue({});
    });

    test('should remove sheet icons from a specific app', async () => {
        const result = await qscloudRemoveSheetIcons(defaultOptions);

        expect(result).toBe(true);
        expect(setLoggingLevel).toHaveBeenCalledWith(defaultOptions.loglevel);
        expect(QlikSaas).toHaveBeenCalledWith({
            url: defaultOptions.tenanturl,
            token: defaultOptions.apikey,
        });
        expect(qscloudTestConnection).toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledWith(
            'Starting removal of sheet icons for Qlik Sense Cloud'
        );
    });

    test('should remove sheet icons from all apps in a collection', async () => {
        const result = await qscloudRemoveSheetIcons(collectionOptions);

        expect(result).toBe(true);
        expect(mockGet).toHaveBeenCalledWith('collections');
        expect(mockGet).toHaveBeenCalledWith(`collections/${collectionOptions.collectionid}/items`);
        expect(logger.verbose).toHaveBeenCalledWith(expect.stringContaining('exists'));
        expect(logger.verbose).toHaveBeenCalledWith(
            expect.stringContaining('Skipping collection item')
        );
    });

    test('should handle non-existent collection', async () => {
        const options = { ...collectionOptions, collectionid: 'non-existent-id' };

        await expect(qscloudRemoveSheetIcons(options)).resolves.toBe(false);
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('does not exist'));
    });

    test('should handle connection test failure', async () => {
        qscloudTestConnection.mockRejectedValue(new Error('Connection test failed'));

        const result = await qscloudRemoveSheetIcons(defaultOptions);

        expect(result).toBe(false);
        expect(logger.error).toHaveBeenCalled();
    });

    test('should handle error with status code in connection test', async () => {
        const statusError = new Error('Connection test failed');
        statusError.status = 401;
        statusError.statusText = 'Unauthorized';
        qscloudTestConnection.mockRejectedValue(statusError);

        const result = await qscloudRemoveSheetIcons(defaultOptions);

        expect(result).toBe(false);
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('error code'));
    });
});
