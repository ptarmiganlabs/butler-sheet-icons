/**
 * What `--version` reports.
 *
 * Two things a binary could not previously say about itself, both of which turn up in support
 * threads before anything else does. Issue #1152.
 *
 * **Which build this is.** #1135 lets a build substitute the module behind `#extensions` and add
 * commands, options and a `beforeAction` hook. A binary built that way was indistinguishable from a
 * stock one at run time, so somebody filing an issue from a variant build had no way to say so and
 * no way to find out - and the first sign was a report describing a flag that does not exist in this
 * repository, after both sides had spent time on it.
 *
 * **When it was built.** Narrower than it looks, and worth stating so the scope is clear: a tagged
 * release is determined by its version, and insider builds already rewrite `package.json` to
 * `<version>-<sha>` before bundling. What is left is the case where one version string covers more
 * than one artifact - an image rebuilt from the same tag, or a binary that has sat on a server for a
 * year.
 *
 * The variant's own version is **derived at build time, not declared**: a description cannot know
 * its own version without hard-coding a number that goes stale silently, so `scripts/bundle.mjs`
 * reads it from that module's nearest `package.json` - the same package tree it already resolves for
 * the Commander major check - and substitutes it here.
 */

/**
 * When this binary was built, injected at bundle time.
 *
 * Declared with a `typeof` guard rather than read directly, because esbuild's `--define` substitutes
 * a bare identifier: in a source run the identifier simply does not exist, and referencing it would
 * be a ReferenceError rather than `undefined`.
 */
export const BUILD_DATE =
    typeof __BSI_BUILD_DATE__ === 'undefined' ? undefined : __BSI_BUILD_DATE__;

/** The version of the extensions module this binary bundled, injected at bundle time. */
export const EXTENSIONS_VERSION =
    typeof __BSI_EXTENSIONS_VERSION__ === 'undefined' ? undefined : __BSI_EXTENSIONS_VERSION__;

/** Width the detail labels are padded to, so the values line up under each other. */
const LABEL_WIDTH = 8;

/**
 * Render the string Commander prints for `--version`.
 *
 * Pure, and takes every input rather than reading the injected constants itself, so the shape can be
 * asserted without a build. A detail line appears only when its value is known: a source run knows
 * neither, and prints the headline alone.
 *
 * @param {object} options - What this binary knows about itself.
 * @param {string} options.name - The program name.
 * @param {string} options.version - The version from `package.json`, which is core's.
 * @param {string} [options.variant] - Short name for a variant build, from its description.
 * @param {string} [options.variantVersion] - That variant's own version, injected at bundle time.
 * @param {string} [options.buildDate] - When this binary was built, injected at bundle time.
 *
 * @returns {string} One line for a stock source run; a headline plus indented detail otherwise.
 */
export const describeVersion = ({ name, version, variant, variantVersion, buildDate }) => {
    const headline = variant ? `${name} ${version} (${variant})` : `${name} ${version}`;

    const details = [
        // Only worth splitting out when there is a second version to distinguish it from. On a
        // stock build "core 5.0.0" under "butler-sheet-icons 5.0.0" says nothing twice.
        ...(variant ? [['core', version]] : []),
        ...(variant && variantVersion ? [[variant, variantVersion]] : []),
        ...(buildDate ? [['built', buildDate]] : []),
    ];

    if (details.length === 0) {
        return headline;
    }

    const lines = details.map(([label, value]) => `  ${label.padEnd(LABEL_WIDTH)}${value}`);

    return [headline, ...lines].join('\n');
};
