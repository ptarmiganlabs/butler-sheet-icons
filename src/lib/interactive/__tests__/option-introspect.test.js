import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { everyLeafCommand, leafCommandAt } from '../command-tree.js';
import { specsFromCommand, specFromOption, splitDescription } from '../option-introspect.js';
import { isInteractiveOption, INTERACTIVE_OPTION_ATTRIBUTE } from '../interactive-option.js';

const ENV_SNAPSHOT = { ...process.env };

beforeEach(() => {
    for (const key of Object.keys(process.env)) {
        if (/^BS_?I?_/.test(key)) delete process.env[key];
    }
});

afterEach(() => {
    for (const key of Object.keys(process.env)) {
        if (!(key in ENV_SNAPSHOT)) delete process.env[key];
    }
    Object.assign(process.env, ENV_SNAPSHOT);
});

const LEAVES = everyLeafCommand();
const EVERY_COMMAND = LEAVES.map(({ path, command }) => [path, command]);
const optionOn = (path, long) => leafCommandAt(path).options.find((option) => option.long === long);

describe('command-tree', () => {
    test('finds every leaf command, across all three namespaces', () => {
        expect(LEAVES.map((leaf) => leaf.path).sort()).toEqual([
            'browser install',
            'browser list-available',
            'browser list-installed',
            'browser uninstall',
            'browser uninstall-all',
            'qscloud create-sheet-thumbnails',
            'qscloud list-collections',
            'qscloud remove-sheet-icons',
            'qseow create-sheet-thumbnails',
        ]);
    });

    test('finds qseow, which registers no per-leaf builder', () => {
        // The namespaces are not symmetrical: qscloud and browser use one file
        // per leaf, qseow builds its leaf inline. Walking the tree is what makes
        // that difference invisible to everything downstream.
        expect(leafCommandAt('qseow create-sheet-thumbnails').options.length).toBeGreaterThan(30);
    });

    test('names the alternatives when asked for a command that does not exist', () => {
        expect(() => leafCommandAt('qseow nope')).toThrow(/Known commands/);
    });
});

describe('every option yields exactly one question', () => {
    // Every option except the flag that opens the wizard, which is not one of
    // the wizard's own questions.
    const askableOptions = (command) => command.options.filter((o) => !isInteractiveOption(o));

    test.each(EVERY_COMMAND)('%s', (_path, command) => {
        const specs = specsFromCommand(command);

        // The regression net behind "adding a CLI option gets a prompt for
        // free". If this ever fails, an option has become unaskable.
        expect(specs).toHaveLength(askableOptions(command).length);
        expect(specs.every((spec) => spec.message.length > 0)).toBe(true);
    });

    test.each(EVERY_COMMAND)('%s keys are what Commander stores', (_path, command) => {
        const specs = specsFromCommand(command);

        expect(specs.map((spec) => spec.key)).toEqual(
            askableOptions(command).map((option) => option.attributeName())
        );
    });
});

describe('the interactive flag is never a question', () => {
    // Two things go wrong if it is. The user is asked "Answer questions instead
    // of assembling a command line?" while already answering questions, and
    // `--interactive` is emitted into the echoed command line - so the line the
    // wizard prints as the way to reproduce the run would instead re-open the
    // wizard when pasted back.
    test.each(EVERY_COMMAND)('%s', (_path, command) => {
        expect(specsFromCommand(command).map((spec) => spec.key)).not.toContain(
            INTERACTIVE_OPTION_ATTRIBUTE
        );
    });

    test('and the commands that offer it really do declare it, so this is not vacuous', () => {
        const withFlag = EVERY_COMMAND.filter(([, command]) =>
            command.options.some(isInteractiveOption)
        );

        expect(withFlag.length).toBeGreaterThan(0);
    });
});

describe('the log-level option', () => {
    // Declared `--log-level, --loglevel <level>`. Commander takes the *second*
    // long form as the attribute name and puts the first in `.short`, so a
    // mapper keying off `short` would emit a flag that does not match the key.
    test.each(EVERY_COMMAND)('%s stores it as loglevel and echoes --loglevel', (_path, command) => {
        const spec = specsFromCommand(command).find((s) => s.key === 'loglevel');

        expect(spec).toBeDefined();
        expect(spec.option.long).toBe('--loglevel');
        expect(spec.option.short).toBe('--log-level');
        expect(spec.type).toBe('select');
    });
});

describe('type derivation', () => {
    test('a closed value set becomes a select, carrying its choices', () => {
        const spec = specFromOption(
            optionOn('qseow create-sheet-thumbnails', '--includesheetpart')
        );

        expect(spec.type).toBe('select');
        expect(spec.choices).toEqual(['1', '2', '3', '4']);
    });

    test('a variadic closed value set becomes a checkbox', () => {
        const spec = specFromOption(
            optionOn('qseow create-sheet-thumbnails', '--exclude-sheet-status')
        );

        expect(spec.type).toBe('checkbox');
        expect(spec.choices).toEqual(['private', 'published', 'public']);
    });

    test('a variadic free-text option becomes a list', () => {
        const spec = specFromOption(
            optionOn('qseow create-sheet-thumbnails', '--exclude-sheet-tag')
        );

        expect(spec.type).toBe('list');
        expect(spec.variadic).toBe(true);
    });

    test('a flag taking no value becomes a confirm', () => {
        const spec = specFromOption(optionOn('qscloud create-sheet-thumbnails', '--skip-login'));

        expect(spec.type).toBe('confirm');
    });

    test('a <true|false> option becomes a confirm despite being a string option', () => {
        const spec = specFromOption(optionOn('qseow create-sheet-thumbnails', '--secure'));

        expect(spec.type).toBe('confirm');
        expect(spec.default).toBe(true);
    });

    test('a numeric option stays a text input, not a number prompt', () => {
        // A number prompt answers with a JavaScript number, while the CLI
        // stores the string typed. Asking as text is what keeps them identical.
        const spec = specFromOption(optionOn('qseow create-sheet-thumbnails', '--pagewait'));

        expect(spec.type).toBe('input');
    });

    test('a secret becomes a password prompt', () => {
        for (const [path, flag] of [
            ['qseow create-sheet-thumbnails', '--logonpwd'],
            ['qscloud create-sheet-thumbnails', '--apikey'],
        ]) {
            const spec = specFromOption(optionOn(path, flag));

            expect(`${flag}: ${spec.type}`).toBe(`${flag}: password`);
            expect(spec.secret).toBe(true);
        }
    });

    test('no other option is marked secret', () => {
        const secrets = LEAVES.flatMap(({ command }) =>
            specsFromCommand(command)
                .filter((spec) => spec.secret)
                .map((spec) => spec.key)
        );

        expect([...new Set(secrets)].sort()).toEqual(['apikey', 'logonpwd']);
    });
});

describe('what counts as required', () => {
    test('an option that is mandatory with no default must be answered', () => {
        expect(specFromOption(optionOn('qseow create-sheet-thumbnails', '--host')).required).toBe(
            true
        );
    });

    test('an option that is mandatory but defaulted need not be', () => {
        // browser uninstall --browser is mandatory *and* defaults to 'chrome',
        // so Commander's missing-mandatory check can never fire for it. Marking
        // it required would demand an answer the CLI never demands.
        const spec = specFromOption(optionOn('browser uninstall', '--browser'));

        expect(spec.option.mandatory).toBe(true);
        expect(spec.required).toBe(false);
    });

    test('an option satisfied by an environment variable need not be answered', () => {
        const option = optionOn('qseow create-sheet-thumbnails', '--host');
        process.env[option.envVar] = 'sense.acme.com';

        expect(specFromOption(option).required).toBe(false);
    });
});

describe('defaults', () => {
    test('an environment variable beats the declared default', () => {
        const option = optionOn('qseow create-sheet-thumbnails', '--pagewait');
        process.env[option.envVar] = '42';

        expect(specFromOption(option).default).toBe('42');
    });

    test('a set-but-empty environment variable also beats it, as Commander does', () => {
        // Commander checks `envVar in process.env`, not whether it has a value,
        // so an empty line in a unit file wins over .default(). The wizard has
        // to agree or it proposes something a real run would not use.
        const option = optionOn('qseow create-sheet-thumbnails', '--pagewait');
        process.env[option.envVar] = '';

        expect(specFromOption(option).default).toBe('');
    });

    test('falls back to the declared default when no variable is set', () => {
        expect(
            specFromOption(optionOn('qseow create-sheet-thumbnails', '--pagewait')).default
        ).toBe(5);
    });
});

describe('validation comes from the option itself', () => {
    test('a rejected value produces the CLI wording, character for character', () => {
        const spec = specFromOption(optionOn('qseow create-sheet-thumbnails', '--engineport'));

        expect(spec.validate('abc')).toBe('Engine port must be a non-negative integer.');
        expect(spec.validate('4747')).toBe(true);
    });

    test('a variadic option names the entry that was rejected', () => {
        const spec = specFromOption(
            optionOn('qseow create-sheet-thumbnails', '--exclude-sheet-number')
        );

        expect(spec.validate(['1', '2', 'abc'])).toContain('Entry 3 ("abc")');
        expect(spec.validate(['1', '2'])).toBe(true);
    });

    test('a closed value set rejects with Commander own message', () => {
        const spec = specFromOption(
            optionOn('qseow create-sheet-thumbnails', '--includesheetpart')
        );

        expect(spec.validate('9')).toContain('Allowed choices are 1, 2, 3, 4');
    });
});

describe('splitDescription', () => {
    test('takes the first sentence as the question and the rest as a hint', () => {
        const { message, hint } = splitDescription(
            'Browser to install. Use list-installed to see what is there.'
        );

        expect(message).toBe('Browser to install.');
        expect(hint).toBe('Use list-installed to see what is there.');
    });

    test('does not mistake an abbreviation for the end of the question', () => {
        // Taking the first full stop turned this into the question "Browser to
        // install (e.g.", which is worse than not splitting at all.
        const { message, hint } = splitDescription(
            'Browser to install (e.g. "chrome" or "firefox"). Use list-installed to see them.'
        );

        expect(message).toBe('Browser to install (e.g. "chrome" or "firefox").');
        expect(hint).toBe('Use list-installed to see them.');
    });

    test('no real command produces a question cut mid-abbreviation', () => {
        for (const { command } of LEAVES) {
            for (const spec of specsFromCommand(command)) {
                expect(`${spec.key}: ${/\b(?:e\.g|i\.e|etc|vs)\.$/i.test(spec.message)}`).toBe(
                    `${spec.key}: false`
                );
            }
        }
    });

    test('copes with a description that is a single phrase', () => {
        expect(splitDescription('Log level')).toEqual({ message: 'Log level', hint: undefined });
    });

    test('never returns an empty question', () => {
        for (const { command } of LEAVES) {
            for (const spec of specsFromCommand(command)) {
                expect(`${spec.key}: ${spec.message.length > 0}`).toBe(`${spec.key}: true`);
            }
        }
    });
});

describe('duplicate keys', () => {
    test('are refused rather than silently prompted for twice', () => {
        const command = leafCommandAt('browser uninstall');
        const doubled = { options: [...command.options, command.options[0]], name: () => 'x' };

        expect(() => specsFromCommand(doubled)).toThrow(/two options storing under/);
    });
});
