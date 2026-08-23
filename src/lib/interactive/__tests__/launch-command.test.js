import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { Command } from 'commander';

// `launchInteractive` is what a leaf command's action calls for `-i`, with the parsed - that is,
// registered - command in hand. The wizard has to be given that command rather than a path to
// rebuild from the builders, or every option a build contributed through the extension point goes
// unasked (issue #1159). This pins the hand-over; the wizard's side is covered end to end in
// src/lib/interactive/__tests__/contributed-wizard.test.js.

const runInteractive = jest.fn().mockResolvedValue(true);
const assertInteractiveCapable = jest.fn();

jest.unstable_mockModule('../index.js', () => ({ runInteractive }));
jest.unstable_mockModule('../tty.js', () => ({ assertInteractiveCapable }));
jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
    },
}));

const { launchInteractive } = await import('../launch.js');

beforeEach(() => {
    jest.clearAllMocks();
    runInteractive.mockResolvedValue(true);
});

describe('launchInteractive', () => {
    test('hands the wizard the parsed command itself, not just its path', async () => {
        const command = new Command('create-sheet-thumbnails')
            .option('--host <host>', 'Host.')
            .option('-i, --interactive', 'Wizard.');
        command.parse(['--host', 'sense.acme.com', '-i'], { from: 'user' });

        await launchInteractive('TEST', 'qseow create-sheet-thumbnails', command);

        expect(runInteractive).toHaveBeenCalledTimes(1);
        const [args] = runInteractive.mock.calls[0];
        expect(args.path).toBe('qseow create-sheet-thumbnails');
        expect(args.command).toBe(command);
        expect(args.presetOptions).toEqual({ host: 'sense.acme.com' });
    });
});
