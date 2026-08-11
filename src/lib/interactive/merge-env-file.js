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
 * bytes are carried across untouched, line endings included. That is what makes
 * merging safe here, where a full round-trip through a parser would risk
 * changing someone else's settings as a side effect of saving ours.
 *
 * Four details of the format drive the implementation, all checked by running
 * the code against them rather than reasoning about them:
 *
 * - **The last occurrence of a key wins**, not the first. Replacing an earlier
 *   duplicate would leave the file parsing to the old value, so the *last* one
 *   is the one that has to be rewritten.
 * - **`export NAME=value` is valid** and parses the same as `NAME=value`, so the
 *   matcher has to allow the prefix - and preserves it, since it is presumably
 *   there because something else sources the file.
 * - **A quoted value may span physical lines.** Replacing only the first line of
 *   one would leave the remainder behind as an orphan fragment, so a key's entry
 *   is a line *range*. But an *unterminated* quote must not be read that way: it
 *   would make the range run to the end of the file and the replacement would
 *   delete everything after it. A stray quote in a hand-edited file is entirely
 *   ordinary, so that case falls back to treating the line as a single line.
 * - **Line endings are per line.** A `.env` written on Windows is CRLF, and
 *   `.` does not match `\r` in JavaScript - so matching against the raw line
 *   silently found nothing at all and appended a duplicate of every setting on
 *   every save. Each line is matched with its ending stripped and rewritten with
 *   the ending it had.
 */

/** Matches the start of an assignment, capturing the optional export and the key. */
const ASSIGNMENT = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

/**
 * Split a file into lines, keeping each line's own ending separate from its text.
 *
 * Preserving the ending per line rather than normalising the file is what lets
 * an unrelated line be written back byte for byte, including in a file that
 * mixes the two conventions.
 *
 * @param {string} text - The file contents.
 *
 * @returns {{text: string, eol: string}[]} One entry per line.
 */
const toLines = (text) => {
    const parts = text.split('\n');

    return parts.map((line, index) => {
        // Split consumes every newline, so only the final part can have lacked
        // one. That distinction matters for working out the file's convention.
        const terminated = index < parts.length - 1;

        return line.endsWith('\r')
            ? { text: line.slice(0, -1), eol: '\r\n', terminated }
            : { text: line, eol: '\n', terminated };
    });
};

/**
 * The line ending a file predominantly uses, for lines being added to it.
 *
 * Blank entries are ignored, because splitting a file that ends in a newline
 * always yields a final empty one - counting it made a one-line CRLF file look
 * evenly split and additions came out LF.
 *
 * @param {{text: string, eol: string}[]} lines - The parsed lines.
 *
 * @returns {string} `'\r\n'` or `'\n'`.
 */
const dominantEol = (lines) => {
    // A line with no terminator carries no evidence either way, and counting it
    // as LF made a CRLF file whose last line lacks a newline come out as LF.
    const real = lines.filter((line) => line.text !== '' && line.terminated);

    return real.filter((line) => line.eol === '\r\n').length > real.length / 2 ? '\r\n' : '\n';
};

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
 * Find where a quoted value that opened on this line closes.
 *
 * @param {{text: string}[]} lines - The parsed lines.
 * @param {number} start - Index of the line the quote opened on.
 * @param {string} quote - The quote character to close.
 *
 * @returns {number|undefined} Index of the closing line, or undefined when it never closes.
 */
/**
 * Whether a line ends a quoted value that opened earlier.
 *
 * @param {string} text - The line's text, without its ending.
 * @param {string} quote - The quote character that opened the value.
 *
 * @returns {boolean} True when the value closes on this line.
 */
const closesQuote = (text, quote) => {
    const at = text.indexOf(quote);

    if (at === -1) {
        return false;
    }

    // Only whitespace or a comment may follow the closing quote. Checked against
    // dotenv: `B=two"` after an opening quote is absorbed into the value, while
    // `OTHER=say "hi` stays a separate setting - so a quote with content after
    // it does not close anything, and treating it as a closer deletes a real
    // setting when the value is replaced.
    const rest = text.slice(at + 1).trim();

    return rest === '' || rest.startsWith('#');
};

const findClosingLine = (lines, start, quote) => {
    for (let index = start + 1; index < lines.length; index += 1) {
        if (closesQuote(lines[index].text, quote)) {
            return index;
        }
    }

    return undefined;
};

/**
 * Find the line range each key occupies, keeping only the effective one.
 *
 * @param {{text: string}[]|string[]} lines - The file's lines, parsed or raw.
 * @param {Set<string>} keys - Keys to look for.
 *
 * @returns {Map<string, {start: number, end: number, prefix: string}>} Where each key lives.
 */
export const locateAssignments = (lines, keys) => {
    // Accepts raw strings too, so the exported helper stays usable on its own.
    const parsed = lines.map((line) => (typeof line === 'string' ? { text: line } : line));
    const found = new Map();

    for (let index = 0; index < parsed.length; index += 1) {
        const match = ASSIGNMENT.exec(parsed[index].text);

        if (!match) {
            continue;
        }

        const [, prefix, key, valueFragment] = match;
        const openQuote = opensQuote(valueFragment);
        let end = index;

        if (openQuote) {
            const closing = findClosingLine(parsed, index, openQuote);

            // An unterminated quote is a malformed line, not a value running to
            // the end of the file. Treating it as the latter would put every
            // remaining line inside this key's range, and replacing the key
            // would then delete all of them.
            if (closing !== undefined) {
                end = closing;
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

/** Header written above settings appended to a file that did not have them. */
export const ADDED_HEADER = '# Added by the Butler Sheet Icons wizard';

/**
 * Merge a set of `NAME=value` assignments into an existing file's contents.
 *
 * @param {string} current - The existing file contents.
 * @param {Array<{name: string, line: string}>} assignments - Lines to apply, already quoted.
 *
 * @returns {{contents: string, updated: string[], added: string[]}} The new contents and what changed.
 */
export const mergeEnvContents = (current, assignments) => {
    const lines = toLines(current);
    const eol = dominantEol(lines);
    const byName = new Map(assignments.map((entry) => [entry.name, entry]));
    const located = locateAssignments(lines, new Set(byName.keys()));

    const updated = [];
    const added = [];
    const replacements = new Map();

    for (const [name, where] of located) {
        replacements.set(where.start, { ...where, name });
        updated.push(name);
    }

    const out = [];

    for (let index = 0; index < lines.length; index += 1) {
        const replacement = replacements.get(index);

        if (replacement) {
            out.push({
                text: `${replacement.prefix}${byName.get(replacement.name).line}`,
                // The ending of the line the value ended on, so a rewritten
                // multiline value does not change the file's convention.
                eol: lines[replacement.end].eol,
            });
            // Skip the rest of a multiline value, which the new line replaces.
            index = replacement.end;
            continue;
        }

        out.push(lines[index]);
    }

    const missing = assignments.filter((entry) => !located.has(entry.name));

    if (missing.length > 0) {
        const newLines = missing.map((entry) => ({ text: entry.line, eol }));
        const headerAt = out.findIndex((line) => line.text.trim() === ADDED_HEADER);

        added.push(...missing.map((entry) => entry.name));

        if (headerAt === -1) {
            // Trailing blank lines are dropped before appending so the additions
            // do not drift further from the content on each save.
            while (out.length > 0 && out[out.length - 1].text.trim() === '') {
                out.pop();
            }

            out.push({ text: '', eol }, { text: ADDED_HEADER, eol }, ...newLines);
        } else {
            // Directly under the header, rather than after the lines that
            // follow it - those are not necessarily the wizard's, and appending
            // at the end leaves later settings orphaned beneath whatever
            // happened to be last with nothing saying where they came from.
            out.splice(headerAt + 1, 0, ...newLines);
        }
    }

    const contents = out
        .map((line, index) => {
            if (index === out.length - 1) {
                return line.text;
            }

            // A line that had no terminator gains one only because something was
            // appended after it, so it takes the file's convention rather than
            // the placeholder its own entry carries.
            return `${line.text}${line.terminated === false ? eol : line.eol}`;
        })
        .join('');
    const trailing = out.length > 0 ? out[out.length - 1].eol : eol;

    return {
        contents: contents.endsWith('\n') ? contents : `${contents}${trailing}`,
        updated,
        added,
    };
};
