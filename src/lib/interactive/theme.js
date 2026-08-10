import { colours as defaultPalette } from '../util/colour.js';
import { getSymbols } from './symbols.js';

/**
 * Build the prompt theme.
 *
 * This is the lever that makes the wizard feel like one product rather than a
 * pile of prompts: every style entry is a plain `(text) => string`, so one pure
 * data module restyles every prompt at once. It imports nothing from the prompt
 * library, which is what keeps it swappable alongside `prompt-runtime.js` if
 * the library is ever replaced.
 *
 * Degradation is free by construction. When the palette is inert every
 * formatter is the identity function, so the same theme object yields plain
 * text with no branching at any call site; when the ASCII symbol set is in use
 * the cursor, spinner and checkbox icons all follow, because they are read from
 * the symbol set rather than written here.
 *
 * The returned object is a superset of the core theme and the select, checkbox
 * and search extensions. `@inquirer` merges a partial theme onto its defaults
 * per prompt, so entries a given prompt does not know about are ignored rather
 * than rejected - one object can therefore serve all of them.
 *
 * @param {object} [options] - Build options.
 * @param {object} [options.symbols] - Symbol set. Defaults to the one this terminal can render.
 * @param {object} [options.palette] - Colour formatters. Defaults to the process palette.
 *
 * @returns {object} A theme object accepted by every `@inquirer` prompt.
 */
export const buildTheme = ({ symbols = getSymbols(), palette = defaultPalette } = {}) => ({
    prefix: {
        idle: palette.blue('?'),
        done: palette.green(symbols.done),
    },

    spinner: {
        interval: 80,
        // Read from the symbol set rather than hard-coded, so a terminal using
        // the ASCII fallback does not get braille frames spinning in the one
        // place the user is forced to watch while waiting.
        frames: symbols.spinnerFrames.map((frame) => palette.yellow(frame)),
    },

    style: {
        answer: (text) => palette.cyan(text),
        message: (text) => palette.bold(text),
        error: (text) => palette.red(`${symbols.failed} ${text}`),
        defaultAnswer: (text) => palette.dim(`(${text})`),
        help: (text) => palette.dim(text),
        highlight: (text) => palette.cyan(text),
        key: (text) => palette.cyan(palette.bold(`<${text}>`)),

        // select / checkbox / search extensions.
        disabled: (text) => palette.dim(text),
        description: (text) => palette.dim(text),
        searchTerm: (text) => palette.cyan(text),
        keysHelpTip: (keys) =>
            palette.dim(keys.map(([key, action]) => `${key} to ${action}`).join(', ')),
    },

    icon: {
        cursor: symbols.cursor,
        checked: palette.green(symbols.checked),
        unchecked: symbols.unchecked,
        disabledChecked: palette.dim(symbols.checked),
        disabledUnchecked: palette.dim(symbols.unchecked),
    },

    indexMode: 'hidden',
});
