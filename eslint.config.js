import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier/flat';
import globals from 'globals';
import jsdoc from 'eslint-plugin-jsdoc';

export default [
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
