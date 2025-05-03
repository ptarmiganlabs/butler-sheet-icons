// filepath: /Users/goran/code/butler-sheet-icons/src/__tests__/jest.config.test.js
import { test, expect, describe } from '@jest/globals';
import jestConfig from '../../jest.config.js';

describe('Jest Configuration', () => {
    test('should have correct basic configuration properties', () => {
        expect(jestConfig).toHaveProperty('clearMocks');
        expect(jestConfig).toHaveProperty('collectCoverage');
        expect(jestConfig).toHaveProperty('coverageDirectory');
        expect(jestConfig).toHaveProperty('roots');
    });

    test('should collect coverage correctly', () => {
        expect(jestConfig.collectCoverage).toBe(true);
        expect(jestConfig.collectCoverageFrom).toContain('src/**/*.js');
        expect(jestConfig.coverageDirectory).toBe('coverage');
    });

    test('should properly ignore paths for coverage', () => {
        expect(jestConfig.coveragePathIgnorePatterns).toEqual(
            expect.arrayContaining(['/node_modules/', '/build/', '/dist/'])
        );
    });

    test('should use correct root directory', () => {
        expect(jestConfig.rootDir).toBe('.');
        expect(jestConfig.roots).toEqual(['<rootDir>/src']);
    });

    test('should match test files correctly', () => {
        expect(jestConfig.testMatch).toEqual(['**/__tests__/**/*.js', '**/src/**/*.test.js']);
    });

    test('should have appropriate transformation settings', () => {
        expect(jestConfig.transform).toBeDefined();
        expect(jestConfig.transformIgnorePatterns).toBeDefined();
    });
});
