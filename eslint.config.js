import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier/flat';
import globals from 'globals';
import jsdoc from 'eslint-plugin-jsdoc';

// Shared by the two rules that enforce the prompt-library boundary, so the two
// halves of one policy cannot drift apart in wording.
const BOUNDARY_MESSAGE =
    'Import prompts through src/lib/interactive/prompt-runtime.js instead. It is the only module allowed to depend on the prompt library, so the library can be replaced by editing one file if it misbehaves inside the SEA binary.';

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
    // The prompt-library boundary for interactive mode (#896).
    //
    // `src/lib/interactive/prompt-runtime.js` is the only file allowed to reach
    // for @inquirer. That isolation is the hedge against the one genuinely
    // unverified risk in the design - raw mode and ANSI redraw inside the SEA
    // binary on a Windows console host - and it is only worth anything if it
    // holds. A rule is the difference between a boundary and a comment: with
    // the import scattered across a dozen wizards, swapping the library means
    // rewriting all of them instead of one file.
    //
    // Placed last, and carrying `files`/`rules` only: src/__tests__/eslint.config.test.js
    // asserts on the *first* entry that has a `languageOptions` key, so a block
    // added above the main one with its own languageOptions would break it.
    {
        files: ['src/**/*.js'],
        ignores: ['src/lib/interactive/prompt-runtime.js'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['@inquirer/*', 'inquirer'],
                            message: BOUNDARY_MESSAGE,
                        },
                    ],
                },
            ],
            // no-restricted-imports covers static imports and `export ... from`
            // only - a dynamic `await import('@inquirer/prompts')` sails past
            // it, verified against this ESLint version. Since the runtime's own
            // lazy load is a dynamic import, that is exactly the form someone
            // would copy into a wizard. This closes the gap.
            'no-restricted-syntax': [
                'error',
                {
                    selector: 'ImportExpression > Literal[value=/^(@inquirer\\/|inquirer$)/]',
                    message: BOUNDARY_MESSAGE,
                },
            ],
        },
    },
];
