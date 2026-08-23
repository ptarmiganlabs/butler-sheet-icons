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

import { logError } from '../util/log-error.js';

/**
 * What a build contributes to the CLI beyond what core declares itself.
 *
 * @typedef {object} SeamDescription
 * @property {number} seamVersion - The contract version this description targets.
 * @property {string} [variant] - Optional short name for this build, e.g. `'acme'`. When present,
 *     `--version` names it and reports the extensions module's own version alongside core's; when
 *     absent - which is what the committed stub does - `--version` is unchanged. Issue #1152.
 * @property {import('commander').Command[]} commands - Whole commands to add to the root.
 * @property {OptionContribution[]} options - Options to add to commands that already exist.
 * @property {SeamHooks} hooks - Hooks, all of them optional.
 */

/**
 * @typedef {object} OptionContribution
 * @property {string} path - Space-separated command path, e.g. `'qseow create-sheet-thumbnails'`.
 * @property {import('commander').Option} option - A fully built Commander option.
 * @property {InteractivePlacement} [interactive] - Where the interactive mode asks about it. Absent,
 *     the question is asked after the command's own sections, under no heading and behind no gate.
 *     Issue #1159.
 */

/**
 * Where the interactive mode puts a contributed option's question.
 *
 * A wizard's own questions are arranged by its `refine()` into sections, some behind a gate ("Exclude
 * or blur any sheets?"). A contributed option is not known to any `refine()`, so the driver places it
 * from this: after the command's own sections, under `section`'s heading, behind one gate per section
 * that contributions sharing the section share. Declaring a section is what makes a contribution
 * declinable - the gate answered no skips every question under it.
 *
 * @typedef {object} InteractivePlacement
 * @property {string} section - Heading the question is asked under, e.g. `'Labels'`.
 * @property {string} [gate] - The yes/no question that opens the section. Defaults to
 *     `Configure <section>?`.
 * @property {boolean} [perRun=true] - Whether the question describes this run rather than this
 *     environment, and is therefore asked again even when a value was already supplied (opened on
 *     that value) - the rule the wizards apply to sheet filters and app selection. `false` for a
 *     value that stays true between runs, which a supplied value then answers without a question.
 */

/**
 * @typedef {object} SeamHooks
 * @property {BeforeAction} [beforeAction] - Runs once after parse, before the action handler runs.
 * @property {ImageTransform} [imageTransform] - Runs once per captured sheet, after its image and
 *     blurred copy are on disk and before either is recorded for upload. Issue #1158.
 */

/**
 * The two files a captured sheet has produced, as absolute paths. Both exist when the hook runs.
 *
 * Every captured sheet yields exactly these two on both platforms - the plain capture and a blurred
 * copy of it - which is what makes this the payload rather than the per-app `createdFiles` array:
 * that array is shaped differently per platform (issue #1091 closed before reaching it), and the
 * QSEoW update step derives the file names itself rather than reading them back. So the names are
 * the contract, and a transform works on the files in place.
 *
 * Both are PNG and must stay PNG: the upload steps select files by their `.png` name and QSEoW
 * declares the bytes as `image/png` when it posts them.
 *
 * @typedef {object} SheetImages
 * @property {string} image - Absolute path of the sheet's captured image.
 * @property {string} blurredImage - Absolute path of its blurred copy.
 */

/**
 * What core knows about the sheet whose images are being transformed.
 *
 * @typedef {object} ImageTransformContext
 * @property {'qseow'|'cloud'} platform - Which pipeline is running.
 * @property {string} appId - The app being processed.
 * @property {number} sheetPos - 1-based sheet number; the one the file names carry.
 * @property {object} sheet - The SheetList entry as the loop holds it - `qInfo`, `qMeta` (title,
 *     description, …), `qData` - the object itself, not a projection. The engine does return
 *     sheets with no `qData` and with `qMeta` fields missing, and the loops deliberately capture
 *     them rather than fail the app, so guard those reads the way the loops do
 *     (`sheet?.qMeta?.title`).
 * @property {boolean} blurSheet - Whether the update step will point this sheet at the blurred copy.
 * @property {object} browser - The Puppeteer browser this run drives. Open a page of your own for
 *     anything that needs rendering - the app's page is not yours to navigate - and close what you
 *     open: core closes pages only with the browser, at the end of the app, so a page left open per
 *     sheet accumulates for the whole app. Calls are sequential (the next capture starts after the
 *     hook returns), so one scratch page reused across calls is the cheapest correct choice.
 * @property {object} options - The command's options bag.
 * @property {object} logger - The run's logger.
 */

/**
 * The keys of {@link ImageTransformContext}, in the order the loops build them.
 *
 * Both pipelines build the context by hand, and nothing else couples the two literals - a field
 * added to one would be `undefined` on the other platform with every test still green, which is
 * the twin-drift class issue #1091 catalogued. The pipeline tests assert their context against
 * this list, so the two cannot drift from it, or from each other, unnoticed.
 */
export const IMAGE_TRANSFORM_CONTEXT_KEYS = Object.freeze([
    'platform',
    'appId',
    'sheetPos',
    'sheet',
    'blurSheet',
    'browser',
    'options',
    'logger',
]);

/**
 * Transforms a sheet's images in place, between capture and upload.
 *
 * Runs inside the sheet loop while the browser is still open - which is why it is per sheet and
 * not "once before upload": both pipelines close the browser before they upload. Works on the files
 * at the paths given and returns nothing; the file names are what the upload and update steps rely
 * on, so a transform that renamed or re-pointed them would work on one platform and silently break
 * the other. Must not make `blurredImage` less redacted than it was received - `--blur-sheet-*` is a
 * redaction control, and the blurred copy is what a sheet selected for blurring will show.
 *
 * Throwing fails this sheet, under each platform's existing rule for a sheet whose images could not
 * be produced: it is reported, counted, never enters the upload list and keeps the icon it had, and
 * the run continues with the next sheet. Core guarantees the "this sheet" part: the error is logged
 * with its stack and rethrown wrapped, so that a transform's own timeouts and closed targets are
 * never mistaken for a lost engine session - see {@link runImageTransform}.
 *
 * @callback ImageTransform
 * @param {SheetImages} images - The sheet's two files.
 * @param {ImageTransformContext} context - What core knows about them.
 *
 * @returns {void|Promise<void>} Nothing, or a promise the caller will await.
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
 * What a build said about each option it contributed, looked up by the option itself.
 *
 * A WeakMap rather than a property on the Option: Commander's objects are Commander's, and the
 * interactive mode only needs to ask "was this contributed, and where does it go" of an option it
 * already holds. Keyed by instance, which is also why a contribution aimed at two commands is two
 * `Option` instances - Commander stores an option on the command it is added to and mutates it.
 */
const contributions = new WeakMap();

/**
 * What the description said about a contributed option - or nothing, for an option core declares
 * itself.
 *
 * @param {import('commander').Option} option - An option taken from a command's `options`.
 *
 * @returns {{path: string, interactive?: InteractivePlacement}|undefined} The contribution record.
 */
export const contributionOf = (option) => contributions.get(option);

/**
 * Refuse an `interactive` placement that could not be acted on.
 *
 * Caught at registration for the same reason a bad command path is: the alternative is a question
 * that quietly lands in the wrong place, or a gate that reads `Configure undefined?`, discovered by
 * whoever next runs the wizard.
 *
 * @param {unknown} interactive - The contribution's `interactive` value.
 * @param {import('commander').Option} option - The option it belongs to, named in the message.
 *
 * @returns {void}
 *
 * @throws {Error} When `interactive` is present but not a usable placement.
 */
const assertPlacement = (interactive, option) => {
    if (interactive === undefined) {
        return;
    }

    const name = option?.long ?? option?.flags ?? 'an option';
    const { section, gate, perRun } = interactive ?? {};

    if (typeof section !== 'string' || section.trim() === '') {
        throw new Error(
            `Extension option ${name} has an interactive placement without a usable section (received ${JSON.stringify(section)}).`
        );
    }

    if (gate !== undefined && (typeof gate !== 'string' || gate.trim() === '')) {
        throw new Error(
            `Extension option ${name} has an interactive gate that is not a non-empty string (received ${JSON.stringify(gate)}).`
        );
    }

    if (perRun !== undefined && typeof perRun !== 'boolean') {
        throw new Error(
            `Extension option ${name} has an interactive perRun that is not a boolean (received ${JSON.stringify(perRun)}).`
        );
    }
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
 * was made, and the two mistakes that would otherwise be silent are caught here instead: an option
 * aimed at a command that does not exist (`commandAtPath` above), and a hook that is not a function
 * - which for `imageTransform` would otherwise surface once per sheet, after every capture had been
 * paid for, rather than at startup. The three list properties are defaulted below as leniency for a
 * hand-written description; the contract still says all three are present.
 *
 * @param {import('commander').Command} program - The root command, with its own tree already built.
 * @param {SeamDescription} extensions - What to register. Describing nothing is normal.
 *
 * @returns {void} Nothing. The command tree is modified in place.
 */
export const applyExtensions = (program, extensions) => {
    const { commands = [], options = [], hooks = {} } = extensions ?? {};

    for (const [name, hook] of Object.entries(hooks)) {
        if (hook !== undefined && typeof hook !== 'function') {
            throw new Error(
                `Extension hook '${name}' must be a function, but the description carries a ${typeof hook}.`
            );
        }
    }

    for (const command of commands) {
        program.addCommand(command);
    }

    for (const { path, option, interactive } of options) {
        assertPlacement(interactive, option);
        commandAtPath(program, path).addOption(option);
        contributions.set(option, { path, interactive });
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

/**
 * Run a description's `imageTransform` hook, if it has one.
 *
 * Called by both sheet loops once per captured sheet, after the blurred copy exists and before the
 * sheet is recorded for upload. The two pipelines build `images` and `context` themselves - each
 * knows its own file layout - and call this rather than reaching into the description, so the
 * empty-description case stays a `?.` in one place and the call shape cannot drift between them.
 *
 * **A throw is logged and rethrown wrapped, deliberately.** The loops hand every error to
 * `runOverSheets`, which tells a lost engine session from a one-sheet failure by the error's
 * wording - `timeout`, `target closed`, `ECONNREFUSED` and friends abandon the app's remaining
 * sheets. A transform that renders in a page of its own produces exactly those words when it fails
 * (`Navigation timeout of 30000 ms exceeded`), and a transform fetching an asset produces those
 * codes; neither says anything about the engine. So the original error goes to the log in full -
 * message at error, stack at debug - and what propagates is a core error with a neutral message and
 * the original as `cause`, which the classifier (it never reads `cause`) takes for what it is: this
 * sheet's failure. The cost is one extra log line; the alternative was a one-sheet hiccup re-running
 * a forty-sheet app.
 *
 * @param {SeamDescription} extensions - The description, which may describe no hooks at all.
 * @param {SheetImages} images - The sheet's two files, as absolute paths.
 * @param {ImageTransformContext} context - What core knows about them.
 *
 * @returns {Promise<void>} Resolves when the hook has run, or at once when no hook is described -
 *     which is the committed default's case.
 *
 * @throws {Error} `Image transform failed` with the hook's error as `cause`, when the hook throws.
 */
export const runImageTransform = async (extensions, images, context) => {
    const hook = extensions?.hooks?.imageTransform;

    if (!hook) {
        return;
    }

    try {
        await hook(images, context);
    } catch (err) {
        logError(
            `IMAGE TRANSFORM: Failed to transform the images of sheet ${context?.sheetPos} in app ${context?.appId}`,
            err
        );

        // The message must not embed the original's: `runOverSheets` classifies by substring.
        throw new Error('Image transform failed (see the IMAGE TRANSFORM error above)', {
            cause: err,
        });
    }
};
