import { test, expect, describe } from '@jest/globals';

import eslintConfig from '../../eslint.config.js';

describe('ESLint Configuration', () => {
    test('should export an array configuration', () => {
        expect(Array.isArray(eslintConfig)).toBe(true);
        expect(eslintConfig.length).toBeGreaterThan(0);
    });

    test('should include prettier plugin configuration', () => {
        const pluginConfig = eslintConfig.find(
            (config) => config.plugins && config.plugins.prettier
        );
        expect(pluginConfig).toBeDefined();
    });

    test('should have correct language options', () => {
        const configWithLanguageOptions = eslintConfig.find((config) => config.languageOptions);

        expect(configWithLanguageOptions).toBeDefined();
        expect(configWithLanguageOptions.languageOptions).toHaveProperty('globals');
        expect(configWithLanguageOptions.languageOptions).toHaveProperty('ecmaVersion', 12);
        expect(configWithLanguageOptions.languageOptions).toHaveProperty('sourceType', 'module');
    });

    test('should enforce prettier rules', () => {
        // Find any config object that has the prettier/prettier rule
        const configWithPrettierRules = eslintConfig.find(
            (config) => config.rules && config.rules['prettier/prettier'] === 'error'
        );

        expect(configWithPrettierRules).toBeDefined();
        expect(configWithPrettierRules.rules['prettier/prettier']).toBe('error');
    });
});
