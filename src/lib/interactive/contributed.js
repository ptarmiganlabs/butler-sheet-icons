import { contributionOf } from '../extensions/apply.js';
import { gate, gatedBy } from './spec-ops.js';

/**
 * Place the questions for options a build contributed through the extension point.
 *
 * A wizard's `refine()` arranges the command's own questions into sections and gates. It knows
 * nothing about an option added at registration time (issue #1135), so left to `refine()` such a
 * question either trails the conversation unsectioned and ungated, or - in a wizard whose `refine()`
 * returns an explicit list, as the browser ones do - is not asked at all. Neither is what a
 * contribution that declared a placement asked for, and the second is silent.
 *
 * So the driver places them, after `refine()` has had its say (issue #1159):
 *
 * - Every contributed question is taken out of wherever `refine()` left it, or re-added if it was
 *   dropped, and appended after the command's own sections.
 * - Contributions that declared a `section` go under that heading, behind one synthetic gate per
 *   section - the same `gate()`/`gatedBy()` the wizards use, so declining the gate skips them and a
 *   value already supplied is still asked about as it would be for a builder option. Per run by
 *   default, because a contributed option usually describes this run rather than this environment;
 *   a contribution says otherwise with `perRun: false` - and a gate whose every question was
 *   already answered that way is not asked at all.
 * - Contributions that declared nothing keep today's behaviour: asked last, ungated, under no
 *   heading.
 *
 * Pure, so it can be tested without a terminal: specs in, specs out.
 *
 * @param {Array} refined - What `refine()` returned, or the derived specs when a wizard has none.
 * @param {Array} specs - The specs derived from the command - every option, contributed or not.
 * @param {object} [supplied] - Answers already supplied, keyed by option name; a supplied value
 *     opens a gated question whatever the gate says, as `gatedBy` does for the wizards' own.
 *
 * @returns {Array} The questions to ask, with the contributed ones placed.
 */
export const placeContributed = (refined, specs, supplied = {}) => {
    const contributed = specs.filter((spec) => spec.option && contributionOf(spec.option));

    if (contributed.length === 0) {
        return refined;
    }

    const contributedKeys = new Set(contributed.map((spec) => spec.key));
    const own = refined.filter((spec) => !contributedKeys.has(spec.key));

    // Sections in the order a contribution first named them, so a description's own ordering is
    // the conversation's ordering.
    const sections = new Map();
    const unplaced = [];

    for (const spec of contributed) {
        const placement = contributionOf(spec.option).interactive;

        if (!placement) {
            unplaced.push(spec);
            continue;
        }

        if (!sections.has(placement.section)) {
            sections.set(placement.section, { gate: placement.gate, specs: [] });
        }

        sections.get(placement.section).specs.push({ spec, perRun: placement.perRun !== false });
    }

    const placed = [];

    for (const [section, { gate: message, specs: list }] of sections) {
        const key = contributedGateKey(section);

        // A gate with nothing behind it is a question with no consequence. When every value under
        // it was already supplied and none describes this run, the driver will not ask about any of
        // them whatever the gate says - so the gate is not asked either.
        const asksSomething = list.some(({ spec, perRun }) => perRun || !(spec.key in supplied));

        if (asksSomething) {
            placed.push({
                ...gate({ key, message: message ?? `Configure ${section}?` }),
                group: section,
            });
        }

        for (const { spec, perRun } of list) {
            placed.push({
                ...gatedBy(key, [spec.key], supplied)(spec),
                group: section,
                ...(perRun ? { perRun: true } : {}),
            });
        }
    }

    return [...own, ...placed, ...unplaced];
};

/**
 * The synthetic question that opens a contributed section.
 *
 * `_`-prefixed, as every synthetic key is, so it can never reach the options bag; derived from the
 * section name so two contributions naming the same section share one gate, and two sections never
 * collide with each other or with a wizard's own `_filtering` / `_advanced`.
 *
 * @param {string} section - The section heading.
 *
 * @returns {string} The gate's answer key.
 */
export const contributedGateKey = (section) =>
    `_contributed-${String(section)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')}`;
