import { jest, describe, test, expect, beforeEach } from '@jest/globals';

const setLoggingLevel = jest.fn();
const getLoggingLevel = jest.fn(() => 'info');

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
    },
    setLoggingLevel,
    getLoggingLevel,
    bsiExecutablePath: '/test',
    isSea: false,
}));

const { askQuestions, assertNeedsAreSatisfiable } = await import('../ask-questions.js');
const { withQuietLogging } = await import('../quiet.js');
const { scriptedRuntime } = await import('../test-helpers/scripted-runtime.js');
const { ASCII_SYMBOLS } = await import('../symbols.js');

const spec = (overrides) => ({
    key: 'k',
    type: 'input',
    message: 'A question?',
    required: false,
    variadic: false,
    secret: false,
    ...overrides,
});

const ctx = () => ({ symbols: ASCII_SYMBOLS });

beforeEach(() => {
    jest.clearAllMocks();
    getLoggingLevel.mockReturnValue('info');
});

describe('askQuestions', () => {
    test('asks each question in order and collects the answers', async () => {
        const runtime = scriptedRuntime({ host: 'sense.acme.com', port: '4242' });
        const answers = await askQuestions([spec({ key: 'host' }), spec({ key: 'port' })], ctx(), {
            runtime,
        });

        expect(answers).toEqual({ host: 'sense.acme.com', port: '4242' });
        expect(runtime.asked.map((a) => a.key)).toEqual(['host', 'port']);
    });

    test('shows the hint beside the question, not inside it', async () => {
        // Several option descriptions run to three or four sentences. Folding
        // them into the message produced a prompt several lines long with the
        // actual question lost at the front of it.
        const runtime = scriptedRuntime({ k: 'x' });
        await askQuestions([spec({ hint: 'Use list-installed to see them.' })], ctx(), { runtime });

        expect(runtime.asked[0].message).toBe('A question?');
        expect(runtime.output()).toContain('list-installed');
    });

    test('separates each step with a blank line', async () => {
        // Answered prompts collapse to one line and stay on screen, so without
        // this the transcript becomes a block in which the question being asked
        // now is hard to pick out from the ones already answered.
        const runtime = scriptedRuntime({ a: '1', b: '2' });

        await askQuestions([spec({ key: 'a' }), spec({ key: 'b' })], ctx(), { runtime });

        expect(runtime.written.filter((line) => line === '\n')).toHaveLength(2);
    });

    test('skips a question whose `when` says it does not apply', async () => {
        const runtime = scriptedRuntime({ browser: 'safari', channel: 'stable' });
        const answers = await askQuestions(
            [
                spec({ key: 'browser' }),
                spec({ key: 'channel', when: (c) => c.answers.browser === 'chrome' }),
            ],
            ctx(),
            { runtime }
        );

        expect(runtime.asked.map((a) => a.key)).toEqual(['browser']);
        expect(answers.channel).toBeUndefined();
    });

    test('a later question sees the answers already given', async () => {
        // Answers are written back as the conversation goes, which is what lets
        // a wizard ask about apps only after it has credentials.
        const seen = [];
        const runtime = scriptedRuntime({ a: '1', b: '2' });

        await askQuestions(
            [spec({ key: 'a' }), spec({ key: 'b', when: (c) => seen.push({ ...c.answers }) > 0 })],
            ctx(),
            { runtime }
        );

        expect(seen[0]).toEqual({ a: '1' });
    });

    test('re-asks when an answer fails the option own validation', async () => {
        // The behaviour a user actually experiences: a rejected value becomes
        // an inline correction, not a crash.
        const runtime = scriptedRuntime({ port: ['abc', '4242'] });
        const answers = await askQuestions(
            [
                spec({
                    key: 'port',
                    validate: (v) =>
                        /^\d+$/.test(v) ? true : 'Port must be a non-negative integer.',
                }),
            ],
            ctx(),
            { runtime }
        );

        expect(answers.port).toBe('4242');
        expect(runtime.asked.filter((a) => a.key === 'port')).toHaveLength(2);
    });

    test('splits a list answer into entries', async () => {
        const runtime = scriptedRuntime({ tags: 'alpha, beta gamma' });
        const answers = await askQuestions([spec({ key: 'tags', type: 'list' })], ctx(), {
            runtime,
        });

        expect(answers.tags).toEqual(['alpha', 'beta', 'gamma']);
    });

    test('writes a section rule when the group changes, once per group', async () => {
        const runtime = scriptedRuntime({ a: '1', b: '2', c: '3' });

        await askQuestions(
            [
                spec({ key: 'a', group: 'Connection' }),
                spec({ key: 'b', group: 'Connection' }),
                spec({ key: 'c', group: 'Output' }),
            ],
            ctx(),
            { runtime }
        );

        const rules = runtime.written.filter((line) => line.includes('--'));
        expect(rules).toHaveLength(2);
        expect(runtime.output()).toContain('Connection');
        expect(runtime.output()).toContain('Output');
    });

    test('offers a default to a text prompt', async () => {
        const runtime = scriptedRuntime({ k: 'typed' });

        await askQuestions([spec({ default: 'from-env' })], ctx(), { runtime });

        expect(runtime.asked[0].default).toBe('from-env');
    });

    test('never offers a default to a password prompt', async () => {
        // `@inquirer/password` accepts message, mask, validate and theme, and its
        // implementation never reads `default` - so one set here would be
        // silently dropped and the wizard would be promising a pre-fill that a
        // masked prompt cannot give. The library is right to omit it: an
        // invisible default is one you answer blind.
        //
        // Kept as a rule about the prompt type rather than about any one option,
        // because every secret goes through here - `logonpwd` as much as
        // `apikey` - and a default reaches them whenever their BSI_* variable is
        // set or a supplied value is promoted after a failed check.
        const runtime = scriptedRuntime({ k: 'typed' });

        await askQuestions([spec({ type: 'password', default: 'a-real-secret' })], ctx(), {
            runtime,
        });

        expect(runtime.asked[0].default).toBeUndefined();
    });
});

describe('live choices', () => {
    test('are fetched with the answers given so far', async () => {
        // "The app fetcher was called with the tenant url the user typed",
        // asserted without a terminal.
        const fetched = [];
        const runtime = scriptedRuntime({ tenanturl: 'acme.eu.qlikcloud.com', appid: 'app-1' });

        await askQuestions(
            [
                spec({ key: 'tenanturl' }),
                spec({
                    key: 'appid',
                    type: 'select',
                    needs: ['tenanturl'],
                    choices: async (c) => {
                        fetched.push(c.answers.tenanturl);

                        return ['app-1', 'app-2'];
                    },
                }),
            ],
            ctx(),
            { runtime }
        );

        expect(fetched).toEqual(['acme.eu.qlikcloud.com']);
        expect(runtime.asked[1].choices).toEqual(['app-1', 'app-2']);
    });

    test('are fetched with logging pinned, so nothing corrupts the prompt', async () => {
        // Worker code logs and has no idea a prompt is on screen.
        let levelDuringFetch;
        setLoggingLevel.mockImplementation((level) => {
            levelDuringFetch = level;
        });
        const runtime = scriptedRuntime({ appid: 'app-1' });

        await askQuestions(
            [spec({ key: 'appid', type: 'select', choices: async () => ['app-1'] })],
            ctx(),
            { runtime }
        );

        expect(levelDuringFetch).toBe('info'); // restored by the time we look
        expect(setLoggingLevel).toHaveBeenCalledWith('error');
        expect(setLoggingLevel).toHaveBeenLastCalledWith('info');
    });

    test('fall back to free text when the fetch fails', async () => {
        // A network blip must not strand someone halfway through a wizard.
        const runtime = scriptedRuntime({ appid: 'typed-by-hand' });
        const answers = await askQuestions(
            [
                spec({
                    key: 'appid',
                    type: 'select',
                    choices: async () => {
                        throw new Error('ENOTFOUND');
                    },
                    fallback: { type: 'input', message: 'App ID (could not fetch the list)' },
                }),
            ],
            ctx(),
            { runtime }
        );

        expect(answers.appid).toBe('typed-by-hand');
        expect(runtime.asked[0].type).toBe('input');
        expect(runtime.asked[0].message).toContain('could not fetch');
    });

    test('fall back when the fetch succeeds but finds nothing', async () => {
        const runtime = scriptedRuntime({ appid: 'typed-by-hand' });
        const answers = await askQuestions(
            [
                spec({
                    key: 'appid',
                    type: 'select',
                    choices: async () => [],
                    fallback: { type: 'input', message: 'App ID' },
                }),
            ],
            ctx(),
            { runtime }
        );

        expect(answers.appid).toBe('typed-by-hand');
    });

    test('propagate the failure when there is no fallback', async () => {
        const runtime = scriptedRuntime({ appid: 'x' });

        await expect(
            askQuestions(
                [
                    spec({
                        key: 'appid',
                        type: 'select',
                        choices: async () => {
                            throw new Error('boom');
                        },
                    }),
                ],
                ctx(),
                { runtime }
            )
        ).rejects.toThrow('boom');
    });
});

describe('the needs guard', () => {
    test('accepts a dependency answered earlier', () => {
        expect(() =>
            assertNeedsAreSatisfiable([spec({ key: 'a' }), spec({ key: 'b', needs: ['a'] })])
        ).not.toThrow();
    });

    test('refuses a dependency that comes later, which no answer could fix', () => {
        expect(() =>
            assertNeedsAreSatisfiable([spec({ key: 'b', needs: ['a'] }), spec({ key: 'a' })])
        ).toThrow(/needs "a"/);
    });

    test('accepts a dependency that was supplied rather than asked', () => {
        // `bsi browser install --browser chrome -i` drops the browser question
        // because it is already answered. The dependency is satisfied by the
        // answer, so requiring an earlier *question* would reject exactly the
        // command line that supplied it.
        expect(() =>
            assertNeedsAreSatisfiable([spec({ key: 'b', needs: ['a'] })], ['a'])
        ).not.toThrow();
    });

    test('and a preset answer is what askQuestions counts as known', async () => {
        const runtime = scriptedRuntime({ b: '2' });

        await expect(
            askQuestions(
                [spec({ key: 'b', needs: ['a'] })],
                { ...ctx(), answers: { a: '1' } },
                {
                    runtime,
                }
            )
        ).resolves.toEqual({ a: '1', b: '2' });
    });

    test('runs before any question is asked', async () => {
        const runtime = scriptedRuntime({ a: '1', b: '2' });

        await expect(
            askQuestions([spec({ key: 'b', needs: ['a'] }), spec({ key: 'a' })], ctx(), { runtime })
        ).rejects.toThrow();

        expect(runtime.asked).toHaveLength(0);
    });
});

describe('withQuietLogging', () => {
    test('pins the console level and restores it', async () => {
        getLoggingLevel.mockReturnValue('verbose');

        await withQuietLogging(async () => 'done');

        expect(setLoggingLevel).toHaveBeenNthCalledWith(1, 'error');
        expect(setLoggingLevel).toHaveBeenNthCalledWith(2, 'verbose');
    });

    test('restores the level even when the work throws', async () => {
        // Otherwise one failed fetch mutes the logger for the rest of the run.
        getLoggingLevel.mockReturnValue('debug');

        await expect(
            withQuietLogging(async () => {
                throw new Error('nope');
            })
        ).rejects.toThrow('nope');

        expect(setLoggingLevel).toHaveBeenLastCalledWith('debug');
    });

    test('returns whatever the work returned', async () => {
        await expect(withQuietLogging(async () => ['a', 'b'])).resolves.toEqual(['a', 'b']);
    });
});

describe('scriptedRuntime', () => {
    test('fails loudly on a question nobody queued an answer for', async () => {
        // The alternative is a test that hangs, which is the thing that makes
        // prompt testing miserable.
        const runtime = scriptedRuntime({});

        await expect(askQuestions([spec({ key: 'host' })], ctx(), { runtime })).rejects.toThrow(
            /no answer queued for "host"/
        );
    });

    test('reports when every queued answer was rejected', async () => {
        const runtime = scriptedRuntime({ port: ['abc', 'def'] });

        await expect(
            askQuestions([spec({ key: 'port', validate: () => 'must be a number' })], ctx(), {
                runtime,
            })
        ).rejects.toThrow(/every queued answer for "port" was rejected/);
    });

    test('treats an array as the answer itself for a checkbox', async () => {
        const runtime = scriptedRuntime({ status: ['private', 'published'] });
        const answers = await askQuestions(
            [
                spec({
                    key: 'status',
                    type: 'checkbox',
                    choices: ['private', 'published', 'public'],
                }),
            ],
            ctx(),
            { runtime }
        );

        expect(answers.status).toEqual(['private', 'published']);
    });

    test('validates a checkbox against the values, not the choice objects', async () => {
        // The prompt hands its validator the selected *choices*. A spec's
        // validator comes from the option's own parser and expects values, so
        // passing the objects through made every entry stringify to
        // "[object Object]" - and any option with a closed value set could never
        // be answered. Ticking `private` on --exclude-sheet-status was rejected
        // with `Entry 1 ("[object Object]"): Allowed choices are private,
        // published, public.` with no way past the prompt.
        const seen = [];
        const runtime = scriptedRuntime({ status: ['private'] });

        await askQuestions(
            [
                spec({
                    key: 'status',
                    type: 'checkbox',
                    choices: ['private', 'published', 'public'],
                    validate: (values) => {
                        seen.push(values);

                        return values.every((v) => typeof v === 'string') ? true : 'not values';
                    },
                }),
            ],
            ctx(),
            { runtime }
        );

        expect(seen).toEqual([['private']]);
    });

    test('refuses a checkbox answer the prompt never offered', async () => {
        // Silently dropping it would let a script assert against an answer no
        // user could give - and because an empty list passes most validators,
        // the validator would never see it either.
        const runtime = scriptedRuntime({ status: ['bogus'] });

        await expect(
            askQuestions(
                [
                    spec({
                        key: 'status',
                        type: 'checkbox',
                        choices: ['private', 'published', 'public'],
                    }),
                ],
                ctx(),
                { runtime }
            )
        ).rejects.toThrow(/"status" was answered with \["bogus"\], which the prompt never offered/);
    });

    test('pre-ticks a checkbox default that differs only in case', async () => {
        // App ids are GUIDs, which are not case-sensitive and are routinely
        // pasted out of the QMC in upper case. Comparing them exactly left the
        // row unticked, so submitting the list dropped an id that was supplied.
        const runtime = scriptedRuntime({ appid: ['a1b2'] });

        await askQuestions(
            [
                spec({
                    key: 'appid',
                    type: 'checkbox',
                    default: ['A1B2'],
                    choices: ['a1b2', 'c3d4'],
                }),
            ],
            ctx(),
            { runtime }
        );

        const offered = runtime.asked.find((entry) => entry.key === 'appid').choices;
        expect(offered).toEqual([
            expect.objectContaining({ value: 'a1b2', checked: true }),
            expect.objectContaining({ value: 'c3d4', checked: false }),
        ]);
    });

    test('a <true|false> option supplied as "false" opens on no, not yes', async () => {
        // These are string options carrying boolean defaults, and
        // Boolean('false') is true - so reading the value that way offered to
        // turn --secure or --reject-unauthorized back on.
        const runtime = scriptedRuntime({ secure: false });

        await askQuestions([spec({ key: 'secure', type: 'confirm', default: 'false' })], ctx(), {
            runtime,
        });

        expect(runtime.asked.find((entry) => entry.key === 'secure').default).toBe(false);
    });

    test('a <true|false> option supplied as "true" still opens on yes', async () => {
        const runtime = scriptedRuntime({ secure: true });

        await askQuestions([spec({ key: 'secure', type: 'confirm', default: 'true' })], ctx(), {
            runtime,
        });

        expect(runtime.asked.find((entry) => entry.key === 'secure').default).toBe(true);
    });
});
