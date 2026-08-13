/**
 * Reshaping helpers for the question list a wizard's `refine()` returns.
 *
 * These exist because the two Qlik wizards are the same conversation over
 * different options: connection, apps, sheets, a gated block of filters, a gated
 * block of advanced settings. Written twice, they were 134 identical lines and
 * tripped SonarCloud's duplication gate at more than double its threshold - but
 * the count is the symptom. The real cost is that nothing kept them in step, so
 * the two platforms could drift apart in how they ask the same question, which
 * is exactly the failure #986 fixed one layer further down.
 *
 * Everything here is pure: specs in, specs out, no I/O. Live data belongs behind
 * a spec's `choices` or `probe`, which the driver invokes.
 */

import { splitEntries } from './validators.js';

/**
 * The sheet exclude and blur options, which are identical on both platforms.
 *
 * Gated as a block rather than asked one by one. They are nine of the twenty-five
 * options on Cloud and of the thirty-six on QSEoW, and most runs use none of them
 * - the common case is "every sheet in the app" - so asking about each in turn is
 * what turns a short conversation into a long one.
 */
export const SHEET_FILTER_KEYS = Object.freeze([
    'excludeSheetStatus',
    'excludeSheetTag',
    'excludeSheetNumber',
    'excludeSheetTitle',
    'blurSheetStatus',
    'blurSheetTag',
    'blurSheetNumber',
    'blurSheetTitle',
    'blurFactor',
]);

/**
 * THE STATIC/DYNAMIC CLASSIFICATION. Edit this list to change it.
 *
 * Every option a Qlik wizard asks about falls into one of two kinds:
 *
 * - **This environment.** A host, a port, a certificate path, a credential, a
 *   browser build. Properties of the server you are pointing at, true until the
 *   environment itself changes. Supplied once in a `.env` file, they should stay
 *   answered - re-asking them every run is the tedium `-i` exists to remove.
 *
 * - **This run.** Which apps to update, which sheets to skip, how much of each
 *   sheet to capture. Decisions, not facts. A decision taken once and left in a
 *   `.env` file should not be taken again silently on every later run, because
 *   the operator cannot see it and cannot change it without editing the file.
 *
 * Keys listed here are the second kind: always asked, opening on whatever was
 * supplied, so confirming costs one keystroke and changing costs a few.
 * Everything not listed is the first kind and is skipped once supplied.
 *
 * **To reclassify an option, move its key in or out of this list.** Nothing else
 * needs editing: the driver reads the `perRun` mark this produces, and the
 * banner, the pre-fill and the gate bypass all follow from it. `contentlibrary`
 * and `imagedir` sit outside deliberately - both were judged properties of the
 * environment rather than of the run.
 */
export const PER_RUN_KEYS = Object.freeze([
    // What gets updated.
    'appid',
    'qliksensetag',
    'collectionid',
    // How much of each sheet the screenshot covers.
    'includesheetpart',
    // Which sheets are skipped or blurred.
    ...SHEET_FILTER_KEYS,
]);

/**
 * Mark a question as describing this run, if the classification says it does.
 *
 * Applied to every question a wizard returns, so {@link PER_RUN_KEYS} is the
 * single statement of the rule rather than a thing each question repeats.
 *
 * @param {object} spec - The question.
 *
 * @returns {object} The question, marked when it names a per-run decision.
 */
export const markPerRun = (spec) =>
    PER_RUN_KEYS.includes(spec.key) ? { ...spec, perRun: true } : spec;

/**
 * Whether a value was actually supplied, as opposed to left at nothing.
 *
 * An empty string is how both `--qliksensetag` and `--collectionid` say "none" -
 * it is their declared default - so it has to read as absent here, or a wizard
 * would offer to re-confirm a value nobody set.
 *
 * @param {unknown} value - The value to test.
 *
 * @returns {boolean} True when there is something there.
 */
export const isSupplied = (value) =>
    Array.isArray(value) ? value.length > 0 : String(value ?? '').trim().length > 0;

/**
 * Open a question on a value that was already supplied.
 *
 * The pre-fill is the whole reason a supplied value can be asked about again
 * without costing anything: the answer from the last run is one keystroke away
 * rather than gone, so re-asking stays cheap enough to be the default.
 *
 * @param {object} spec - The question.
 * @param {unknown} supplied - What the command line or environment already gave.
 *
 * @returns {object} The question, opening on that value when there is one.
 */
export const openingOn = (spec, supplied) =>
    isSupplied(supplied) ? { ...spec, default: supplied } : spec;

/**
 * Refuse to go on when the run would have no apps to process.
 *
 * `runOverApps` already treats an empty selection as a failure rather than a
 * no-op, but it says so *after* every remaining question has been answered and
 * the run confirmed. A wizard can know sooner: app selection is one question
 * away from where the mistake was made, so this is thrown from a probe and the
 * driver re-asks on the spot.
 *
 * Both sources count. Naming no apps is perfectly fine when a tag or collection
 * is carrying the selection - the run covers the union of the two - so this
 * fires only when neither has anything in it.
 *
 * @param {object} answers - The answers so far.
 * @param {string} groupingKey - `qliksensetag` or `collectionid`.
 * @param {string} groupingLabel - What to call it in the message, e.g. `a tag`.
 *
 * @returns {void}
 *
 * @throws {Error} When nothing at all has been selected.
 */
export const assertAppSelectionNotEmpty = (answers, groupingKey, groupingLabel) => {
    if (splitEntries(answers.appid).length > 0 || isSupplied(answers[groupingKey])) {
        return;
    }

    // Names only what can actually be done here. There is no way back to an
    // earlier question - the prompt library has no such gesture, which is why
    // the wizard says up front that Ctrl+C cancels - so telling someone to "go
    // back" sends them hunting for a key that does not exist.
    throw new Error(
        `No apps selected, so there would be nothing to do. Pick at least one app, or press Ctrl+C and start again to choose ${groupingLabel} instead.`
    );
};

/** Key of the synthetic question asking how apps should be chosen. */
export const APP_SOURCE = '_appSource';

/**
 * How apps can be picked, in the order the choices are offered.
 *
 * One vocabulary for both platforms. The middle route is a tag on QSEoW and a
 * collection on Cloud, but it plays the same part in the conversation, and
 * giving it one value is what lets the questions below be built once.
 */
export const APP_SOURCES = Object.freeze({
    ALL: 'all',
    GROUPED: 'grouped',
    TYPED: 'typed',
});

/**
 * Ask how apps should be chosen.
 *
 * @param {object} args - Arguments.
 * @param {string[]} args.needs - Keys that must be answered first, i.e. the credentials a lookup needs.
 * @param {string} args.groupingKey - `qliksensetag` or `collectionid`.
 * @param {string} args.groupingChoice - Label for the middle route.
 *
 * @returns {object} A question spec.
 */
export const appSourceQuestion = ({ needs, groupingKey, groupingChoice }) => ({
    key: APP_SOURCE,
    type: 'select',
    message: 'Which apps should be updated?',
    required: true,
    variadic: false,
    secret: false,
    needs,
    // This one question leads to both of these, so a value already supplied for
    // either is not "not asked about again": it is asked about under this
    // question's routes, opening on what was supplied.
    replaces: ['appid', groupingKey],
    choices: [
        { name: 'Pick apps from a list', value: APP_SOURCES.ALL },
        { name: groupingChoice, value: APP_SOURCES.GROUPED },
        { name: 'Type app id(s)', value: APP_SOURCES.TYPED },
    ],
});

/**
 * Turn a tag or collection into the apps it actually names.
 *
 * Two jobs, both of which need the lookup, which is why they are one probe.
 *
 * It **reports what was matched**, which is what lets the grouped route drop its
 * app checkbox. That checkbox listed the tagged apps and invited a selection it
 * could not honour: the tag reaches the worker as well, and the two are additive,
 * so unticking an app there never removed it from the run. Saying "7 apps carry
 * this tag" is the honest version of what that list was for.
 *
 * It also **rejects a value that matches nothing**, at the prompt where it was
 * typed rather than after every other question has been answered.
 *
 * @param {object} args - Arguments.
 * @param {string} args.groupingKey - `qliksensetag` or `collectionid`.
 * @param {(ctx: object) => Promise<Array<{id: string, name: string}>>} args.resolve - The lookup.
 * @param {(value: string) => string} args.whenEmpty - Message for a value that matched nothing.
 * @param {(count: number, value: string) => string} args.whenFound - Line shown for a value that matched.
 *
 * @returns {(ctx: object) => Promise<void>} A probe.
 */
export const resolvesToApps =
    ({ groupingKey, resolve, whenEmpty, whenFound }) =>
    async (ctx) => {
        const value = String(ctx.answers[groupingKey] ?? '').trim();

        if (!isSupplied(value)) {
            if (ctx.answers[APP_SOURCE] === APP_SOURCES.GROUPED) {
                throw new Error('This is how apps are being chosen, so it cannot be empty.');
            }

            // Empty is a real answer on the other routes: it is how someone
            // says "not this time" to a value their .env file supplied.
            return;
        }

        const apps = await resolve(ctx);

        if (apps.length === 0) {
            throw new Error(whenEmpty(value));
        }

        ctx.write(`  ${whenFound(apps.length, value)}\n`);
    };

/**
 * Ask which individual apps to update, from what the server actually holds.
 *
 * Asked on the list route because that is the route, and on the grouped route
 * only when app ids were supplied as well - because there the banner has
 * promised they would be asked about rather than skipped, and they are added to
 * whatever the tag or collection matches.
 *
 * @param {object} args - Arguments.
 * @param {object} args.spec - The derived `appid` question.
 * @param {unknown} args.supplied - App ids already supplied, pre-ticked.
 * @param {string} args.groupingKey - `qliksensetag` or `collectionid`.
 * @param {string} args.groupingLabel - What to call the other route, e.g. `a tag`.
 * @param {(ctx: object) => Promise<Array<{id: string, name: string}>>} args.listApps - The lookup.
 * @param {(app: object) => string} args.label - How to label one app.
 *
 * @returns {object} A question spec.
 */
export const appPickerQuestion = ({
    spec,
    supplied,
    groupingKey,
    groupingLabel,
    listApps,
    label,
}) => ({
    ...openingOn(
        {
            ...spec,
            type: 'checkbox',
            message: 'Which apps?',
            hint: isSupplied(supplied)
                ? `Apps you already supplied are listed first, ticked. Untick to leave one out. Anything ${groupingLabel} matches is updated as well.`
                : `Individually named apps. They are updated in addition to anything ${groupingLabel} matches.`,
        },
        supplied
    ),
    needs: [APP_SOURCE],
    when: (ctx) =>
        ctx.answers[APP_SOURCE] === APP_SOURCES.ALL ||
        (ctx.answers[APP_SOURCE] === APP_SOURCES.GROUPED && isSupplied(supplied)),
    choices: async (ctx) => {
        const apps = await listApps(ctx);

        // Compared case-insensitively, because an app id is a GUID and a GUID
        // is not case-sensitive. They are routinely copied out of the QMC in
        // upper case, and Qlik's own APIs match them either way, so treating
        // 'DED8...' and 'ded8...' as different ids would report an app that is
        // plainly there as missing and then drop it from the run.
        const alreadyChosen = new Set(splitEntries(supplied).map((id) => String(id).toLowerCase()));
        const wasSupplied = (entry) => alreadyChosen.has(String(entry.id).toLowerCase());

        // Supplied ids first, because a ticked row the operator cannot see is
        // the same as no choice at all. On a server with 519 apps the one that
        // came from a .env file sat at index 16, ten rows below the fold: the
        // list looked entirely unticked, and submitting it silently kept an app
        // nobody had chosen in this run.
        const ranked = [...apps.filter(wasSupplied), ...apps.filter((e) => !wasSupplied(e))];

        // A supplied id the server no longer has cannot be shown, ticked or
        // otherwise, so it would just vanish from the selection. Saying so is
        // the whole reason this question is asked again rather than skipped.
        const missing = splitEntries(supplied).filter(
            (id) =>
                !apps.some((entry) => String(entry.id).toLowerCase() === String(id).toLowerCase())
        );

        if (missing.length > 0) {
            ctx.write(
                `  ${missing.join(', ')} - supplied, but no longer on the server, so not listed below.\n`
            );
        }

        return ranked.map((entry) => ({ name: label(entry), value: entry.id }));
    },
    probe: async (ctx) => assertAppSelectionNotEmpty(ctx.answers, groupingKey, groupingLabel),
    fallback: { type: 'list', message: 'App id(s) (could not fetch the list)' },
});

/**
 * Ask for app ids directly, for someone who already knows them.
 *
 * @param {object} args - Arguments.
 * @param {object} args.spec - The derived `appid` question, used unchanged apart from the pre-fill.
 * @param {unknown} args.supplied - App ids already supplied.
 * @param {string} args.groupingKey - `qliksensetag` or `collectionid`.
 * @param {string} args.groupingLabel - What to call the other route, e.g. `a tag`.
 *
 * @returns {object} A question spec.
 */
export const typedAppQuestion = ({ spec, supplied, groupingKey, groupingLabel }) => ({
    ...openingOn(spec, supplied),
    needs: [APP_SOURCE],
    when: (ctx) => ctx.answers[APP_SOURCE] === APP_SOURCES.TYPED,
    probe: async (ctx) => assertAppSelectionNotEmpty(ctx.answers, groupingKey, groupingLabel),
});

/**
 * Build a synthetic yes/no question that hides a block of others behind it.
 *
 * Synthetic keys are `_`-prefixed by convention, and `to-cli-options` drops those
 * from the options bag and the echoed command line - so a gate can never be
 * mistaken for something the command accepts.
 *
 * @param {object} args - Arguments.
 * @param {string} args.key - The gate's key. Must start with `_`.
 * @param {string} args.message - The question to ask.
 * @param {boolean} [args.default] - Whether the block is offered by default.
 *
 * @returns {object} A question spec.
 *
 * @throws {Error} If the key is not `_`-prefixed, which would let it reach the options bag.
 */
export const gate = ({ key, message, default: defaultValue = false }) => {
    if (!key.startsWith('_')) {
        throw new Error(`Interactive: gate key "${key}" must start with "_" to stay synthetic.`);
    }

    return {
        key,
        type: 'confirm',
        message,
        default: defaultValue,
        required: false,
        variadic: false,
        secret: false,
    };
};

/**
 * Hide a set of questions behind a gate.
 *
 * Returns a mapper, so it composes with the other reshaping a wizard does rather
 * than needing its own pass over the list.
 *
 * A question whose value was already supplied is shown whatever the gate says.
 * Hiding it would put the operator in the worst position of all: a filter from
 * a `.env` file silently excluding sheets, behind a question they answered "no"
 * to. Declining the gate means "nothing more", not "and forget what I set".
 *
 * @param {string} gateKey - Key of the gate question.
 * @param {string[]|Set<string>} keys - Keys to hide behind it.
 * @param {object} [supplied] - What the command line and environment already gave.
 *
 * @returns {(spec: object) => object} A mapper leaving other questions untouched.
 */
export const gatedBy = (gateKey, keys, supplied = {}) => {
    const hidden = new Set(keys);

    return (spec) =>
        hidden.has(spec.key)
            ? {
                  ...spec,
                  when: (ctx) => ctx.answers[gateKey] === true || isSupplied(supplied[spec.key]),
              }
            : spec;
};

/**
 * Put every question in a section, and order the list by section.
 *
 * Sections are declared once, as `[heading, keys]` pairs, and drive both the
 * grouping and the order questions are asked in - so a wizard cannot end up
 * showing a heading in one order and asking in another.
 *
 * Within a section the incoming order is kept, which `Array.prototype.sort` being
 * stable is what guarantees. A question whose key appears in no section keeps
 * whatever group it already had and sorts last.
 *
 * @param {Array} specs - The questions.
 * @param {Array<[string, Array<string>]>} sections - Section headings and the keys under each.
 *
 * @returns {Array} The questions, grouped and ordered.
 */
export const inSections = (specs, sections) => {
    const headings = sections.map(([heading]) => heading);
    const headingFor = (key) => sections.find(([, keys]) => [...keys].includes(key))?.[0];

    const grouped = specs.map((spec) => ({
        ...spec,
        group: spec.group ?? headingFor(spec.key),
    }));

    const rank = (spec) => {
        const index = headings.indexOf(spec.group);

        // An unsectioned question sorts last rather than first, so a key someone
        // forgot to place does not silently become the opening question.
        return index === -1 ? headings.length : index;
    };

    return [...grouped].sort((a, b) => rank(a) - rank(b));
};
