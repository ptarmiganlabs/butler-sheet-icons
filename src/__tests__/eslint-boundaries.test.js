import { describe, test, expect, beforeAll } from '@jest/globals';
import { ESLint } from 'eslint';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Behavioural, deliberately. `eslint.config.test.js` beside this asserts the *shape* of the config
// array, which cannot see the failure that matters most here: flat config replaces a rule's options
// rather than merging them, so a second block naming `no-restricted-imports` for the same files
// silently switches the first one off. Measured against this ESLint version - two blocks, and only
// the later block's patterns fired, while every shape assertion still passed. These tests run the
// real config over real source text instead. Issue #1139.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let eslint;

beforeAll(() => {
    eslint = new ESLint({ cwd: repoRoot });
});

/**
 * Lint a snippet as if it were a file at `filePath`, and return the rules that fired.
 *
 * @param {string} code - Source to lint.
 * @param {string} filePath - Repo-relative path to attribute it to, since the rules are path-scoped.
 *
 * @returns {Promise<Array<{ruleId: string, message: string}>>} One entry per message.
 */
const rulesFiredFor = async (code, filePath) => {
    // `filePath` is passed through as given, forward slashes and all. Built with `path.join` it
    // would carry backslashes on Windows, where the unit suite also runs (pr-unit-tests.yaml), and
    // the config scopes every rule with forward-slash globs like `src/**/*.js`.
    const [result] = await eslint.lintText(code, { filePath });

    return result.messages.map(({ ruleId, message }) => ({ ruleId, message }));
};

/**
 * Whether a rule fired, and the message it carried.
 *
 * @param {Array<{ruleId: string, message: string}>} fired - What lint reported.
 * @param {string} ruleId - The rule to look for.
 *
 * @returns {{fired: boolean, message: string}} Whether it fired, and the first message if so.
 */
const forRule = (fired, ruleId) => {
    const hit = fired.find((entry) => entry.ruleId === ruleId);

    return { fired: Boolean(hit), message: hit?.message ?? '' };
};

describe('the extension-point boundary', () => {
    test.each([
        [
            'a relative import of the module',
            "import { extensions } from './lib/extensions/index.js';",
        ],
        ['a deeper relative import', "import { extensions } from '../extensions/index.js';"],
        ['reaching into a subdirectory', "import brand from '../extensions/features/branding.js';"],
    ])('rejects %s', async (_name, code) => {
        const { fired, message } = forRule(
            await rulesFiredFor(code, 'src/lib/probe.js'),
            'no-restricted-imports'
        );

        expect(fired).toBe(true);
        expect(message).toContain('#extensions');
    });

    // no-restricted-imports does not reach a dynamic import, which is why the config carries a
    // second selector for it - the same gap the prompt-library boundary had to close.
    // Both alternatives of the selector, because they are separately fragile: the second embeds a
    // raw `/` inside a character class within an esquery attribute regex, and nothing but a test
    // would notice if a future esquery parsed that differently.
    test.each([
        [
            'the module itself',
            "export const load = async () => import('./lib/extensions/index.js');",
        ],
        [
            'a subdirectory of it',
            "export const load = async () => import('../extensions/features/branding.js');",
        ],
    ])('rejects a dynamic import of %s', async (_name, code) => {
        const { fired, message } = forRule(
            await rulesFiredFor(code, 'src/lib/probe.js'),
            'no-restricted-syntax'
        );

        expect(fired).toBe(true);
        expect(message).toContain('#extensions');
    });

    test.each([
        ['the specifier itself', "import { extensions } from '#extensions';"],
        [
            'the core-side helper beside it',
            "import { applyExtensions } from './lib/extensions/apply.js';",
        ],
        ['the version module', "import { SEAM_VERSION } from './lib/extensions/version.js';"],
    ])('allows %s', async (_name, code) => {
        const fired = await rulesFiredFor(code, 'src/lib/probe.js');

        expect(forRule(fired, 'no-restricted-imports').fired).toBe(false);
        expect(forRule(fired, 'no-restricted-syntax').fired).toBe(false);
    });

    // prompt-runtime.js is exempt from the prompt-library boundary. It must not be exempt from this
    // one as a side effect, which is the only reason the config carries a second block at all.
    test('still applies inside the file the prompt-library boundary exempts', async () => {
        const { fired, message } = forRule(
            await rulesFiredFor(
                "import { extensions } from '../extensions/index.js';",
                'src/lib/interactive/prompt-runtime.js'
            ),
            'no-restricted-imports'
        );

        expect(fired).toBe(true);
        expect(message).toContain('#extensions');
    });
});

describe('the prompt-library boundary still holds', () => {
    // The regression this whole file exists to catch. Adding the seam patterns as a *separate*
    // config block would have switched this off everywhere, and every shape assertion in
    // eslint.config.test.js would still have passed.
    test('rejects a prompt-library import from ordinary source', async () => {
        const { fired, message } = forRule(
            await rulesFiredFor("import { select } from '@inquirer/prompts';", 'src/lib/probe.js'),
            'no-restricted-imports'
        );

        expect(fired).toBe(true);
        expect(message).toContain('prompt-runtime.js');
    });

    test('rejects a dynamic prompt-library import too', async () => {
        const { fired, message } = forRule(
            await rulesFiredFor(
                "export const load = async () => import('@inquirer/prompts');",
                'src/lib/probe.js'
            ),
            'no-restricted-syntax'
        );

        expect(fired).toBe(true);
        expect(message).toContain('prompt-runtime.js');
    });

    test('and still exempts prompt-runtime.js itself', async () => {
        const fired = await rulesFiredFor(
            "import { select } from '@inquirer/prompts';",
            'src/lib/interactive/prompt-runtime.js'
        );

        expect(forRule(fired, 'no-restricted-imports').fired).toBe(false);
    });
});
