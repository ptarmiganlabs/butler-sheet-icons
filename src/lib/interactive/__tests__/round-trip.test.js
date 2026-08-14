import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { Command } from 'commander';
import { everyLeafCommand } from '../command-tree.js';
import { specsFromCommand } from '../option-introspect.js';
import { answersToOptions, tokensFrom } from '../to-cli-options.js';
import { formatCommandLine } from '../render-command-line.js';

/**
 * The correctness claim of the whole design, in one assertion:
 *
 *   For any answer set, the options bag the wizard produces is identical to the
 *   one Commander produces from the command line the wizard printed.
 *
 * If it holds, a wizard-driven run and a flag-driven run are indistinguishable
 * to every worker in the codebase.
 *
 * Delivered as a deterministic matrix rather than a property test. Randomised
 * generation would mean a new devDependency under .npmrc's min-release-age=7
 * and CI failures that do not reproduce; three answer sets across nine commands
 * gives 27 cases that always run the same way.
 */

const ENV_SNAPSHOT = { ...process.env };

beforeEach(() => {
    // Every option in this codebase declares .env(), and globals.js loads .env
    // at import. A developer's own BSI_* variable would otherwise change what a
    // default is, and the invariant would appear to fail - or worse, appear to
    // hold for the wrong reason.
    for (const key of Object.keys(process.env)) {
        // The optional I is not a typo: `browser uninstall-all` reads
        // BS_BROWSER_UIA_LOG_LEVEL, missing the I, which is issue #893.
        if (/^BS_?I?_/.test(key) || /^BSI_/.test(key) || /^BS_/.test(key)) {
            delete process.env[key];
        }
    }
});

afterEach(() => {
    for (const key of Object.keys(process.env)) {
        if (!(key in ENV_SNAPSHOT)) delete process.env[key];
    }
    Object.assign(process.env, ENV_SNAPSHOT);
});

/**
 * Re-tokenise a printed command line the way a shell would.
 *
 * Deliberately not a full shell parser: it handles the single-quoting
 * `quoteArg` emits, which is the only quoting the wizard can produce.
 *
 * @param {string} line - The printed command line.
 *
 * @returns {string[]} The argv words.
 */
const tokenise = (line) => {
    const words = [];
    let current = '';
    let inQuotes = false;
    let started = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];

        if (inQuotes) {
            if (char === "'") {
                // '\'' is the escaped-single-quote sequence quoteArg produces.
                if (line.slice(i, i + 4) === `'\\''`) {
                    current += "'";
                    i += 3;
                } else {
                    inQuotes = false;
                }
            } else {
                current += char;
            }
        } else if (char === "'") {
            inQuotes = true;
            started = true;
        } else if (char === ' ') {
            if (started || current.length > 0) words.push(current);
            current = '';
            started = false;
        } else {
            current += char;
        }
    }

    if (started || current.length > 0) words.push(current);

    return words;
};

/**
 * Build an answer for one question, for a given strategy.
 *
 * @param {object} spec - The question.
 * @param {string} strategy - `defaults`, `mandatory` or `changed`.
 *
 * @returns {unknown} The answer, or `undefined` to leave it unanswered.
 */
const answerFor = (spec, strategy) => {
    const declared = spec.option?.defaultValue;

    if (strategy === 'defaults') {
        return declared === undefined ? undefined : spec.default;
    }

    if (strategy === 'mandatory' && !spec.required) {
        return declared === undefined ? undefined : spec.default;
    }

    // "changed": pick something deliberately different from the default.
    if (spec.type === 'confirm') {
        return !(declared === true || declared === 'true');
    }

    if (spec.option?.argChoices?.length) {
        const choices = spec.option.argChoices;
        const different = choices.find((c) => String(c) !== String(declared)) ?? choices[0];

        return spec.option.variadic ? [different] : different;
    }

    if (spec.option?.variadic) {
        // Numeric variadic options reject non-digits, so digits are the only
        // value that works for every variadic option in the codebase.
        return ['7', '9'];
    }

    if (spec.option?.parseArg) {
        return '7';
    }

    return `bsi-test-${spec.key}`;
};

const STRATEGIES = ['defaults', 'mandatory', 'changed'];
const CASES = everyLeafCommand().flatMap(({ path, command }) =>
    STRATEGIES.map((strategy) => [`${path} [${strategy}]`, command, strategy])
);

describe('the wizard produces what the command line it prints produces', () => {
    test('there are ten commands to check, across three answer sets', () => {
        // Guards against the walk silently finding nothing, which would make
        // every assertion below pass vacuously.
        expect(everyLeafCommand()).toHaveLength(10);
        expect(CASES).toHaveLength(30);
    });

    test.each(CASES)('%s', (_label, command, strategy) => {
        const specs = specsFromCommand(command);
        const answers = {};

        for (const spec of specs) {
            const answer = answerFor(spec, strategy);
            if (answer !== undefined) answers[spec.key] = answer;
        }

        const line = formatCommandLine('ns leaf', specs, answers, { redactSecrets: false });
        const printedTokens = tokenise(line).slice(3); // drop programme + path

        // 1. What the wizard prints re-tokenises to what the wizard emits.
        //    Without this, a quoting bug would hide behind emissionsFor.
        expect(printedTokens).toEqual(tokensFrom(specs, answers));

        // 2. The bag matches Commander parsing that exact command line.
        const probe = new Command();
        probe.exitOverride();
        specs.forEach((spec) => spec.option && probe.addOption(spec.option));
        probe.parseOptions(printedTokens);

        expect(answersToOptions(specs, answers)).toEqual(probe.opts());
    });
});

describe('parseOptions agrees with a full parse', () => {
    // answersToOptions uses parseOptions() so it can skip the missing-mandatory
    // check without writing to option.mandatory. This proves that shortcut does
    // not change any value: with every mandatory option supplied, a complete
    // parse() produces the same bag.
    test.each(everyLeafCommand().map(({ path, command }) => [path, command]))(
        '%s',
        (_path, command) => {
            const specs = specsFromCommand(command);
            const answers = {};

            for (const spec of specs) {
                const answer = answerFor(spec, 'changed');
                if (answer !== undefined) answers[spec.key] = answer;
            }

            const tokens = tokensFrom(specs, answers);

            const full = new Command();
            full.exitOverride();
            specs.forEach((spec) => spec.option && full.addOption(spec.option));
            full.parse(tokens, { from: 'user' });

            expect(answersToOptions(specs, answers)).toEqual(full.opts());
        }
    );
});

describe('the traps this invariant exists to catch', () => {
    const qseow = everyLeafCommand().find((leaf) => leaf.path === 'qseow create-sheet-thumbnails');

    test('a defaulted numeric option keeps its declared number type', () => {
        // --pagewait declares 5 (number) but stores '7' (string) when supplied.
        // Emitting a defaulted value would silently change its type.
        const specs = specsFromCommand(qseow.command);
        const bag = answersToOptions(specs, { pagewait: 5 });

        expect(bag.pagewait).toBe(5);
        expect(typeof bag.pagewait).toBe('number');
    });

    test('a changed numeric option stores the string the user typed', () => {
        const specs = specsFromCommand(qseow.command);
        const bag = answersToOptions(specs, { pagewait: '7' });

        expect(bag.pagewait).toBe('7');
    });

    test('a defaulted <true|false> option stays boolean, a changed one becomes a string', () => {
        const specs = specsFromCommand(qseow.command);

        expect(answersToOptions(specs, { secure: true }).secure).toBe(true);
        expect(answersToOptions(specs, { secure: false }).secure).toBe('false');
    });

    test('a variadic option is an array, never a bare string (issue #872)', () => {
        // The specific bug: consumers call .includes() on these, and a bare
        // string makes '12' match sheets 1 and 2.
        const specs = specsFromCommand(qseow.command);
        const bag = answersToOptions(specs, { excludeSheetNumber: ['12'] });

        expect(bag.excludeSheetNumber).toEqual(['12']);
        expect(Array.isArray(bag.excludeSheetNumber)).toBe(true);
    });

    test('a variadic option with choices is also an array', () => {
        const specs = specsFromCommand(qseow.command);
        const bag = answersToOptions(specs, { excludeSheetStatus: ['private', 'published'] });

        expect(bag.excludeSheetStatus).toEqual(['private', 'published']);
    });

    test('an optional option left blank is simply absent', () => {
        // qseow's --port takes no default, so the CLI is happy without it, but
        // its parser rejects an empty string. Emitting `--port ''` would build a
        // command line the parser then refuses - a line the wizard printed as
        // the way to reproduce its own run.
        const specs = specsFromCommand(qseow.command);
        const bag = answersToOptions(specs, { port: '' });

        expect(bag.port).toBeUndefined();
        expect(formatCommandLine('qseow x', specs, { port: '' })).not.toContain('--port');
    });

    test('a required option left blank is still emitted, so the failure is visible', () => {
        // The opposite case: silently dropping a required answer would produce a
        // command line that looks complete and is not.
        const specs = specsFromCommand(qseow.command);

        expect(formatCommandLine('qseow x', specs, { host: '' })).toContain('--host');
    });

    test('synthetic answers never reach the options bag or the command line', () => {
        const specs = specsFromCommand(qseow.command);
        const answers = { _howToPick: 'by collection', host: 'sense.example.com' };

        expect(answersToOptions(specs, answers)._howToPick).toBeUndefined();
        expect(formatCommandLine('qseow x', specs, answers)).not.toContain('_howToPick');
    });
});
