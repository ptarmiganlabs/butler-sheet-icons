/**
 * The only module permitted to import the prompt library.
 *
 * This is the hedge, and it is deliberately thin. The residual risk in the
 * whole interactive design is not bundling - `@inquirer/prompts` is pure JS
 * with no native addons - but runtime terminal behaviour: raw mode plus ANSI
 * redraw inside a postject-injected binary on a Windows console host that is
 * not a modern VT terminal. If that turns out badly, this one file is rewritten
 * against `prompts` or `node:readline/promises`, and the question specs,
 * validators, per-command wizards and their tests are untouched. An isolation
 * layer only pays off if it is spent early, which is why the self-test that
 * exercises it lands before any wizard is written.
 *
 * The boundary is enforced rather than trusted: `eslint.config.js` carries a
 * `no-restricted-imports` rule naming this file as the sole exception.
 */

/**
 * Maps a question type onto the prompt function that renders it.
 *
 * `list` deliberately renders as a plain text input. It collects the entries of
 * a variadic option as free text, which the driver splits and validates per
 * entry - there is no dedicated list prompt, and inventing one would put
 * parsing rules in the layer that is meant to be replaceable.
 *
 * Exported because it is also the map from a question type to the *package*
 * whose options that question's configuration has to satisfy - `@inquirer/input`
 * for both `input` and `list`, and so on. `ask-questions`' contract test reads
 * the declared options out of those packages, and deriving the package from this
 * map rather than restating it means a type added here cannot be checked against
 * the wrong prompt.
 */
export const PROMPT_FOR_TYPE = Object.freeze({
    input: 'input',
    list: 'input',
    password: 'password',
    confirm: 'confirm',
    number: 'number',
    select: 'select',
    checkbox: 'checkbox',
    search: 'search',
});

/**
 * Question types this runtime can render.
 *
 * @type {string[]}
 */
export const SUPPORTED_TYPES = Object.freeze(Object.keys(PROMPT_FOR_TYPE));

let loading;

/**
 * Load the prompt library, once.
 *
 * The dynamic import keeps the library off the startup path of every other
 * command. Worth being precise about what that buys: under esbuild's
 * `--bundle --format=cjs` a dynamic import of a bundled module becomes a
 * deferred `require`, so this saves *execution* time, not binary size. The
 * library ships in the binary whether or not anyone types `interactive`.
 *
 * @returns {Promise<object>} The `@inquirer/prompts` module namespace.
 */
const loadPrompts = () => {
    loading ??= import('@inquirer/prompts');

    return loading;
};

/**
 * Ask one question and return the answer.
 *
 * Two methods rather than one per prompt type, so the type dispatch stays
 * behind the boundary: replacing the library means editing one `switch` here,
 * and the scripted runtime used in tests stays a handful of lines.
 *
 * @param {object} spec - Question spec. Only `type` is read; everything else comes from `config`.
 * @param {object} config - Prompt configuration passed straight to the library (message, default, choices, validate, theme).
 *
 * @returns {Promise<unknown>} The user's answer.
 *
 * @throws {Error} When the spec carries a type this runtime cannot render.
 */
const ask = async (spec, config) => {
    const promptName = PROMPT_FOR_TYPE[spec?.type];

    if (!promptName) {
        // A developer error, not a user error: a spec reached the runtime with
        // a type nothing can render. Fail loudly rather than prompting for
        // something the user cannot answer.
        throw new Error(
            `Interactive: no prompt for question type "${spec?.type}" (key "${spec?.key}"). Supported types: ${SUPPORTED_TYPES.join(', ')}.`
        );
    }

    const prompts = await loadPrompts();

    return prompts[promptName](config);
};

/**
 * Write a line of the wizard's own output.
 *
 * Section rules, the review table and the echoed command line are the wizard's
 * output, not log records. They cannot go through winston, which is pinned to
 * `error` while questions are on screen precisely so it never corrupts a
 * prompt's redraw, and `console.log` is banned repo-wide. Routing them through
 * the runtime also makes them assertable in tests without a pty.
 *
 * @param {string} text - Text to write. No newline is added.
 *
 * @returns {void}
 */
const write = (text) => {
    process.stdout.write(text);
};

/**
 * Error names the prompt library uses when the user stops rather than answers.
 *
 * Ctrl-C, Ctrl-D and a closed stdin all land here.
 */
const CANCELLATION_NAMES = new Set(['ExitPromptError', 'AbortPromptError', 'CancelPromptError']);

/**
 * Whether a failure is the user deciding to stop, rather than something broken.
 *
 * Pressing Ctrl-C in a wizard is a normal way to leave it, and without this the
 * library's own wording reaches the user - "User force closed the prompt with 0
 * null" is a real message it produces, and it reads like a crash.
 *
 * Matched on `name` rather than `instanceof`, deliberately: an import of the
 * error class would put a second file on the wrong side of the boundary this
 * module exists to hold, for no gain. The names are part of the library's
 * public surface.
 *
 * @param {Error|unknown} err - The error to test.
 *
 * @returns {boolean} True when the user cancelled.
 */
export const isPromptCancellation = (err) => CANCELLATION_NAMES.has(err?.name);

/**
 * The runtime used when a real user is at a real terminal.
 *
 * Injected rather than imported by the driver, so tests substitute a scripted
 * implementation and never touch a terminal.
 *
 * @type {{ask: Function, write: Function}}
 */
export const defaultRuntime = Object.freeze({ ask, write });
