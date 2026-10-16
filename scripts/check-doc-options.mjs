#!/usr/bin/env node
// Platform: Cross-platform (macOS, Linux, Windows)
// Requires: Node.js

/**
 * Refuse a staged doc page that shows an option the CLI does not have.
 *
 * A pending page in `docs/to-doc-site/` documents this repository's CLI, so every option it shows on
 * a `butler-sheet-icons` command line has to be one the CLI declares. A misspelt option, one
 * renamed since the page was written, or a page committed ahead of the code that adds its option
 * is refused at the moment it is committed, rather than found in the publishing pass or on the doc
 * site. What counts as "showing an option", and why it is that narrow, is in
 * `src/lib/docs/documented-options.js`.
 *
 * Only pending pages are checked - the unprefixed files directly in the folder. `done/` holds pages
 * that were published long ago, and an option one of them names may since have been renamed with
 * the page itself left as the record of what shipped.
 *
 * Usage:
 *   node scripts/check-doc-options.mjs <page.md>...
 *
 * Invoked by pre-commit with the staged pending pages. With no arguments it checks every pending
 * page in the folder, which is what the test uses - and which catches a page committed with the
 * hook skipped, once CI runs.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { declaredOptions, optionMentionsIn } from '../src/lib/docs/documented-options.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAGING = path.join(repoRoot, 'docs', 'to-doc-site');

/**
 * Every pending page: the unprefixed markdown files directly in the staging folder, as its README
 * defines them, apart from the README itself.
 *
 * @returns {string[]} Paths, relative to the repository root.
 */
const pendingPages = () =>
    readdirSync(STAGING, { withFileTypes: true })
        .filter(
            (entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md'
        )
        .map((entry) => path.relative(repoRoot, path.join(STAGING, entry.name)));

const supplied = process.argv.slice(2);
const pages = supplied.length > 0 ? supplied : pendingPages();
const declared = declaredOptions();
const findings = [];

for (const page of pages) {
    const source = path.isAbsolute(page) ? page : path.resolve(repoRoot, page);

    for (const { option, line } of optionMentionsIn(readFileSync(source, 'utf8'))) {
        if (!declared.has(option)) {
            findings.push(`  ${page}:${line}  ${option}`);
        }
    }
}

if (findings.length > 0) {
    console.error('\nStaged doc pages show options the CLI does not have:\n');

    for (const finding of findings) {
        console.error(finding);
    }

    console.error(
        [
            '',
            'A page in docs/to-doc-site/ documents this CLI, so every option it shows after',
            'butler-sheet-icons on a command line has to be one the CLI declares. Check the',
            "spelling against 'butler-sheet-icons <command> --help'. If the page describes an",
            'option that is being added, commit it together with the code that adds it.',
            '',
            'Checked: long options after the binary or the image name, in code blocks and inline',
            "code. Other programs' options on the same line, and prose, are not checked.",
            '',
        ].join('\n')
    );

    process.exitCode = 1;
}
