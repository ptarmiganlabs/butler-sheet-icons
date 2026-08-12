import { execFileSync } from 'node:child_process';
import { getBorderCharacters } from 'table';
import { isSea } from '../../globals.js';
import { isColourEnabled, createPalette } from '../util/colour.js';
import {
    ASCII_ONLY_ENV,
    ASCII_SYMBOLS,
    UNICODE_SYMBOLS,
    getSymbols,
    isUnicodeCapable,
    tableBorderName,
} from './symbols.js';
import { buildTheme } from './theme.js';
import { interactiveBlocker, INTERACTIVE_OPT_OUT_ENV } from './tty.js';
import { defaultRuntime } from './prompt-runtime.js';

/**
 * Width the capability labels are padded to, so values line up in one column.
 */
const LABEL_WIDTH = 26;

const yesNo = (value) => (value ? 'yes' : 'no');
const orUnset = (value) => (value === undefined ? '(not set)' : JSON.stringify(value));

/**
 * Read the Windows console code page, best effort.
 *
 * This is the measurement that matters most on Windows and the one no library
 * performs: Node writes UTF-8 bytes, and if the console is on a legacy code
 * page (437 and 850 are common) those bytes are decoded as that code page and
 * multi-byte characters render as mojibake. `is-unicode-supported` does not
 * read this - it is a heuristic over WT_SESSION, TERM and the platform - so a
 * report that printed only its verdict would hide the actual mechanism.
 *
 * @param {string} [platform] - Platform to test. Defaults to `process.platform`.
 * @param {Function} [run] - Command runner, injectable for tests.
 *
 * @returns {string|null} The code page as text, or `null` when not applicable or unreadable.
 */
export const readWindowsCodePage = (platform = process.platform, run = execFileSync) => {
    if (platform !== 'win32') {
        return null;
    }

    try {
        // "Active code page: 65001"
        const output = String(run('chcp.com', { encoding: 'utf8', timeout: 5000 }));
        const match = /(\d{3,5})/.exec(output);

        return match ? match[1] : output.trim();
    } catch {
        // chcp.com missing or blocked. Not knowing is a fine outcome; failing
        // the self-test over it is not.
        return null;
    }
};

/**
 * Gather everything that decides how the wizard renders.
 *
 * Pure over its inputs, so the whole report is testable without a terminal.
 *
 * @param {object} [deps] - Injected environment.
 * @param {object} [deps.stdin] - Input stream. Defaults to `process.stdin`.
 * @param {object} [deps.stdout] - Output stream. Defaults to `process.stdout`.
 * @param {object} [deps.env] - Environment. Defaults to `process.env`.
 * @param {string} [deps.platform] - Platform string. Defaults to `process.platform`.
 * @param {string} [deps.arch] - Architecture string. Defaults to `process.arch`.
 * @param {string} [deps.nodeVersion] - Node version. Defaults to `process.version`.
 * @param {boolean} [deps.packaged] - Whether this is a SEA binary.
 * @param {string|null} [deps.codePage] - Windows code page, from {@link readWindowsCodePage}.
 *
 * @returns {Array<{section: string, label: string, value: string}>} Report rows, in print order.
 */
export const collectCapabilities = ({
    stdin = process.stdin,
    stdout = process.stdout,
    env = process.env,
    platform = process.platform,
    arch = process.arch,
    nodeVersion = process.version,
    packaged = isSea,
    codePage = null,
} = {}) => {
    const blocker = interactiveBlocker({ stdin, stdout, env });
    const colour = isColourEnabled(stdout, env);
    const unicode = isUnicodeCapable(env);

    const rows = [
        ['Runtime', 'platform', `${platform} ${arch}`],
        ['Runtime', 'node', nodeVersion],
        ['Runtime', 'packaged binary (SEA)', yesNo(packaged)],

        ['Terminal', 'stdin is a terminal', yesNo(Boolean(stdin?.isTTY))],
        ['Terminal', 'stdout is a terminal', yesNo(Boolean(stdout?.isTTY))],
        // Not a typo in the report: on a piped stream hasColors is not a
        // function at all, rather than a function returning false. Anything
        // calling it without testing isTTY first throws instead of degrading.
        ['Terminal', 'typeof stdout.hasColors', typeof stdout?.hasColors],
        ['Terminal', 'can set raw mode', yesNo(typeof stdin?.setRawMode === 'function')],
        ['Terminal', 'columns x rows', `${stdout?.columns ?? '?'} x ${stdout?.rows ?? '?'}`],
        ['Terminal', 'TERM', orUnset(env.TERM)],
        ['Terminal', 'TERM_PROGRAM', orUnset(env.TERM_PROGRAM)],
        ['Terminal', 'WT_SESSION', orUnset(env.WT_SESSION)],
        ['Terminal', 'ConEmuTask', orUnset(env.ConEmuTask)],

        ['Colour', 'colour enabled', yesNo(colour)],
        [
            'Colour',
            'colour depth',
            stdout?.isTTY && typeof stdout.getColorDepth === 'function'
                ? String(stdout.getColorDepth())
                : '(not a terminal)',
        ],
        ['Colour', 'NO_COLOR', orUnset(env.NO_COLOR)],
        ['Colour', 'FORCE_COLOR', orUnset(env.FORCE_COLOR)],

        ['Unicode', 'unicode symbols in use', yesNo(unicode)],
        ['Unicode', 'table border set', tableBorderName(env)],
        ['Unicode', ASCII_ONLY_ENV, orUnset(env[ASCII_ONLY_ENV])],
        ['Unicode', 'console code page', codePage ?? '(not applicable)'],

        ['Interactive mode', 'available', yesNo(blocker === null)],
        ['Interactive mode', 'blocked by', blocker ? blocker.reason : '(nothing)'],
        ['Interactive mode', INTERACTIVE_OPT_OUT_ENV, orUnset(env[INTERACTIVE_OPT_OUT_ENV])],
    ];

    return rows.map(([section, label, value]) => ({ section, label, value: String(value) }));
};

/**
 * Render a section heading.
 *
 * @param {string} title - Heading text.
 * @param {object} symbols - Symbol set supplying the rule character.
 *
 * @returns {string} One line, newline-terminated.
 */
const heading = (title, symbols) => {
    const rule = symbols.rule.repeat(Math.max(3, 52 - title.length));

    return `\n${symbols.rule.repeat(2)} ${title} ${rule}\n`;
};

/**
 * Render the capability rows as grouped, aligned text.
 *
 * @param {Array<{section: string, label: string, value: string}>} rows - From {@link collectCapabilities}.
 * @param {object} [symbols] - Symbol set. Defaults to this terminal's.
 *
 * @returns {string} The formatted report.
 */
export const formatCapabilities = (rows, symbols = getSymbols()) => {
    let out = '';
    let section = null;

    for (const row of rows) {
        if (row.section !== section) {
            section = row.section;
            out += heading(section, symbols);
        }
        out += `  ${row.label.padEnd(LABEL_WIDTH)}${row.value}\n`;
    }

    return out;
};

/**
 * Render the symbol sets.
 *
 * When the terminal can render Unicode, both sets are printed side by side.
 * That is what makes the report useful in a support thread: an administrator
 * whose Unicode column comes out as boxes or question marks has demonstrated
 * that detection was wrong and the fallback is needed, without anyone having to
 * guess from a version string.
 *
 * When the ASCII set is in use, only the ASCII column is printed. Printing
 * characters the terminal has just told us it cannot render would be the very
 * mojibake this command exists to detect, and it would make the report's own
 * output impossible to check mechanically.
 *
 * @param {object} [symbols] - Symbol set in use.
 *
 * @returns {string} The formatted matrix.
 */
export const formatSymbolMatrix = (symbols = getSymbols()) => {
    const unicode = symbols === UNICODE_SYMBOLS;
    const names = Object.keys(UNICODE_SYMBOLS).filter((name) => name !== 'spinnerFrames');
    const frames = (set) => set.spinnerFrames.join('');

    let out = `  (in use: ${unicode ? 'unicode' : 'ascii'})\n`;

    if (!unicode) {
        out += '  the unicode column is omitted: this terminal cannot render it\n';
        out += `  ${'name'.padEnd(14)}ascii\n`;
        for (const name of names) {
            out += `  ${name.padEnd(14)}${ASCII_SYMBOLS[name]}\n`;
        }
        out += `  ${'spinner'.padEnd(14)}${frames(ASCII_SYMBOLS)}\n`;

        return out;
    }

    out += `  ${'name'.padEnd(14)}${'unicode'.padEnd(12)}ascii\n`;
    for (const name of names) {
        out += `  ${name.padEnd(14)}${String(UNICODE_SYMBOLS[name]).padEnd(12)}${ASCII_SYMBOLS[name]}\n`;
    }
    out += `  ${'spinner'.padEnd(14)}${frames(UNICODE_SYMBOLS).padEnd(12)}${frames(ASCII_SYMBOLS)}\n`;

    return out;
};

/**
 * Render a sample of the table border sets.
 *
 * Follows the same rule as {@link formatSymbolMatrix}: the Unicode set is shown
 * only when this terminal can render it.
 *
 * @param {object} [env] - Environment, used to report which set is in use.
 * @param {Function} [detect] - Unicode detection function. Injectable so tests do not depend on the host running them.
 *
 * @returns {string} The formatted sample.
 */
export const formatBorderMatrix = (env = process.env, detect = undefined) => {
    const inUse = detect ? tableBorderName(env, detect) : tableBorderName(env);
    const shown = inUse === 'ramac' ? ['ramac'] : ['norc', 'ramac'];

    let out = `  (in use: ${inUse})\n`;

    for (const name of shown) {
        const b = getBorderCharacters(name);
        const top = `${b.topLeft}${b.topBody.repeat(3)}${b.topJoin}${b.topBody.repeat(3)}${b.topRight}`;
        const body = `${b.bodyLeft}${' '.repeat(3)}${b.bodyJoin}${' '.repeat(3)}${b.bodyRight}`;
        const bottom = `${b.bottomLeft}${b.bottomBody.repeat(3)}${b.bottomJoin}${b.bottomBody.repeat(3)}${b.bottomRight}`;

        out += `  ${name.padEnd(8)}${top}  ${body}  ${bottom}\n`;
    }

    return out;
};

/**
 * Render the colour palette, and the theme styles built on it.
 *
 * @param {object} [options] - Rendering options.
 * @param {object} [options.stdout] - Stream the colour decision is made against.
 * @param {object} [options.env] - Environment.
 *
 * @returns {string} The formatted palette.
 */
export const formatPalette = ({ stdout = process.stdout, env = process.env } = {}) => {
    const enabled = isColourEnabled(stdout, env);
    const palette = createPalette(enabled);
    const theme = buildTheme({ palette, symbols: getSymbols(env) });

    let out = `  (colour ${enabled ? 'enabled' : 'disabled'})\n`;
    out += `  ${['red', 'green', 'yellow', 'blue', 'cyan', 'dim', 'bold']
        .map((name) => palette[name](name))
        .join('  ')}\n`;
    out += `  prompt prefix  ${theme.prefix.idle} idle   ${theme.prefix.done} done\n`;
    out += `  message        ${theme.style.message('Which browser should be installed?')}\n`;
    out += `  answer         ${theme.style.answer('chrome')}\n`;
    out += `  default        ${theme.style.defaultAnswer('chrome')}\n`;
    out += `  help           ${theme.style.help('Use the arrow keys, then Enter')}\n`;
    out += `  error          ${theme.style.error('Engine port must be a non-negative integer.')}\n`;
    out += `  cursor         ${theme.icon.cursor} selected item\n`;
    out += `  checkbox       ${theme.icon.checked} checked   ${theme.icon.unchecked} unchecked\n`;

    return out;
};

/**
 * The part of the self-test that needs no terminal.
 *
 * Split out deliberately. Everything here runs and exits 0 with stdin closed,
 * which is what lets CI assert on it - including that the ASCII fallback emits
 * nothing outside printable ASCII, the one degradation criterion that can be
 * checked mechanically rather than by looking at a screenshot.
 *
 * @param {object} [deps] - Injected environment. See {@link collectCapabilities}.
 *
 * @returns {string} The full static report.
 */
export const renderStaticReport = (deps = {}) => {
    const env = deps.env ?? process.env;
    const stdout = deps.stdout ?? process.stdout;
    const symbols = getSymbols(env);

    let out = 'Butler Sheet Icons - interactive mode self-test\n';
    out += formatCapabilities(collectCapabilities(deps), symbols);
    out += heading('Symbols', symbols) + formatSymbolMatrix(symbols);
    out += heading('Table borders', symbols) + formatBorderMatrix(env);
    out += heading('Colour', symbols) + formatPalette({ stdout, env });

    return out;
};

/**
 * One of each prompt type, for a human to look at.
 *
 * This is the half that cannot be automated: whether raw mode, cursor movement
 * and line redraw behave inside the packaged binary on a given console host is
 * a question only a person watching the screen can answer.
 *
 * @param {object} runtime - Prompt runtime to drive.
 * @param {object} theme - Theme to render with.
 *
 * @returns {Promise<void>} Resolves when every prompt has been answered.
 */
const runPromptGallery = async (runtime, theme) => {
    // Demo data only - nothing here is applied. Log levels rather than browsers: they are a real
    // multi-value option, and the gallery needs more than one entry for the cursor, the toggle
    // and the filter to have anything to do.
    const choices = [
        { name: 'info', value: 'info', description: 'The default log level' },
        { name: 'verbose', value: 'verbose', description: 'Adds progress detail' },
        { name: 'debug', value: 'debug', description: 'Adds internal diagnostics' },
    ];

    await runtime.ask(
        { type: 'input', key: '_input' },
        { message: 'input - type anything', default: 'sample', theme }
    );
    await runtime.ask(
        { type: 'password', key: '_password' },
        { message: 'password - the text must stay hidden', theme }
    );
    await runtime.ask(
        { type: 'confirm', key: '_confirm' },
        { message: 'confirm - does this look right?', default: true, theme }
    );
    await runtime.ask(
        { type: 'number', key: '_number' },
        { message: 'number - enter any number', default: 4242, theme }
    );
    await runtime.ask(
        { type: 'select', key: '_select' },
        { message: 'select - arrow keys should move the cursor', choices, theme }
    );
    await runtime.ask(
        { type: 'checkbox', key: '_checkbox' },
        { message: 'checkbox - space should toggle an item', choices, theme }
    );
    await runtime.ask(
        { type: 'search', key: '_search' },
        {
            message: 'search - type to filter',
            source: async (term) =>
                choices.filter((c) => !term || c.name.toLowerCase().includes(term.toLowerCase())),
            theme,
        }
    );
};

/**
 * Run the interactive-mode self-test.
 *
 * Prints what this terminal can do, renders the full symbol, border and colour
 * matrix, and - only when there is a terminal to render into - one of each
 * prompt type. Non-destructive throughout: no Qlik connection, no browser
 * download, nothing written to disk.
 *
 * @param {object} [options] - Options.
 * @param {object} [options.runtime] - Prompt runtime. Injectable for tests.
 * @param {object} [options.deps] - Injected environment. See {@link collectCapabilities}.
 *
 * @returns {Promise<boolean>} `true` - the self-test reports, it does not judge.
 */
export const runSelfTest = async ({ runtime = defaultRuntime, deps = {} } = {}) => {
    const env = deps.env ?? process.env;
    const stdin = deps.stdin ?? process.stdin;
    const stdout = deps.stdout ?? process.stdout;
    const symbols = getSymbols(env);

    const codePage = deps.codePage ?? readWindowsCodePage();

    runtime.write(renderStaticReport({ ...deps, env, stdin, stdout, codePage }));

    runtime.write(heading('Prompts', symbols));

    const blocker = interactiveBlocker({ stdin, stdout, env });

    if (blocker) {
        // Exiting 0 here is deliberate. The capability report is the useful
        // output and it is complete; a non-zero exit would make the command
        // unusable as the CI check that guards the non-TTY path.
        runtime.write(`  skipped - ${blocker.message}\n`);

        return true;
    }

    await runPromptGallery(runtime, buildTheme({ symbols }));
    runtime.write(`\n  ${symbols.done} Prompt gallery complete.\n`);

    return true;
};
