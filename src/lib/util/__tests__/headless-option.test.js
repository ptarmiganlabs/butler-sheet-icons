import { describe, test, expect } from '@jest/globals';
import { parseHeadlessOption } from '../headless-option.js';

describe('headless-option', () => {
    describe('parseHeadlessOption', () => {
        test('boolean true maps to true (Puppeteer v25 default)', () => {
            expect(parseHeadlessOption(true)).toBe(true);
        });

        test('string "true" maps to true', () => {
            expect(parseHeadlessOption('true')).toBe(true);
        });

        test('boolean false maps to false (headed mode)', () => {
            expect(parseHeadlessOption(false)).toBe(false);
        });

        test('string "false" maps to false (headed mode)', () => {
            expect(parseHeadlessOption('false')).toBe(false);
        });

        test('undefined defaults to true (headless mode)', () => {
            expect(parseHeadlessOption(undefined)).toBe(true);
        });

        test('unknown string values default to true (headless mode)', () => {
            expect(parseHeadlessOption('yes')).toBe(true);
            expect(parseHeadlessOption('')).toBe(true);
        });
    });
});
