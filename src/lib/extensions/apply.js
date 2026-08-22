/**
 * Registers what an extensions module describes onto the command tree.
 *
 * The module behind `#extensions` exports a plain value, not code that reaches into `program`
 * itself. That is deliberate: core stays in control of what is registered and in what order, the
 * description can be inspected in a test without a command tree to hand, and the committed default
 * can be a literal - which is what lets the ordinary test suite cover the every-run path.
 *
 * Issue #1135.
 */

/**
 * What a build contributes to the CLI beyond what core declares itself.
 *
 * @typedef {object} SeamDescription
 * @property {number} seamVersion - The contract version this description targets.
 * @property {import('commander').Command[]} commands - Whole commands to add to the root.
 * @property {OptionContribution[]} options - Options to add to commands that already exist.
 * @property {SeamHooks} hooks - Hooks, all of them optional.
 */

/**
 * @typedef {object} OptionContribution
 * @property {string} path - Space-separated command path, e.g. `'qseow create-sheet-thumbnails'`.
 * @property {import('commander').Option} option - A fully built Commander option.
 */

/**
 * @typedef {object} SeamHooks
 * @property {BeforeAction} [beforeAction] - Runs once after parse, before the action handler runs.
 */

/**
 * Which of a command's options the user actually supplied.
 *
 * The values alone cannot answer this. `opts()` reports a default and a typed value identically, and
 * by the time a hook runs `dotenv` has already merged every `BSI_*` variable into the environment,
 * so reading the environment cannot separate them either. Commander's own record can, and it is the
 * only thing that can - which is why this is computed here and handed over, rather than left as
 * something an extension is expected to work out.
 *
 * `cli` and `env` both count as supplied: an operator who set an environment variable asked for that
 * value just as deliberately as one who typed it.
 *
 * @param {import('commander').Command} command - The command about to run.
 *
 * @returns {Set<string>} Attribute names whose value the operator supplied.
 */
const suppliedOptionsOf = (command) =>
    new Set(
        command.options
            .map((option) => option.attributeName())
            .filter((attribute) => {
                const source = command.getOptionValueSource(attribute);

                return source === 'cli' || source === 'env';
            })
    );

/**
 * Runs after the command line has been parsed and before the action handler is dispatched, so a run
 * that was never going to be allowed to proceed fails at startup rather than partway through.
 *
 * May be async: it runs under `parseAsync`, not at module evaluation. Throwing aborts the run.
 *
 * **How that throw is reported depends on one property.** An error carrying `expected: true` is
 * treated as a run that stopped deliberately: its message is logged and the process exits non-zero,
 * with no crash dump. Anything else is treated as a fault and takes the crash path, which is what a
 * bug inside a hook should do. A plain property rather than an error class, because the module
 * behind `#extensions` is substituted at build time and does not import from this tree, so it has no
 * class to extend - `isExpectedFailure` in `src/lib/util/errors.js` carries the reasoning. Issue
 * #1150.
 *
 * **It can run more than once for a single run, so it must be idempotent.** An interactive run
 * calls it twice, and deliberately: once from the `preAction` hook, where the command line has been
 * parsed but the wizard has not yet asked anything, and again once the wizard has assembled the
 * options the run will actually use. Only the second call sees those, so a hook deciding anything
 * from *which options were supplied* must treat the second as the authoritative one - on
 * `-i` the first sees almost nothing. See `runBeforeAction`.
 *
 * @callback BeforeAction
 * @param {string} path - Space-separated path of the command that is about to run.
 * @param {object} options - The options that command will run with.
 * @param {{supplied: Set<string>}} context - What core knows that the options bag cannot express.
 *     `supplied` names the options whose value the operator actually gave, as opposed to a default.
 *
 * @returns {void|Promise<void>} Nothing, or a promise the caller will await.
 */

/**
 * The command at a space-separated path below the root.
 *
 * @param {import('commander').Command} program - The root command.
 * @param {string} path - Space-separated command path, e.g. `'qseow create-sheet-thumbnails'`.
 *
 * @returns {import('commander').Command} The command that path names.
 *
 * @throws {Error} When `path` is not a usable string, or when no such command exists. A
 *     contribution aimed at a command that is not there would otherwise be silently dropped, and
 *     the option would go missing from `--help` with nothing anywhere saying why.
 */
const commandAtPath = (program, path) => {
    // Checked before `.trim()` rather than after it. A contribution that omits `path` altogether is
    // the likeliest way to get here, and letting it reach `.trim()` produces a bare TypeError from
    // inside core, naming neither the contribution nor the option.
    if (typeof path !== 'string' || path.trim() === '') {
        throw new Error(
            `Extension option contribution has no usable command path (received ${JSON.stringify(path)}).`
        );
    }

    const segments = path.trim().split(/\s+/).filter(Boolean);

    let command = program;

    for (const segment of segments) {
        const child = command.commands.find(
            (candidate) => candidate.name() === segment || candidate.aliases().includes(segment)
        );

        if (!child) {
            throw new Error(
                `Extension option contribution targets '${path}', but there is no command '${segment}' under '${command.name()}'.`
            );
        }

        command = child;
    }

    return command;
};

/**
 * The space-separated path of a command, relative to the root.
 *
 * @param {import('commander').Command} command - The command that is about to run.
 *
 * @returns {string} The path, e.g. `'qseow create-sheet-thumbnails'`. Empty when the root itself is
 *     the acting command.
 */
const pathOfCommand = (command) => {
    const names = [];

    for (let cmd = command; cmd?.parent; cmd = cmd.parent) {
        names.unshift(cmd.name());
    }

    return names.join(' ');
};

/**
 * Register everything a description asks for.
 *
 * **Where this is called from is forced, not preferred.** It must run after the command tree is
 * built and before `relaxMandatoryOptionsIfInteractive`, because Commander rejects a command line
 * missing a mandatory option before any hook or handler runs - so an option contributed after the
 * relaxation call would parse normally in ordinary use and fail only under `-i`.
 *
 * An empty description is the normal case, not an edge case: it is what every build in this
 * repository bundles. It registers nothing and adds no hook, so a build with no extensions behaves
 * exactly as it would if this function were never called.
 *
 * The description is trusted rather than schema-validated. It is a value written by whoever built
 * the binary, it was checked against {@link import('./version.js').SEAM_VERSION} when the bundle
 * was made, and the one mistake that would otherwise be silent - an option aimed at a command that
 * does not exist - is caught in `commandAtPath` above. The three list properties are defaulted
 * below as leniency for a hand-written description; the contract still says all three are present.
 *
 * @param {import('commander').Command} program - The root command, with its own tree already built.
 * @param {SeamDescription} extensions - What to register. Describing nothing is normal.
 *
 * @returns {void} Nothing. The command tree is modified in place.
 */
export const applyExtensions = (program, extensions) => {
    const { commands = [], options = [], hooks = {} } = extensions ?? {};

    for (const command of commands) {
        program.addCommand(command);
    }

    for (const { path, option } of options) {
        commandAtPath(program, path).addOption(option);
    }

    if (!hooks.beforeAction) {
        return;
    }

    // One hook on the root covers every command: Commander collects preAction hooks from the acting
    // command and all of its ancestors.
    //
    // It fires ahead of the one `relaxMandatoryOptionsIfInteractive` installs, because hooks run in
    // registration order and this function is called first. That ordering is worth knowing about
    // rather than working around: on a command line where `-i` appeared as an option *value* rather
    // than as a request for a wizard, this hook runs before the relaxation hook re-runs Commander's
    // missing-mandatory check, so a hook that throws reports its own failure instead of the missing
    // option. Both are genuine failures of the same command line, and reordering would mean
    // contributing options after the relaxation call, which is exactly what cannot be done.
    program.hook('preAction', (_hookedCommand, actionCommand) =>
        hooks.beforeAction(pathOfCommand(actionCommand), actionCommand.opts(), {
            supplied: suppliedOptionsOf(actionCommand),
        })
    );
};

/**
 * Run a description's `beforeAction` hook, if it has one.
 *
 * Exists because `preAction` is not a sufficient enforcement point on its own. Commander fires it
 * before the action handler, and for `-i` the wizard runs *inside* that handler - so the hook sees
 * `interactive: true` and almost nothing else, and a hook that decides from which options were
 * supplied would wave the run through and then watch the wizard collect the very option it was
 * meant to gate.
 *
 * `runInteractive` therefore calls this again with the options the wizard assembled, immediately
 * before the run starts. Both calls are kept rather than moving the check wholesale: the first
 * still catches a contributed option typed on the command line alongside `-i`, and catches it
 * before the wizard asks anything.
 *
 * @param {SeamDescription} extensions - The description, which may describe no hooks at all.
 * @param {string} path - Space-separated command path, e.g. `'qseow create-sheet-thumbnails'`.
 * @param {object} options - The options the run will actually use.
 * @param {{supplied: Set<string>}} [context] - What core knows that the options bag cannot express.
 *     Defaulted so a caller with nothing to add need not construct one.
 *
 * @returns {void|Promise<void>} Whatever the hook returns, so an async hook is awaited by the
 *     caller. Nothing at all when no hook is described, which is the committed default's case.
 */
export const runBeforeAction = (extensions, path, options, context = { supplied: new Set() }) =>
    extensions?.hooks?.beforeAction?.(path, options, context);
