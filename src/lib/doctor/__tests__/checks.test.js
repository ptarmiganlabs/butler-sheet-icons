import { jest, test, expect, describe } from '@jest/globals';

import { CHECKS } from '../checks/index.js';
import { runChecks, RUNNER_ERROR_ID, SKIP_NETWORK, SKIP_NOT_APPLICABLE } from '../run-checks.js';
import { SEVERITY } from '../findings.js';

/**
 * The check contract (§15.3 of `docs/todo/airgap-browser-phase-1.md`).
 *
 * Two things are tested here, and they answer different questions.
 *
 * The **runner** guarantees are cheap now and expensive to retrofit: one broken check must never
 * take down the report, a `needsNetwork` check must never run on an air-gapped host unless it was
 * asked for, and a finding id must be unique across the whole registry - checked at the moment an
 * id is introduced rather than after it has shipped in somebody's log.
 *
 * The **per-check** tests are what make the contract worth having: every check is a pure function
 * of a fabricated `ctx`, so its findings can be asserted without a filesystem, a browser or a
 * network. A check that cannot be tested this way has reached out to the world, which is the one
 * thing the contract forbids.
 */

/**
 * A cached build that this machine can run, shaped exactly as the gatherer produces one.
 *
 * `usable` and `reason` are computed by the worker rather than by a check, so a fabricated build
 * has to carry them - a fixture that omitted them would let a check pass here while reading
 * `undefined` in production.
 */
const HEALTHY_BUILD = Object.freeze({
    browser: 'chrome',
    buildId: '138.0.7204.94',
    platform: 'win64',
    executablePath: 'C:\\bsi\\browser-cache\\chrome\\win64-138.0.7204.94\\chrome.exe',
    executableExists: true,
    canRunHere: true,
    usable: true,
    reason: undefined,
});

/** A cache holding nothing. */
const EMPTY_CACHE = Object.freeze({
    dir: 'C:\\bsi\\browser-cache',
    source: 'standalone',
    sourceLabel: 'default location next to the Butler Sheet Icons executable',
    exists: false,
    inUse: true,
    notConsultedReason: undefined,
    builds: [],
});

/**
 * A fabricated check context, healthy unless overridden.
 *
 * Nested objects are replaced wholesale rather than merged: a test that says the cache is empty
 * should not silently inherit a build list from the healthy default.
 *
 * @param {object} [overrides] - Top-level keys to replace.
 *
 * @returns {object} A context object shaped as the gatherer produces one.
 */
const ctxWith = (overrides = {}) => ({
    options: { browser: 'chrome', browserVersion: 'recommended', headless: true },
    env: {},
    host: {
        hostPlatform: 'win64',
        nodePlatform: 'win32',
        arch: 'x64',
        user: 'svc_qlik',
        homeDir: 'C:\\Windows\\system32\\config\\systemprofile',
        cwd: 'C:\\Windows\\system32',
        isSea: true,
    },
    cache: {
        dir: 'C:\\bsi\\browser-cache',
        source: 'standalone',
        sourceLabel: 'default location next to the Butler Sheet Icons executable',
        exists: true,
        inUse: true,
        notConsultedReason: undefined,
        builds: [HEALTHY_BUILD],
    },
    executableOverride: null,
    detection: {
        selection: {
            source: 'cache',
            executablePath: HEALTHY_BUILD.executablePath,
            browser: 'chrome',
            buildId: HEALTHY_BUILD.buildId,
        },
        error: null,
        wouldDownload: false,
        requested: 'chrome recommended',
        requestedVersion: 'recommended',
        versionForm: 'recommended',
        resolvedBuildId: HEALTHY_BUILD.buildId,
    },
    launch: {
        attempted: true,
        // `started` is separate from `ok` on purpose: a browser that starts and then dies on the
        // first command is a different diagnosis with different advice (issue #878).
        started: true,
        ok: true,
        version: 'Chrome/138.0.7204.94',
        error: null,
        skipped: false,
        elapsedMs: 850,
    },
    logger: { debug: jest.fn() },
    ...overrides,
});

/**
 * The registered check with a given id.
 *
 * @param {string} id - Check id.
 *
 * @returns {object} The check module's exported check object.
 */
const checkById = (id) => {
    const check = CHECKS.find((entry) => entry.id === id);

    if (!check) {
        throw new Error(
            `No check registered with id "${id}". Registered: ${CHECKS.map((c) => c.id).join(', ')}.`
        );
    }

    return check;
};

/**
 * Runs one check against a context and returns its findings.
 *
 * @param {string} id - Check id.
 * @param {object} ctx - The context to run against.
 *
 * @returns {Promise<object[]>} The findings it produced.
 */
const findingsOf = async (id, ctx) => checkById(id).run(ctx);

/**
 * The scenarios every check is held to.
 *
 * Data rather than a `describe` per check, because the last test in this file compares the ids
 * actually emitted here against the ids each check declares. A branch left untested therefore
 * fails rather than going unnoticed, which is what stops `findingIds` from rotting into a list
 * nobody maintains.
 */
const SCENARIOS = [
    {
        check: 'environment',
        name: 'reports the machine facts',
        ctx: ctxWith(),
        ids: ['BSI-ENV-001'],
        severities: [SEVERITY.INFO],
    },
    {
        check: 'browser-executable-override',
        name: 'nothing configured, so the cache decides',
        ctx: ctxWith(),
        ids: ['BSI-BROWSER-004'],
        severities: [SEVERITY.OK],
    },
    {
        check: 'browser-executable-override',
        name: 'an explicit path that exists',
        ctx: ctxWith({
            executableOverride: {
                path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                configuredValue: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                source: 'option',
                sourceLabel: 'from --browser-executable-path / BSI_BROWSER_EXECUTABLE_PATH',
                explicit: true,
                exists: true,
            },
        }),
        ids: ['BSI-BROWSER-001'],
        severities: [SEVERITY.OK],
    },
    {
        check: 'browser-executable-override',
        name: 'an explicit path that does not exist is an error, not a crash',
        ctx: ctxWith({
            executableOverride: {
                path: 'D:\\nope\\chrome.exe',
                configuredValue: 'D:\\nope\\chrome.exe',
                source: 'option',
                sourceLabel: 'from --browser-executable-path / BSI_BROWSER_EXECUTABLE_PATH',
                explicit: true,
                exists: false,
            },
        }),
        ids: ['BSI-BROWSER-002'],
        severities: [SEVERITY.ERROR],
    },
    {
        check: 'browser-executable-override',
        name: 'a stale PUPPETEER_EXECUTABLE_PATH only warns, because it falls through',
        ctx: ctxWith({
            executableOverride: {
                path: '/usr/bin/chromium-browser',
                configuredValue: '/usr/bin/chromium-browser',
                source: 'puppeteer-env',
                sourceLabel: 'from PUPPETEER_EXECUTABLE_PATH',
                explicit: false,
                exists: false,
            },
        }),
        ids: ['BSI-BROWSER-003'],
        severities: [SEVERITY.WARNING],
    },
    {
        check: 'browser-cache-platform',
        name: 'a cached build this machine can run',
        ctx: ctxWith(),
        ids: ['BSI-BROWSER-005'],
        severities: [SEVERITY.OK],
    },
    {
        check: 'browser-cache-platform',
        name: 'every cached build was made for another operating system',
        // No selection: these scenarios describe a cache that WAS the deciding factor, which is
        // what makes its faults failures. With a browser selected they are warnings - see the
        // "a cache problem that did not stop the run" tests.
        nothingSelected: true,
        ctx: ctxWith({
            cache: {
                dir: 'C:\\bsi\\browser-cache',
                source: 'option',
                sourceLabel: 'from --browser-cache-dir / BSI_BROWSER_CACHE_DIR',
                exists: true,
                inUse: true,
                notConsultedReason: undefined,
                builds: [
                    {
                        ...HEALTHY_BUILD,
                        platform: 'mac_arm',
                        canRunHere: false,
                        usable: false,
                        reason: 'built for another platform',
                    },
                ],
            },
        }),
        ids: ['BSI-BROWSER-006'],
        severities: [SEVERITY.ERROR],
    },
    {
        check: 'browser-cache-platform',
        name: 'an empty cache is not an error on its own',
        ctx: ctxWith({ cache: EMPTY_CACHE }),
        ids: ['BSI-BROWSER-007'],
        severities: [SEVERITY.INFO],
    },
    {
        check: 'browser-cache-platform',
        // ~/.cache/puppeteer is shared with any other Puppeteer install on the host, which stages
        // chrome-headless-shell beside chrome. Those builds are real, runnable and irrelevant:
        // detection filters on the browser type before anything else.
        name: 'a cache holding only another browser is reported as such',
        ctx: ctxWith({
            cache: {
                ...EMPTY_CACHE,
                exists: true,
                builds: [
                    {
                        ...HEALTHY_BUILD,
                        browser: 'chrome-headless-shell',
                        usable: false,
                        reason: 'a chrome-headless-shell build, not the chrome build this run needs',
                    },
                ],
            },
        }),
        ids: ['BSI-BROWSER-007'],
        severities: [SEVERITY.INFO],
    },
    {
        check: 'browser-cache-platform',
        // The LocalSystem symptom: a cache staged from an administrator's profile that the
        // service account cannot open. This used to reject out of the gatherer and take the whole
        // report with it - no environment block, no cache directory, no disclaimer.
        name: 'an unreadable cache is an error the report survives',
        // No selection: these scenarios describe a cache that WAS the deciding factor, which is
        // what makes its faults failures. With a browser selected they are warnings - see the
        // "a cache problem that did not stop the run" tests.
        nothingSelected: true,
        ctx: ctxWith({
            cache: {
                ...EMPTY_CACHE,
                exists: true,
                readError: "EACCES: permission denied, scandir 'D:\\bsi\\cache\\chrome'",
            },
        }),
        ids: ['BSI-BROWSER-019'],
        severities: [SEVERITY.ERROR],
    },
    {
        check: 'browser-cache-executable',
        name: 'every cached build has its binary',
        ctx: ctxWith(),
        ids: ['BSI-BROWSER-008'],
        severities: [SEVERITY.OK],
    },
    {
        check: 'browser-cache-executable',
        name: 'a cache copied without its binaries',
        // No selection: these scenarios describe a cache that WAS the deciding factor, which is
        // what makes its faults failures. With a browser selected they are warnings - see the
        // "a cache problem that did not stop the run" tests.
        nothingSelected: true,
        ctx: ctxWith({
            cache: {
                dir: 'D:\\bsi\\cache',
                source: 'option',
                sourceLabel: 'from --browser-cache-dir / BSI_BROWSER_CACHE_DIR',
                exists: true,
                inUse: true,
                notConsultedReason: undefined,
                builds: [
                    {
                        ...HEALTHY_BUILD,
                        executableExists: false,
                        usable: false,
                        reason: 'executable not found on disk',
                    },
                ],
            },
        }),
        ids: ['BSI-BROWSER-009'],
        severities: [SEVERITY.ERROR],
    },
    {
        check: 'browser-selection',
        name: 'a browser was selected',
        ctx: ctxWith(),
        ids: ['BSI-BROWSER-010'],
        severities: [SEVERITY.OK],
    },
    {
        check: 'browser-selection',
        name: 'nothing local at all, so a real run would download',
        ctx: ctxWith({
            cache: EMPTY_CACHE,
            detection: {
                selection: null,
                error: null,
                wouldDownload: true,
                requested: 'chrome recommended',
                resolvedBuildId: '138.0.7204.94',
                pinCheckedOffline: true,
            },
        }),
        ids: ['BSI-BROWSER-011'],
        severities: [SEVERITY.ERROR],
    },
    {
        check: 'browser-selection',
        // Always an error here, whatever the cache holds. Demotion is the runner's job, driven by
        // a cause that is actually present - see the supersession tests. Deciding it here, from
        // the shape of the cache, is what let `browser check` exit 0 on a machine that could not
        // take a screenshot.
        name: 'nothing usable is an error even when a cache check will explain it',
        ctx: ctxWith({
            cache: {
                dir: 'D:\\bsi\\cache',
                source: 'option',
                sourceLabel: 'from --browser-cache-dir / BSI_BROWSER_CACHE_DIR',
                exists: true,
                inUse: true,
                notConsultedReason: undefined,
                builds: [
                    {
                        ...HEALTHY_BUILD,
                        platform: 'win64',
                        canRunHere: false,
                        usable: false,
                        reason: 'built for another platform',
                    },
                ],
            },
            detection: {
                selection: null,
                error: null,
                wouldDownload: true,
                requested: 'chrome recommended',
                requestedVersion: 'recommended',
                versionForm: 'recommended',
                resolvedBuildId: '138.0.7204.94',
            },
        }),
        ids: ['BSI-BROWSER-011'],
        severities: [SEVERITY.ERROR],
    },
    {
        check: 'browser-selection',
        // It names the cache findings that would explain it, so the runner can demote it rather
        // than the check guessing.
        name: 'nothing usable names the causes that would explain it',
        ctx: ctxWith({
            cache: { ...EMPTY_CACHE },
            detection: {
                selection: null,
                error: null,
                wouldDownload: true,
                requested: 'chrome recommended',
                requestedVersion: 'recommended',
                versionForm: 'recommended',
                resolvedBuildId: '138.0.7204.94',
            },
        }),
        ids: ['BSI-BROWSER-011'],
        severities: [SEVERITY.ERROR],
        supersededBy: ['BSI-BROWSER-006', 'BSI-BROWSER-009', 'BSI-BROWSER-019'],
    },
    {
        check: 'browser-selection',
        // Reproduced on a real machine while building this command: the cache held
        // chrome 151.0.7922.138 and the recommended pin was 151.0.7922.71. The advice that
        // matters is "use the build you already have", not "go and download one".
        name: 'the requested build is missing, but a usable one is present',
        ctx: ctxWith({
            detection: {
                selection: null,
                error: null,
                wouldDownload: true,
                requested: 'chrome recommended (build 151.0.7922.71)',
                requestedVersion: 'recommended',
                versionForm: 'recommended',
                resolvedBuildId: '151.0.7922.71',
            },
        }),
        ids: ['BSI-BROWSER-017'],
        severities: [SEVERITY.ERROR],
    },
    {
        check: 'browser-selection',
        name: 'detection stopped with an error',
        ctx: ctxWith({
            detection: {
                selection: null,
                error: { message: 'the browser cache directory could not be read' },
                wouldDownload: false,
                requested: 'chrome recommended',
                requestedVersion: 'recommended',
                versionForm: 'recommended',
                resolvedBuildId: '138.0.7204.94',
            },
        }),
        ids: ['BSI-BROWSER-012'],
        severities: [SEVERITY.ERROR],
        supersededBy: ['BSI-BROWSER-002'],
    },
    {
        check: 'browser-selection',
        name: 'a floating keyword cannot be checked without internet access',
        ctx: ctxWith({
            detection: {
                selection: {
                    source: 'cache',
                    executablePath: HEALTHY_BUILD.executablePath,
                    browser: 'chrome',
                    buildId: HEALTHY_BUILD.buildId,
                },
                error: null,
                wouldDownload: false,
                requested: 'chrome stable',
                requestedVersion: 'stable',
                versionForm: 'floating',
                resolvedBuildId: undefined,
            },
        }),
        ids: ['BSI-BROWSER-010', 'BSI-BROWSER-013'],
        severities: [SEVERITY.OK, SEVERITY.WARNING],
    },
    {
        check: 'browser-selection',
        // A milestone is an explicit pin that happens to need a lookup. Calling it a value that
        // "names whichever build is newest" told an administrator their deliberate pin floated,
        // and then advised them to name an exact build id - which is what they thought they had.
        // A milestone or build prefix is NOT the same as a floating keyword, and sharing
        // BSI-BROWSER-013's warning severity with one hid a false OK. `resolveRequestedBuildId`
        // only degrades to a cached build when `isVersionKeyword` is true, and `isVersionKeyword`
        // ('151') is false - so on an air-gapped host a real run throws before it ever reaches
        // the cache, while the check said OK. Its own finding, and an error.
        name: 'a milestone pin is an error, because a real run cannot resolve it offline',
        ctx: ctxWith({
            detection: {
                selection: {
                    source: 'cache',
                    executablePath: HEALTHY_BUILD.executablePath,
                    browser: 'chrome',
                    buildId: HEALTHY_BUILD.buildId,
                },
                error: null,
                wouldDownload: false,
                requested: 'chrome 151',
                requestedVersion: '151',
                versionForm: 'partial',
                resolvedBuildId: undefined,
            },
        }),
        ids: ['BSI-BROWSER-010', 'BSI-BROWSER-022'],
        severities: [SEVERITY.OK, SEVERITY.ERROR],
    },
    {
        check: 'browser-selection',
        // The browser is the unsupported thing, not the version. Overwriting the version form
        // with INVALID here made the report say `--browser-version "recommended" is neither a
        // keyword nor a build id`, sending the administrator to change the setting that was fine.
        name: 'an unsupported browser is named as the problem',
        ctx: ctxWith({
            options: { browser: 'firefox', browserVersion: 'recommended', headless: true },
            detection: {
                selection: null,
                error: null,
                wouldDownload: true,
                requested: 'firefox recommended',
                requestedVersion: 'recommended',
                versionForm: 'recommended',
                browserError:
                    'Unsupported browser "firefox". Butler Sheet Icons can install chrome.',
                resolvedBuildId: undefined,
            },
        }),
        ids: ['BSI-BROWSER-023'],
        severities: [SEVERITY.ERROR],
    },
    {
        check: 'browser-selection',
        // The false-OK route: an unrecognised value used to be accepted as a floating keyword, so
        // the check exited 0 while resolveBrowserVersion threw and the real run died.
        name: 'a version a real run would reject is an error',
        ctx: ctxWith({
            detection: {
                selection: {
                    source: 'cache',
                    executablePath: HEALTHY_BUILD.executablePath,
                    browser: 'chrome',
                    buildId: HEALTHY_BUILD.buildId,
                },
                error: null,
                wouldDownload: false,
                requested: 'chrome garbage',
                requestedVersion: 'garbage',
                versionForm: 'invalid',
                resolvedBuildId: undefined,
            },
        }),
        ids: ['BSI-BROWSER-010', 'BSI-BROWSER-018'],
        severities: [SEVERITY.OK, SEVERITY.ERROR],
    },
    {
        check: 'browser-launch',
        name: 'the browser started and answered',
        ctx: ctxWith(),
        ids: ['BSI-BROWSER-014'],
        severities: [SEVERITY.OK],
    },
    {
        check: 'browser-launch',
        name: 'the browser process could not be started',
        ctx: ctxWith({
            launch: {
                attempted: true,
                started: false,
                ok: false,
                version: null,
                error: 'Failed to launch the browser process!',
                skipped: false,
                elapsedMs: 120,
            },
        }),
        ids: ['BSI-BROWSER-015'],
        severities: [SEVERITY.ERROR],
    },
    {
        check: 'browser-launch',
        // Issue #878: the browser starts perfectly well and dies on the first command sent to it.
        // Reporting that as "could not be started" was false, and it led with antivirus advice
        // while the actual fix - use a different build - sat at step 2 with the build id never
        // named.
        name: 'the browser started and then could not be driven',
        ctx: ctxWith({
            launch: {
                attempted: true,
                started: true,
                ok: false,
                version: null,
                error: 'Protocol error (Browser.getVersion): Session closed.',
                skipped: false,
                elapsedMs: 900,
            },
        }),
        ids: ['BSI-BROWSER-020'],
        severities: [SEVERITY.ERROR],
    },
    {
        check: 'browser-launch',
        // The stall no timeout catches: process creation is synchronous inside libuv, so the
        // launch budget never fires and the run is merely inexplicably slow. Reported as OK
        // before, which let an administrator rule the browser out and chase the wrong thing.
        name: 'a launch that succeeded slowly is reported as well as passing',
        ctx: ctxWith({
            launch: {
                attempted: true,
                started: true,
                ok: true,
                version: 'Chrome/138.0.7204.94',
                error: null,
                skipped: false,
                elapsedMs: 92_000,
            },
        }),
        ids: ['BSI-BROWSER-014', 'BSI-BROWSER-021'],
        severities: [SEVERITY.OK, SEVERITY.WARNING],
    },
    {
        check: 'browser-launch',
        name: '--skip-launch says so rather than staying silent',
        ctx: ctxWith({
            launch: {
                attempted: false,
                started: false,
                ok: false,
                version: null,
                error: null,
                skipped: true,
                elapsedMs: 0,
            },
        }),
        ids: ['BSI-BROWSER-016'],
        severities: [SEVERITY.INFO],
    },
];

describe('every check is a pure function of its context', () => {
    test.each(SCENARIOS.map((s) => [`${s.check}: ${s.name}`, s]))('%s', async (_name, scenario) => {
        // `nothingSelected` clears the healthy default's selection. A cache fault only fails the
        // run when the cache is what the run depended on, so a scenario asserting an error has to
        // say that no browser was found in the end - otherwise it is asserting the old, wrong
        // behaviour, where a leftover build directory failed a machine that had already launched.
        const ctx = scenario.nothingSelected
            ? {
                  ...scenario.ctx,
                  detection: { ...scenario.ctx.detection, selection: null, wouldDownload: true },
              }
            : scenario.ctx;
        const findings = await findingsOf(scenario.check, ctx);

        expect(findings.map((f) => f.id)).toEqual(scenario.ids);
        expect(findings.map((f) => f.severity)).toEqual(scenario.severities);

        // Where a scenario states the causes a finding defers to, hold it to them. A typo in a
        // supersededBy id fails silently in the worst possible direction: the cause never matches,
        // so nothing is ever demoted and the duplicate remediation quietly comes back.
        if (scenario.supersededBy) {
            expect(findings.at(-1).supersededBy).toEqual(scenario.supersededBy);
        }
    });

    test('every finding states what was observed, with the values it observed', () => {
        // §15.4: "No browser found" helps nobody. A detail that never names anything concrete is
        // a finding that ends no investigation.
        return Promise.all(
            SCENARIOS.map(async (scenario) => {
                const findings = await findingsOf(scenario.check, scenario.ctx);

                for (const finding of findings) {
                    expect({ id: finding.id, hasTitle: finding.title?.length > 10 }).toEqual({
                        id: finding.id,
                        hasTitle: true,
                    });
                    expect({ id: finding.id, hasDetail: finding.detail?.length > 10 }).toEqual({
                        id: finding.id,
                        hasDetail: true,
                    });
                }
            })
        );
    });

    test('every error finding carries at least one remediation step', () => {
        // §15.9: wrong advice is worse than none - but an error with no advice at all is a dead
        // end on a machine whose administrator cannot open the documentation site.
        return Promise.all(
            SCENARIOS.map(async (scenario) => {
                const findings = await findingsOf(scenario.check, scenario.ctx);

                for (const finding of findings.filter((f) => f.severity === SEVERITY.ERROR)) {
                    expect({ id: finding.id, steps: finding.remediation.length > 0 }).toEqual({
                        id: finding.id,
                        steps: true,
                    });
                }
            })
        );
    });
});

describe('a cache problem that did not stop the run does not fail the run', () => {
    // Both of these were false FAILEDs on machines that demonstrably work - the opposite gate
    // failure from the one the earlier fixes were about, and the more likely to reach a customer:
    // a leftover build directory beside a working one is ordinary, not exotic.

    /**
     * A ctx where a browser really was selected, whatever else is wrong with the cache.
     *
     * @param {object} cache - The cache state to report alongside a successful selection.
     *
     * @returns {object} The context.
     */
    const withSelection = (cache) =>
        ctxWith({
            cache,
            detection: {
                selection: {
                    source: 'cache',
                    executablePath: HEALTHY_BUILD.executablePath,
                    browser: 'chrome',
                    buildId: HEALTHY_BUILD.buildId,
                },
                error: null,
                wouldDownload: false,
                requested: 'chrome recommended',
                requestedVersion: 'recommended',
                versionForm: 'recommended',
                resolvedBuildId: HEALTHY_BUILD.buildId,
            },
        });

    test('a stale build beside a working one is a warning, not a failure', async () => {
        const [entry] = await findingsOf(
            'browser-cache-executable',
            withSelection({
                dir: 'C:\\bsi\\browser-cache',
                source: 'standalone',
                sourceLabel: 'default location next to the Butler Sheet Icons executable',
                exists: true,
                inUse: true,
                notConsultedReason: undefined,
                builds: [
                    HEALTHY_BUILD,
                    {
                        ...HEALTHY_BUILD,
                        buildId: '137.0.7100.10',
                        executableExists: false,
                        usable: false,
                        reason: 'executable not found on disk',
                    },
                ],
            })
        );

        expect(entry.id).toBe('BSI-BROWSER-009');
        expect(entry.severity).toBe(SEVERITY.WARNING);
    });

    test('an unreadable cache that nothing was going to read is a warning', async () => {
        const [entry] = await findingsOf(
            'browser-cache-platform',
            withSelection({
                ...EMPTY_CACHE,
                exists: true,
                inUse: false,
                notConsultedReason:
                    'an executable path is configured, so the cache is not consulted',
                readError: "EACCES: permission denied, scandir 'D:\\bsi\\cache\\chrome'",
            })
        );

        expect(entry.id).toBe('BSI-BROWSER-019');
        expect(entry.severity).toBe(SEVERITY.WARNING);
    });

    test('but an unreadable cache that decided the run is still an error', async () => {
        const [entry] = await findingsOf(
            'browser-cache-platform',
            ctxWith({
                cache: {
                    ...EMPTY_CACHE,
                    exists: true,
                    readError: "EACCES: permission denied, scandir 'D:\\bsi\\cache\\chrome'",
                },
                detection: {
                    selection: null,
                    error: null,
                    wouldDownload: true,
                    requested: 'chrome recommended',
                    requestedVersion: 'recommended',
                    versionForm: 'recommended',
                    resolvedBuildId: '138.0.7204.94',
                },
            })
        );

        expect(entry.severity).toBe(SEVERITY.ERROR);
    });
});

describe('one build, one diagnosis', () => {
    test('a foreign build with no binary is reported as foreign, once', async () => {
        // Both cache checks judged the same build against different criteria, so a build that was
        // BOTH wrong-platform and binary-less produced two errors and a four-step Next steps whose
        // last two entries ("copy again, preserving hidden files") cannot help a build compiled
        // for another operating system. `unusableReason` already declares the precedence - platform
        // first - and the executable check now honours it.
        const ctx = ctxWith({
            cache: {
                dir: 'D:\\bsi\\cache',
                source: 'option',
                sourceLabel: 'from --browser-cache-dir / BSI_BROWSER_CACHE_DIR',
                exists: true,
                inUse: true,
                notConsultedReason: undefined,
                builds: [
                    {
                        ...HEALTHY_BUILD,
                        platform: 'mac_arm',
                        canRunHere: false,
                        executableExists: false,
                        usable: false,
                        reason: 'built for another platform',
                    },
                ],
            },
            detection: {
                selection: null,
                error: null,
                wouldDownload: true,
                requested: 'chrome recommended',
                requestedVersion: 'recommended',
                versionForm: 'recommended',
                resolvedBuildId: '138.0.7204.94',
            },
        });

        const platform = await findingsOf('browser-cache-platform', ctx);
        const executable = checkById('browser-cache-executable').appliesTo(ctx)
            ? await findingsOf('browser-cache-executable', ctx)
            : [];

        expect(platform.map((f) => f.id)).toEqual(['BSI-BROWSER-006']);
        // The executable check has nothing to add: the binary is not why this build is unusable.
        expect(executable).toEqual([]);
    });

    test('a runnable build with no binary is still reported by the executable check', async () => {
        const ctx = ctxWith({
            cache: {
                dir: 'D:\\bsi\\cache',
                source: 'option',
                sourceLabel: 'from --browser-cache-dir / BSI_BROWSER_CACHE_DIR',
                exists: true,
                inUse: true,
                notConsultedReason: undefined,
                builds: [
                    {
                        ...HEALTHY_BUILD,
                        executableExists: false,
                        usable: false,
                        reason: 'executable not found on disk',
                    },
                ],
            },
            detection: {
                selection: null,
                error: null,
                wouldDownload: true,
                requested: 'chrome recommended',
                requestedVersion: 'recommended',
                versionForm: 'recommended',
                resolvedBuildId: '138.0.7204.94',
            },
        });

        const [entry] = await findingsOf('browser-cache-executable', ctx);

        expect(entry.id).toBe('BSI-BROWSER-009');
        expect(entry.severity).toBe(SEVERITY.ERROR);
    });
});

describe('advice is aimed at the configuration actually in force', () => {
    /**
     * A ctx whose browser came from --browser-executable-path rather than the cache.
     *
     * @param {object} [overrides] - `detection` fields to replace, and `rest` to merge into the ctx.
     *
     * @returns {object} The context.
     */
    const namedExecutable = (overrides = {}) =>
        ctxWith({
            executableOverride: {
                path: '/usr/bin/chromium',
                configuredValue: '/usr/bin/chromium',
                source: 'option',
                sourceLabel: 'from --browser-executable-path / BSI_BROWSER_EXECUTABLE_PATH',
                explicit: true,
                exists: true,
            },
            cache: {
                ...EMPTY_CACHE,
                inUse: false,
                notConsultedReason:
                    'an executable path is configured, so the cache is not consulted',
            },
            detection: {
                selection: {
                    source: 'system',
                    executablePath: '/usr/bin/chromium',
                    browser: 'chrome',
                    buildId: 'system-installed',
                },
                error: null,
                wouldDownload: false,
                requested: 'chrome recommended',
                requestedVersion: 'recommended',
                versionForm: 'recommended',
                resolvedBuildId: '138.0.7204.94',
                ...overrides.detection,
            },
            ...overrides.rest,
        });

    test('a failed launch of a named executable does not blame the browser cache', async () => {
        // The cache is not consulted on this path, and `--browser-version recommended` changes
        // nothing: detection returns the override before it ever looks at the version, so pasting
        // that command reproduces the identical failure.
        const ctx = namedExecutable();
        ctx.launch = {
            attempted: true,
            started: false,
            ok: false,
            version: null,
            error: 'spawn EACCES',
            skipped: false,
            elapsedMs: 40,
        };

        const [entry] = await findingsOf('browser-launch', ctx);
        const advice = entry.remediation
            .map((step) => `${step.text} ${step.command?.bash ?? ''}`)
            .join('\n');

        expect(entry.severity).toBe(SEVERITY.ERROR);
        expect(advice).not.toContain('browser cache');
        expect(advice).not.toContain('--browser-version');
        // It should point at the thing that is actually in force.
        expect(advice).toContain('/usr/bin/chromium');
    });

    test('no version finding fires when a named executable makes the version moot', async () => {
        // resolveBrowserExecutablePath skips version resolution entirely when a named executable
        // exists, so a real run neither validates nor uses --browser-version here. Warning about
        // it sent customers chasing version drift that cannot occur on their configuration - and
        // an invalid value must not fail the check either, because a real run would succeed.
        for (const versionForm of ['floating', 'partial', 'invalid']) {
            const ctx = namedExecutable({
                detection: { versionForm, requestedVersion: 'stable' },
            });

            const ids = (await findingsOf('browser-selection', ctx)).map((f) => f.id);

            expect({ versionForm, ids }).toEqual({ versionForm, ids: ['BSI-BROWSER-010'] });
        }
    });

    test('version findings still fire when the cache is what decides', async () => {
        // The other half: without a named executable the version really does select the build, so
        // silence would hide a genuine mismatch.
        const ctx = ctxWith({
            detection: {
                selection: {
                    source: 'cache',
                    executablePath: HEALTHY_BUILD.executablePath,
                    browser: 'chrome',
                    buildId: HEALTHY_BUILD.buildId,
                },
                error: null,
                wouldDownload: false,
                requested: 'chrome stable',
                requestedVersion: 'stable',
                versionForm: 'floating',
                resolvedBuildId: undefined,
            },
        });

        const ids = (await findingsOf('browser-selection', ctx)).map((f) => f.id);

        expect(ids).toEqual(['BSI-BROWSER-010', 'BSI-BROWSER-013']);
    });

    test('remediation quotes the version as normalised, never as undefined', async () => {
        // browserCheck({}) is a supported call shape, and reaching past the normalised value back
        // to the raw options bag printed `--browser-version undefined` into a command an
        // administrator is invited to paste.
        const ctx = ctxWith({
            options: { browser: 'chrome' },
            detection: {
                selection: null,
                error: null,
                wouldDownload: true,
                requested: 'chrome recommended (build 151.0.7922.71)',
                requestedVersion: 'recommended',
                versionForm: 'recommended',
                resolvedBuildId: '151.0.7922.71',
            },
        });

        const findings = await findingsOf('browser-selection', ctx);
        const printed = findings
            .flatMap((entry) => entry.remediation)
            .map(
                (step) =>
                    `${step.text} ${step.command?.powershell ?? ''} ${step.command?.bash ?? ''}`
            )
            .join('\n');

        expect(printed).not.toContain('undefined');
    });
});

describe('the registry', () => {
    test('every finding id is unique across every registered check', () => {
        // The one-line test that prevents the id collisions §15.4 warns about, at the moment they
        // are introduced rather than after they have shipped in someone's logs.
        const ids = CHECKS.flatMap((check) => check.findingIds);

        expect(ids.length).toBe(new Set(ids).size);
    });

    test('every check id is unique', () => {
        const ids = CHECKS.map((check) => check.id);

        expect(ids.length).toBe(new Set(ids).size);
    });

    test('every finding id is shaped for a permanent, searchable identifier', () => {
        for (const check of CHECKS) {
            for (const id of check.findingIds) {
                expect(`${check.id}: ${id}`).toMatch(/: BSI-[A-Z]+-\d{3}$/);
            }
        }
    });

    test('every check declares the whole contract', () => {
        for (const check of CHECKS) {
            expect({
                id: check.id,
                shape: {
                    title: typeof check.title,
                    section: typeof check.section,
                    area: typeof check.area,
                    needsNetwork: typeof check.needsNetwork,
                    appliesTo: typeof check.appliesTo,
                    run: typeof check.run,
                    findingIds: Array.isArray(check.findingIds),
                },
            }).toEqual({
                id: check.id,
                shape: {
                    title: 'string',
                    section: 'string',
                    area: 'string',
                    needsNetwork: 'boolean',
                    appliesTo: 'function',
                    run: 'function',
                    findingIds: true,
                },
            });
        }
    });

    test('every check declares an area the contract recognises', async () => {
        // `checksForAreas` filters on a free-form string, so a typo does not throw, warn, or
        // produce a skipped result - the check simply is not there. Renaming browser-selection's
        // area to `browserr` was measured to leave `browser check` reporting OK and exiting 0 on
        // a machine with no browser at all, with the whole suite green: the per-check tests call
        // `run()` directly and never go through the registry.
        const { CHECK_AREAS } = await import('../run-checks.js');

        for (const check of CHECKS) {
            expect({ check: check.id, known: CHECK_AREAS.includes(check.area) }).toEqual({
                check: check.id,
                known: true,
            });
        }
    });

    test('browser check runs every check it is meant to, and asks for real areas', async () => {
        // The other half: `AREAS` is a hand-written list in the worker, so a typo *there* drops a
        // check just as silently. Both lists are read from the real modules rather than restated.
        const { checksForAreas } = await import('../checks/index.js');
        const { CHECK_AREAS } = await import('../run-checks.js');
        const { BROWSER_CHECK_AREAS } = await import('../../browser/browser-check.js');

        for (const area of BROWSER_CHECK_AREAS) {
            expect({ area, known: CHECK_AREAS.includes(area) }).toEqual({ area, known: true });
        }

        // Every registered check belongs to one of the areas this command runs. When a check for
        // another area is added - the qseow connectivity check the design anticipates - this
        // assertion is the deliberate place to say so.
        expect(checksForAreas(BROWSER_CHECK_AREAS).map((check) => check.id)).toEqual(
            CHECKS.map((check) => check.id)
        );
    });

    test('no check reaches the network, so the default is safe on an air-gapped server', () => {
        // Every phase 1 check reads facts the gatherer already collected locally. The field
        // exists for the checks that come later; this asserts none of today's has quietly
        // acquired one.
        expect(CHECKS.filter((check) => check.needsNetwork).map((check) => check.id)).toEqual([]);
    });

    test('the ids each check declares are exactly the ids the scenarios above produce', () => {
        // What keeps `findingIds` honest as checks grow. A branch added without a scenario, or a
        // declared id no branch can reach, both fail here.
        return Promise.all(
            CHECKS.map(async (check) => {
                const emitted = new Set();

                for (const scenario of SCENARIOS.filter((s) => s.check === check.id)) {
                    const ctx = scenario.nothingSelected
                        ? {
                              ...scenario.ctx,
                              detection: { ...scenario.ctx.detection, selection: null },
                          }
                        : scenario.ctx;

                    for (const finding of await check.run(ctx)) {
                        emitted.add(finding.id);
                    }
                }

                expect({ check: check.id, ids: [...emitted].sort() }).toEqual({
                    check: check.id,
                    ids: [...check.findingIds].sort(),
                });
            })
        );
    });
});

describe('the runner isolates the report from one broken check', () => {
    /**
     * A minimal check for exercising the runner.
     *
     * @param {object} overrides - Fields to replace on the default shape.
     *
     * @returns {object} A check object.
     */
    const fakeCheck = (overrides) => ({
        id: 'fake',
        title: 'A fake check',
        section: 'Fake',
        area: 'browser',
        needsNetwork: false,
        findingIds: [],
        appliesTo: () => true,
        run: async () => [],
        ...overrides,
    });

    test('a check that throws becomes an error finding naming it', async () => {
        const results = await runChecks(
            [
                fakeCheck({
                    id: 'explodes',
                    run: async () => {
                        throw new Error('the cache directory could not be read');
                    },
                }),
                fakeCheck({
                    id: 'survives',
                    run: async () => [{ id: 'BSI-TEST-001', severity: SEVERITY.OK, title: 'fine' }],
                }),
            ],
            ctxWith()
        );

        const [broken, survivor] = results;

        expect(broken.findings).toHaveLength(1);
        expect(broken.findings[0].severity).toBe(SEVERITY.ERROR);
        expect(broken.findings[0].id).toBe(RUNNER_ERROR_ID);
        // Naming the check is the point: without it the report says something failed and gives
        // nobody a place to look.
        expect(broken.findings[0].detail).toContain('explodes');
        expect(broken.findings[0].detail).toContain('the cache directory could not be read');

        // And the rest of the report still happened, which is the whole reason for the try/catch.
        expect(survivor.findings[0].id).toBe('BSI-TEST-001');
    });

    test('a check returning a bare finding instead of a list cannot erase the report', async () => {
        // The runner used to reassemble per-check findings by slicing a flattened array with a
        // running cursor. A non-array return made `result.findings.length` undefined, the cursor
        // NaN, and every subsequent slice empty - so ONE malformed check silently deleted every
        // finding in the report and the command exited 0 on a broken machine.
        const results = await runChecks(
            [
                fakeCheck({
                    id: 'returns-bare-object',
                    run: async () => ({
                        id: 'BSI-TEST-100',
                        severity: SEVERITY.OK,
                        title: 'a bare finding',
                        detail: 'not wrapped in an array',
                    }),
                }),
                fakeCheck({
                    id: 'reports-a-real-problem',
                    run: async () => [
                        {
                            id: 'BSI-TEST-101',
                            severity: SEVERITY.ERROR,
                            title: 'the real problem',
                            detail: 'd',
                            facts: [],
                            remediation: [{ text: 'Fix it.' }],
                        },
                    ],
                }),
            ],
            ctxWith()
        );

        expect(results[0].findings.map((f) => f.id)).toEqual(['BSI-TEST-100']);
        // The half that matters: the healthy check's error must survive, so the run still fails.
        expect(results[1].findings.map((f) => f.id)).toEqual(['BSI-TEST-101']);
        expect(results[1].findings[0].severity).toBe(SEVERITY.ERROR);
    });

    test('findings stay attributed to the check that produced them', async () => {
        // The other half of the cursor bug: mis-slicing silently moved findings between sections,
        // which reads as the wrong check having found something.
        const results = await runChecks(
            [
                fakeCheck({ id: 'a', run: async () => [] }),
                fakeCheck({
                    id: 'b',
                    run: async () => [
                        { id: 'B1', severity: SEVERITY.OK, title: 't', detail: 'd', facts: [] },
                        { id: 'B2', severity: SEVERITY.OK, title: 't', detail: 'd', facts: [] },
                    ],
                }),
                fakeCheck({
                    id: 'c',
                    run: async () => [
                        { id: 'C1', severity: SEVERITY.OK, title: 't', detail: 'd', facts: [] },
                    ],
                }),
            ],
            ctxWith()
        );

        expect(results.map((r) => [r.check.id, r.findings.map((f) => f.id)])).toEqual([
            ['a', []],
            ['b', ['B1', 'B2']],
            ['c', ['C1']],
        ]);
    });

    test('a finding repaired by the runner cannot demote a genuine error', async () => {
        // Normalisation promotes an unrecognised severity to `error` so a malformed finding is
        // never silently passing. That made it eligible as a *cause*: a check writing
        // `severity: 'WARNING'` - the constant is lowercase - was repaired into an error, joined
        // the cause set, and demoted a real finding that named its id, stripping the remediation
        // an administrator needed. A repaired finding fails the run; it does not get to explain
        // away someone else's.
        const results = await runChecks(
            [
                fakeCheck({
                    id: 'typo',
                    run: async () => [
                        {
                            id: 'BSI-TEST-100',
                            severity: 'WARNING',
                            title: 'a severity typo',
                            detail: 'd',
                            facts: [],
                            remediation: [],
                        },
                    ],
                }),
                fakeCheck({
                    id: 'real',
                    run: async () => [
                        {
                            id: 'BSI-TEST-101',
                            severity: SEVERITY.ERROR,
                            title: 'the real problem',
                            detail: 'd',
                            facts: [],
                            remediation: [{ text: 'Fix the real problem.' }],
                            supersededBy: ['BSI-TEST-100'],
                        },
                    ],
                }),
            ],
            ctxWith()
        );

        const real = results[1].findings[0];

        expect(real.severity).toBe(SEVERITY.ERROR);
        expect(real.remediation).toHaveLength(1);
        // The malformed one still fails the run, so nothing is swept under the carpet.
        expect(results[0].findings[0].severity).toBe(SEVERITY.ERROR);
    });

    test('a check that throws a non-Error is still reported', async () => {
        const [result] = await runChecks(
            [
                fakeCheck({
                    run: async () => {
                        throw 'a bare string';
                    },
                }),
            ],
            ctxWith()
        );

        expect(result.findings[0].severity).toBe(SEVERITY.ERROR);
        expect(result.findings[0].detail).toContain('a bare string');
    });

    test('a needsNetwork check is skipped unless the network is allowed', async () => {
        const run = jest.fn(async () => []);

        const [result] = await runChecks([fakeCheck({ needsNetwork: true, run })], ctxWith());

        expect(run).not.toHaveBeenCalled();
        expect(result.skipped).toBe(SKIP_NETWORK);
    });

    test('a needsNetwork check runs when the network is allowed', async () => {
        const run = jest.fn(async () => []);

        const [result] = await runChecks([fakeCheck({ needsNetwork: true, run })], ctxWith(), {
            allowNetwork: true,
        });

        expect(run).toHaveBeenCalledTimes(1);
        expect(result.skipped).toBeUndefined();
    });

    test('a check that does not apply is skipped without being run', async () => {
        const run = jest.fn(async () => []);

        const [result] = await runChecks([fakeCheck({ appliesTo: () => false, run })], ctxWith());

        expect(run).not.toHaveBeenCalled();
        expect(result.skipped).toBe(SKIP_NOT_APPLICABLE);
    });

    test('an appliesTo that throws is reported rather than taking down the report', async () => {
        const [result] = await runChecks(
            [
                fakeCheck({
                    appliesTo: () => {
                        throw new Error('predicate exploded');
                    },
                }),
            ],
            ctxWith()
        );

        expect(result.findings[0].severity).toBe(SEVERITY.ERROR);
        expect(result.findings[0].detail).toContain('predicate exploded');
    });

    test('an error is demoted when the cause it names is present in the report', async () => {
        // How a consequence stops repeating its cause's advice. Declarative: the consequence names
        // the finding ids that explain it, and the runner demotes it only when one of them is
        // actually there. The check does not predict what other checks will do.
        const results = await runChecks(
            [
                fakeCheck({
                    id: 'cause',
                    run: async () => [
                        {
                            id: 'BSI-TEST-100',
                            severity: SEVERITY.ERROR,
                            title: 'the cause',
                            detail: 'd',
                            facts: [],
                            remediation: [{ text: 'Fix the cause.' }],
                        },
                    ],
                }),
                fakeCheck({
                    id: 'consequence',
                    run: async () => [
                        {
                            id: 'BSI-TEST-101',
                            severity: SEVERITY.ERROR,
                            title: 'the consequence',
                            detail: 'd',
                            facts: [],
                            remediation: [{ text: 'Fix the cause.' }],
                            supersededBy: ['BSI-TEST-100'],
                        },
                    ],
                }),
            ],
            ctxWith()
        );

        const consequence = results[1].findings[0];

        expect(consequence.severity).toBe(SEVERITY.INFO);
        // And its advice is dropped, so "Next steps" does not list the same fix twice.
        expect(consequence.remediation).toEqual([]);
    });

    test('an error is NOT demoted when the cause it names is absent', async () => {
        // The half that matters. Demotion driven by a prediction rather than by a present finding
        // is how `browser check` exited 0 on a machine that could not take a screenshot: every
        // other check reported OK, and the one real error demoted itself anyway.
        const results = await runChecks(
            [
                fakeCheck({
                    id: 'cause',
                    run: async () => [
                        {
                            id: 'BSI-TEST-100',
                            severity: SEVERITY.OK,
                            title: 'the cause did not fire',
                            detail: 'd',
                            facts: [],
                            remediation: [],
                        },
                    ],
                }),
                fakeCheck({
                    id: 'consequence',
                    run: async () => [
                        {
                            id: 'BSI-TEST-101',
                            severity: SEVERITY.ERROR,
                            title: 'the consequence',
                            detail: 'd',
                            facts: [],
                            remediation: [{ text: 'Fix something.' }],
                            supersededBy: ['BSI-TEST-100'],
                        },
                    ],
                }),
            ],
            ctxWith()
        );

        expect(results[1].findings[0].severity).toBe(SEVERITY.ERROR);
        expect(results[1].findings[0].remediation).toHaveLength(1);
    });

    test('a cause that is itself only a warning does not supersede', async () => {
        // Only an error explains an error. A warning left the run passable, so a consequence
        // demoted by one would leave the report with no error and the command exiting 0.
        const results = await runChecks(
            [
                fakeCheck({
                    id: 'cause',
                    run: async () => [
                        {
                            id: 'BSI-TEST-100',
                            severity: SEVERITY.WARNING,
                            title: 'a warning',
                            detail: 'd',
                            facts: [],
                            remediation: [],
                        },
                    ],
                }),
                fakeCheck({
                    id: 'consequence',
                    run: async () => [
                        {
                            id: 'BSI-TEST-101',
                            severity: SEVERITY.ERROR,
                            title: 'the consequence',
                            detail: 'd',
                            facts: [],
                            remediation: [{ text: 'Fix something.' }],
                            supersededBy: ['BSI-TEST-100'],
                        },
                    ],
                }),
            ],
            ctxWith()
        );

        expect(results[1].findings[0].severity).toBe(SEVERITY.ERROR);
    });

    test('supersession works regardless of the order the causes ran in', async () => {
        // The consequence may run before its cause. Resolving after every check has run is what
        // makes registry order a reading order rather than a correctness dependency.
        const results = await runChecks(
            [
                fakeCheck({
                    id: 'consequence',
                    run: async () => [
                        {
                            id: 'BSI-TEST-101',
                            severity: SEVERITY.ERROR,
                            title: 'the consequence',
                            detail: 'd',
                            facts: [],
                            remediation: [{ text: 'Fix the cause.' }],
                            supersededBy: ['BSI-TEST-100'],
                        },
                    ],
                }),
                fakeCheck({
                    id: 'cause',
                    run: async () => [
                        {
                            id: 'BSI-TEST-100',
                            severity: SEVERITY.ERROR,
                            title: 'the cause',
                            detail: 'd',
                            facts: [],
                            remediation: [{ text: 'Fix the cause.' }],
                        },
                    ],
                }),
            ],
            ctxWith()
        );

        expect(results[0].findings[0].severity).toBe(SEVERITY.INFO);
    });

    test('checks run in registry order, so the report reads top to bottom', async () => {
        const results = await runChecks(
            [fakeCheck({ id: 'first' }), fakeCheck({ id: 'second' }), fakeCheck({ id: 'third' })],
            ctxWith()
        );

        expect(results.map((result) => result.check.id)).toEqual(['first', 'second', 'third']);
    });
});
