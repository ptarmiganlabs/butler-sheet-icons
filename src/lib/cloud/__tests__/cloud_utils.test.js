import { test, expect, describe, jest, beforeEach } from '@jest/globals';
import 'dotenv/config';

// Import the function to be tested
import { shouldProcessSheet } from '../cloud-utils.js';

describe('cloud-utils.js', () => {
    const mockLogger = {
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('shouldProcessSheet', () => {
        const createSheet = (
            published = false,
            approved = false,
            title = 'Test Sheet',
            showCondition = undefined
        ) => ({
            qMeta: {
                published,
                approved,
                title,
            },
            qData: {
                showCondition,
            },
        });

        // Basic cases
        test('should process a regular sheet with no exclusions', () => {
            const sheet = createSheet();
            const options = { excludeSheetStatus: [] };

            const result = shouldProcessSheet(sheet, 1, options, false, mockLogger);

            expect(result).toBe(true);
            expect(mockLogger.verbose).not.toHaveBeenCalled();
        });

        // Status-based exclusions
        test('should exclude private sheet when excludeSheetStatus includes private', () => {
            const sheet = createSheet(false, false); // private sheet
            const options = { excludeSheetStatus: ['private'] };

            const result = shouldProcessSheet(sheet, 1, options, false, mockLogger);

            expect(result).toBe(false);
            expect(mockLogger.verbose).toHaveBeenCalledWith(expect.stringContaining('private'));
        });

        test('should exclude published sheet when excludeSheetStatus includes published and app is published', () => {
            const sheet = createSheet(true, false); // published sheet
            const options = { excludeSheetStatus: ['published'] };

            const result = shouldProcessSheet(sheet, 1, options, true, mockLogger);

            expect(result).toBe(false);
            expect(mockLogger.verbose).toHaveBeenCalledWith(expect.stringContaining('published'));
        });

        test('should exclude public sheet when excludeSheetStatus includes public and app is published', () => {
            const sheet = createSheet(true, true); // public sheet
            const options = { excludeSheetStatus: ['public'] };

            const result = shouldProcessSheet(sheet, 1, options, true, mockLogger);

            expect(result).toBe(false);
            expect(mockLogger.verbose).toHaveBeenCalledWith(expect.stringContaining('public'));
        });

        test('should exclude public sheet when excludeSheetStatus includes public and app is not published', () => {
            const sheet = createSheet(true, false); // would be public in a published app
            const options = { excludeSheetStatus: ['public'] };

            const result = shouldProcessSheet(sheet, 1, options, false, mockLogger);

            expect(result).toBe(false);
            expect(mockLogger.verbose).toHaveBeenCalledWith(expect.stringContaining('public'));
        });

        // Hidden sheet exclusion
        test('should exclude hidden sheet', () => {
            const sheet = createSheet(false, false, 'Hidden Sheet', 'false');
            const options = { excludeSheetStatus: [] };

            const result = shouldProcessSheet(sheet, 1, options, false, mockLogger);

            expect(result).toBe(false);
            expect(mockLogger.verbose).toHaveBeenCalledWith(expect.stringContaining('hidden'));
        });

        // Sheet number exclusion
        test('should exclude sheet based on sheet number', () => {
            const sheet = createSheet();
            const options = {
                excludeSheetStatus: [],
                excludeSheetNumber: ['1', '3'],
            };

            const result = shouldProcessSheet(sheet, 1, options, false, mockLogger);

            expect(result).toBe(false);
            expect(mockLogger.verbose).toHaveBeenCalledWith(
                expect.stringContaining('sheet number')
            );
        });

        // Sheet title exclusion
        test('should exclude sheet based on sheet title', () => {
            const sheet = createSheet(false, false, 'Excluded Title');
            const options = {
                excludeSheetStatus: [],
                excludeSheetTitle: ['Excluded Title', 'Another Title'],
            };

            const result = shouldProcessSheet(sheet, 1, options, false, mockLogger);

            expect(result).toBe(false);
            expect(mockLogger.verbose).toHaveBeenCalledWith(expect.stringContaining('sheet title'));
        });

        // Multiple exclusion criteria
        test('should prioritize status exclusion over other criteria', () => {
            const sheet = createSheet(false, false); // private sheet
            const options = {
                excludeSheetStatus: ['private'],
                excludeSheetNumber: ['2'],
                excludeSheetTitle: ['Another Title'],
            };

            const result = shouldProcessSheet(sheet, 1, options, false, mockLogger);

            expect(result).toBe(false);
            expect(mockLogger.verbose).toHaveBeenCalledWith(expect.stringContaining('private'));
            expect(mockLogger.verbose).not.toHaveBeenCalledWith(
                expect.stringContaining('sheet number')
            );
            expect(mockLogger.verbose).not.toHaveBeenCalledWith(
                expect.stringContaining('sheet title')
            );
        });

        // Edge cases
        test('should handle undefined qMeta properties', () => {
            const sheet = {
                qData: {},
            };
            const options = { excludeSheetStatus: ['private'] };

            const result = shouldProcessSheet(sheet, 1, options, false, mockLogger);

            expect(result).toBe(false);
        });

        test('should handle undefined exclusion arrays in options', () => {
            const sheet = createSheet();
            const options = {};

            const result = shouldProcessSheet(sheet, 1, options, false, mockLogger);

            expect(result).toBe(true);
        });
    });
});
