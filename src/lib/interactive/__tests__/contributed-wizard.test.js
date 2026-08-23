import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { Command, Option } from 'commander';

// The interactive mode used to rebuild the command tree from the builders, so an option a build
// contributed through the extension point was parsed, shown in --help, and never asked about; and
// had it been asked, no wizard's refine() knew where to put it. These tests drive the real qseow
// wizard end to end against a command the description was applied to, and assert both halves of
// issue #1159: the wizard sees the registered command, and places contributed questions where the
// contribution said.

const beforeAction = jest.fn();

// Mutable on purpose: each test describes its own contributions, applies the description to a fresh
// program, and hands the wizard the command as registered - exactly what the launchers do.
const description = { seamVersion: 1, commands: [], options: [], hooks: { beforeAction } };

jest.unstable_mockModule('#extensions', () => ({ extensions: description }));

const qseowVerifyCertificatesExist = jest.fn();
const qseowVerifyContentLibraryExists = jest.fn();
const listAppsByTag = jest.fn();
const listAllApps = jest.fn();
const qseowCreateThumbnails = jest.fn().mockResolvedValue(true);

jest.unstable_mockModule('../../qseow/qseow-certificates.js', () => ({
    qseowVerifyCertificatesExist,
}));
jest.unstable_mockModule('../../qseow/qseow-contentlibrary.js', () => ({
    qseowVerifyContentLibraryExists,
}));
jest.unstable_mockModule('../../qseow/qseow-app-lookup.js', () => ({
    listAppsByTag,
    listAllApps,
}));
jest.unstable_mockModule('../../qseow/qseow-create-thumbnails.js', () => ({
    qseowCreateThumbnails,
}));

const { runInteractive } = await import('../index.js');
const { scriptedRuntime } = await import('../test-helpers/scripted-runtime.js');
const { leafCommandIn } = await import('../command-tree.js');
const { contributedGateKey } = await import('../contributed.js');
const { applyExtensions } = await import('../../extensions/apply.js');
const { buildQseowCommand } = await import('../../commands/qseow/index.js');

const PATH = 'qseow create-sheet-thumbnails';
const SECTION = 'Tile style';
const GATE = contributedGateKey(SECTION);

/**
 * A complete set of wizard answers for the command's own questions, ending in "Run it".
 *
 * @param {object} [overrides] - Answers to replace or add.
 *
 * @returns {object} Answers for the scripted runtime.
 */
const answers = (overrides = {}) => ({
    host: 'sense.acme.com',
    certfile: './cert/client.pem',
    certkeyfile: './cert/client_key.pem',
    apiuserdir: 'INTERNAL',
    apiuserid: 'sa_api',
    logonuserdir: 'ACME',
    logonuserid: 'goran',
    logonpwd: 'a-password',
    _appSource: 'all',
    appid: ['app-a'],
    contentlibrary: 'Butler sheet thumbnails',
    includesheetpart: '1',
    _filtering: false,
    _advanced: false,
    _review: 'run',
    ...overrides,
});

/**
 * A contribution of `--tile-colour` to the qseow command.
 *
 * @param {object} [interactive] - The placement, or nothing for "asked last, ungated".
 *
 * @returns {object} An OptionContribution.
 */
const tileColour = (interactive) => ({
    path: PATH,
    option: new Option('--tile-colour <colour>', 'Colour of the tiles.').env('BSI_TILE_COLOUR'),
    ...(interactive ? { interactive } : {}),
});

/**
 * Build a fresh program, apply the description's current contributions to it, and return the
 * registered leaf - what `launchInteractive` hands the wizard.
 *
 * @param {object[]} contributions - The description's `options` for this test.
 *
 * @returns {import('commander').Command} The registered `qseow create-sheet-thumbnails`.
 */
const registered = (contributions) => {
    description.options = contributions;

    const program = new Command('butler-sheet-icons');
    program.addCommand(buildQseowCommand());
    applyExtensions(program, description);

    return leafCommandIn(program, PATH);
};

/**
 * The keys the wizard asked, in order.
 *
 * @param {object} runtime - A scripted runtime after a run.
 *
 * @returns {string[]} Keys.
 */
const askedKeys = (runtime) => runtime.asked.map((entry) => entry.key);

beforeEach(() => {
    jest.clearAllMocks();
    beforeAction.mockReset();
    qseowVerifyCertificatesExist.mockResolvedValue(true);
    qseowVerifyContentLibraryExists.mockResolvedValue(true);
    listAllApps.mockResolvedValue([{ id: 'app-a', name: 'Finance' }]);
    listAppsByTag.mockResolvedValue([]);
    qseowCreateThumbnails.mockResolvedValue(true);
});

describe('the wizard reads the command as registered', () => {
    test('an option a build contributed is asked about, and reaches the run and the hook', async () => {
        const command = registered([tileColour({ section: SECTION })]);
        const runtime = scriptedRuntime(answers({ [GATE]: true, tileColour: '#abc' }));

        await runInteractive({ path: PATH, command, runtime });

        expect(askedKeys(runtime)).toContain('tileColour');
        expect(qseowCreateThumbnails).toHaveBeenCalledTimes(1);
        expect(qseowCreateThumbnails.mock.calls[0][0].tileColour).toBe('#abc');

        // The entitlement check sees it as supplied - it is what the hook would gate on.
        const [, options, context] = beforeAction.mock.calls[0];
        expect(options.tileColour).toBe('#abc');
        expect(context.supplied.has('tileColour')).toBe(true);
    });

    test('a wizard handed no command rebuilds the tree, which never heard of the contribution', async () => {
        // The old behaviour, kept for callers that ask what core declares - and the reason both
        // launchers now pass the registered command.
        registered([tileColour({ section: SECTION })]);
        const runtime = scriptedRuntime(answers());

        await runInteractive({ path: PATH, runtime });

        expect(askedKeys(runtime)).not.toContain('tileColour');
        expect(qseowCreateThumbnails.mock.calls[0][0]).not.toHaveProperty('tileColour');
    });

    test('the echoed command line carries the contributed value', async () => {
        const command = registered([tileColour({ section: SECTION })]);
        const runtime = scriptedRuntime(answers({ [GATE]: true, tileColour: '#abc' }));

        await runInteractive({ path: PATH, command, runtime });

        expect(runtime.output()).toContain('--tile-colour');
    });
});

describe('where a contributed question is asked', () => {
    test("under its section, behind its gate, after the command's own sections", async () => {
        const command = registered([tileColour({ section: SECTION, gate: 'Style the tiles?' })]);
        const runtime = scriptedRuntime(answers({ [GATE]: true, tileColour: '#abc' }));

        await runInteractive({ path: PATH, command, runtime });

        const keys = askedKeys(runtime);
        const gate = runtime.asked.find((entry) => entry.key === GATE);

        expect(gate.type).toBe('confirm');
        expect(gate.message).toBe('Style the tiles?');
        // The gate opens the section, the question follows it, and both come after the last of the
        // command's own questions (the Advanced gate closes the wizard's own conversation).
        expect(keys.indexOf(GATE)).toBeGreaterThan(keys.indexOf('_advanced'));
        expect(keys.indexOf('tileColour')).toBe(keys.indexOf(GATE) + 1);
        expect(runtime.output()).toContain(`${SECTION} `);
    });

    test('the gate defaults to naming the section', async () => {
        const command = registered([tileColour({ section: SECTION })]);
        const runtime = scriptedRuntime(answers({ [GATE]: true, tileColour: '#abc' }));

        await runInteractive({ path: PATH, command, runtime });

        expect(runtime.asked.find((entry) => entry.key === GATE).message).toBe(
            `Configure ${SECTION}?`
        );
    });

    test('declining the gate skips every question under it', async () => {
        const command = registered([tileColour({ section: SECTION })]);
        // No answer queued for tileColour: the scripted runtime fails loudly if it is asked.
        const runtime = scriptedRuntime(answers({ [GATE]: false }));

        await runInteractive({ path: PATH, command, runtime });

        expect(askedKeys(runtime)).not.toContain('tileColour');
        expect(qseowCreateThumbnails.mock.calls[0][0]).not.toHaveProperty('tileColour');
    });

    test('two contributions naming the same section share one gate and one heading', async () => {
        const command = registered([
            tileColour({ section: SECTION }),
            {
                path: PATH,
                option: new Option('--tile-icon <name>', 'Icon on the tiles.'),
                interactive: { section: SECTION },
            },
        ]);
        const runtime = scriptedRuntime(
            answers({ [GATE]: true, tileColour: '#abc', tileIcon: 'chart' })
        );

        await runInteractive({ path: PATH, command, runtime });

        const keys = askedKeys(runtime);
        expect(keys.filter((key) => key === GATE)).toHaveLength(1);
        expect(keys.slice(keys.indexOf(GATE), keys.indexOf(GATE) + 3)).toEqual([
            GATE,
            'tileColour',
            'tileIcon',
        ]);
        expect(runtime.output().split(`${SECTION} `)).toHaveLength(2);
        expect(qseowCreateThumbnails.mock.calls[0][0]).toMatchObject({
            tileColour: '#abc',
            tileIcon: 'chart',
        });
    });

    test('a contribution that declared no placement is asked last, ungated', async () => {
        const command = registered([tileColour()]);
        const runtime = scriptedRuntime(answers({ tileColour: '#abc' }));

        await runInteractive({ path: PATH, command, runtime });

        const keys = askedKeys(runtime);
        // Last before the review prompt, and no gate in front of it.
        expect(keys.at(-2)).toBe('tileColour');
        expect(keys.at(-1)).toBe('_review');
        expect(keys.some((key) => key.startsWith('_contributed'))).toBe(false);
        expect(qseowCreateThumbnails.mock.calls[0][0].tileColour).toBe('#abc');
    });
});

describe('a contributed value that was already supplied', () => {
    test('is asked about again, opened on the value, because it describes this run', async () => {
        const command = registered([tileColour({ section: SECTION })]);
        const runtime = scriptedRuntime(answers({ [GATE]: true, tileColour: '#def' }));

        await runInteractive({
            path: PATH,
            command,
            runtime,
            presetOptions: { tileColour: '#abc' },
            presetSources: { tileColour: 'env' },
        });

        const asked = runtime.asked.find((entry) => entry.key === 'tileColour');
        expect(asked).toBeDefined();
        expect(asked.default).toBe('#abc');
        expect(runtime.output()).toContain('asked about again');
        expect(qseowCreateThumbnails.mock.calls[0][0].tileColour).toBe('#def');
    });

    test('unless the contribution said perRun: false, when it is an answer rather than a question', async () => {
        const command = registered([tileColour({ section: SECTION, perRun: false })]);
        // Neither the gate nor the question is queued: asking either would fail loudly.
        const runtime = scriptedRuntime(answers());

        await runInteractive({
            path: PATH,
            command,
            runtime,
            presetOptions: { tileColour: '#abc' },
            presetSources: { tileColour: 'cli' },
        });

        expect(askedKeys(runtime)).not.toContain('tileColour');
        expect(runtime.output()).toContain('not asked about again');
        expect(qseowCreateThumbnails.mock.calls[0][0].tileColour).toBe('#abc');
    });
});
