import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { Command } from 'commander';
import { wantsInteractive, relaxMandatoryOptionsIfInteractive } from '../mandatory-relaxation.js';
import { addInteractiveOption } from '../interactive-option.js';
import { specsFromCommand } from '../option-introspect.js';
import { buildQseowCommand } from '../../commands/qseow/index.js';
import { buildQscloudCommand } from '../../commands/qscloud/index.js';
import { buildBrowserCommand } from '../../commands/browser/index.js';

const ENV_SNAPSHOT = { ...process.env };

beforeEach(() => {
    // Every option in this codebase has an .env() binding, and a stray BSI_*
    // variable in the developer's shell would satisfy a mandatory option and
    // make these tests pass for the wrong reason.
    for (const key of Object.keys(process.env)) {
        if (/^BS_?I?_/.test(key)) delete process.env[key];
    }
});

afterEach(() => {
    process.env = { ...ENV_SNAPSHOT };
});

/**
 * A program shaped like the real one, but silent and non-exiting.
 *
 * The real builders are used rather than fixtures: the whole point of the
 * relaxation is what it does to 18 mandatory options declared across a tree
 * nobody rebuilds by hand.
 *
 * @param {object} [options] - Options.
 * @param {boolean} [options.withFlag] - Whether leaf commands declare `-i`.
 *
 * @returns {import('commander').Command} The program, with `reached` recording the action that ran.
 */
const buildProgram = ({ withFlag = true } = {}) => {
    const program = new Command();
    const silence = { writeOut: () => {}, writeErr: () => {} };

    program.name('butler-sheet-icons').exitOverride().configureOutput(silence);
    program.reached = undefined;

    for (const namespace of [buildQseowCommand(), buildQscloudCommand(), buildBrowserCommand()]) {
        namespace.exitOverride().configureOutput(silence);

        for (const leaf of namespace.commands) {
            leaf.exitOverride().configureOutput(silence);

            if (withFlag && !leaf.options.some((option) => option.long === '--interactive')) {
                addInteractiveOption(leaf);
            }

            // Replace the real action, which would connect to a Qlik server.
            leaf._actionHandler = undefined;
            leaf.action((opts, cmd) => {
                program.reached = { path: cmd.name(), opts, cmd };
            });
        }

        program.addCommand(namespace);
    }

    return program;
};

/**
 * Parse a command line, reporting either the action reached or the error code.
 *
 * @param {string[]} tail - Argv after the program name.
 * @param {object} [options] - Options.
 * @param {boolean} [options.relax] - Whether to apply the relaxation before parsing.
 * @param {boolean} [options.withFlag] - Whether leaf commands declare `-i`.
 *
 * @returns {Promise<object>} `{ reached, error, relaxed, program }`.
 */
const run = async (tail, { relax = true, withFlag = true } = {}) => {
    const program = buildProgram({ withFlag });
    const argv = ['node', 'bsi', ...tail];
    const relaxed = relax ? relaxMandatoryOptionsIfInteractive(program, argv) : false;

    try {
        await program.parseAsync(argv);

        return { reached: program.reached, error: undefined, relaxed, program };
    } catch (error) {
        return { reached: program.reached, error, relaxed, program };
    }
};

const QSEOW = ['qseow', 'create-sheet-thumbnails'];

describe('wantsInteractive', () => {
    test.each([
        [['node', 'bsi', 'browser', 'install', '-i'], true],
        [['node', 'bsi', 'browser', 'install', '--interactive'], true],
        [['node', 'bsi', '-i', 'browser', 'install'], true],
        [['node', 'bsi', 'browser', 'install'], false],
        [['node', 'bsi'], false],
    ])('%s -> %s', (argv, expected) => {
        expect(wantsInteractive(argv)).toBe(expected);
    });

    test('stops at --, so a word after it is an operand and not a flag', () => {
        expect(wantsInteractive(['node', 'bsi', 'browser', 'install', '--', '-i'])).toBe(false);
    });

    test('does not match a flag that merely starts with -i', () => {
        expect(wantsInteractive(['node', 'bsi', 'browser', 'install', '--imagedir'])).toBe(false);
    });

    test('tolerates being called with nothing', () => {
        expect(wantsInteractive()).toBe(false);
    });
});

describe('without -i, nothing changes', () => {
    // The main regression risk in this phase: every existing user is on this
    // path, and none of them has asked for a wizard.
    test('the tree is left alone', async () => {
        const { relaxed } = await run(QSEOW);

        expect(relaxed).toBe(false);
    });

    test('a missing mandatory option is still rejected, with Commander wording', async () => {
        const { error, reached } = await run(QSEOW);

        expect(reached).toBeUndefined();
        expect(error.code).toBe('commander.missingMandatoryOptionValue');
        expect(error.message).toBe("error: required option '--host <host>' not specified");
    });

    test('and the error is identical to the one raised before -i existed', async () => {
        const before = await run(QSEOW, { relax: false, withFlag: false });
        const after = await run(QSEOW);

        expect(after.error.message).toBe(before.error.message);
        expect(after.error.code).toBe(before.error.code);
    });

    test('a complete command line still runs', async () => {
        const { reached, error } = await run([
            ...QSEOW,
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
        ]);

        expect(error).toBeUndefined();
        expect(reached.opts.host).toBe('sense.acme.com');
    });
});

describe('with -i, the wizard is reachable', () => {
    test.each([
        ['-i', ['-i']],
        ['--interactive', ['--interactive']],
        ['-i after another flag', ['--host', 'sense.acme.com', '-i']],
        ['-i terminating a variadic', ['--exclude-sheet-status', 'private', '-i']],
    ])('qseow create-sheet-thumbnails %s', async (_label, extra) => {
        const { reached, error } = await run([...QSEOW, ...extra]);

        expect(error).toBeUndefined();
        expect(reached.opts.interactive).toBe(true);
    });

    test.each([
        ['qscloud create-sheet-thumbnails', ['qscloud', 'create-sheet-thumbnails']],
        ['qscloud list-collections', ['qscloud', 'list-collections']],
        ['qscloud remove-sheet-icons', ['qscloud', 'remove-sheet-icons']],
        ['browser uninstall', ['browser', 'uninstall']],
    ])('%s -i', async (_label, path) => {
        const { reached, error } = await run([...path, '-i']);

        expect(error).toBeUndefined();
        expect(reached.opts.interactive).toBe(true);
    });

    test('a flag supplied alongside -i still reaches the options bag', async () => {
        const { reached } = await run([...QSEOW, '--host', 'sense.acme.com', '-i']);

        expect(reached.opts.host).toBe('sense.acme.com');
    });
});

describe('the relaxation lasts only as long as the parse', () => {
    // If it outlived the parse, specsFromCommand() would read the relaxed tree
    // and decide that none of the wizard's questions are required - a silent
    // failure with no test of its own to catch it, which is why this one exists.
    test('every mandatory option is mandatory again once a handler runs', async () => {
        const { reached } = await run([...QSEOW, '-i']);
        const stillMandatory = reached.cmd.options.filter((option) => option.mandatory);

        expect(stillMandatory).toHaveLength(18);
    });

    test('so the wizard still knows which questions are required', async () => {
        const { reached } = await run([...QSEOW, '-i']);
        const required = specsFromCommand(reached.cmd, { env: {} })
            .filter((spec) => spec.required)
            .map((spec) => spec.key);

        expect(required).toEqual([
            'host',
            'apiuserdir',
            'apiuserid',
            'logonuserdir',
            'logonuserid',
            'logonpwd',
        ]);
    });
});

describe('a literal -i used as an option value does not relax anything', () => {
    // The argv scan has to run before Commander parses, so it cannot tell a
    // flag from a value and says yes here. Once the parse is done the truth is
    // knowable, and the check is re-run rather than skipped.
    test('the command line is rejected exactly as it is today', async () => {
        const { reached, error } = await run([...QSEOW, '--qliksensetag', '-i']);

        expect(reached).toBeUndefined();
        expect(error.code).toBe('commander.missingMandatoryOptionValue');
        expect(error.message).toBe("error: required option '--host <host>' not specified");
    });

    test('which is what a run without the relaxation does too', async () => {
        const argv = [...QSEOW, '--qliksensetag', '-i'];
        const before = await run(argv, { relax: false, withFlag: false });
        const after = await run(argv);

        expect(after.error.message).toBe(before.error.message);
    });

    test('and the value really did land on the option, so this is the case described', async () => {
        const { program } = await run([
            ...QSEOW,
            '--qliksensetag',
            '-i',
            '--host',
            'h',
            '--apiuserdir',
            'd',
            '--apiuserid',
            'u',
            '--logonuserdir',
            'd',
            '--logonuserid',
            'u',
            '--logonpwd',
            'p',
        ]);

        expect(program.reached.opts.qliksensetag).toBe('-i');
        expect(program.reached.opts.interactive).toBeUndefined();
    });
});

describe('--help is unaffected', () => {
    /**
     * The qseow leaf's help text, taken from a program built the same way twice.
     *
     * @param {boolean} relax - Whether to relax the tree first.
     *
     * @returns {string} Help output.
     */
    const helpFor = (relax) => {
        const program = buildProgram();

        if (relax) {
            relaxMandatoryOptionsIfInteractive(program, ['node', 'bsi', '-i']);
        }

        return program.commands
            .find((command) => command.name() === 'qseow')
            .commands[0].helpInformation();
    };

    test('relaxing the tree does not change a single character of help output', () => {
        // Both sides declare -i, so the relaxation is the only variable. Nothing
        // in Commander's help renderer reads `mandatory`, and this is what pins
        // that: an administrator running --help sees the same page either way.
        expect(helpFor(true)).toBe(helpFor(false));
    });

    test('and --help still works on a command line that is missing mandatory options', async () => {
        const { error } = await run([...QSEOW, '--help']);

        expect(error.code).toBe('commander.helpDisplayed');
    });
});

describe('a program with nothing mandatory', () => {
    test('is reported as relaxed without a hook being needed', () => {
        const program = new Command();
        program.command('noop').action(() => {});

        expect(relaxMandatoryOptionsIfInteractive(program, ['node', 'bsi', '-i'])).toBe(true);
    });
});
