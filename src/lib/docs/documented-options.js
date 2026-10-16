/**
 * Which options a staged doc page shows, and whether the CLI has them.
 *
 * Pages in `docs/to-doc-site/` describe the CLI by example, and nothing checked those examples
 * against it. A misspelt option, one renamed after the page was written, or a page staged ahead of
 * code that never landed all reached the publishing pass, where only a careful read stood between
 * them and the doc site. The option tables already avoid this by being generated from the
 * Commander definitions (issue #849); command lines in prose cannot be generated, but they can be
 * checked against the same definitions.
 *
 * What counts as "an option a page shows" is deliberately narrow: a long option that follows
 * `butler-sheet-icons` on a command line, in a fenced code block or an inline code span. A page
 * about Docker or npm is full of other programs' options - `docker run --rm`, `npm ci
 * --omit=dev` - and so is the documentation of this repository's own scripts. Taking only what
 * comes after the binary, or the image named after it, leaves all of those alone; checking every
 * `--word` in a page would refuse a dozen of the pages already in the folder. Prose and lone
 * option names in inline code are not checked, for the same reason.
 */

import { everyLeafCommand } from '../interactive/command-tree.js';
import { buildInteractiveCommand } from '../interactive/interactive-command.js';

/**
 * Options no builder declares, because Commander adds them itself: `--help` on every command and
 * `--version` on the root program.
 */
const COMMANDER_OWN_OPTIONS = ['--help', '--version'];

/**
 * A long option as a command line writes it: two hyphens, then lowercase words joined by single
 * hyphens. The lookbehind keeps a `--` inside a word - a host name such as `a--b.example.com` -
 * from being read as one.
 */
const LONG_OPTION = /(?<![\w-])--[a-z][a-z0-9]*(?:-[a-z0-9]+)*/g;

/**
 * The binary, or the Docker image named after it, as a command line refers to it.
 *
 * Preceded by a separator that can sit before a program name - start of line, whitespace, a path
 * separator, a quote - and followed by one that can end it: end of line, whitespace, the `:` of an
 * image tag, the `@` of an npx version, a quote. That admits `./butler-sheet-icons`,
 * `.\butler-sheet-icons.exe`, `ptarmiganlabs/butler-sheet-icons:latest` and
 * `npx butler-sheet-icons@latest`, and excludes `butler-sheet-icons-docs`, the doc site's
 * repository, whose name is on command lines in this folder too.
 */
const BINARY = /(?:^|[\s/\\"'(=])butler-sheet-icons(?:\.exe|\.js)?(?=$|[\s:"'@)])/g;

/** Where one shell command ends and the next begins on the same line. */
const COMMAND_SEPARATOR = /&&|\|\||;|\|/g;

/** A line the shell continues onto the next one: bash's `\`, PowerShell's backtick, cmd's `^`. */
const CONTINUATION = /[\\`^][ \t]*$/;

/**
 * The opening or closing line of a fenced code block. Any indentation, not only the three spaces
 * CommonMark allows at the top level, because a block inside a list item is indented with it.
 */
const FENCE = /^[ \t]*(`{3,}|~{3,})(.*)$/;

/**
 * @typedef {object} CodePart
 * @property {string} text - The code, without any continuation character.
 * @property {number} line - The page line it came from, counted from 1.
 */

/**
 * @typedef {object} OptionMention
 * @property {string} option - The long option, without any value, e.g. `--dry-run`.
 * @property {number} line - The page line it is on, counted from 1.
 */

/**
 * Every long option the CLI declares, on any command.
 *
 * Read from the same Commander definitions the generated option tables and the interactive
 * wizards read, so an option is accepted here from the moment it is registered. A leaf command's
 * ancestors are walked as well, so an option declared on a namespace counts too.
 *
 * @returns {Set<string>} Long option names, e.g. `--dry-run`.
 */
export const declaredOptions = () => {
    const declared = new Set(COMMANDER_OWN_OPTIONS);
    const commands = [
        ...everyLeafCommand().map((leaf) => leaf.command),
        // A command of the root program rather than of a namespace, so the walk above misses it.
        buildInteractiveCommand(),
    ];

    for (const command of commands) {
        for (let current = command; current; current = current.parent) {
            for (const option of current.options) {
                if (option.long) {
                    declared.add(option.long);
                }
            }
        }
    }

    return declared;
};

/**
 * The code in a page, as logical lines.
 *
 * A fenced block contributes each of its lines, joined across shell continuations so that a
 * command wrapped over several lines is read as one; an inline code span contributes itself. Each
 * part keeps the page line it came from, so a finding can say where it is.
 *
 * @param {string} markdown - The page.
 *
 * @returns {CodePart[][]} One array of parts per logical line.
 */
export const codeLinesOf = (markdown) => {
    const logical = [];
    let fence = null;
    let continued = null;

    markdown.split(/\r?\n/).forEach((text, index) => {
        const line = index + 1;
        const marker = FENCE.exec(text);

        if (fence === null) {
            if (marker) {
                fence = marker[1];

                return;
            }

            for (const span of text.matchAll(/`([^`]+)`/g)) {
                logical.push([{ text: span[1], line }]);
            }

            return;
        }

        // Closed by a fence of the same character, at least as long, with nothing after it.
        if (
            marker &&
            marker[1][0] === fence[0] &&
            marker[1].length >= fence.length &&
            marker[2].trim() === ''
        ) {
            if (continued) {
                logical.push(continued);
                continued = null;
            }

            fence = null;

            return;
        }

        const part = { text: text.replace(CONTINUATION, ''), line };

        continued = continued ? [...continued, part] : [part];

        if (!CONTINUATION.test(text)) {
            logical.push(continued);
            continued = null;
        }
    });

    // An unclosed fence still holds code, and a page that forgot to close one should not hide it.
    if (continued) {
        logical.push(continued);
    }

    return logical;
};

/**
 * The long options a page shows on `butler-sheet-icons` command lines.
 *
 * Within each command on a logical line - split at `&&`, `||`, `;` and `|` - only what follows the
 * last mention of the binary counts. The last rather than the first, because a Docker command can
 * name the binary twice: as an `--entrypoint` value and again as the image.
 *
 * @param {string} markdown - The page.
 *
 * @returns {OptionMention[]} Each option where it appears, in page order.
 */
export const optionMentionsIn = (markdown) => {
    const mentions = [];

    for (const parts of codeLinesOf(markdown)) {
        const starts = [];
        let joined = '';

        for (const part of parts) {
            starts.push({ at: joined.length, line: part.line });
            joined += `${part.text} `;
        }

        const lineAt = (position) => starts.findLast((start) => start.at <= position).line;
        const boundaries = [...joined.matchAll(COMMAND_SEPARATOR)];
        const commands = [];
        let from = 0;

        for (const boundary of boundaries) {
            commands.push({ at: from, text: joined.slice(from, boundary.index) });
            from = boundary.index + boundary[0].length;
        }

        commands.push({ at: from, text: joined.slice(from) });

        for (const command of commands) {
            const binary = [...command.text.matchAll(BINARY)].at(-1);

            if (!binary) {
                continue;
            }

            const after = binary.index + binary[0].length;

            for (const option of command.text.slice(after).matchAll(LONG_OPTION)) {
                mentions.push({
                    option: option[0],
                    line: lineAt(command.at + after + option.index),
                });
            }
        }
    }

    return mentions;
};

/**
 * The options a page shows that the CLI does not have.
 *
 * @param {string} markdown - The page.
 * @param {Set<string>} [declared] - The options the CLI declares. Read from the CLI when omitted.
 *
 * @returns {OptionMention[]} Each unknown option where it appears, in page order.
 */
export const undeclaredOptionsIn = (markdown, declared = declaredOptions()) =>
    optionMentionsIn(markdown).filter((mention) => !declared.has(mention.option));
