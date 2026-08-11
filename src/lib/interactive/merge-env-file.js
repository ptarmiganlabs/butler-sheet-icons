/**
 * Update the settings a command owns in an existing `.env`, leaving the rest alone.
 *
 * A `.env` in a working directory is shared: it holds the settings for every
 * Butler Sheet Icons command run from there, and often things the operator put
 * there themselves. Replacing it wholesale to save one command's answers
 * destroys all of that, which is why the earlier version needed a warning, a
 * confirmation and a backup file. Updating in place removes the destruction
 * rather than apologising for it.
 *
 * This is a **line-level edit, not a parse and rewrite**. Values belonging to
 * keys this command does not own are never read, re-quoted or reformatted - the
 * bytes are carried across untouched. That is what makes merging safe here,
 * where a full round-trip through a parser would risk changing someone else's
 * settings as a side effect of saving ours.
 *
 * Three details of `dotenv`'s format drive the implementation, all checked
 * against the version this repo depends on rather than assumed:
 *
 * - **The last occurrence of a key wins**, not the first. Replacing an earlier
 *   duplicate would leave the file parsing to the old value, so the *last* one
 *   is the one that has to be rewritten.
 * - **`export NAME=value` is valid** and parses the same as `NAME=value`, so the
 *   matcher has to allow the prefix - and preserves it, since it is presumably
 *   there because something else sources the file.
 * - **A quoted value may span physical lines.** Replacing only the first line of
 *   one would leave the remainder behind as an orphan fragment, corrupting the
 *   file. A key's entry is therefore a line *range*, not a line.
 */

/** Matches the start of an assignment, capturing the optional export and the key. */
const ASSIGNMENT = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

/**
 * Whether a value fragment leaves a quote open at the end of the line.
 *
 * @param {string} fragment - The text after the `=` on the opening line.
 *
 * @returns {false|string} The unterminated quote character, or false.
 */
const opensQuote = (fragment) => {
    const text = fragment.trimStart();
    const quote = text[0];

    if (quote !== '"' && quote !== "'") {
        return false;
    }

    // Closed on the same line when the quote appears again after the opener.
    return text.indexOf(quote, 1) === -1 ? quote : false;
};

/**
 * Find the line range each key occupies, keeping only the effective one.
 *
 * @param {string[]} lines - The file, split into lines.
 * @param {Set<string>} keys - Keys to look for.
 *
 * @returns {Map<string, {start: number, end: number, prefix: string}>} Where each key lives.
 */
export const locateAssignments = (lines, keys) => {
    const found = new Map();

    for (let index = 0; index < lines.length; index += 1) {
        const match = ASSIGNMENT.exec(lines[index]);

        if (!match) {
            continue;
        }

        const [, prefix, key, valueFragment] = match;
        let end = index;
        const openQuote = opensQuote(valueFragment);

        if (openQuote) {
            // Consume until the quote closes, so a multiline value is replaced
            // as one unit rather than leaving its tail behind.
            while (end + 1 < lines.length && !lines[end + 1].includes(openQuote)) {
                end += 1;
            }

            if (end + 1 < lines.length) {
                end += 1;
            }
        }

        if (keys.has(key)) {
            // Overwrites any earlier sighting, which is what "last one wins"
            // requires: rewriting an earlier duplicate would leave the file
            // still parsing to the later value.
            found.set(key, { start: index, end, prefix });
        }

        index = end;
    }

    return found;
};

/**
 * Merge a set of `NAME=value` assignments into an existing file's contents.
 *
 * @param {string} current - The existing file contents.
 * @param {Array<{name: string, line: string}>} assignments - Lines to apply, already quoted.
 *
 * @returns {{contents: string, updated: string[], added: string[]}} The new contents and what changed.
 */
export const mergeEnvContents = (current, assignments) => {
    const lines = current.split('\n');
    const byName = new Map(assignments.map((entry) => [entry.name, entry]));
    const located = locateAssignments(lines, new Set(byName.keys()));

    const updated = [];
    const added = [];
    const replacements = new Map();

    for (const [name, where] of located) {
        replacements.set(where.start, {
            ...where,
            line: `${where.prefix}${byName.get(name).line}`,
        });
        updated.push(name);
    }

    const out = [];

    for (let index = 0; index < lines.length; index += 1) {
        const replacement = replacements.get(index);

        if (replacement) {
            out.push(replacement.line);
            // Skip the rest of a multiline value, which the new line replaces.
            index = replacement.end;
            continue;
        }

        out.push(lines[index]);
    }

    const missing = assignments.filter((entry) => !located.has(entry.name));

    if (missing.length > 0) {
        // Trailing blank lines are dropped before appending so the additions do
        // not drift further from the content each time the file is saved.
        while (out.length > 0 && out[out.length - 1].trim() === '') {
            out.pop();
        }

        out.push('', `# Added by the Butler Sheet Icons wizard`);

        for (const entry of missing) {
            out.push(entry.line);
            added.push(entry.name);
        }
    }

    const contents = out.join('\n');

    return {
        contents: contents.endsWith('\n') ? contents : `${contents}\n`,
        updated,
        added,
    };
};
