/**
 * Which commands have a wizard, and which deliberately do not.
 *
 * Each entry wraps a **literal** import specifier. That is load-bearing under
 * the SEA build: a templated `import(`../commands/${ns}/${leaf}.interactive.js`)`
 * is not statically analysable, so esbuild would not bundle the target and the
 * failure would appear only inside the packaged binary, on a user's machine,
 * at the moment they chose that wizard.
 */
export const INTERACTIVE_COMMANDS = Object.freeze({
    'browser install': () => import('../commands/browser/install.interactive.js'),
    'browser uninstall': () => import('../commands/browser/uninstall.interactive.js'),
    'qscloud create-sheet-thumbnails': () =>
        import('../commands/qscloud/create-sheet-thumbnails.interactive.js'),
});

/**
 * Commands with no wizard, and the reason each one does not need one.
 *
 * An explicit list rather than an absence. `registry.test.js` asserts every
 * leaf command is either registered or named here, so a command added without
 * a wizard fails CI until somebody decides which it is. That is what makes
 * "extensible" a property of the repo rather than a hope.
 */
export const NOT_INTERACTIVE = Object.freeze({
    'browser list-installed': 'Takes nothing but a log level; there is nothing to ask.',
    'browser list-available': 'Takes nothing but a browser and a channel, both with defaults.',
    'browser uninstall-all': 'Takes nothing but a log level, and asks for confirmation itself.',
    'qseow create-sheet-thumbnails': 'Phase 2 - needs credentials and a live connection probe.',
    'qscloud list-collections': 'Phase 2 - needs tenant credentials.',
    'qscloud remove-sheet-icons': 'Phase 2 - needs tenant credentials.',
});

/**
 * Load the wizard for a command.
 *
 * @param {string} path - Space-separated command path, e.g. `browser install`.
 *
 * @returns {Promise<object>} The wizard module's default export.
 *
 * @throws {Error} When no wizard is registered for that path.
 */
export const loadWizard = async (path) => {
    const load = INTERACTIVE_COMMANDS[path];

    if (!load) {
        throw new Error(
            `Interactive: no wizard for "${path}". Available: ${Object.keys(INTERACTIVE_COMMANDS).join(', ')}.`
        );
    }

    const module = await load();

    return module.default;
};
