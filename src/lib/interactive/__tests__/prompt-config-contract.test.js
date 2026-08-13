import { describe, test, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { CONFIG_BUILDERS, configFor } from '../ask-questions.js';
import { PROMPT_FOR_TYPE, SUPPORTED_TYPES } from '../prompt-runtime.js';

/**
 * The contract between a question spec and the prompt that renders it.
 *
 * Three bugs in one week came out of this seam, and none of them could fail
 * loudly. `@inquirer` prompts take a plain object and ignore any property they
 * do not recognise, so a configuration key that is misspelled, or right for a
 * different prompt, or handed a value of the wrong shape, produces no error at
 * all - just a wizard that quietly does not do what the code says it does:
 *
 *   - `checkbox` passed `spec.validate` straight through, but the prompt calls
 *     its validator with the selected *choice objects*. Every entry stringified
 *     to "[object Object]" and `--exclude-sheet-status` could not be answered.
 *     It reached a user.
 *   - `password` was given a `default`. `@inquirer/password` has no such option,
 *     so the wizard promised a pre-fill that a masked prompt cannot show (#1052).
 *   - `--qrsport` was ignored entirely because a configuration key was
 *     misspelled (#1050).
 *
 * What they have in common is that the tests asserted our own output rather than
 * the library's contract. So this file does three things that the per-feature
 * tests cannot:
 *
 *   1. It requires an explicit decision for **every** (question type, spec
 *      field) pair, driven from `SUPPORTED_TYPES` rather than from the builders,
 *      so a newly renderable type has to be classified before the suite is green
 *      again.
 *   2. It verifies each decision by **watching which fields the builder reads**,
 *      through a recording proxy, rather than by inspecting what it returned. A
 *      field a builder never touches cannot be having an effect, whatever the
 *      returned object looks like.
 *   3. It checks every key that is emitted against the options the prompt
 *      package actually declares, read out of the installed `@inquirer/*` type
 *      declarations. That is the check password's dead `default` and the
 *      `--qrsport` typo would both have failed on the day they were written.
 *
 * Where a field is dropped on purpose, that is an assertion carrying its reason,
 * not an absence.
 */

const require = createRequire(import.meta.url);

/** Passed where the driver passes the real theme; no builder looks at it. */
const THEME = {};

/** Choices in the two shapes a spec may carry: bare values and {name, value}. */
const CHOICES = [
    { name: 'Alpha', value: 'alpha' },
    { name: 'Beta', value: 'beta' },
];

/**
 * The spec fields whose fate this file governs.
 *
 * `type` is deliberately not among them: it is the discriminator the builders
 * branch on, not a value forwarded anywhere, and every builder is entitled to
 * read it.
 */
const GOVERNED_FIELDS = ['default', 'validate', 'required'];

/** Read by every builder without needing a decision, being what selects one. */
const DISCRIMINATOR_FIELDS = new Set(['type', 'key', 'message']);

// ---------------------------------------------------------------------------
// The decision table
// ---------------------------------------------------------------------------

/**
 * What each question type does with each governed spec field.
 *
 * The three verdicts are defined by two observations - does the builder read the
 * field, and does a key of that name come out - so each is checked the same
 * mechanical way rather than by a bespoke assertion per cell:
 *
 *   - `emits`   - read, and returned under a key of the same name.
 *   - `honours` - read, and acted on under some *other* key. The value reaches
 *                 the prompt in the shape that prompt wants.
 *   - `ignores` - never read, so it cannot possibly have an effect. Every one of
 *                 these carries the reason, and in most cases the reason is that
 *                 the prompt package declares no such option.
 */
const DECISIONS = {
    input: {
        default: { verdict: 'emits', why: 'the prompt pre-fills it and the user edits over it' },
        validate: { verdict: 'emits', why: 'the option parser judges the text as typed' },
        required: {
            verdict: 'honours',
            why: 'folded into validate: an optional question has to be leaveable, a required one not',
        },
    },

    list: {
        default: {
            verdict: 'emits',
            why: 'joined back into the comma-separated text a user types',
        },
        validate: { verdict: 'emits', why: 'wrapped to split the text into entries first' },
        required: { verdict: 'honours', why: 'folded into validate, as for input' },
    },

    number: {
        default: { verdict: 'emits', why: 'as for input' },
        validate: { verdict: 'emits', why: 'as for input' },
        required: { verdict: 'honours', why: 'folded into validate, as for input' },
    },

    password: {
        default: {
            verdict: 'ignores',
            // #1052. The library is right and this is not worth working around:
            // a masked default is invisible, so pressing Enter over one is
            // answering blind.
            why: '@inquirer/password declares no default option, and a masked pre-fill cannot be seen anyway',
        },
        validate: {
            verdict: 'emits',
            why: 'the one thing a masked prompt can still do with a spec is judge what was typed',
        },
        required: { verdict: 'honours', why: 'folded into validate, as for input' },
    },

    confirm: {
        default: {
            verdict: 'emits',
            why: 'coerced to a real boolean, since a <true|false> option supplies the word',
        },
        validate: {
            verdict: 'ignores',
            why: '@inquirer/confirm declares no validate option, and y/n has nothing to reject',
        },
        required: {
            verdict: 'ignores',
            why: 'a confirm always produces an answer, so there is nothing to require',
        },
    },

    select: {
        default: { verdict: 'emits', why: 'starts the cursor on the value already in force' },
        validate: {
            verdict: 'ignores',
            // The question the task set, answered against the library rather
            // than by analogy: forwarding it would be a line that reads as a
            // safety check and is in fact dead, which is exactly what #1050 and
            // #1052 were. Specs reaching this prompt really do carry validators
            // - loglevel, browser, includesheetpart and senseVersion all do -
            // so the drop is deliberate, not an oversight.
            why: '@inquirer/select declares no validate option; a select can only return a value it offered',
        },
        required: {
            verdict: 'ignores',
            why: 'a select always returns one of its choices; no select question is required today',
        },
    },

    checkbox: {
        default: {
            verdict: 'honours',
            why: 'ticks the matching rows instead: @inquirer/checkbox declares no default, it takes checked per choice',
        },
        validate: {
            verdict: 'emits',
            why: 'wrapped to unwrap the selected choice objects into their values, which is the bug that reached a user',
        },
        required: {
            verdict: 'ignores',
            // Left as a decision rather than a gap: @inquirer/checkbox does
            // declare `required`, so if a mandatory choice list ever appears
            // this is the row to change and that option is what to set.
            why: 'no checkbox question is required today; the prompt declares its own required option if one ever is',
        },
    },

    search: {
        default: {
            verdict: 'emits',
            why: 'so the picker and the free-text fallback of one question honour the spec alike',
        },
        validate: { verdict: 'emits', why: 'called with the selected value, unlike checkbox' },
        required: {
            verdict: 'ignores',
            why: 'a search always returns one of the entries its source produced',
        },
    },
};

// ---------------------------------------------------------------------------
// Reading the library's own declarations
// ---------------------------------------------------------------------------

/**
 * The option names a prompt package declares, read from its shipped types.
 *
 * This is the part that makes the file a check on the library's contract rather
 * than on our own output. Both shapes `@inquirer` ships are handled: a named
 * `type XConfig = {...}` and an inline `(config: {...})`.
 *
 * @param {string} pkg - Package name under `@inquirer`, e.g. `select`.
 *
 * @returns {string[]} The top-level option names the package accepts.
 *
 * @throws {Error} If the declarations cannot be found or parsed, which means the
 *   library's shape changed and these builders need re-checking against it.
 */
const declaredOptions = (pkg) => {
    const dts = path.join(
        path.dirname(require.resolve(`@inquirer/${pkg}/package.json`)),
        'dist/index.d.ts'
    );
    const text = fs.readFileSync(dts, 'utf-8');
    const start = text.search(/(?:type \w*Config\s*=\s*\{|\(config:\s*\{)/);

    if (start === -1) {
        throw new Error(
            `Could not find the config object in ${dts}. @inquirer/${pkg} has changed the shape of its declarations, so the configuration CONFIG_BUILDERS produces for it needs checking by hand.`
        );
    }

    const open = text.indexOf('{', start);
    let depth = 0;
    let end = -1;

    for (let i = open; i < text.length; i += 1) {
        if (text[i] === '{') depth += 1;
        else if (text[i] === '}') {
            depth -= 1;
            if (depth === 0) {
                end = i;
                break;
            }
        }
    }

    // One indent level in, so nested shapes such as a theme's own members are
    // not mistaken for options.
    const names = [...text.slice(open + 1, end).matchAll(/^\s{4}(\w+)\??:/gm)].map((m) => m[1]);

    if (names.length === 0) {
        throw new Error(`Parsed no options out of ${dts}; the declaration shape has changed.`);
    }

    return names;
};

// ---------------------------------------------------------------------------
// Building a configuration while watching what gets read
// ---------------------------------------------------------------------------

/**
 * A spec carrying every governed field, wrapped so its reads are recorded.
 *
 * @param {string} type - The question type.
 *
 * @returns {{spec: object, reads: Set<string>}} The proxied spec and the record.
 */
const watchedSpec = (type) => {
    const reads = new Set();
    const target = {
        key: 'probe',
        type,
        message: 'Probe?',
        default: 'alpha',
        required: true,
        /**
         * Stands in for a spec validator built from the option's own parser.
         *
         * @returns {boolean} Always true; this file cares who calls it, not what it says.
         */
        validate: () => true,
    };

    return {
        reads,
        spec: new Proxy(target, {
            /**
             * Records the read and answers it.
             *
             * @param {object} obj - The underlying spec.
             * @param {string} prop - The property being read.
             *
             * @returns {unknown} The property's value.
             */
            get(obj, prop) {
                if (typeof prop === 'string') reads.add(prop);

                return obj[prop];
            },
        }),
    };
};

/**
 * Sample answers for exercising a built validator, per type.
 *
 * Needed because some fields are read lazily, inside the validator rather than
 * while the configuration is being built - `required` is read that way for every
 * text prompt. A read that only happens when the user answers is still a read,
 * and missing it would misreport the field as ignored.
 *
 * The shapes differ because the prompts differ, which is the whole subject of
 * this file: checkbox validates the selected choice objects, everything else
 * validates a value.
 */
const SAMPLE_ANSWER = {
    input: 'alpha',
    list: 'alpha, beta',
    number: 1,
    password: 'alpha',
    search: 'alpha',
    checkbox: [{ name: 'Alpha', value: 'alpha' }],
};

/**
 * Builds the configuration for a type and records every spec field it consults.
 *
 * @param {string} type - The question type.
 *
 * @returns {Promise<{config: object, reads: Set<string>}>} The configuration and the fields read.
 */
const buildWatched = async (type) => {
    const { spec, reads } = watchedSpec(type);
    const config = configFor(spec, CHOICES, THEME);

    // Exercise what was built, so lazily-read fields are recorded too.
    if (typeof config.validate === 'function') await config.validate(SAMPLE_ANSWER[type]);
    if (typeof config.source === 'function') await config.source(undefined);

    return { config, reads };
};

// ---------------------------------------------------------------------------

describe('the decision table covers every prompt this runtime can render', () => {
    test('every supported question type has a row', () => {
        // Driven from the runtime's own list rather than from CONFIG_BUILDERS,
        // because four types (input, list, number, password) have no builder and
        // fall through to the text configuration. Keying off the builders would
        // leave exactly those four unexamined - and password is one of them.
        expect(Object.keys(DECISIONS).sort()).toEqual([...SUPPORTED_TYPES].sort());
    });

    test('every row governs every field', () => {
        for (const [type, row] of Object.entries(DECISIONS)) {
            expect({ type, fields: Object.keys(row).sort() }).toEqual({
                type,
                fields: [...GOVERNED_FIELDS].sort(),
            });
        }
    });

    test('every decision states a verdict and a reason', () => {
        // The reason is the deliverable as much as the verdict is. It rides in
        // the test name below, so a cell without one turns a run of this file
        // into a list of bare assertions and the next person has to re-derive
        // from the library what someone here already looked up.
        const incomplete = Object.entries(DECISIONS).flatMap(([type, row]) =>
            Object.entries(row)
                .filter(
                    ([, cell]) =>
                        !['emits', 'honours', 'ignores'].includes(cell.verdict) || !cell.why?.trim()
                )
                .map(([field]) => `${type}.${field}`)
        );

        expect(incomplete).toEqual([]);
    });

    test('every type this runtime renders resolves to a prompt package', () => {
        // The link between a type and the declarations checked against it. A
        // type added to the runtime with no prompt behind it would fail here
        // rather than at the first person to reach that question.
        for (const type of SUPPORTED_TYPES) {
            expect(declaredOptions(PROMPT_FOR_TYPE[type]).length).toBeGreaterThan(0);
        }
    });

    test('the builders and the fallback account for every supported type', () => {
        const built = Object.keys(CONFIG_BUILDERS);

        expect(built.every((type) => SUPPORTED_TYPES.includes(type))).toBe(true);
    });
});

describe('each field has one decision, and the builder is held to it', () => {
    const cells = Object.entries(DECISIONS).flatMap(([type, row]) =>
        GOVERNED_FIELDS.map((field) => ({ type, field, ...row[field] }))
    );

    // The reason rides in the test name, so a run of this file reads as the
    // statement of intent rather than sending anyone to the source to find out
    // why a field is dropped.
    test.each(cells)('$type $verdict $field — $why', async ({ type, field, verdict }) => {
        const { config, reads } = await buildWatched(type);

        if (verdict === 'ignores') {
            // The strongest form the claim can take: not "no such key came out",
            // which a builder could satisfy while still acting on the value, but
            // "the builder never looked". Nothing read cannot have an effect.
            expect({ field, read: reads.has(field) }).toEqual({ field, read: false });

            return;
        }

        expect({ field, read: reads.has(field) }).toEqual({ field, read: true });
        expect({ field, emitted: field in config }).toEqual({
            field,
            emitted: verdict === 'emits',
        });
    });

    test('no builder reads a spec field that has no decision', () => {
        // The half that keeps the table honest as the code moves. Adding a read
        // of some new spec field to a builder fails here until that field is
        // governed for every type - which is what stops the next divergence from
        // being invisible.
        const allowed = new Set([...GOVERNED_FIELDS, ...DISCRIMINATOR_FIELDS]);

        return Promise.all(
            SUPPORTED_TYPES.map(async (type) => {
                const { reads } = await buildWatched(type);
                const ungoverned = [...reads].filter((field) => !allowed.has(field));

                expect({ type, ungoverned }).toEqual({ type, ungoverned: [] });
            })
        );
    });
});

describe('every key handed to a prompt is one that prompt declares', () => {
    // The check that needed no one to notice first. A key the library does not
    // read is silently discarded at run time, so nothing but this can tell the
    // difference between a configured prompt and a decorated object.
    test.each([...SUPPORTED_TYPES])('%s emits nothing @inquirer will discard', async (type) => {
        const declared = new Set(declaredOptions(PROMPT_FOR_TYPE[type]));

        // Both shapes a question takes: carrying values, and carrying none.
        const { config } = await buildWatched(type);
        const bare = configFor({ key: 'probe', type, message: 'Probe?' }, CHOICES, THEME);
        const emitted = new Set([...Object.keys(config), ...Object.keys(bare)]);

        const unknown = [...emitted].filter((key) => !declared.has(key));

        expect({ type, unknown }).toEqual({ type, unknown: [] });
    });

    test('a key no prompt declares is caught, not shrugged at', () => {
        // Proves the check above can fail. Without this, a parser that quietly
        // returned every key in the file would look exactly as green.
        const declared = new Set(declaredOptions(PROMPT_FOR_TYPE.password));

        expect(declared.has('validate')).toBe(true);
        expect(declared.has('default')).toBe(false);
    });
});

describe('the shapes each prompt is given, which is where the wrong ones hid', () => {
    test('checkbox validates the selected choices and hands the spec plain values', async () => {
        // The bug that reached a user. The prompt calls its validator with whole
        // choice objects; a spec validator is built from the option's parser and
        // expects the values behind them.
        const seen = [];
        const config = configFor(
            {
                key: 'probe',
                type: 'checkbox',
                message: 'Probe?',
                /**
                 * Records what the spec's own validator was handed.
                 *
                 * @param {unknown} value - Whatever reached it.
                 *
                 * @returns {boolean} Always true.
                 */
                validate: (value) => {
                    seen.push(value);

                    return true;
                },
            },
            CHOICES,
            THEME
        );

        await config.validate([{ name: 'Alpha', value: 'alpha' }]);

        expect(seen).toEqual([['alpha']]);
    });

    test('search validates the selected value, not a choice object', async () => {
        // The opposite convention to checkbox, one prompt away. Forwarding by
        // analogy rather than by signature is how the checkbox bug happened.
        const seen = [];
        const config = configFor(
            {
                key: 'probe',
                type: 'search',
                message: 'Probe?',
                /**
                 * Records what the spec's own validator was handed.
                 *
                 * @param {unknown} value - Whatever reached it.
                 *
                 * @returns {boolean} Always true.
                 */
                validate: (value) => {
                    seen.push(value);

                    return true;
                },
            },
            CHOICES,
            THEME
        );

        await config.validate('alpha');

        expect(seen).toEqual(['alpha']);
    });

    test('checkbox ticks the rows a default names rather than setting one', () => {
        const config = configFor(
            { key: 'probe', type: 'checkbox', message: 'Probe?', default: 'beta' },
            CHOICES,
            THEME
        );

        expect('default' in config).toBe(false);
        expect(config.choices.map((choice) => [choice.value, choice.checked])).toEqual([
            ['alpha', false],
            ['beta', true],
        ]);
    });

    test('search carries the default through to the picker', () => {
        // Not because anything looks different today - `recommended` is already
        // the first entry `browser install` offers, and the prompt starts on the
        // first entry regardless. The point is that the same spec, rendered as
        // the `input` fallback when the version list cannot be fetched, has
        // always pre-filled its default; one question should not honour its spec
        // only when the network happens to be down.
        const config = configFor(
            {
                key: 'browserVersion',
                type: 'search',
                message: 'Which build?',
                default: 'recommended',
            },
            CHOICES,
            THEME
        );

        expect(config.default).toBe('recommended');
    });

    test('a blank default is not a default, for every type that takes one', () => {
        // Both `--qliksensetag` and `--collectionid` declare '' as their default.
        for (const type of ['input', 'select', 'search']) {
            const config = configFor(
                { key: 'probe', type, message: 'Probe?', default: '' },
                CHOICES,
                THEME
            );

            expect({ type, hasDefault: 'default' in config }).toEqual({ type, hasDefault: false });
        }
    });
});
