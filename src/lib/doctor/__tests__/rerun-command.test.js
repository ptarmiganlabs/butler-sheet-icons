import { test, expect, describe } from '@jest/globals';

import { rerunWith } from '../checks/rerun-command.js';

/**
 * The re-run suggestion names the command that was actually run.
 *
 * The checks' "try again with ..." remediations were written when `browser check` was the
 * registry's only consumer and named it literally - so `doctor check` told its reader to re-run
 * `browser check`, quietly narrowing a five-area diagnostic to a two-area one in the middle of
 * advice about how to investigate. The command now comes from the context, which is also what
 * lets a third consumer inherit correct advice without touching any check.
 */
describe('rerunWith', () => {
    test('builds the command from the context, for both host shells', () => {
        expect(rerunWith({ command: 'doctor check' }, '--browser-version recommended')).toEqual({
            powershell: 'butler-sheet-icons.exe doctor check --browser-version recommended',
            bash: './butler-sheet-icons doctor check --browser-version recommended',
        });
    });

    test('a context without a command falls back to the narrower diagnostic', () => {
        // The per-check unit tests hand-build contexts, and a check must never render
        // `undefined` into a line an administrator is asked to paste into a shell. The fallback
        // is `browser check` because under-claiming is the safe direction: it sends nobody to a
        // command they did not run.
        expect(rerunWith({}, '--skip-launch')).toEqual({
            powershell: 'butler-sheet-icons.exe browser check --skip-launch',
            bash: './butler-sheet-icons browser check --skip-launch',
        });
    });
});
