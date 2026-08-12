#!/usr/bin/env node
// Platform: Cross-platform (macOS, Linux, Windows)
// Requires: Node.js

/**
 * Generate the CLI option tables used by the Butler Sheet Icons doc site.
 *
 * The tables on the doc site state flag names, environment variables, accepted values and
 * defaults. Every one of those is already declared once, in the Commander definitions under
 * `src/lib/commands/`, so a hand-written table is a second copy that drifts silently - issue
 * #849 is one page's worth of exactly that. This reads the definitions and writes the table.
 *
 * The doc site lives in a separate repository (ptarmiganlabs/butler-sheet-icons-docs), so point
 * this at a local clone of it. Only the regions between the generated-block markers are
 * rewritten; the prose around them is left alone.
 *
 * Usage:
 *   node scripts/docs-cli-tables.js --list
 *   node scripts/docs-cli-tables.js --command "browser install"
 *   node scripts/docs-cli-tables.js <file.md>... --check
 *   node scripts/docs-cli-tables.js <file.md>... --write
 *
 * Options:
 *   --list              Print every command path a table can be generated for.
 *   --command <path>    Print a ready-to-paste block for one command.
 *   --check             Report whether the blocks in the named files are current. Exit 1 if not.
 *   --write             Rewrite the blocks in the named files.
 *   --examples <file>   JSON of hand-written examples: { "<command path>": { "--flag": "..." } }.
 *
 * With neither --check nor --write, the named files are rendered to stdout and left untouched.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import {
    knownCommandPaths,
    renderBlock,
    updateGeneratedBlocks,
} from '../src/lib/docs/cli-option-tables.js';

/**
 * Parse the command line.
 *
 * Hand-rolled rather than using Commander: this script reads the CLI definitions, and building
 * a second command tree in the same process to do it invites confusion about which tree is
 * being inspected.
 *
 * @param {string[]} argv - Arguments after the script name.
 *
 * @returns {{files: string[], list: boolean, command: string|null, check: boolean, write: boolean, examples: string|null}} Parsed arguments.
 *
 * @throws {Error} When a flag that takes a value is given none.
 */
const parseArgs = (argv) => {
    const parsed = {
        files: [],
        list: false,
        command: null,
        check: false,
        write: false,
        examples: null,
    };

    const valueFor = (flag, index) => {
        const value = argv[index + 1];

        if (value === undefined || value.startsWith('--')) {
            throw new Error(`${flag} needs a value`);
        }

        return value;
    };

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];

        if (argument === '--list') {
            parsed.list = true;
        } else if (argument === '--check') {
            parsed.check = true;
        } else if (argument === '--write') {
            parsed.write = true;
        } else if (argument === '--command') {
            parsed.command = valueFor(argument, index);
            index += 1;
        } else if (argument === '--examples') {
            parsed.examples = valueFor(argument, index);
            index += 1;
        } else if (argument.startsWith('--')) {
            throw new Error(`Unknown option ${argument}`);
        } else {
            parsed.files.push(argument);
        }
    }

    return parsed;
};

/**
 * Load the hand-written examples file, if one was named.
 *
 * @param {string|null} path - Path to a JSON file, or null.
 *
 * @returns {Record<string, Record<string, string>>} Examples keyed by command path, then flag.
 */
const loadExamples = (path) => (path ? JSON.parse(readFileSync(path, 'utf8')) : {});

/**
 * Entry point.
 *
 * @returns {number} Process exit code. 1 when `--check` found a stale block, or on error.
 */
const main = () => {
    let args;

    try {
        args = parseArgs(process.argv.slice(2));
    } catch (err) {
        process.stderr.write(`${err.message}\n`);

        return 1;
    }

    if (args.list) {
        process.stdout.write(`${knownCommandPaths().join('\n')}\n`);

        return 0;
    }

    const examples = loadExamples(args.examples);

    if (args.command) {
        process.stdout.write(renderBlock(args.command, { examples: examples[args.command] }));

        return 0;
    }

    if (args.files.length === 0) {
        process.stderr.write(
            'Nothing to do. Name one or more markdown files, or use --list or --command.\n'
        );

        return 1;
    }

    let stale = 0;

    for (const file of args.files) {
        const original = readFileSync(file, 'utf8');
        const { content, blocks } = updateGeneratedBlocks(original, { examples });

        if (blocks.length === 0) {
            process.stderr.write(`${file}: no generated:cli-options blocks found\n`);
            continue;
        }

        for (const block of blocks) {
            if (block.changed) {
                stale += 1;
            }

            // Reported per block rather than per file so a page carrying several tables says
            // which command's table is the stale one.
            const state = block.changed ? (args.write ? 'updated' : 'STALE') : 'current';

            process.stderr.write(`${file}: ${block.path}: ${state}\n`);
        }

        if (args.write) {
            if (content !== original) {
                writeFileSync(file, content);
            }
        } else if (!args.check) {
            process.stdout.write(content);
        }
    }

    if (args.check && stale > 0) {
        process.stderr.write(
            `\n${stale} option table(s) out of date. Regenerate with: node scripts/docs-cli-tables.js <file> --write\n`
        );

        return 1;
    }

    return 0;
};

process.exitCode = main();
