import { describe, test, expect } from '@jest/globals';
import { Command, Option } from 'commander';
import { applyExtensions, runBeforeAction } from '../apply.js';
import { isExpectedFailure } from '../../util/errors.js';

const SILENT = { writeOut: () => {}, writeErr: () => {} };

/**
 * A small program shaped like the real one: a root, a namespace, and a leaf that records its run.
 *
 * Deliberately hand-built rather than the real tree - the behaviour under test is what
 * `applyExtensions` does to a command tree, and a four-command fixture makes a failure readable.
 * `apply-ordering.test.js` covers the same code against the real tree, where the interesting part
 * is the 18 mandatory options rather than the wiring.
 *
 * @returns {object} `{ program, leaf, runs }` - the root, the leaf, and what the leaf recorded.
 */
const buildProgram = () => {
    const runs = [];
    const program = new Command().name('butler-sheet-icons').exitOverride().configureOutput(SILENT);
    const namespace = new Command('qseow').exitOverride().configureOutput(SILENT);
    const leaf = new Command('create-sheet-thumbnails')
        .exitOverride()
        .configureOutput(SILENT)
        .alias('cst')
        .action((opts) => runs.push(opts));

    namespace.addCommand(leaf);
    program.addCommand(namespace);

    return { program, leaf, runs };
};

// A description that adds nothing, byte for byte what the committed module exports.
const nothing = () => ({ seamVersion: 1, commands: [], options: [], hooks: {} });

describe('an empty description', () => {
    test('registers no commands and adds no hook', async () => {
        const { program, runs } = buildProgram();
        const before = program.commands.length;

        applyExtensions(program, nothing());

        expect(program.commands.length).toBe(before);
        await program.parseAsync(['qseow', 'create-sheet-thumbnails'], { from: 'user' });
        expect(runs).toHaveLength(1);
    });

    // Not defensive programming for its own sake: a description assembled by hand, in a test or in
    // a variant build, is the likely source of a missing property, and the failure would otherwise
    // be a TypeError from inside core.
    test.each([
        ['a description with no properties at all', {}],
        ['no description', undefined],
        ['null', null],
    ])('tolerates %s', async (_name, description) => {
        const { program, runs } = buildProgram();

        expect(() => applyExtensions(program, description)).not.toThrow();
        await program.parseAsync(['qseow', 'create-sheet-thumbnails'], { from: 'user' });
        expect(runs).toHaveLength(1);
    });
});

describe('contributed commands', () => {
    test('are added to the root and run', async () => {
        const { program } = buildProgram();
        const ran = [];
        const command = new Command('estate-report')
            .exitOverride()
            .configureOutput(SILENT)
            .action(() => ran.push(true));

        applyExtensions(program, { ...nothing(), commands: [command] });

        expect(program.commands.map((c) => c.name())).toContain('estate-report');
        await program.parseAsync(['estate-report'], { from: 'user' });
        expect(ran).toEqual([true]);
    });
});

describe('contributed options', () => {
    test('are added to the command their path names, and parse', async () => {
        const { program, runs } = buildProgram();

        applyExtensions(program, {
            ...nothing(),
            options: [
                {
                    path: 'qseow create-sheet-thumbnails',
                    option: new Option('--extra-file <path>', 'a contributed option'),
                },
            ],
        });

        await program.parseAsync(
            ['qseow', 'create-sheet-thumbnails', '--extra-file', '/tmp/extra.txt'],
            { from: 'user' }
        );

        expect(runs[0].extraFile).toBe('/tmp/extra.txt');
    });

    test('reach a command through its alias too', () => {
        const { program, leaf } = buildProgram();

        applyExtensions(program, {
            ...nothing(),
            options: [{ path: 'qseow cst', option: new Option('--via-alias') }],
        });

        expect(leaf.options.map((o) => o.long)).toContain('--via-alias');
    });

    test('land on a top-level command when the path has one segment', () => {
        const { program } = buildProgram();

        applyExtensions(program, {
            ...nothing(),
            options: [{ path: 'qseow', option: new Option('--on-the-namespace') }],
        });

        const namespace = program.commands.find((c) => c.name() === 'qseow');
        expect(namespace.options.map((o) => o.long)).toContain('--on-the-namespace');
    });

    // The one mistake that would otherwise be silent: the option simply would not appear, in
    // `--help` or anywhere else, with nothing saying why.
    test('throw when the path names a command that does not exist', () => {
        const { program } = buildProgram();

        expect(() =>
            applyExtensions(program, {
                ...nothing(),
                options: [{ path: 'qseow no-such-command', option: new Option('--x') }],
            })
        ).toThrow(/targets 'qseow no-such-command'.*no command 'no-such-command' under 'qseow'/);
    });

    // The likeliest authoring mistake is omitting `path` altogether, and it must not surface as a
    // bare TypeError from inside core naming neither the contribution nor the option.
    test.each([
        ['whitespace', '   '],
        ['an empty string', ''],
        ['undefined', undefined],
        ['null', null],
        ['a number', 3],
    ])('throw a named error on %s', (_name, path) => {
        const { program } = buildProgram();

        expect(() =>
            applyExtensions(program, {
                ...nothing(),
                options: [{ path, option: new Option('--x') }],
            })
        ).toThrow(/no usable command path/);
    });
});

describe('runBeforeAction', () => {
    test('calls the hook and returns what it returns, so an async hook can be awaited', async () => {
        const seen = [];
        const description = {
            ...nothing(),
            hooks: {
                beforeAction: async (path, options) => {
                    seen.push({ path, options });

                    return 'done';
                },
            },
        };

        await expect(runBeforeAction(description, 'qseow x', { a: 1 })).resolves.toBe('done');
        expect(seen).toEqual([{ path: 'qseow x', options: { a: 1 } }]);
    });

    test('propagates a throw, so the caller can abort the run', async () => {
        const description = {
            ...nothing(),
            hooks: {
                beforeAction: () => {
                    throw new Error('refused by the hook');
                },
            },
        };

        expect(() => runBeforeAction(description, 'qseow x', {})).toThrow('refused by the hook');
    });

    // The committed default's every-run path: no hook described, nothing happens, no crash.
    test.each([
        ['a description with no hooks', { seamVersion: 1, commands: [], options: [] }],
        ['a description describing nothing', nothing()],
        ['no description at all', undefined],
    ])('does nothing for %s', (_name, description) => {
        expect(runBeforeAction(description, 'qseow x', {})).toBeUndefined();
    });
});

describe('the beforeAction hook', () => {
    // The values alone cannot say which of them the operator actually gave: `opts()` reports a
    // default and a typed value identically, and by hook time dotenv has merged every BSI_* variable
    // into the environment. Commander's record is the only thing that can separate them, so core
    // computes it and hands it over rather than leaving an extension to guess.
    test('is told which options the operator supplied, and which are defaults', async () => {
        const { program } = buildProgram();
        const seen = [];

        applyExtensions(program, {
            ...nothing(),
            options: [
                { path: 'qseow create-sheet-thumbnails', option: new Option('--extra-file <p>') },
                {
                    path: 'qseow create-sheet-thumbnails',
                    option: new Option('--untouched <p>').default('a default'),
                },
            ],
            hooks: { beforeAction: (path, options, context) => seen.push({ options, context }) },
        });

        await program.parseAsync(
            ['qseow', 'create-sheet-thumbnails', '--extra-file', '/tmp/extra.txt'],
            { from: 'user' }
        );

        expect(seen[0].options.untouched).toBe('a default');
        expect([...seen[0].context.supplied]).toContain('extraFile');
        expect([...seen[0].context.supplied]).not.toContain('untouched');
    });

    test('counts an environment-supplied value as supplied', async () => {
        const { program } = buildProgram();
        const seen = [];

        process.env.BSI_EXTRA_FILE = '/from/env.txt';

        applyExtensions(program, {
            ...nothing(),
            options: [
                {
                    path: 'qseow create-sheet-thumbnails',
                    option: new Option('--extra-file <p>').env('BSI_EXTRA_FILE'),
                },
            ],
            hooks: { beforeAction: (_path, _options, context) => seen.push(context) },
        });

        await program.parseAsync(['qseow', 'create-sheet-thumbnails'], { from: 'user' });

        delete process.env.BSI_EXTRA_FILE;

        expect([...seen[0].supplied]).toContain('extraFile');
    });

    test('receives the command path and the parsed options', async () => {
        const { program } = buildProgram();
        const seen = [];

        applyExtensions(program, {
            ...nothing(),
            options: [
                { path: 'qseow create-sheet-thumbnails', option: new Option('--extra-file <p>') },
            ],
            hooks: { beforeAction: (path, options) => seen.push({ path, options }) },
        });

        await program.parseAsync(
            ['qseow', 'create-sheet-thumbnails', '--extra-file', '/tmp/extra.txt'],
            { from: 'user' }
        );

        expect(seen).toHaveLength(1);
        expect(seen[0].path).toBe('qseow create-sheet-thumbnails');
        expect(seen[0].options.extraFile).toBe('/tmp/extra.txt');
    });

    test('reports a contributed top-level command by its own name', async () => {
        const { program } = buildProgram();
        const seen = [];
        const command = new Command('estate-report')
            .exitOverride()
            .configureOutput(SILENT)
            .action(() => {});

        applyExtensions(program, {
            ...nothing(),
            commands: [command],
            hooks: { beforeAction: (path) => seen.push(path) },
        });

        await program.parseAsync(['estate-report'], { from: 'user' });
        expect(seen).toEqual(['estate-report']);
    });

    // The reason the hook exists: a run that was never going to be allowed to proceed has to fail
    // at startup, not after the first Sense app has been touched.
    test('aborts the run when it throws, before the action handler', async () => {
        const { program, runs } = buildProgram();

        applyExtensions(program, {
            ...nothing(),
            hooks: {
                beforeAction: () => {
                    throw new Error('refused by the hook');
                },
            },
        });

        await expect(
            program.parseAsync(['qseow', 'create-sheet-thumbnails'], { from: 'user' })
        ).rejects.toThrow('refused by the hook');
        expect(runs).toHaveLength(0);
    });

    // The seam between the hook and the entry point's catch. `parseAsync` has to surface the error
    // itself rather than a wrapper, or the marker never reaches the classification above it and the
    // run is reported as a crash - which is what #1150 was. Asserted through a real parse rather
    // than by calling the hook, because calling the hook directly is exactly the test that stayed
    // green while the bug shipped.
    test('an error marked as expected reaches the caller with its marker intact', async () => {
        const { program, runs } = buildProgram();

        applyExtensions(program, {
            ...nothing(),
            hooks: {
                beforeAction: () => {
                    throw Object.assign(new Error('this run may not proceed'), { expected: true });
                },
            },
        });

        const err = await program
            .parseAsync(['qseow', 'create-sheet-thumbnails'], { from: 'user' })
            .then(
                () => undefined,
                (caught) => caught
            );

        expect(err).toBeDefined();
        expect(isExpectedFailure(err)).toBe(true);
        expect(err.message).toBe('this run may not proceed');
        expect(runs).toHaveLength(0);
    });

    test('an unmarked error stays unmarked, so a hook bug still takes the crash path', async () => {
        const { program } = buildProgram();

        applyExtensions(program, {
            ...nothing(),
            hooks: {
                beforeAction: () => {
                    // The shape a genuine bug takes: nobody meant to stop the run.
                    throw new TypeError('opts.split is not a function');
                },
            },
        });

        const err = await program
            .parseAsync(['qseow', 'create-sheet-thumbnails'], { from: 'user' })
            .then(
                () => undefined,
                (caught) => caught
            );

        expect(err).toBeInstanceOf(TypeError);
        expect(isExpectedFailure(err)).toBe(false);
    });

    // It runs under `parseAsync`, not at module evaluation, so it is allowed to be async - which is
    // what lets it read something off disk or over a socket.
    test('is awaited when async, and its rejection aborts the run', async () => {
        const { program, runs } = buildProgram();
        const order = [];

        applyExtensions(program, {
            ...nothing(),
            hooks: {
                beforeAction: async () => {
                    await Promise.resolve();
                    order.push('hook');
                    throw new Error('async refusal');
                },
            },
        });

        await expect(
            program.parseAsync(['qseow', 'create-sheet-thumbnails'], { from: 'user' })
        ).rejects.toThrow('async refusal');
        expect(order).toEqual(['hook']);
        expect(runs).toHaveLength(0);
    });

    test('lets the run proceed when it returns normally', async () => {
        const { program, runs } = buildProgram();

        applyExtensions(program, { ...nothing(), hooks: { beforeAction: async () => {} } });

        await program.parseAsync(['qseow', 'create-sheet-thumbnails'], { from: 'user' });
        expect(runs).toHaveLength(1);
    });
});
