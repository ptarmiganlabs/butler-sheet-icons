import { everyLeafCommand } from '../interactive/command-tree.js';

/**
 * Markers delimiting a generated option table inside a markdown file.
 *
 * The tables live in the doc site repository, interleaved with hand-written prose, so the
 * generator cannot own whole files. Markers let it own a region: everything between them is
 * replaced on each run, everything around them is left exactly as the author wrote it.
 *
 * The opening marker carries the command path, so a file states which table belongs where and
 * the generator needs no separate mapping to keep in step with it.
 */
export const BLOCK_OPEN_PREFIX = '<!-- generated:cli-options ';
export const BLOCK_CLOSE = '<!-- /generated:cli-options -->';

/**
 * The body written between the two markers.
 *
 * The blank lines are for whoever opens the file: checked against VitePress's own renderer, the
 * table is recognised with or without them. They also happen to be what Prettier emits around
 * an HTML comment, so a block stays byte-identical if the page is ever run through a formatter.
 *
 * @param {string} table - The rendered table, newline-terminated.
 *
 * @returns {string} The block body.
 */
const blockBody = (table) => `\n${table}\n`;

/**
 * Matches one generated block, capturing the command path and the current body.
 *
 * Non-greedy so consecutive blocks in one file are matched separately rather than as a single
 * span running from the first opening marker to the last closing one.
 */
const BLOCK_PATTERN =
    /<!-- generated:cli-options ([^>]+?) -->\r?\n([\s\S]*?)<!-- \/generated:cli-options -->/g;

/**
 * Columns, in the order the doc site already uses for these tables.
 *
 * `Example` is dropped when nothing in the table can fill it, rather than emitting a column of
 * placeholders.
 */
const HEADERS = ['Option', 'Environment Variable', 'Description', 'Default', 'Example'];

/**
 * Escape a value for use inside a markdown table cell.
 *
 * Only ever applied to free-text cells. Cells this module wraps in backticks are code spans,
 * where every character is already literal and escaping would show the backslashes.
 *
 * Three things matter:
 *
 * - A literal `|` would end the cell, and a description may contain one.
 * - A newline would end the row. Several descriptions are authored as multiple lines for the
 *   terminal's benefit, and those breaks have to survive as `<br>` rather than truncating the
 *   table.
 * - `_` and `*` are emphasis markers. Descriptions are free text written for the terminal,
 *   where they mean nothing, so nothing stops one arriving with a matched pair that would
 *   silently italicise part of the cell on the site.
 *
 * The emphasis escaping is defensive rather than a fix for a live defect: today's descriptions
 * render the same either way, checked against VitePress's renderer. It is scoped to where
 * CommonMark would actually act, because escaping more than that puts visible backslashes on
 * the page - an `_` between two word characters cannot open emphasis, so `stable_153.0.3` is
 * left exactly as the CLI prints it.
 *
 * @param {unknown} value - Raw cell content.
 *
 * @returns {string} Content safe to place between two pipes.
 */
export const escapeCell = (value) =>
    String(value)
        .replace(/([*|])/g, '\\$1')
        .replace(/(^|\W)_|_(?=\W|$)/g, (match) => match.replace('_', '\\_'))
        .replace(/\r?\n/g, '<br>')
        .trim();

/**
 * Render a value as a markdown code span for a table cell.
 *
 * A code span makes every character literal except one: a `|` still ends the cell, because the
 * row is split into cells before inline spans are parsed. GFM is explicit that a pipe has to be
 * escaped "even inside other inline spans".
 *
 * This is not theoretical. `qscloud list-collections` declares `--outputformat <table|json>`,
 * and rendering that unescaped through VitePress splits the cell, drops the code span, and
 * pushes the row's last value off the end of the table where it is not displayed at all.
 *
 * @param {unknown} value - Raw cell content.
 *
 * @returns {string} A code span safe to place between two pipes.
 */
export const codeCell = (value) => `\`${String(value).replace(/\|/g, '\\|')}\``;

/**
 * Render the `Default` cell for one option.
 *
 * A mandatory option has no default by definition, and saying so is more useful to an
 * administrator than an empty cell: it is the difference between an option they may omit and
 * one the command refuses to run without.
 *
 * @param {import('commander').Option} option - The option to describe.
 *
 * @returns {string} Markdown for the cell.
 */
export const formatDefault = (option) => {
    if (option.mandatory) {
        return '**Required**';
    }

    if (option.defaultValue === undefined) {
        return '-';
    }

    if (Array.isArray(option.defaultValue)) {
        return option.defaultValue.length > 0 ? codeCell(option.defaultValue.join(', ')) : '-';
    }

    return codeCell(option.defaultValue);
};

/**
 * Render the `Description` cell for one option.
 *
 * The accepted values are appended in the same shape Commander prints them in `--help`, so a
 * reader comparing the doc page against their own terminal sees the same sentence twice rather
 * than two wordings of it.
 *
 * @param {import('commander').Option} option - The option to describe.
 *
 * @returns {string} Markdown for the cell.
 */
export const formatDescription = (option) => {
    const parts = [option.description];

    if (option.argChoices?.length > 0) {
        parts.push(`(choices: ${option.argChoices.join(', ')})`);
    }

    return escapeCell(parts.filter(Boolean).join(' '));
};

/**
 * Derive an example invocation for one option.
 *
 * Only options with a fixed set of accepted values can have one derived: any other example is
 * editorial - a plausible host name, a real build id - and inventing those here would put
 * unverifiable text into a generated block. Those are supplied through the examples file
 * instead, or left out.
 *
 * A value other than the default is preferred, since an example repeating the default
 * demonstrates nothing.
 *
 * @param {import('commander').Option} option - The option to derive an example for.
 *
 * @returns {string|null} The example, or null when none can be derived.
 */
export const deriveExample = (option) => {
    if (!(option.argChoices?.length > 0)) {
        return null;
    }

    const alternative =
        option.argChoices.find((choice) => choice !== option.defaultValue) ?? option.argChoices[0];

    return `${option.long ?? option.short} ${alternative}`;
};

/**
 * The rows of the option table for one command.
 *
 * @param {import('commander').Command} command - The command to tabulate.
 * @param {object} [context] - Rendering context.
 * @param {Record<string, string>} [context.examples] - Hand-written examples, keyed by long flag.
 *
 * @returns {string[][]} One array of cells per row, in `HEADERS` order.
 */
export const optionRowsFor = (command, { examples = {} } = {}) => {
    const rows = command.options
        .filter((option) => !option.hidden)
        .map((option) => {
            const example = examples[option.long] ?? deriveExample(option);

            return [
                codeCell(option.flags),
                option.envVar ? codeCell(option.envVar) : '-',
                formatDescription(option),
                formatDefault(option),
                example ? codeCell(example) : '-',
            ];
        });

    // Commander adds the help option itself, so it is absent from `command.options` even though
    // every command accepts it and the doc tables list it. Read it back rather than hardcoding
    // the flags: `_getHelpOption()` is private, so fall back to omitting the row instead of
    // guessing, and skip it entirely for a command that has disabled help.
    const helpOption = command._getHelpOption?.();

    if (helpOption) {
        rows.push([
            codeCell(helpOption.flags),
            '-',
            escapeCell(helpOption.description),
            '-',
            codeCell(helpOption.short ?? helpOption.long),
        ]);
    }

    return rows;
};

/**
 * Render a markdown table, padding every cell to its column width.
 *
 * Markdown does not need the padding, and the rendered page is identical without it. It is here
 * so a generated table reads like the hand-written ones already on the doc site, and so a diff
 * against one shows the cells that changed rather than every row reflowing.
 *
 * The layout matches Prettier's byte for byte - verified against it for all nine commands - so
 * the blocks survive a formatter unchanged if the doc site ever gains one.
 *
 * @param {string[]} headers - Header cells.
 * @param {string[][]} rows - Body rows.
 *
 * @returns {string} The table, newline-terminated.
 */
export const renderTable = (headers, rows) => {
    const widths = headers.map((header, column) =>
        Math.max(header.length, ...rows.map((row) => row[column].length))
    );

    // Measured against Prettier: it lays these columns out by source length, counting an
    // escaping backslash as a character like any other, so the raw string is what to pad.
    const line = (cells) =>
        `| ${cells.map((text, column) => text.padEnd(widths[column])).join(' | ')} |`;

    // Prettier writes at least three dashes per column, even when the column is narrower.
    const separator = `| ${widths.map((width) => '-'.repeat(Math.max(width, 3))).join(' | ')} |`;

    return [line(headers), separator, ...rows.map(line)].join('\n') + '\n';
};

/**
 * The complete option table for one command.
 *
 * @param {import('commander').Command} command - The command to tabulate.
 * @param {object} [context] - Rendering context.
 * @param {Record<string, string>} [context.examples] - Hand-written examples, keyed by long flag.
 *
 * @returns {string} Markdown table, newline-terminated.
 */
export const renderOptionTable = (command, context = {}) => {
    const rows = optionRowsFor(command, context);
    const exampleColumn = HEADERS.indexOf('Example');
    const hasExamples = rows.some((row) => row[exampleColumn] !== '-');

    if (hasExamples) {
        return renderTable(HEADERS, rows);
    }

    const trimmed = HEADERS.slice(0, exampleColumn);

    return renderTable(
        trimmed,
        rows.map((row) => row.slice(0, exampleColumn))
    );
};

/**
 * Look up a command by the path a user would type.
 *
 * Reads the same enumeration the interactive wizards and their registry guard read, so a
 * command added to the CLI is available to the docs from the moment it is registered.
 *
 * @param {string} path - Space-separated command path, e.g. `browser install`.
 *
 * @returns {import('commander').Command} The command.
 *
 * @throws {Error} When no command has that path.
 */
export const commandAt = (path) => {
    const leaves = everyLeafCommand();
    const match = leaves.find((leaf) => leaf.path === path);

    if (!match) {
        throw new Error(
            `No CLI command "${path}". Known commands: ${leaves.map((leaf) => leaf.path).join(', ')}.`
        );
    }

    return match.command;
};

/**
 * @typedef {object} BlockUpdate
 * @property {string} path - Command path named by the block.
 * @property {boolean} changed - Whether the rendered table differs from what the file held.
 */

/**
 * @typedef {object} UpdateResult
 * @property {string} content - The markdown, with every generated block re-rendered.
 * @property {BlockUpdate[]} blocks - One entry per block found, in document order.
 */

/**
 * Re-render every generated option table in a markdown document.
 *
 * Content outside the markers is untouched, so this is safe to run against a page that is
 * mostly hand-written prose.
 *
 * @param {string} markdown - The document.
 * @param {object} [context] - Rendering context.
 * @param {Record<string, Record<string, string>>} [context.examples] - Hand-written examples,
 *   keyed by command path and then by long flag.
 *
 * @returns {UpdateResult} The updated document and a report of what each block did.
 *
 * @throws {Error} When a block names a command that does not exist.
 */
export const updateGeneratedBlocks = (markdown, { examples = {} } = {}) => {
    const blocks = [];

    const content = markdown.replace(BLOCK_PATTERN, (match, rawPath, body) => {
        const path = rawPath.trim();
        const rendered = blockBody(
            renderOptionTable(commandAt(path), { examples: examples[path] })
        );

        blocks.push({ path, changed: body !== rendered });

        return `${BLOCK_OPEN_PREFIX}${path} -->\n${rendered}${BLOCK_CLOSE}`;
    });

    return { content, blocks };
};

/**
 * A generated block ready to paste into a page that does not have one yet.
 *
 * @param {string} path - Space-separated command path, e.g. `browser install`.
 * @param {object} [context] - Rendering context.
 * @param {Record<string, string>} [context.examples] - Hand-written examples, keyed by long flag.
 *
 * @returns {string} The markers and the table between them.
 */
export const renderBlock = (path, context = {}) =>
    `${BLOCK_OPEN_PREFIX}${path} -->\n${blockBody(renderOptionTable(commandAt(path), context))}${BLOCK_CLOSE}\n`;

/**
 * Every command path the generator can render a table for.
 *
 * @returns {string[]} Command paths, in registration order.
 */
export const knownCommandPaths = () => everyLeafCommand().map((leaf) => leaf.path);
