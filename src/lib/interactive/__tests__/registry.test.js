import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { everyLeafCommand } from '../command-tree.js';
import { specsFromCommand } from '../option-introspect.js';
import { INTERACTIVE_COMMANDS, NOT_INTERACTIVE, loadWizard } from '../registry.js';
import { isInteractiveOption, INTERACTIVE_OPTION_ATTRIBUTE } from '../interactive-option.js';

const REGISTRY_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'registry.js');
const REGISTERED = Object.keys(INTERACTIVE_COMMANDS);

describe('every command is accounted for', () => {
    // The guard that makes "modular and extensible" a property of the repo
    // rather than a hope: a command added with no wizard fails here until
    // somebody decides which it is.
    test.each(everyLeafCommand().map(({ path }) => [path]))(
        '%s is either registered or explicitly excluded',
        (path) => {
            const registered = path in INTERACTIVE_COMMANDS;
            const excluded = path in NOT_INTERACTIVE;

            expect(`${path}: ${registered || excluded}`).toBe(`${path}: true`);
            expect(registered && excluded).toBe(false);
        }
    );

    test('nothing is registered or excluded that is not a real command', () => {
        const known = new Set(everyLeafCommand().map(({ path }) => path));

        for (const path of [...REGISTERED, ...Object.keys(NOT_INTERACTIVE)]) {
            expect(`${path}: ${known.has(path)}`).toBe(`${path}: true`);
        }
    });

    test('every exclusion says why, so the list cannot become a dumping ground', () => {
        for (const [path, reason] of Object.entries(NOT_INTERACTIVE)) {
            expect(`${path}: ${reason.length > 20}`).toBe(`${path}: true`);
        }
    });
});

describe('-i is offered exactly where a wizard exists', () => {
    // Two failures this rules out, one in each direction. A command advertising
    // -i with no wizard behind it reaches loadWizard() and throws at the moment
    // the user asked for help. A command with a wizard but no -i leaves the
    // wizard reachable only through the `interactive` menu, which is the gap
    // this phase exists to close.
    test.each(everyLeafCommand().map(({ path, command }) => [path, command]))(
        '%s',
        (path, command) => {
            const declaresFlag = command.options.some(isInteractiveOption);
            const registered = path in INTERACTIVE_COMMANDS;

            expect(`${path}: -i=${declaresFlag}`).toBe(`${path}: -i=${registered}`);
        }
    );

    test('the flag is a real short option, not a long one in the short slot', () => {
        // `--log-level, --loglevel` is declared that way and Commander stores
        // the first long form in `.short`, so "has a short flag" is not by
        // itself evidence that -i parses as -i.
        const [{ command }] = everyLeafCommand().filter(({ path }) => path in INTERACTIVE_COMMANDS);
        const flag = command.options.find(isInteractiveOption);

        expect(flag.short).toBe('-i');
        expect(flag.attributeName()).toBe(INTERACTIVE_OPTION_ATTRIBUTE);
    });
});

describe('the registered wizards', () => {
    test.each(REGISTERED.map((path) => [path]))(
        '%s loads and declares what it drives',
        async (path) => {
            const wizard = await loadWizard(path);

            expect(wizard.commandPath).toBe(path);
            expect(wizard.label.length).toBeGreaterThan(5);
            expect(typeof wizard.run).toBe('function');
        }
    );

    test('an unregistered path is refused, naming what is available', async () => {
        await expect(loadWizard('qseow create-sheet-thumbnails')).rejects.toThrow(/Available:/);
    });

    // Every key a wizard can produce must be a real option on its own command.
    // The existing option-name guard in commands.test.js scans only
    // src/lib/{cloud,qseow,browser}, so it never sees these modules - and a
    // wizard emitting `browserversion` would sail straight past it.
    test.each(REGISTERED.map((path) => [path]))(
        '%s produces only keys its command declares',
        async (path) => {
            const wizard = await loadWizard(path);
            const { command } = everyLeafCommand().find((leaf) => leaf.path === path);
            const declared = new Set(command.options.map((option) => option.attributeName()));

            const specs = specsFromCommand(command);
            const refined = wizard.refine ? wizard.refine(specs, { answers: {} }) : specs;

            // Synthetic questions are allowed, but only if finalize maps them
            // onto real keys - which is what the second half checks.
            const emitted = wizard.finalize
                ? Object.keys(
                      wizard.finalize(Object.fromEntries(refined.map((spec) => [spec.key, 'x'])), {
                          specs,
                      })
                  )
                : refined.map((spec) => spec.key);

            for (const key of emitted) {
                expect(`${path} -> ${key}: ${declared.has(key)}`).toBe(`${path} -> ${key}: true`);
            }
        }
    );

    test('synthetic questions are prefixed, so they can never reach the options bag', async () => {
        for (const path of REGISTERED) {
            const wizard = await loadWizard(path);
            const { command } = everyLeafCommand().find((leaf) => leaf.path === path);
            const specs = specsFromCommand(command);
            const declared = new Set(command.options.map((option) => option.attributeName()));
            const refined = wizard.refine ? wizard.refine(specs, { answers: {} }) : specs;

            for (const spec of refined) {
                const isReal = declared.has(spec.key);
                expect(`${path} -> ${spec.key}: ${isReal || spec.key.startsWith('_')}`).toBe(
                    `${path} -> ${spec.key}: true`
                );
            }
        }
    });
});

describe('SEA bundling', () => {
    test('every import specifier is a literal, not a template', () => {
        // A templated import is not statically analysable, so esbuild would not
        // bundle the target. The failure would then appear only inside the
        // packaged binary, on a user's machine, at the moment they chose that
        // wizard - which is exactly the kind of defect that survives every test
        // that runs from source.
        // Comments are stripped first: the module documents the templated form
        // as the thing to avoid, and a scan that could not tell the warning
        // from the mistake would be useless.
        const source = readFileSync(REGISTRY_PATH, 'utf8')
            .replaceAll(/\/\*[\s\S]*?\*\//g, '')
            .replaceAll(/^\s*\/\/.*$/gm, '');

        expect(source).not.toMatch(/import\(\s*`/);
        expect(source).not.toMatch(/import\(\s*[A-Za-z_$]/);

        for (const path of REGISTERED) {
            const file = `${path.split(' ').join('/')}.interactive.js`;
            expect(source).toContain(file);
        }
    });
});

describe('the menu themes itself', () => {
    test('does not fall back to the library default tick', async () => {
        // Regression guard. The menu used to be asked without a theme, so it
        // ticked with @inquirer's U+2714 while every prompt after it used the
        // repo's U+2713 - and, far worse, it never consulted the ASCII symbol
        // set, so it would have mojibaked on exactly the consoles the fallback
        // exists for while the rest of the wizard rendered correctly.
        const { runMenu } = await import('../menu.js');
        const { getSymbols } = await import('../symbols.js');

        // Compared against whatever this host resolves to, not against the
        // Unicode set. is-unicode-supported says no on the windows runner and
        // yes on ubuntu, so pinning either one asserts something about the
        // machine rather than about the menu - which is the mistake this very
        // file exists to guard against, made twice already on this branch.
        const symbols = getSymbols();

        let seenTheme;
        const runtime = {
            write: () => {},
            ask: async (_spec, config) => {
                seenTheme = config.theme;

                return null;
            },
        };

        await runMenu({ runtime });

        expect(seenTheme).toBeDefined();
        expect(seenTheme.prefix.done).toContain(symbols.done);
        expect(seenTheme.icon.cursor).toBe(symbols.cursor);
        // The regression itself: @inquirer's default ticks with U+2714, which
        // is drawn from the emoji font at double width on some terminals and
        // never consults the ASCII fallback.
        expect(seenTheme.prefix.done).not.toContain('✔');
    });
});
