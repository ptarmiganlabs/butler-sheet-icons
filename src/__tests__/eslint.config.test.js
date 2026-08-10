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
        expect(configWithLanguageOptions.languageOptions).toHaveProperty('ecmaVersion', 'latest');
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

    describe('the prompt-library boundary (#896)', () => {
        const boundaryConfig = () =>
            eslintConfig.find((config) => config.rules?.['no-restricted-imports']);

        test('restricts the prompt library everywhere under src/', () => {
            const config = boundaryConfig();

            expect(config).toBeDefined();
            expect(config.files).toContain('src/**/*.js');

            const [severity, { patterns }] = config.rules['no-restricted-imports'];
            expect(severity).toBe('error');
            expect(patterns[0].group).toContain('@inquirer/*');
        });

        test('exempts only prompt-runtime.js', () => {
            expect(boundaryConfig().ignores).toEqual(['src/lib/interactive/prompt-runtime.js']);
        });

        test('also guards dynamic import(), which no-restricted-imports does not reach', () => {
            // Verified against this ESLint version: a dynamic
            // `await import('@inquirer/prompts')` sails past no-restricted-imports.
            // Since the runtime's own lazy load takes exactly that form, it is
            // the form someone would copy into a wizard.
            const config = boundaryConfig();
            const [severity, { selector }] = config.rules['no-restricted-syntax'];

            expect(severity).toBe('error');
            expect(selector).toContain('ImportExpression');
            expect(selector).toContain('@inquirer');
        });

        test('both halves of the boundary give the same guidance', () => {
            const config = boundaryConfig();

            expect(config.rules['no-restricted-syntax'][1].message).toBe(
                config.rules['no-restricted-imports'][1].patterns[0].message
            );
        });

        // The trap this ordering exists to avoid: 'should have correct language
        // options' above takes the FIRST entry carrying languageOptions. A block
        // added before the main one, with its own languageOptions, would silently
        // retarget that assertion at the wrong object.
        test('the boundary block carries no languageOptions, and sits after the main block', () => {
            const boundaryIndex = eslintConfig.indexOf(boundaryConfig());
            const mainIndex = eslintConfig.findIndex((config) => config.languageOptions);

            expect(boundaryConfig().languageOptions).toBeUndefined();
            expect(boundaryIndex).toBeGreaterThan(mainIndex);
        });
    });
});
