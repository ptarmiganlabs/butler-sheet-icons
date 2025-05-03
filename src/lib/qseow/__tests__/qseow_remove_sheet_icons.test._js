// filepath: /Users/goran/code/butler-sheet-icons/src/lib/qseow/__tests__/qseow_remove_sheet_icons.test.js
import { test, expect, describe, jest, beforeEach } from '@jest/globals';
import 'dotenv/config';
import enigma from 'enigma.js';
import qrsInteract from 'qrs-interact';

import { qseowRemoveSheetIcons } from '../qseow-remove-sheet-icons.js';
import { setupEnigmaConnection } from '../qseow-enigma.js';
import { qseowVerifyCertificatesExist } from '../qseow-certificates.js';
import { setupQseowQrsConnection } from '../qseow-qrs.js';
import { logger, setLoggingLevel } from '../../../globals.js';

// Mock dependencies
jest.mock('enigma.js');
jest.mock('qrs-interact');
jest.mock('../qseow-enigma.js');
jest.mock('../qseow-certificates.js');
jest.mock('../qseow-qrs.js');
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

describe('qseow-remove-sheet-icons.js', () => {
    const defaultOptions = {
        host: 'test-server.example.com',
        engineport: '4747',
        qrsport: '4242',
        senseVersion: '2023-Nov',
        loglevel: 'info',
        appid: 'test-app-id',
        qliksensetag: '',
        secure: true,
        prefix: '',
        rejectUnauthorized: false,
        apiuserdir: 'INTERNAL',
        apiuserid: 'sa_api',
        certfile: './cert/client.pem',
        certkeyfile: './cert/client_key.pem',
    };

    const tagOptions = {
        ...defaultOptions,
        appid: '',
        qliksensetag: 'test-tag',
    };

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
                        approved: false,
                        published: false,
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
                        approved: true,
                        published: true,
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

    let mockSession;
    let mockGlobal;
    let mockApp;
    let mockGenericListObj;
    let mockSheetObj;
    let mockQrsInstance;
    let mockGet;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock sheet object
        mockSheetObj = {
            getProperties: jest.fn().mockResolvedValue(mockSheetProperties),
            setProperties: jest.fn().mockResolvedValue({ result: 'success' }),
        };

        // Mock app
        mockApp = {
            createSessionObject: jest.fn().mockResolvedValue(mockGenericListObj),
            getObject: jest.fn().mockResolvedValue(mockSheetObj),
            doSave: jest.fn().mockResolvedValue(true),
        };

        // Mock global
        mockGlobal = {
            engineVersion: jest.fn().mockResolvedValue({ qComponentVersion: '1.0.0' }),
            openDoc: jest.fn().mockResolvedValue(mockApp),
        };

        // Mock generic list object
        mockGenericListObj = {
            getLayout: jest.fn().mockResolvedValue(mockSheetList),
        };

        // Mock enigma session
        mockSession = {
            open: jest.fn().mockResolvedValue(mockGlobal),
            close: jest.fn().mockResolvedValue(true),
            on: jest.fn(),
        };

        // Mock QRS get method
        mockGet = jest.fn().mockResolvedValue({
            body: [
                { id: 'app-id-1', name: 'App 1' },
                { id: 'app-id-2', name: 'App 2' },
            ],
        });

        // Mock QRS instance
        mockQrsInstance = {
            Get: mockGet,
        };

        // Set up mocks
        enigma.create.mockResolvedValue(mockSession);
        setupEnigmaConnection.mockReturnValue({});
        qseowVerifyCertificatesExist.mockResolvedValue(true);
        setupQseowQrsConnection.mockReturnValue({});
        qrsInteract.mockImplementation(() => mockQrsInstance);
    });

    test('should remove sheet icons from a specific app', async () => {
        const result = await qseowRemoveSheetIcons(defaultOptions);

        expect(result).toBe(true);
        expect(setLoggingLevel).toHaveBeenCalledWith(defaultOptions.loglevel);
        expect(qseowVerifyCertificatesExist).toHaveBeenCalledWith(defaultOptions);
        expect(logger.info).toHaveBeenCalledWith(
            expect.stringContaining('Starting creation of thumbnails')
        );
        expect(logger.verbose).toHaveBeenCalledWith(
            expect.stringContaining('Certificate files found')
        );
        expect(enigma.create).toHaveBeenCalled();
        expect(logger.debug).toHaveBeenCalledWith(
            expect.stringContaining('Will process these app IDs:')
        );
    });

    test('should remove sheet icons from all apps with a specific tag', async () => {
        const result = await qseowRemoveSheetIcons(tagOptions);

        expect(result).toBe(true);
        expect(setupQseowQrsConnection).toHaveBeenCalledWith(tagOptions);
        expect(qrsInteract).toHaveBeenCalled();
        expect(mockGet).toHaveBeenCalledWith(
            expect.stringContaining(`app/full?filter=tags.name eq '${tagOptions.qliksensetag}'`)
        );
        expect(enigma.create).toHaveBeenCalled();
    });

    test('should handle missing certificate files', async () => {
        qseowVerifyCertificatesExist.mockResolvedValue(false);

        await expect(qseowRemoveSheetIcons(defaultOptions)).resolves.toBe(false);
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('Missing certificate file')
        );
    });

    test('should handle error in processing an app', async () => {
        // Mock an error when opening a session
        enigma.create.mockRejectedValueOnce(new Error('Failed to create session'));

        const result = await qseowRemoveSheetIcons(defaultOptions);

        expect(result).toBe(true); // Main function should still return true as it catches errors
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('QSEOW PROCESS APP'));
    });

    test('should handle overall process error', async () => {
        // Mock a general error
        qseowVerifyCertificatesExist.mockRejectedValue(new Error('General error'));

        const result = await qseowRemoveSheetIcons(defaultOptions);

        expect(result).toBe(false);
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('QSEOW REMOVE THUMBNAILS')
        );
    });

    test('should correctly sort sheets by rank', async () => {
        // Reverse order to test sorting
        mockGenericListObj.getLayout.mockResolvedValue({
            qAppObjectList: {
                qItems: [
                    { ...mockSheetList.qAppObjectList.qItems[1] }, // Rank 2
                    { ...mockSheetList.qAppObjectList.qItems[0] }, // Rank 1
                ],
            },
        });

        const result = await qseowRemoveSheetIcons(defaultOptions);

        expect(result).toBe(true);
        // Since the sheets should be sorted, the first sheet processed should be rank 1
        expect(mockApp.getObject).toHaveBeenNthCalledWith(1, 'sheet1');
    });

    test('should process both specific app ID and tagged apps without duplicates', async () => {
        // Set up a scenario where both appid and qliksensetag are provided
        // and one of the tagged apps matches the specific appid
        const combinedOptions = {
            ...defaultOptions,
            appid: 'app-id-1',
            qliksensetag: 'test-tag',
        };

        const result = await qseowRemoveSheetIcons(combinedOptions);

        expect(result).toBe(true);
        expect(logger.debug).toHaveBeenCalledWith('app-id-1');
        expect(logger.debug).toHaveBeenCalledWith('app-id-2');
        // Each app should only be processed once, even if it matches both criteria
        expect(enigma.create).toHaveBeenCalledTimes(2);
    });

    test('should clear sheet icon URLs properly', async () => {
        const result = await qseowRemoveSheetIcons(defaultOptions);

        expect(result).toBe(true);
        expect(mockSheetObj.setProperties).toHaveBeenCalledWith(
            expect.objectContaining({
                thumbnail: {
                    qStaticContentUrlDef: {
                        qUrl: '',
                    },
                },
            })
        );
        expect(mockApp.doSave).toHaveBeenCalled();
    });

    test('should handle session close failure gracefully', async () => {
        mockSession.close.mockResolvedValue(false);

        const result = await qseowRemoveSheetIcons(defaultOptions);

        expect(result).toBe(true);
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error closing session'));
    });

    test('should handle case where no sheets exist in an app', async () => {
        mockGenericListObj.getLayout.mockResolvedValue({
            qAppObjectList: {
                qItems: [],
            },
        });

        const result = await qseowRemoveSheetIcons(defaultOptions);

        expect(result).toBe(true);
        expect(mockSheetObj.setProperties).not.toHaveBeenCalled();
        expect(mockApp.doSave).not.toHaveBeenCalled();
    });
});
