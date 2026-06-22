import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier/flat';
import globals from 'globals';

export default [
    prettierConfig,
    {
        plugins: {
            prettier,
        },

        languageOptions: {
            globals: {
                ...globals.node,
            },

            ecmaVersion: 'latest',
            sourceType: 'module',
        },

        rules: {
            'prettier/prettier': 'error',
        },
    },
];
