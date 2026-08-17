/**
 * The command line that re-runs the diagnostic the administrator is currently reading.
 *
 * Several checks end with "try it again with a different browser build", and the command they
 * offer has to be the one that was actually run. These remediations were written when
 * `browser check` was the registry's only consumer and named it literally, so once `doctor check`
 * started running the same checks it told the reader to run `browser check` - quietly moving them
 * from a five-area diagnostic to a two-area one, in the middle of advice about how to investigate.
 *
 * Taking the name from the context also means a third consumer inherits correct advice without
 * touching a single check, which is the property the whole check contract exists to protect.
 *
 * @param {object} ctx - The check context.
 * @param {string} args - Arguments to append, e.g. `--browser-version recommended`.
 *
 * @returns {import('../findings.js').RemediationCommand} The command, keyed by host shell.
 */
export const rerunWith = (ctx, args) => {
    // Defaulted here as well as in `buildBaseContext`, because a check is handed hand-built
    // contexts by its own unit tests and must never render `undefined` into text an administrator
    // is asked to paste into a shell. `browser check` is the safe fallback: it is the narrower
    // command, so a stale default under-claims rather than misdirects.
    const command = ctx.command ?? 'browser check';

    return {
        powershell: `butler-sheet-icons.exe ${command} ${args}`,
        bash: `./butler-sheet-icons ${command} ${args}`,
    };
};
