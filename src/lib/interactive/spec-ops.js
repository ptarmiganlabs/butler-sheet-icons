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
 * @param {string} gateKey - Key of the gate question.
 * @param {string[]|Set<string>} keys - Keys to hide behind it.
 *
 * @returns {(spec: object) => object} A mapper leaving other questions untouched.
 */
export const gatedBy = (gateKey, keys) => {
    const hidden = new Set(keys);

    return (spec) =>
        hidden.has(spec.key) ? { ...spec, when: (ctx) => ctx.answers[gateKey] === true } : spec;
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
