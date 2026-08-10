import { INTERACTIVE_COMMANDS, loadWizard } from './registry.js';
import { defaultRuntime } from './prompt-runtime.js';

/**
 * Ask which wizard to run.
 *
 * Labels come from the wizard modules themselves rather than from a list kept
 * here, so registering a command is one edit rather than two.
 *
 * @param {object} [options] - Options.
 * @param {object} [options.runtime] - Prompt runtime. Injectable for tests.
 * @param {object} [options.theme] - Prompt theme.
 *
 * @returns {Promise<string|null>} The chosen command path, or `null` to leave.
 */
export const runMenu = async ({ runtime = defaultRuntime, theme } = {}) => {
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
