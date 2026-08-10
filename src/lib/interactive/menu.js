import { INTERACTIVE_COMMANDS, loadWizard } from './registry.js';
import { defaultRuntime } from './prompt-runtime.js';
import { buildTheme } from './theme.js';
import { getSymbols } from './symbols.js';

/**
 * Ask which wizard to run.
 *
 * Labels come from the wizard modules themselves rather than from a list kept
 * here, so registering a command is one edit rather than two.
 *
 * The theme is built here when the caller does not supply one, rather than
 * left to the library's default. Forgetting it is not cosmetic: the default
 * theme ticks with U+2714, which is drawn from the emoji font at double width
 * on some terminals, and - worse - it never consults the ASCII symbol set, so
 * the menu would mojibake on exactly the consoles the fallback exists for while
 * every prompt after it rendered correctly.
 *
 * @param {object} [options] - Options.
 * @param {object} [options.runtime] - Prompt runtime. Injectable for tests.
 * @param {object} [options.theme] - Prompt theme. Built from this terminal's capabilities if omitted.
 *
 * @returns {Promise<string|null>} The chosen command path, or `null` to leave.
 */
export const runMenu = async ({
    runtime = defaultRuntime,
    theme = buildTheme({ symbols: getSymbols() }),
} = {}) => {
    const paths = Object.keys(INTERACTIVE_COMMANDS);
    const wizards = await Promise.all(paths.map((path) => loadWizard(path)));

    const choices = [
        ...paths.map((path, index) => ({
            name: `${wizards[index].label}   (${path})`,
            value: path,
        })),
        { name: 'Exit', value: null },
    ];

    return runtime.ask(
        { key: '_menu', type: 'select' },
        { message: 'What would you like to do?', choices, theme }
    );
};
