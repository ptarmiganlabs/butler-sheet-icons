// filepath: /Users/goran/code/butler-sheet-icons/src/__tests__/jest.config.test.js
import { test, expect, describe } from '@jest/globals';
import jestConfig from '../../jest.config.mjs';

describe('Jest Configuration', () => {
    test('should have correct basic configuration properties', () => {
        expect(jestConfig).toHaveProperty('clearMocks');
        expect(jestConfig).toHaveProperty('collectCoverage');
        expect(jestConfig).toHaveProperty('coverageDirectory');
        expect(jestConfig).toHaveProperty('coverageProvider');
        expect(jestConfig).toHaveProperty('testEnvironment', 'node');
        expect(jestConfig).toHaveProperty('roots');
    });

    test('should collect coverage correctly', () => {
        expect(jestConfig.collectCoverage).toBe(true);
        expect(jestConfig.coverageDirectory).toBe('coverage');
    });

    test('should use correct root directory', () => {
        expect(jestConfig.roots).toEqual(['<rootDir>/src']);
    });

    test('should rely on Jest defaults for test discovery', () => {
        // testMatch is unset; Jest defaults include __tests__/ folders and *.test.js files
        expect(jestConfig.testMatch).toBeUndefined();
    });
});
