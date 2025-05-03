// filepath: /Users/goran/code/butler-sheet-icons/src/lib/qseow/__tests__/qseow_process_app.test.js
import { test, expect, describe, jest, beforeEach } from '@jest/globals';
import 'dotenv/config';
import enigma from 'enigma.js';
import puppeteer from 'puppeteer-core';
import fs from 'fs';
// import qrsInteract from 'qrs-interact';
import path from 'path';
import { computeExecutablePath } from '@puppeteer/browsers';
import { Jimp } from 'jimp';

import { qseowProcessApp } from '../qseow-process-app.js';
import { setupEnigmaConnection } from '../qseow-enigma.js';
import { qseowUploadToContentLibrary } from '../qseow-upload.js';
import { qseowUpdateSheetThumbnails } from '../qseow-updatesheets.js';
import { setupQseowQrsConnection } from '../qseow-qrs.js';
import { browserInstall } from '../../browser/browser-install.js';
import { determineSheetExcludeStatus } from '../determine-sheet-exclude-status.js';

// Mock dependencies
jest.mock('enigma.js');
jest.mock('puppeteer-core');
jest.mock('fs');
jest.mock('@puppeteer/browsers');
jest.mock('jimp');
jest.mock('../qseow-enigma.js');

// jest.mock('qrs-interact');
jest.unstable_mockModule('qrs-interact', () => ({
    default: jest.fn(),
}));
const qrsInteract = await import('qrs-interact');

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

jest.mock('../qseow-upload.js');
jest.mock('../qseow-updatesheets.js');
jest.mock('../qseow-qrs.js');
jest.mock('../../browser/browser-install.js');
jest.mock('../determine-sheet-exclude-status.js');

describe('qseow-process-app.js', () => {
    const defaultOptions = {
        senseVersion: '2023-Nov',
        imagedir: './img',
        host: 'test-server.example.com',
        logonuserdir: 'INTERNAL',
        logonuserid: 'sa_api',
        logonpwd: 'password',
        excludeSheetTag: 'exclude-thumbnail',
        excludeSheetNumber: ['2'],
        excludeSheetTitle: ['Excluded Sheet'],
        excludeSheetStatus: ['private'],
        includesheetpart: '1',
        pagewait: 2,
        secure: true,
        prefix: '',
        headless: true,
        blurFactor: 5,
        loglevel: 'info',
    };

    const mockAppMetadata = [
        {
            id: 'test-app-id',
            name: 'Test App',
            published: true,
        },
    ];

    const mockTagSheetAppMetadata = [
        {
            id: 'sheet-id-1',
            engineObjectId: 'engine-sheet-id-1',
            name: 'Sheet 1',
            tags: [{ name: 'exclude-thumbnail' }],
        },
    ];

    const mockSheetMetadata = [
        {
            id: 'sheet-id-1',
            engineObjectId: 'engine-sheet-id-1',
            name: 'Sheet 1',
        },
        {
            id: 'sheet-id-2',
            engineObjectId: 'engine-sheet-id-2',
            name: 'Sheet 2',
        },
    ];

    // Mock sheet list
    const mockSheetList = {
        qAppObjectList: {
            qItems: [
                {
                    qInfo: {
                        qId: 'engine-sheet-id-1',
                    },
                    qMeta: {
                        title: 'Sheet 1',
                        description: 'First sheet',
                        approved: false,
                        published: false,
                    },
                    qData: {
                        rank: 1,
                        showCondition: null,
                    },
                },
                {
                    qInfo: {
                        qId: 'engine-sheet-id-2',
                    },
                    qMeta: {
                        title: 'Sheet 2',
                        description: 'Second sheet',
                        approved: true,
                        published: true,
                    },
                    qData: {
                        rank: 2,
                        showCondition: null,
                    },
                },
            ],
        },
    };

    let mockQrsInstance;
    let mockGet;
    let mockSession;
    let mockGlobal;
    let mockApp;
    let mockGenericListObj;
    let mockBrowser;
    let mockPage;
    let mockSheetMainPart;
    let mockElementHandle;
    let mockJimpInstance;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock QRS Instance and Get method
        mockGet = jest.fn();
        mockGet.mockImplementation((path) => {
            if (path.includes('app?filter=id eq')) {
                return Promise.resolve({ body: mockAppMetadata });
            }
            if (path.includes('tags.name eq')) {
                return Promise.resolve({ body: mockTagSheetAppMetadata });
            }
            if (path.includes('app/object/full?filter=objectType eq')) {
                return Promise.resolve({ body: mockSheetMetadata });
            }
            return Promise.resolve({ body: [] });
        });

        mockQrsInstance = {
            Get: mockGet,
        };

        qrsInteract.mockImplementation(() => mockQrsInstance);
        setupQseowQrsConnection.mockReturnValue({});

        // Mock Enigma.js
        mockGenericListObj = {
            getLayout: jest.fn().mockResolvedValue(mockSheetList),
        };

        mockApp = {
            createSessionObject: jest.fn().mockResolvedValue(mockGenericListObj),
            openDoc: jest.fn(),
            getObject: jest.fn(),
        };

        mockGlobal = {
            engineVersion: jest.fn().mockResolvedValue({ qComponentVersion: '1.0.0' }),
            openDoc: jest.fn().mockResolvedValue(mockApp),
        };

        mockSession = {
            open: jest.fn().mockResolvedValue(mockGlobal),
            close: jest.fn().mockResolvedValue(true),
            on: jest.fn(),
        };

        enigma.create.mockResolvedValue(mockSession);
        setupEnigmaConnection.mockReturnValue({});

        // Mock browser/puppeteer
        mockSheetMainPart = {
            screenshot: jest.fn().mockResolvedValue(true),
        };

        mockElementHandle = [
            {
                click: jest.fn().mockResolvedValue(true),
            },
        ];

        mockPage = {
            setViewport: jest.fn().mockResolvedValue(true),
            setDefaultTimeout: jest.fn().mockResolvedValue(true),
            goto: jest.fn().mockResolvedValue(true),
            waitForNavigation: jest.fn().mockResolvedValue(true),
            screenshot: jest.fn().mockResolvedValue(true),
            click: jest.fn().mockResolvedValue(true),
            keyboard: {
                type: jest.fn().mockResolvedValue(true),
            },
            waitForSelector: jest.fn().mockResolvedValue(true),
            $: jest.fn().mockResolvedValue(mockSheetMainPart),
            $$: jest.fn().mockResolvedValue(mockElementHandle),
        };

        mockBrowser = {
            newPage: jest.fn().mockResolvedValue(mockPage),
            close: jest.fn().mockResolvedValue(true),
        };

        puppeteer.launch.mockResolvedValue(mockBrowser);
        computeExecutablePath.mockReturnValue('/path/to/browser');

        // Mock browser installation
        browserInstall.mockResolvedValue({
            browser: 'chrome',
            buildId: '123456',
        });

        // Mock file system
        fs.mkdirSync.mockReturnValue(true);

        // Mock Jimp
        mockJimpInstance = {
            blur: jest.fn().mockReturnThis(),
            write: jest.fn().mockResolvedValue(true),
        };

        Jimp.read = jest.fn().mockResolvedValue(mockJimpInstance);

        // Mock determine sheet exclude status
        determineSheetExcludeStatus.mockImplementation((app, sheet) => {
            // Exclude the first sheet, include the second
            if (sheet.qInfo.qId === 'engine-sheet-id-1') {
                return Promise.resolve({ excludeSheet: true, sheetIsHidden: false });
            }
            return Promise.resolve({ excludeSheet: false, sheetIsHidden: false });
        });

        // Mock upload and update functions
        qseowUploadToContentLibrary.mockResolvedValue(true);
        qseowUpdateSheetThumbnails.mockResolvedValue(true);
    });

    test('should process an app successfully with valid options', async () => {
        await qseowProcessApp('test-app-id', defaultOptions);

        expect(setupQseowQrsConnection).toHaveBeenCalledWith(defaultOptions);
        expect(qrsInteract).toHaveBeenCalled();
        expect(mockGet).toHaveBeenCalled();
        expect(setupEnigmaConnection).toHaveBeenCalledWith('test-app-id', defaultOptions);
        expect(enigma.create).toHaveBeenCalled();
        expect(fs.mkdirSync).toHaveBeenCalledWith('./img/qseow/test-app-id', { recursive: true });
        expect(browserInstall).toHaveBeenCalledWith(defaultOptions);
        expect(puppeteer.launch).toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Opened app test-app-id'));
    });

    // test('should handle error when creating image directory', async () => {
    //     fs.mkdirSync.mockImplementation(() => {
    //         throw new Error('Directory creation failed');
    //     });

    //     await expect(qseowProcessApp('test-app-id', defaultOptions)).rejects.toThrow(
    //         'Error creating QSEoW image directory'
    //     );

    //     expect(logger.error).toHaveBeenCalledWith(
    //         expect.stringContaining('Error creating QSEoW image directory')
    //     );
    // });

    // test('should handle error when browser installation fails', async () => {
    //     // Save the original process.exit
    //     const originalExit = process.exit;

    //     // Mock process.exit
    //     process.exit = jest.fn();

    //     // Mock browser installation failure
    //     browserInstall.mockResolvedValue(false);

    //     await qseowProcessApp('test-app-id', defaultOptions);

    //     expect(browserInstall).toHaveBeenCalledWith(defaultOptions);
    //     expect(logger.error).toHaveBeenCalledWith(
    //         expect.stringContaining('Error installing browser')
    //     );
    //     expect(process.exit).toHaveBeenCalledWith(1);

    //     // Restore the original process.exit
    //     process.exit = originalExit;
    // });

    // test('should handle error when browser launch fails', async () => {
    //     // Save the original process.exit
    //     const originalExit = process.exit;

    //     // Mock process.exit
    //     process.exit = jest.fn();

    //     // Mock browser launch failure
    //     puppeteer.launch.mockRejectedValue(new Error('Browser launch failed'));

    //     await qseowProcessApp('test-app-id', defaultOptions);

    //     expect(browserInstall).toHaveBeenCalledWith(defaultOptions);
    //     expect(logger.error).toHaveBeenCalledWith(
    //         expect.stringContaining('Could not launch virtual browser')
    //     );
    //     expect(process.exit).toHaveBeenCalledWith(1);

    //     // Restore the original process.exit
    //     process.exit = originalExit;
    // });

    // test('should exclude sheets according to determineSheetExcludeStatus result', async () => {
    //     await qseowProcessApp('test-app-id', defaultOptions);

    //     // Sheet 1 should be excluded, Sheet 2 should be processed
    //     expect(mockPage.$).toHaveBeenCalledTimes(1); // Only one sheet should be processed
    //     expect(mockSheetMainPart.screenshot).toHaveBeenCalledTimes(1);
    //     expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Excluded sheet'));
    //     expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Processing sheet'));
    // });

    // test('should create blurred versions of screenshots', async () => {
    //     await qseowProcessApp('test-app-id', defaultOptions);

    //     expect(Jimp.read).toHaveBeenCalled();
    //     expect(mockJimpInstance.blur).toHaveBeenCalledWith(5); // Using the blurFactor from options
    //     expect(mockJimpInstance.write).toHaveBeenCalled();
    // });

    // test('should handle error when creating blurred image', async () => {
    //     Jimp.read.mockRejectedValue(new Error('Image processing failed'));

    //     await qseowProcessApp('test-app-id', defaultOptions);

    //     expect(logger.error).toHaveBeenCalledWith(
    //         expect.stringContaining('Failed to create blurred image')
    //     );
    // });

    // test('should upload images to content library', async () => {
    //     await qseowProcessApp('test-app-id', defaultOptions);

    //     expect(qseowUploadToContentLibrary).toHaveBeenCalled();
    //     expect(qseowUpdateSheetThumbnails).toHaveBeenCalled();
    // });

    // test('should handle error when hub navigation fails', async () => {
    //     mockPage.goto.mockImplementation((url) => {
    //         if (url.includes('hub')) {
    //             return Promise.reject(new Error('Hub navigation failed'));
    //         }
    //         return Promise.resolve();
    //     });

    //     await qseowProcessApp('test-app-id', defaultOptions);

    //     expect(logger.error).toHaveBeenCalledWith(
    //         expect.stringContaining('Could not open hub after generating thumbnail images')
    //     );
    // });

    // test('should handle error when clicking user button in hub fails', async () => {
    //     mockPage.waitForSelector.mockImplementation((selector) => {
    //         if (selector.includes('hub-toolbar')) {
    //             throw new Error('Element not found');
    //         }
    //         return Promise.resolve();
    //     });

    //     await qseowProcessApp('test-app-id', defaultOptions);

    //     expect(logger.error).toHaveBeenCalledWith(
    //         expect.stringContaining('Error waiting for, or clicking, user button')
    //     );
    // });

    // test('should handle error when clicking logout button fails', async () => {
    //     mockPage.$$.mockImplementation((selector) => {
    //         if (selector.includes('logout')) {
    //             throw new Error('Element not found');
    //         }
    //         return mockElementHandle;
    //     });

    //     await qseowProcessApp('test-app-id', defaultOptions);

    //     expect(logger.error).toHaveBeenCalledWith(
    //         expect.stringContaining('Error while waiting for, or clicking, logout button')
    //     );
    // });

    // test('should handle error when closing browser fails', async () => {
    //     mockBrowser.close.mockRejectedValue(new Error('Browser close failed'));

    //     await qseowProcessApp('test-app-id', defaultOptions);

    //     expect(logger.error).toHaveBeenCalledWith(
    //         expect.stringContaining('Could not close virtual browser')
    //     );
    // });

    // test('should handle different headless options', async () => {
    //     // Test with headless as boolean true
    //     await qseowProcessApp('test-app-id', { ...defaultOptions, headless: true });
    //     expect(puppeteer.launch).toHaveBeenCalledWith(expect.objectContaining({ headless: 'new' }));

    //     // Reset mocks
    //     jest.clearAllMocks();

    //     // Test with headless as string 'false'
    //     await qseowProcessApp('test-app-id', { ...defaultOptions, headless: 'false' });
    //     expect(puppeteer.launch).toHaveBeenCalledWith(expect.objectContaining({ headless: false }));
    // });

    // test('should use correct includesheetpart selector', async () => {
    //     // Test with includesheetpart = '1'
    //     await qseowProcessApp('test-app-id', { ...defaultOptions, includesheetpart: '1' });
    //     expect(mockPage.waitForSelector).toHaveBeenCalledWith('#grid-wrap');

    //     // Reset mocks
    //     jest.clearAllMocks();

    //     // Test with includesheetpart = '2'
    //     await qseowProcessApp('test-app-id', { ...defaultOptions, includesheetpart: '2' });
    //     expect(mockPage.waitForSelector).toHaveBeenCalledWith(
    //         '#qv-stage-container > div > div.qv-panel-content.flex-row'
    //     );

    //     // Reset mocks
    //     jest.clearAllMocks();

    //     // Test with includesheetpart = '3'
    //     await qseowProcessApp('test-app-id', { ...defaultOptions, includesheetpart: '3' });
    //     expect(mockPage.waitForSelector).toHaveBeenCalledWith('#qv-stage-container > div');

    //     // Reset mocks
    //     jest.clearAllMocks();

    //     // Test with includesheetpart = '4'
    //     await qseowProcessApp('test-app-id', { ...defaultOptions, includesheetpart: '4' });
    //     expect(mockPage.waitForSelector).toHaveBeenCalledWith('#qv-page-container');
    // });

    // test('should handle error in overall process', async () => {
    //     setupQseowQrsConnection.mockImplementation(() => {
    //         throw new Error('QRS connection failed');
    //     });

    //     await qseowProcessApp('test-app-id', defaultOptions);

    //     expect(logger.error).toHaveBeenCalledWith(
    //         expect.stringContaining('QSEOW: qseowProcessApp')
    //     );
    // });

    // test('should handle invalid sense version', async () => {
    //     // Save the original process.exit
    //     const originalExit = process.exit;

    //     // Mock process.exit
    //     process.exit = jest.fn();

    //     await qseowProcessApp('test-app-id', {
    //         ...defaultOptions,
    //         senseVersion: 'invalid-version',
    //     });

    //     expect(logger.error).toHaveBeenCalledWith(
    //         expect.stringContaining('Invalid Sense version specified')
    //     );
    //     expect(process.exit).toHaveBeenCalledWith(1);

    //     // Restore the original process.exit
    //     process.exit = originalExit;
    // });

    // test('should handle different sense versions', async () => {
    //     const testVersions = [
    //         'pre-2022-Nov',
    //         '2022-Nov',
    //         '2023-Feb',
    //         '2023-May',
    //         '2023-Aug',
    //         '2023-Nov',
    //         '2024-Feb',
    //         '2024-May',
    //         '2024-Nov',
    //     ];

    //     for (const version of testVersions) {
    //         jest.clearAllMocks();
    //         await qseowProcessApp('test-app-id', { ...defaultOptions, senseVersion: version });
    //         expect(logger.error).not.toHaveBeenCalledWith(
    //             expect.stringContaining('Invalid Sense version specified')
    //         );
    //     }
    // });
});
