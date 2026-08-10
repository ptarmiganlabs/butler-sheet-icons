import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
    },
    appVersion: 'test-version',
    isSea: false,
    setLoggingLevel: jest.fn(),
    getLoggingLevel: jest.fn(() => 'info'),
}));

let selfTest;
let ASCII_ONLY_ENV;
let ASCII_SYMBOLS;
let UNICODE_SYMBOLS;

beforeAll(async () => {
    selfTest = await import('../self-test.js');
    ({ ASCII_ONLY_ENV, ASCII_SYMBOLS, UNICODE_SYMBOLS } = await import('../symbols.js'));
});

// A terminal that can do everything, so the gallery is reached.
const capableDeps = () => ({
    stdin: { isTTY: true, setRawMode: () => {} },
    stdout: { isTTY: true, columns: 120, rows: 40, hasColors: () => true, getColorDepth: () => 8 },
    env: {},
    platform: 'linux',
    arch: 'x64',
    nodeVersion: 'v24.0.0',
    packaged: false,
});

// The shape a piped or scheduled run actually has.
const pipedDeps = (env = {}) => ({
    stdin: { isTTY: false },
    stdout: { isTTY: false },
    env,
    platform: 'linux',
    arch: 'x64',
    nodeVersion: 'v24.0.0',
    packaged: false,
});

const fakeRuntime = () => {
    const written = [];
    const asked = [];

    return {
        written,
        asked,
        output: () => written.join(''),
        write: (text) => written.push(text),
        ask: async (spec, config) => {
            asked.push({ type: spec.type, message: config.message });

            return 'answer';
        },
    };
};

describe('collectCapabilities', () => {
    test('is pure over its injected environment', () => {
        const rows = selfTest.collectCapabilities(capableDeps());
        const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));

        expect(byLabel.platform).toBe('linux x64');
        expect(byLabel.node).toBe('v24.0.0');
        expect(byLabel['stdin is a terminal']).toBe('yes');
        expect(byLabel['columns x rows']).toBe('120 x 40');
        expect(byLabel.available).toBe('yes');
        expect(byLabel['blocked by']).toBe('(nothing)');
    });

    test('reports every section the support workflow depends on', () => {
        const sections = new Set(selfTest.collectCapabilities(capableDeps()).map((r) => r.section));

        expect([...sections]).toEqual([
            'Runtime',
            'Terminal',
            'Colour',
            'Unicode',
            'Interactive mode',
        ]);
    });

    test('records that hasColors is absent on a piped stream, not merely false', () => {
        // The detail worth surfacing: on a pipe it is not a function at all, so
        // anything calling it without testing isTTY first throws rather than
        // degrading. An administrator reading this row can see that directly.
        const rows = selfTest.collectCapabilities(pipedDeps());
        const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));

        expect(byLabel['typeof stdout.hasColors']).toBe('undefined');
        expect(byLabel['colour depth']).toBe('(not a terminal)');
    });

    test('names the blocker when interactive mode is unavailable', () => {
        const byLabel = Object.fromEntries(
            selfTest.collectCapabilities(pipedDeps()).map((r) => [r.label, r.value])
        );

        expect(byLabel.available).toBe('no');
        expect(byLabel['blocked by']).toBe('stdin-not-tty');
    });

    test('every row is a printable string, so the report can never render [object Object]', () => {
        for (const row of selfTest.collectCapabilities(capableDeps())) {
            expect(typeof row.value).toBe('string');
            expect(row.value).not.toContain('[object');
        }
    });
});

describe('readWindowsCodePage', () => {
    test('is not applicable away from Windows', () => {
        const run = jest.fn();

        expect(selfTest.readWindowsCodePage('darwin', run)).toBeNull();
        expect(run).not.toHaveBeenCalled();
    });

    test('extracts the code page number from chcp output', () => {
        const run = jest.fn(() => 'Active code page: 65001\r\n');

        expect(selfTest.readWindowsCodePage('win32', run)).toBe('65001');
    });

    test('reads a legacy code page, the case that causes mojibake', () => {
        const run = jest.fn(() => 'Active code page: 850\r\n');

        expect(selfTest.readWindowsCodePage('win32', run)).toBe('850');
    });

    test('not knowing is a fine outcome; a broken chcp must not fail the self-test', () => {
        const run = jest.fn(() => {
            throw new Error('chcp.com not found');
        });

        expect(selfTest.readWindowsCodePage('win32', run)).toBeNull();
    });
});

// Every assertion here pins the symbol set explicitly. Letting the real
// detector decide would make these tests agree with whichever host ran them:
// is-unicode-supported reads process.env directly, so it says yes on the ubuntu
// runner and no on the windows one, and an assertion of "norc" would pass on one
// and fail on the other. That is the whole reason BSI_ASCII_ONLY exists, and it
// applies to the tests as much as to CI.
describe('the rendered matrices', () => {
    test('omit the Unicode column when the ASCII set is in use', () => {
        // Printing characters the terminal has just told us it cannot render
        // would be the very mojibake this command exists to detect.
        const out = selfTest.formatSymbolMatrix(ASCII_SYMBOLS);
        const offending = [...out].filter((c) => !/[\x20-\x7e\r\n\t]/.test(c));

        expect(out).toContain('in use: ascii');
        expect(out).toContain('unicode column is omitted');
        expect(offending).toEqual([]);
    });

    test('show both columns when Unicode is available, for comparison', () => {
        // The support case: an administrator whose Unicode column renders as
        // boxes has demonstrated detection was wrong, with no version guessing.
        const out = selfTest.formatSymbolMatrix(UNICODE_SYMBOLS);

        expect(out).toContain('in use: unicode');
        expect(out).toContain(UNICODE_SYMBOLS.cursor);
        expect(out).toContain(ASCII_SYMBOLS.done);
    });

    test('border sample follows the symbol set', () => {
        const unicodeTerminal = () => true;
        const asciiTerminal = () => false;

        expect(selfTest.formatBorderMatrix({}, unicodeTerminal)).toContain('norc');
        expect(selfTest.formatBorderMatrix({}, asciiTerminal)).not.toContain('norc');
        expect(selfTest.formatBorderMatrix({}, asciiTerminal)).toContain('ramac');
    });

    test('the ASCII override wins over a terminal that claims Unicode support', () => {
        const out = selfTest.formatBorderMatrix({ [ASCII_ONLY_ENV]: '1' }, () => true);

        expect(out).not.toContain('norc');
        expect(out).toContain('ramac');
    });
});

describe('renderStaticReport', () => {
    test('needs no terminal at all', () => {
        expect(() => selfTest.renderStaticReport(pipedDeps())).not.toThrow();
    });

    test('emits nothing outside printable ASCII when the fallback is forced', () => {
        // The one degradation criterion that can be checked mechanically rather
        // than by looking at a screenshot on a Windows console.
        const report = selfTest.renderStaticReport(pipedDeps({ [ASCII_ONLY_ENV]: '1' }));
        const offending = [...report].filter((c) => !/[\x20-\x7e\r\n\t]/.test(c));

        expect(offending).toEqual([]);
    });

    test('includes the capability report and every matrix', () => {
        // Forced to ASCII so the content is the same on every host. Without it
        // the assertions would quietly describe whichever runner executed them.
        const report = selfTest.renderStaticReport(pipedDeps({ [ASCII_ONLY_ENV]: '1' }));

        expect(report).toContain('self-test');
        expect(report).toContain('Interactive mode');
        expect(report).toContain('Symbols');
        expect(report).toContain('Table borders');
        expect(report).toContain('ramac');
    });
});

describe('runSelfTest', () => {
    let runtime;

    beforeEach(() => {
        runtime = fakeRuntime();
    });

    test('skips the prompt gallery, and still succeeds, when there is no terminal', async () => {
        // Exiting 0 is what lets this command be the CI check that guards the
        // non-TTY path. A non-zero exit would make it useless for that.
        const result = await selfTest.runSelfTest({ runtime, deps: pipedDeps() });

        expect(result).toBe(true);
        expect(runtime.asked).toEqual([]);
        expect(runtime.output()).toContain('skipped');
        expect(runtime.output()).toContain('stdin');
    });

    test('renders one of each prompt type when a terminal is present', async () => {
        await selfTest.runSelfTest({ runtime, deps: capableDeps() });

        expect(runtime.asked.map((a) => a.type)).toEqual([
            'input',
            'password',
            'confirm',
            'number',
            'select',
            'checkbox',
            'search',
        ]);
    });

    test('does not read the Windows code page when one is supplied', async () => {
        await selfTest.runSelfTest({ runtime, deps: { ...pipedDeps(), codePage: '437' } });

        expect(runtime.output()).toContain('437');
    });
});
