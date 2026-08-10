import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { everyLeafCommand } from '../command-tree.js';
import { specsFromCommand } from '../option-introspect.js';
import { INTERACTIVE_COMMANDS, NOT_INTERACTIVE, loadWizard } from '../registry.js';

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
