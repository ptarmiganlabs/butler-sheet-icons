import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { Command, Option } from 'commander';
import { applyExtensions } from '../apply.js';
import { relaxMandatoryOptionsIfInteractive } from '../../interactive/mandatory-relaxation.js';
import { addInteractiveOption } from '../../interactive/interactive-option.js';
import { buildQseowCommand } from '../../commands/qseow/index.js';
import { buildQscloudCommand } from '../../commands/qscloud/index.js';
import { buildBrowserCommand } from '../../commands/browser/index.js';

// Everything here is about *where* `applyExtensions` is called from, which is the one thing about
// this seam that cannot be recovered by reading the function itself. `qseow create-sheet-thumbnails`
// declares 18 mandatory options across a tree nobody rebuilds by hand, so the real builders are
// used rather than a fixture: the failure being guarded against only exists at that scale.

const ENV_SNAPSHOT = { ...process.env };

beforeEach(() => {
    // Every option in this codebase has an .env() binding, and a stray BSI_* variable in the
    // developer's shell would satisfy a mandatory option and pass these tests for the wrong reason.
    for (const key of Object.keys(process.env)) {
        if (/^BS_?I?_/.test(key)) delete process.env[key];
    }
});

afterEach(() => {
    process.env = { ...ENV_SNAPSHOT };
});

/** Everything `qseow create-sheet-thumbnails` demands and does not default. */
const COMPLETE_QSEOW = [
    'qseow',
    'create-sheet-thumbnails',
    '--host',
    'sense.acme.com',
    '--apiuserdir',
    'INTERNAL',
    '--apiuserid',
    'sa_api',
    '--logonuserdir',
    'INTERNAL',
    '--logonuserid',
    'sa_ui',
    '--logonpwd',
    'secret',
];

/**
 * The real command tree, silenced and with its action handlers replaced.
 *
 * @returns {import('commander').Command} The program, recording the action reached on `.reached`.
 */
const buildProgram = () => {
    const program = new Command();
    const silence = { writeOut: () => {}, writeErr: () => {} };

    program.name('butler-sheet-icons').exitOverride().configureOutput(silence);
    program.reached = undefined;

    for (const namespace of [buildQseowCommand(), buildQscloudCommand(), buildBrowserCommand()]) {
        namespace.exitOverride().configureOutput(silence);

        for (const leaf of namespace.commands) {
            leaf.exitOverride().configureOutput(silence);

            if (!leaf.options.some((option) => option.long === '--interactive')) {
                addInteractiveOption(leaf);
            }

            // Replace the real action, which would connect to a Qlik server.
            leaf._actionHandler = undefined;
            leaf.action((opts, cmd) => {
                program.reached = { opts, cmd };
            });
        }

        program.addCommand(namespace);
    }

    return program;
};

/**
 * Parse a command line with an option contributed through the seam.
 *
 * @param {string[]} tail - Argv after the program name.
 * @param {object} [config] - Options.
 * @param {import('commander').Option} [config.option] - The option to contribute.
 * @param {object} [config.hooks] - Hooks to contribute alongside it.
 * @param {boolean} [config.afterRelaxation] - Contribute *after* the relaxation call instead of
 *     before it, which is the mistake the call-site position exists to prevent.
 *
 * @returns {Promise<object>} `{ reached, error, option }`.
 */
const run = async (tail, { option, hooks = {}, afterRelaxation = false } = {}) => {
    const program = buildProgram();
    const argv = ['node', 'bsi', ...tail];
    const description = {
        seamVersion: 1,
        commands: [],
        options: option ? [{ path: 'qseow create-sheet-thumbnails', option }] : [],
        hooks,
    };

    if (!afterRelaxation) {
        applyExtensions(program, description);
    }

    relaxMandatoryOptionsIfInteractive(program, argv);

    if (afterRelaxation) {
        applyExtensions(program, description);
    }

    try {
        await program.parseAsync(argv);

        return { reached: program.reached, error: undefined, option };
    } catch (error) {
        return { reached: program.reached, error, option };
    }
};

describe('an option contributed at the call site', () => {
    test('parses like any other option', async () => {
        const { reached, error } = await run(
            [...COMPLETE_QSEOW, '--extra-file', '/tmp/extra.txt'],
            {
                option: new Option('--extra-file <path>', 'a contributed option'),
            }
        );

        expect(error).toBeUndefined();
        expect(reached.opts.extraFile).toBe('/tmp/extra.txt');
    });

    // The one nobody expects to work: `dotenv/config` has already run, and the option did not exist
    // when it did. It resolves because Commander reads `process.env` at parse time rather than at
    // declaration time - so a contributed option gets the same env binding as every core option.
    test('resolves its .env() binding, even though it was added after dotenv ran', async () => {
        process.env.BSI_EXTRA_FILE = '/from/env.txt';

        const { reached, error } = await run(COMPLETE_QSEOW, {
            option: new Option('--extra-file <path>', 'a contributed option').env('BSI_EXTRA_FILE'),
        });

        expect(error).toBeUndefined();
        expect(reached.opts.extraFile).toBe('/from/env.txt');
    });

    test("participates in Commander's own missing-mandatory check when mandatory", async () => {
        const { reached, error } = await run(COMPLETE_QSEOW, {
            option: new Option('--extra-file <path>', 'a contributed option').makeOptionMandatory(),
        });

        expect(reached).toBeUndefined();
        expect(error.code).toBe('commander.missingMandatoryOptionValue');
        expect(error.message).toBe("error: required option '--extra-file <path>' not specified");
    });
});

describe('the position of the call is the thing being protected', () => {
    // Contributed before the relaxation call, a mandatory option is cleared with all the others and
    // the wizard is reachable. This is the whole reason the call site is where it is.
    test('a contributed mandatory option is relaxed by -i, like a core one', async () => {
        const option = new Option('--extra-file <path>', 'a contributed option')
            .makeOptionMandatory()
            .env('BSI_EXTRA_FILE');

        const { reached, error } = await run(['qseow', 'create-sheet-thumbnails', '-i'], {
            option,
        });

        expect(error).toBeUndefined();
        expect(reached.opts.interactive).toBe(true);
    });

    test('and it is mandatory again by the time a handler runs', async () => {
        const option = new Option('--extra-file <path>', 'a contributed option')
            .makeOptionMandatory()
            .env('BSI_EXTRA_FILE');

        await run(['qseow', 'create-sheet-thumbnails', '-i'], { option });

        expect(option.mandatory).toBe(true);
    });

    // Contributed after the relaxation call, the same option is never cleared, so Commander rejects
    // the command line before a single line of interactive code runs. The failure is invisible on
    // every other command line, which is exactly what makes it worth a test rather than a comment.
    test('contributing after the relaxation call breaks -i', async () => {
        const { reached, error } = await run(['qseow', 'create-sheet-thumbnails', '-i'], {
            option: new Option('--extra-file <path>', 'a contributed option').makeOptionMandatory(),
            afterRelaxation: true,
        });

        expect(reached).toBeUndefined();
        expect(error.code).toBe('commander.missingMandatoryOptionValue');
    });
});

describe('the beforeAction hook against the real tree', () => {
    test('names the command that is about to run, and sees its options', async () => {
        const seen = [];

        const { error } = await run([...COMPLETE_QSEOW, '--extra-file', '/tmp/extra.txt'], {
            option: new Option('--extra-file <path>', 'a contributed option'),
            hooks: { beforeAction: (path, options) => seen.push({ path, options }) },
        });

        expect(error).toBeUndefined();
        expect(seen).toHaveLength(1);
        expect(seen[0].path).toBe('qseow create-sheet-thumbnails');
        expect(seen[0].options.extraFile).toBe('/tmp/extra.txt');
        expect(seen[0].options.host).toBe('sense.acme.com');
    });

    test('stops the run before the action handler when it throws', async () => {
        const { reached, error } = await run(COMPLETE_QSEOW, {
            hooks: {
                beforeAction: () => {
                    throw new Error('refused by the hook');
                },
            },
        });

        expect(reached).toBeUndefined();
        expect(error.message).toBe('refused by the hook');
    });
});
