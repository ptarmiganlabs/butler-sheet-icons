import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier/flat';
import globals from 'globals';
import jsdoc from 'eslint-plugin-jsdoc';

export default [
    // Correctness rules - no-undef, no-unused-vars and friends. Without these the lint step
    // checks formatting and JSDoc only, so an undefined variable or a stale import passes
    // silently; enabling them caught a real crash on `--blur-sheet-tag` (issue #840).
    js.configs.recommended,
    prettierConfig,
    {
        ignores: ['src/lib/util/import-meta-url.js'],
    },
    jsdoc.configs['flat/recommended'],
    {
        plugins: {
            prettier,
            jsdoc,
        },

        languageOptions: {
            globals: {
                ...globals.node,
            },

            ecmaVersion: 'latest',
            sourceType: 'module',
        },

        settings: {
            jsdoc: {
                mode: 'typescript',
            },
        },

        rules: {
            'prettier/prettier': 'error',
            // Underscore marks a binding that is deliberately unused - typically a Commander
            // `_command` argument kept for symmetry with the other command handlers.
            'no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
            // JSDoc rules
            'jsdoc/tag-lines': ['error', 'any', { startLines: 1 }],
            'jsdoc/require-jsdoc': [
                'error',
                {
                    require: {
                        FunctionDeclaration: true,
                        MethodDefinition: true,
                        ClassDeclaration: true,
                        ArrowFunctionExpression: false,
                        FunctionExpression: false,
                    },
                },
            ],
            'jsdoc/require-description': 'error',
            'jsdoc/require-param': 'error',
            'jsdoc/require-param-description': 'error',
            'jsdoc/require-param-name': 'error',
            'jsdoc/require-param-type': 'error',
            'jsdoc/require-returns': 'error',
            'jsdoc/require-returns-description': 'error',
            'jsdoc/require-returns-type': 'error',
            // Allow `Function` as a type instead of requiring a specific signature
            'jsdoc/reject-function-type': 'off',
        },
    },
];
