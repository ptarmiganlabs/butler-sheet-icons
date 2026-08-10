import { jest, describe, test, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';

// How many times the mocked module factory has been evaluated. This is what
// proves the library is loaded lazily: with a static import the factory runs
// when prompt-runtime.js is imported, with a dynamic one it runs on first ask().
let factoryCalls = 0;

const input = jest.fn();
const password = jest.fn();
const confirm = jest.fn();
const number = jest.fn();
const select = jest.fn();
const checkbox = jest.fn();
const search = jest.fn();

// The mock is declared by closing over these fns rather than by importing
// '@inquirer/prompts' back out of jest. That keeps this test file on the right
// side of the boundary it is testing - only prompt-runtime.js may name the
// library in an import.
jest.unstable_mockModule('@inquirer/prompts', () => {
    factoryCalls += 1;

    return { input, password, confirm, number, select, checkbox, search };
});

let defaultRuntime;
let SUPPORTED_TYPES;

beforeAll(async () => {
    ({ defaultRuntime, SUPPORTED_TYPES } = await import('../prompt-runtime.js'));
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe('lazy loading', () => {
    test('importing the runtime does not pull in the prompt library', async () => {
        // The reason the dynamic import is there: every other command pays the
        // startup cost of the prompt library otherwise. Note this defers
        // execution, not inclusion - under esbuild the library is still bundled
        // into the binary.
        expect(factoryCalls).toBe(0);

        input.mockResolvedValue('answer');
        await defaultRuntime.ask({ type: 'input', key: 'host' }, { message: 'Host?' });

        expect(factoryCalls).toBe(1);
    });

    test('the library is loaded once, however many questions are asked', async () => {
        input.mockResolvedValue('answer');

        await defaultRuntime.ask({ type: 'input', key: 'a' }, { message: 'a' });
        await defaultRuntime.ask({ type: 'input', key: 'b' }, { message: 'b' });
        await defaultRuntime.ask({ type: 'input', key: 'c' }, { message: 'c' });

        expect(factoryCalls).toBe(1);
    });
});

describe('ask', () => {
    test.each([
        ['input', () => input],
        ['password', () => password],
        ['confirm', () => confirm],
        ['number', () => number],
        ['select', () => select],
        ['checkbox', () => checkbox],
        ['search', () => search],
    ])('dispatches "%s" to its own prompt', async (type, prompt) => {
        prompt().mockResolvedValue('answer');

        const result = await defaultRuntime.ask({ type, key: 'k' }, { message: 'Question?' });

        expect(prompt()).toHaveBeenCalledTimes(1);
        expect(result).toBe('answer');
    });

    test('"list" renders as a text input', async () => {
        // There is no dedicated list prompt. Splitting and per-entry validation
        // belong to the driver, not to the replaceable layer.
        input.mockResolvedValue('1, 2, 3');

        await defaultRuntime.ask(
            { type: 'list', key: 'excludeSheetNumber' },
            { message: 'Which?' }
        );

        expect(input).toHaveBeenCalledTimes(1);
    });

    test('passes the configuration through untouched', async () => {
        const config = {
            message: 'Which browser?',
            default: 'chrome',
            choices: [{ name: 'Chrome', value: 'chrome' }],
            validate: () => true,
            theme: { icon: { cursor: '>' } },
        };
        select.mockResolvedValue('chrome');

        await defaultRuntime.ask({ type: 'select', key: 'browser' }, config);

        expect(select).toHaveBeenCalledWith(config);
    });

    test('rejects an unrenderable type with a message naming the key', async () => {
        // A developer error - a spec reached the runtime with a type nothing
        // can render. Failing loudly beats prompting for something the user
        // cannot answer.
        await expect(
            defaultRuntime.ask({ type: 'wat', key: 'browserVersion' }, { message: 'x' })
        ).rejects.toThrow(/browserVersion/);

        await expect(
            defaultRuntime.ask({ type: 'wat', key: 'browserVersion' }, { message: 'x' })
        ).rejects.toThrow(/Supported types/);
    });

    test('rejects a missing spec rather than throwing something opaque', async () => {
        await expect(defaultRuntime.ask(undefined, {})).rejects.toThrow(
            /no prompt for question type/
        );
    });
});

describe('SUPPORTED_TYPES', () => {
    test('covers every question type the design uses', () => {
        expect([...SUPPORTED_TYPES].sort()).toEqual([
            'checkbox',
            'confirm',
            'input',
            'list',
            'number',
            'password',
            'search',
            'select',
        ]);
    });
});

describe('write', () => {
    let stdoutWrite;

    beforeEach(() => {
        stdoutWrite = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        stdoutWrite.mockRestore();
    });

    test('writes exactly what it is given, adding no newline', () => {
        // The wizard controls its own layout. An implicit newline here would
        // make a section rule and its heading impossible to put on one line.
        defaultRuntime.write('-- Review --');

        expect(stdoutWrite).toHaveBeenCalledWith('-- Review --');
    });
});
