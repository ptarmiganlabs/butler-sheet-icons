import { describe, test, expect } from '@jest/globals';
import { leafCommandAt } from '../command-tree.js';
import { specsFromCommand } from '../option-introspect.js';
import { emissionsFor } from '../to-cli-options.js';
import {
    formatCommandLine,
    formatSecretEnvVars,
    quoteArg,
    HIDDEN,
} from '../render-command-line.js';

const specsFor = (path) => specsFromCommand(leafCommandAt(path), { env: {} });

const UNINSTALL = 'browser uninstall';
const QSEOW = 'qseow create-sheet-thumbnails';

describe('quoteArg', () => {
    test('leaves ordinary words alone, so the line stays readable', () => {
        for (const word of ['chrome', '151.0.7922.77', 'sense.acme.com', '--browser', 'a/b_c-d']) {
            expect(quoteArg(word)).toBe(word);
        }
    });

    test('quotes anything a shell would act on', () => {
        expect(quoteArg('my sheet')).toBe("'my sheet'");
        expect(quoteArg('a;b')).toBe("'a;b'");
        expect(quoteArg('$HOME')).toBe("'$HOME'");
        expect(quoteArg('')).toBe("''");
    });

    test('handles an embedded single quote', () => {
        expect(quoteArg("Göran's tag")).toBe(`'Göran'\\''s tag'`);
    });
});

describe('formatCommandLine', () => {
    test('starts with the programme and the command path', () => {
        const line = formatCommandLine(UNINSTALL, specsFor(UNINSTALL), {});

        expect(line.startsWith('butler-sheet-icons browser uninstall')).toBe(true);
    });

    test('omits answers that match their default, keeping the line short', () => {
        const line = formatCommandLine(UNINSTALL, specsFor(UNINSTALL), {
            browser: 'chrome',
            browserVersion: '151.0.7922.77',
            loglevel: 'info',
        });

        expect(line).toBe('butler-sheet-icons browser uninstall --browser-version 151.0.7922.77');
    });

    test('includes an answer that differs from the default', () => {
        const line = formatCommandLine(UNINSTALL, specsFor(UNINSTALL), {
            browserVersion: '151.0.7922.77',
            loglevel: 'debug',
        });

        expect(line).toContain('--loglevel debug');
    });

    test('shows defaulted answers when asked, for the full picture', () => {
        const line = formatCommandLine(
            UNINSTALL,
            specsFor(UNINSTALL),
            { browser: 'chrome', browserVersion: '151.0.7922.77', loglevel: 'info' },
            { showAll: true }
        );

        expect(line).toContain('--browser chrome');
        expect(line).toContain('--loglevel info');
    });

    test('quotes a value containing spaces so the line can be pasted as-is', () => {
        const line = formatCommandLine(QSEOW, specsFor(QSEOW), {
            excludeSheetTitle: ['Sales overview'],
        });

        expect(line).toContain("--exclude-sheet-title 'Sales overview'");
    });

    test('spreads a variadic answer across the flag once, as Commander expects', () => {
        const line = formatCommandLine(QSEOW, specsFor(QSEOW), {
            excludeSheetNumber: ['3', '4'],
        });

        expect(line).toContain('--exclude-sheet-number 3 4');
    });

    describe('secrets', () => {
        test('are never printed, but the flag still is', () => {
            // Knowing the option is needed is useful; only the value is
            // dangerous. The list is the same one the logger redacts against.
            const line = formatCommandLine(QSEOW, specsFor(QSEOW), {
                host: 'sense.acme.com',
                logonpwd: 'hunter2',
            });

            expect(line).toContain('--logonpwd');
            expect(line).toContain(HIDDEN);
            expect(line).not.toContain('hunter2');
        });

        test('can be shown deliberately, for a caller that needs the real line', () => {
            const line = formatCommandLine(
                QSEOW,
                specsFor(QSEOW),
                { logonpwd: 'hunter2' },
                { redactSecrets: false }
            );

            expect(line).toContain('hunter2');
        });

        test('are offered in environment-variable form instead', () => {
            // Putting a credential in a shell command is how it reaches shell
            // history and a scheduler's stored arguments.
            const lines = formatSecretEnvVars(specsFor(QSEOW), {
                host: 'sense.acme.com',
                logonpwd: 'hunter2',
            });

            expect(lines).toEqual(['BSI_QSEOW_CST_LOGON_PWD=hunter2']);
        });

        test('produce no env lines when nothing secret was answered', () => {
            expect(formatSecretEnvVars(specsFor(QSEOW), { host: 'sense.acme.com' })).toEqual([]);
        });
    });

    test('never prints a synthetic question', () => {
        const specs = specsFor(QSEOW);
        const line = formatCommandLine(QSEOW, specs, {
            _howToPickApps: 'by collection',
            host: 'sense.acme.com',
        });

        expect(line).not.toContain('_howToPickApps');
        expect(line).not.toContain('by collection');
    });

    test('is one line, with no shell continuations', () => {
        // The continuation character differs between bash and PowerShell, and a
        // line that is wrong for the reader's shell is worse than a long one.
        const specs = specsFor(QSEOW);
        const answers = Object.fromEntries(
            specs.filter((s) => s.type === 'input').map((s) => [s.key, 'x'])
        );
        const line = formatCommandLine(QSEOW, specs, answers);

        expect(line).not.toContain('\n');
        expect(line).not.toContain('\\\n');
        expect(line).not.toContain('`');
    });
});

describe('emissionsFor', () => {
    test('reports why each omitted answer was omitted', () => {
        const specs = specsFor(UNINSTALL);
        const emissions = emissionsFor(
            specs,
            { browser: 'chrome', browserVersion: '151.0.7922.77' },
            { env: {} }
        );
        const byKey = Object.fromEntries(emissions.map((e) => [e.spec.key, e]));

        expect(byKey.browser.emitted).toBe(false);
        expect(byKey.browser.reason).toBe('same as default');
        expect(byKey.loglevel.emitted).toBe(false);
        expect(byKey.loglevel.reason).toBe('not asked');
        expect(byKey.browserVersion.emitted).toBe(true);
    });

    test('emits an option whose environment variable is set, even at its default', () => {
        // Without this the printed line would silently mean something else on
        // another machine - the whole point of printing it is that it travels.
        const specs = specsFor(UNINSTALL);
        const option = specs.find((s) => s.key === 'browser').option;
        const emissions = emissionsFor(
            specs,
            { browser: 'chrome' },
            { env: { [option.envVar]: 'chrome' } }
        );

        expect(emissions.find((e) => e.spec.key === 'browser').emitted).toBe(true);
    });

    test('is the single source both the bag and the printed line read', () => {
        // Two functions each deciding separately what to include is exactly how
        // an echoed line drifts from the run it claims to describe.
        const specs = specsFor(QSEOW);
        const answers = { host: 'sense.acme.com', pagewait: '7' };
        const tokens = emissionsFor(specs, answers, { env: {} }).flatMap((e) => e.tokens);
        const line = formatCommandLine(QSEOW, specs, answers, { env: {} });

        for (const token of tokens) {
            expect(line).toContain(token);
        }
    });
});
