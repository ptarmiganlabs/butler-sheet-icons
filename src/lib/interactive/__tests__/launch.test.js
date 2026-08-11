import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { presetOptionsFrom } from '../launch.js';
import { addInteractiveOption } from '../interactive-option.js';
import { buildQseowCommand } from '../../commands/qseow/index.js';

const ENV_SNAPSHOT = { ...process.env };

beforeEach(() => {
    for (const key of Object.keys(process.env)) {
        if (/^BS_?I?_/.test(key)) delete process.env[key];
    }
});

afterEach(() => {
    process.env = { ...ENV_SNAPSHOT };
});

/**
 * Parse a qseow command line and return the parsed leaf command.
 *
 * Mandatory options are cleared first, exactly as the real entry point does when
 * `-i` is present, so a partial command line parses.
 *
 * @param {string[]} tail - Argv after the command path.
 *
 * @returns {import('commander').Command} The parsed leaf.
 */
const parseQseow = (tail) => {
    const namespace = buildQseowCommand();
    const leaf = namespace.commands[0];

    // The builder declares -i itself now that this command has a wizard; adding
    // it again would give Commander two options storing under the same key.
    if (!leaf.options.some((option) => option.long === '--interactive')) {
        addInteractiveOption(leaf);
    }
    leaf.exitOverride().configureOutput({ writeOut: () => {}, writeErr: () => {} });
    leaf._actionHandler = undefined;
    leaf.action(() => {});

    for (const option of leaf.options) {
        option.makeOptionMandatory(false);
    }

    leaf.parse(['node', 'bsi', ...tail]);

    return leaf;
};

describe('presetOptionsFrom', () => {
    test('keeps what was given on the command line', () => {
        const presets = presetOptionsFrom(parseQseow(['--host', 'sense.acme.com', '-i']));

        expect(presets.host).toBe('sense.acme.com');
    });

    test('keeps what was given through a BSI_* environment variable', () => {
        process.env.BSI_QSEOW_CST_API_USER_DIR = 'INTERNAL';

        const presets = presetOptionsFrom(parseQseow(['-i']));

        expect(presets.apiuserdir).toBe('INTERNAL');
    });

    test('leaves defaults out, so they are still asked about', () => {
        // A default is what the wizard would offer as the pre-filled answer
        // anyway. Treating it as "already supplied" would silently hide most of
        // the questions behind values the administrator never chose - the
        // opposite of the point.
        const presets = presetOptionsFrom(parseQseow(['-i']));

        expect(presets).not.toHaveProperty('engineport');
        expect(presets).not.toHaveProperty('contentlibrary');
    });

    test('leaves unset options out', () => {
        const presets = presetOptionsFrom(parseQseow(['-i']));

        expect(presets).not.toHaveProperty('logonpwd');
    });

    test('never carries the interactive flag itself', () => {
        // It is not an answer to anything, and emitting it into the echoed
        // command line would make that line re-open the wizard when pasted back.
        const presets = presetOptionsFrom(parseQseow(['--host', 'h', '-i']));

        expect(presets).not.toHaveProperty('interactive');
    });

    test('a command line supplying nothing presets nothing', () => {
        expect(presetOptionsFrom(parseQseow(['-i']))).toEqual({});
    });

    test('tolerates being handed no command at all', () => {
        expect(presetOptionsFrom(undefined)).toEqual({});
    });
});
