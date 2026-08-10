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

    test('passes the hint along with the question', async () => {
        const runtime = scriptedRuntime({ k: 'x' });
        await askQuestions([spec({ hint: 'Use list-installed to see them.' })], ctx(), { runtime });

        expect(runtime.asked[0].message).toContain('A question?');
        expect(runtime.asked[0].message).toContain('list-installed');
    });

    test('skips a question whose `when` says it does not apply', async () => {
        const runtime = scriptedRuntime({ browser: 'firefox', channel: 'stable' });
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
});
