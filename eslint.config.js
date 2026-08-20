import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier/flat';
import globals from 'globals';
import jsdoc from 'eslint-plugin-jsdoc';

// Shared by the two rules that enforce the prompt-library boundary, so the two
// halves of one policy cannot drift apart in wording.
const BOUNDARY_MESSAGE =
    'Import prompts through src/lib/interactive/prompt-runtime.js instead. It is the only module allowed to depend on the prompt library, so the library can be replaced by editing one file if it misbehaves inside the SEA binary.';

// Shared by the two blocks that enforce the extension-point boundary, so the exemption for
// prompt-runtime.js below cannot quietly become an exemption from this rule too. Issue #1139.
const SEAM_MESSAGE =
    'Import the extension point through the `#extensions` specifier instead. A relative path resolves under node and Jest, so it passes every test, and then silently ignores the build-time override - esbuild cannot alias a relative specifier. The failure appears only inside the packaged binary. Nothing under src/lib/extensions/ is reachable from core except `#extensions`, and apply.js and version.js beside it.';

/**
 * The extension-point boundary, as no-restricted-imports patterns.
 *
 * `**\/extensions/index.js` catches the module being imported by path rather than through the
 * specifier. `**\/extensions/*\/**` catches anything reaching into a subdirectory of it - a
 * directory an override build replaces wholesale, so a file core imports from inside it is either
 * unversioned contract surface or half of a split the build did not intend.
 *
 * `apply.js` and `version.js` are deliberately absent: both are core-side code that lives beside
 * the seam rather than behind it, and core imports them by path today.
 *
 * **Do not anchor these on `lib/extensions/` to make them more specific.** These patterns match the
 * import *string*, not the resolved path, and a sibling module writes `../extensions/index.js` with
 * no `lib/` in it at all - which is exactly how `src/lib/interactive/index.js` would reach the seam.
 * Measured: `**\/lib/extensions/index.js` catches `./lib/extensions/index.js` and misses
 * `../extensions/index.js`, so tightening the anchor opens the more likely hole of the two.
 *
 * The accepted cost is that a future directory named `extensions` anywhere under `src/` inherits
 * this rule. There is none today; if one appears, rename it or scope this block by `files`.
 */
const SEAM_IMPORT_PATTERNS = [
    {
        group: ['**/extensions/index.js', '**/extensions/*/**'],
        message: SEAM_MESSAGE,
    },
];

/** The dynamic-import half of the same boundary. See the note on the prompt-library selector. */
const SEAM_IMPORT_SELECTOR = {
    selector: 'ImportExpression > Literal[value=/extensions\\/(index\\.js|[^/]+\\/)/]',
    message: SEAM_MESSAGE,
};

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
                        ...SEAM_IMPORT_PATTERNS,
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
                SEAM_IMPORT_SELECTOR,
            ],
        },
    },

    // The extension-point boundary for the one file the block above exempts (#1139).
    //
    // Both boundaries have to be declared in the *same* rule for any given file, because flat
    // config replaces a rule's options rather than merging them: a second block naming
    // `no-restricted-imports` for the same files silently switches the first one off. Measured
    // against this ESLint version - two blocks, and only the later block's patterns fired.
    //
    // So the block above carries both, and this one exists solely because that block ignores
    // prompt-runtime.js and would therefore exempt it from the seam boundary as a side effect.
    // Same patterns, from the same constant, so the two cannot drift.
    {
        files: ['src/lib/interactive/prompt-runtime.js'],
        rules: {
            'no-restricted-imports': ['error', { patterns: SEAM_IMPORT_PATTERNS }],
            'no-restricted-syntax': ['error', SEAM_IMPORT_SELECTOR],
        },
    },
];
