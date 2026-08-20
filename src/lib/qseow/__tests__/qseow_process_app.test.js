import { describe, test, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';

// Mock every dependency of qseowProcessApp using the ESM-native
// jest.unstable_mockModule + dynamic import pattern. This mirrors the pattern
// used in src/lib/commands/__tests__/commands.test.js and stays compatible
// with puppeteer-core v25's ESM-only package.
const mockPuppeteerCore = jest.unstable_mockModule('puppeteer-core', () => ({
    default: { launch: jest.fn() },
}));

const mockPuppeteerBrowsers = jest.unstable_mockModule('@puppeteer/browsers', () => ({
    computeExecutablePath: jest.fn().mockReturnValue('/test/browser'),
    getInstalledBrowsers: jest.fn(),
    install: jest.fn(),
    resolveBuildId: jest.fn(),
    detectBrowserPlatform: jest.fn(),
    canDownload: jest.fn(),
    uninstall: jest.fn(),
}));

const mockEnigma = jest.unstable_mockModule('enigma.js', () => ({
    default: { create: jest.fn() },
}));

const mockFs = jest.unstable_mockModule('fs', () => ({
    default: {
        mkdirSync: jest.fn(),
        existsSync: jest.fn().mockReturnValue(false),
        rmSync: jest.fn(),
    },
    mkdirSync: jest.fn(),
    existsSync: jest.fn().mockReturnValue(false),
    rmSync: jest.fn(),
}));

const mockJimp = jest.unstable_mockModule('jimp', () => ({
    Jimp: {
        read: jest.fn().mockResolvedValue({
            blur: jest.fn().mockReturnThis(),
            write: jest.fn().mockResolvedValue(true),
        }),
    },
}));

const mockQrsInteract = jest.unstable_mockModule('qrs-interact', () => ({
    default: jest.fn(),
}));

const mockGlobals = jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    },
    sleep: jest.fn().mockResolvedValue(undefined),
    // browser-paths.js gates the standalone cache location on this, and ESM checks
    // named exports when the module graph is linked, so leaving it out is a hard error
    // rather than an undefined.
    sendConsoleLogToStderr: () => {},
    isSea: false,
    // run-report.js (imported for the report recorders) links these two.
    getLoggingLevel: jest.fn().mockReturnValue('info'),
    setLoggingLevel: jest.fn(),
}));

const mockQseowEnigma = jest.unstable_mockModule('../qseow-enigma.js', () => ({
    setupEnigmaConnection: jest.fn().mockReturnValue({ url: 'wss://test' }),
}));

const mockQseowUpload = jest.unstable_mockModule('../qseow-upload.js', () => ({
    qseowUploadToContentLibrary: jest.fn().mockResolvedValue(true),
}));

const mockQseowUpdateSheets = jest.unstable_mockModule('../qseow-updatesheets.js', () => ({
    qseowUpdateSheetThumbnails: jest.fn().mockResolvedValue(1),
}));

const mockQseowLogout = jest.unstable_mockModule('../qseow-logout.js', () => ({
    qseowLogout: jest.fn().mockResolvedValue(true),
    qseowLogoutQuietly: jest.fn().mockResolvedValue(undefined),
}));

const mockQseowQrs = jest.unstable_mockModule('../qseow-qrs.js', () => ({
    setupQseowQrsConnection: jest.fn().mockReturnValue({ host: 'test', cert: 'cert' }),
}));

const mockBrowserInstall = jest.unstable_mockModule('../../browser/browser-install.js', () => ({
    browserInstall: jest.fn(),
}));

const mockBrowserDetect = jest.unstable_mockModule('../../browser/browser-detect.js', () => ({
    detectAvailableBrowser: jest.fn().mockResolvedValue({
        executablePath: '/test/browser',
        source: 'system',
        browser: 'chrome',
        buildId: 'system-installed',
    }),
}));

const mockDetermineSheetExcludeStatus = jest.unstable_mockModule(
    '../determine-sheet-exclude-status.js',
    () => ({
        determineSheetExcludeStatus: jest.fn().mockResolvedValue({ excludeSheet: false }),
    })
);

let fs;
let qseowProcessApp;
let markInterrupted;
let resetInterruptState;
let puppeteer;
let enigma;
let qrsInteract;
let logger;
let browserInstall;
let detectAvailableBrowser;
let determineSheetExcludeStatus;
let Jimp;
let qseowUploadToContentLibrary;
let qseowUpdateSheetThumbnails;
let qseowLogout;
let qseowLogoutQuietly;

beforeAll(async () => {
    await Promise.all([
        mockPuppeteerCore,
        mockPuppeteerBrowsers,
        mockEnigma,
        mockFs,
        mockJimp,
        mockQrsInteract,
        mockGlobals,
        mockQseowEnigma,
        mockQseowUpload,
        mockQseowUpdateSheets,
        mockQseowLogout,
        mockQseowQrs,
        mockBrowserInstall,
        mockBrowserDetect,
        mockDetermineSheetExcludeStatus,
    ]);

    puppeteer = (await import('puppeteer-core')).default;
    enigma = (await import('enigma.js')).default;
    qrsInteract = (await import('qrs-interact')).default;
    ({ logger } = await import('../../../globals.js'));
    ({ browserInstall } = await import('../../browser/browser-install.js'));
    ({ detectAvailableBrowser } = await import('../../browser/browser-detect.js'));
    ({ determineSheetExcludeStatus } = await import('../determine-sheet-exclude-status.js'));
    ({ Jimp } = await import('jimp'));
    ({ qseowUploadToContentLibrary } = await import('../qseow-upload.js'));
    ({ qseowUpdateSheetThumbnails } = await import('../qseow-updatesheets.js'));
    ({ qseowLogout, qseowLogoutQuietly } = await import('../qseow-logout.js'));
    fs = (await import('fs')).default;
    ({ qseowProcessApp } = await import('../qseow-process-app.js'));
    ({ markInterrupted, resetInterruptState } = await import('../../util/interrupt.js'));
});

describe('qseow-process-app.js — puppeteer launch and click options', () => {
    const defaultOptions = {
        senseVersion: '2023-Nov',
        // Always present in real runs: Commander supplies both via option defaults. The launch
        // path treats their absence as a caller bug rather than silently picking a build.
        browser: 'chrome',
        browserVersion: 'recommended',
        imagedir: './img',
        host: 'test-server.example.com',
        logonuserdir: 'INTERNAL',
        logonuserid: 'sa_api',
        logonpwd: 'password',
        excludeSheetTag: 'exclude-thumbnail',
        excludeSheetNumber: ['2'],
        excludeSheetTitle: ['Excluded Sheet'],
        excludeSheetStatus: ['private'],
        includesheetpart: '1',
        pagewait: 0,
        secure: true,
        prefix: '',
        headless: true,
        blurFactor: 5,
        loglevel: 'info',
        // Off in the shared fixture, on by default in the product. The after-capture opens a
        // *second* browser session, which would double the launch/close counts that the
        // lifecycle tests in this file assert on. It gets its own describe block below, where
        // the second session is the subject rather than an unannounced extra.
        captureOverviewAfter: false,
    };

    /**
     * Build a mock sheet main-part handle that resolves `screenshot()` to true.
     *
     * @returns {object} Mock sheet main part with a `screenshot` method.
     */
    function buildMockSheetMainPart() {
        return {
            screenshot: jest.fn().mockResolvedValue(true),
        };
    }

    /**
     * Build a fully-wired mock Puppeteer page with jest.fn for every method.
     *
     * @returns {object} Mock page exposing every method invoked by qseowProcessApp.
     */
    function buildMockPage() {
        return {
            // Sheet-loading detection (#1119). Defaults to "not loading" so every
            // existing test describes a sheet that had finished rendering.
            evaluate: jest.fn().mockResolvedValue(false),
            setViewport: jest.fn().mockResolvedValue(true),
            setDefaultTimeout: jest.fn().mockResolvedValue(true),
            goto: jest.fn().mockResolvedValue(true),
            waitForNavigation: jest.fn().mockResolvedValue(true),
            screenshot: jest.fn().mockResolvedValue(true),
            click: jest.fn().mockResolvedValue(true),
            keyboard: { type: jest.fn().mockResolvedValue(true) },
            waitForSelector: jest.fn().mockResolvedValue(true),
            $: jest.fn().mockImplementation(() => Promise.resolve(buildMockSheetMainPart())),
            $$: jest.fn().mockResolvedValue([{ click: jest.fn().mockResolvedValue(true) }]),
        };
    }

    /**
     * Build a mock Puppeteer browser whose `newPage()` returns a mock page.
     *
     * The returned browser carries the underlying page on `_page` so tests can
     * inspect call arguments after `qseowProcessApp` has run.
     *
     * @returns {object} Mock browser with `_page` and standard Puppeteer methods.
     */
    function buildMockBrowser() {
        const page = buildMockPage();
        return {
            newPage: jest.fn().mockResolvedValue(page),
            close: jest.fn().mockResolvedValue(true),
            // launchBrowserForApp health checks the browser and listens for an unexpected
            // disconnect, so a browser-shaped mock has to answer both (issue #878).
            version: jest.fn().mockResolvedValue('Chrome/150.0.7871.24'),
            on: jest.fn(),
            _page: page,
        };
    }

    /**
     * Wire `mockGet` to return canned QRS responses for the three endpoints
     * `qseowProcessApp` calls (app metadata, tag-app metadata, sheet metadata).
     *
     * @param {jest.Mock} mockGet - Mock QRS `Get` method.
     *
     * @returns {void}
     */
    function wireQrsGetSequence(mockGet) {
        mockGet.mockImplementation((encodedPath) => {
            // Match on the decoded filter, i.e. what QRS parses, rather than on the wire
            // encoding. Filters are URL-encoded before they leave, so matching the raw path
            // would tie these mocks to that encoding.
            const path = decodeURIComponent(encodedPath);
            if (path.includes('app?filter=id eq')) {
                return Promise.resolve({
                    body: [{ id: 'test-app-id', name: 'Test App', published: true }],
                });
            }
            if (path.includes('tags.name eq')) {
                return Promise.resolve({ body: [] });
            }
            if (path.includes('app/object/full?filter=objectType eq')) {
                return Promise.resolve({
                    body: [
                        {
                            id: 'sheet-id-1',
                            engineObjectId: 'engine-sheet-id-1',
                            name: 'Sheet 1',
                        },
                    ],
                });
            }
            return Promise.resolve({ body: [] });
        });
    }

    /**
     * Wire the Enigma.js mocks (session → global → app → generic list) so that
     * `qseowProcessApp` traverses the sheet-listing path successfully.
     *
     * @returns {void}
     */
    function wireEnigmaSession() {
        const mockSheetList = {
            qAppObjectList: {
                qItems: [
                    {
                        qInfo: { qId: 'engine-sheet-id-1' },
                        qMeta: {
                            title: 'Sheet 1',
                            description: 'First sheet',
                            approved: false,
                            published: false,
                        },
                        qData: { rank: 1, showCondition: null },
                    },
                ],
            },
        };
        const mockGenericListObj = {
            getLayout: jest.fn().mockResolvedValue(mockSheetList),
            evaluateEx: jest
                .fn()
                .mockResolvedValue({ qValue: 0, qIsNumeric: true, qText: '0', qNumber: 0 }),
        };
        const mockApp = {
            createSessionObject: jest.fn().mockResolvedValue(mockGenericListObj),
            openDoc: jest.fn(),
            getObject: jest.fn().mockResolvedValue(buildMockSheetMainPart()),
            evaluateEx: jest
                .fn()
                .mockResolvedValue({ qValue: 0, qIsNumeric: true, qText: '0', qNumber: 0 }),
        };
        const mockGlobal = {
            engineVersion: jest.fn().mockResolvedValue({ qComponentVersion: '1.0.0' }),
            openDoc: jest.fn().mockResolvedValue(mockApp),
        };
        const mockSession = {
            open: jest.fn().mockResolvedValue(mockGlobal),
            close: jest.fn().mockResolvedValue(true),
            on: jest.fn(),
        };
        enigma.create.mockResolvedValue(mockSession);
        mockSession._app = mockApp;

        return mockSession;
    }

    /**
     * Wire QRS, Enigma, and puppeteer.launch with a single mock browser that
     * exposes its underlying page on `_page` for inspection.
     *
     * @returns {object} The mock browser returned by `puppeteer.launch`.
     */
    function setupHappyPath() {
        const mockGet = jest.fn();
        qrsInteract.mockImplementation(() => ({ Get: mockGet }));
        wireQrsGetSequence(mockGet);
        wireEnigmaSession();
        const browser = buildMockBrowser();
        puppeteer.launch.mockResolvedValue(browser);
        return browser;
    }

    /**
     * Runs qseowProcessApp against a wired-up happy path and returns every QRS path it asked
     * for, decoded.
     *
     * @param {object} overrides - Option overrides merged over `defaultOptions`.
     *
     * @returns {Promise<string[]>} The decoded QRS paths requested.
     */
    async function qrsPathsFor(overrides) {
        const mockGet = jest.fn();
        qrsInteract.mockImplementation(() => ({ Get: mockGet }));
        wireQrsGetSequence(mockGet);
        wireEnigmaSession();
        puppeteer.launch.mockResolvedValue(buildMockBrowser());

        await qseowProcessApp('test-app-id', { ...defaultOptions, ...overrides });

        return mockGet.mock.calls.map(([path]) => decodeURIComponent(path));
    }

    test.each([
        ['the option is absent', undefined],
        ['an empty environment variable yields a blank entry', ['']],
        ['an empty array is passed programmatically', []],
    ])('skips the tagged-sheet lookup entirely when %s', async (_label, excludeSheetTag) => {
        // This query used to run for every app whatever was passed. With no tags it asked for a
        // tag literally named `undefined` - a wasted round trip per app, and a real exclusion on
        // any site that happens to have a tag by that name.
        const paths = await qrsPathsFor({ excludeSheetTag });

        expect(paths.some((path) => path.includes('tags.name eq'))).toBe(false);
        expect(paths.some((path) => path.includes("'undefined'"))).toBe(false);
    });

    test('still fetches the sheet-id mapping when the tag lookup is skipped', async () => {
        // Skipping must not take the neighbouring query with it - the repo-to-engine sheet id
        // map is unconditional and everything downstream needs it.
        const paths = await qrsPathsFor({ excludeSheetTag: undefined });

        expect(paths.some((path) => path.includes("objectType eq 'sheet'"))).toBe(true);
    });

    test('still queries when exclude tags are supplied', async () => {
        const paths = await qrsPathsFor({ excludeSheetTag: ['exclude-thumbnail'] });

        expect(paths.some((path) => path.includes("tags.name eq 'exclude-thumbnail'"))).toBe(true);
    });

    test('queries QRS with an or-group when several exclude tags are given', async () => {
        // --exclude-sheet-tag is variadic, so this arrives as an array. Interpolating it
        // produced `tags.name eq 'a,b'` - one literal matching no tag, so nothing was excluded.
        const mockGet = jest.fn();
        qrsInteract.mockImplementation(() => ({ Get: mockGet }));
        wireQrsGetSequence(mockGet);
        wireEnigmaSession();
        puppeteer.launch.mockResolvedValue(buildMockBrowser());

        await qseowProcessApp('test-app-id', {
            ...defaultOptions,
            excludeSheetTag: ['exclude-thumbnail', 'R&D'],
        });

        const tagQuery = mockGet.mock.calls
            .map(([path]) => decodeURIComponent(path))
            .find((path) => path.includes('tags.name eq'));

        expect(tagQuery).toContain("(tags.name eq 'exclude-thumbnail' or tags.name eq 'R&D')");
        expect(tagQuery).not.toContain("'exclude-thumbnail,R&D'");
    });

    // --blur-sheet-tag was accepted by the CLI but nothing ever looked the tag up, so the blur
    // rule could never match. See issue #840.
    describe('--blur-sheet-tag lookup (issue #840)', () => {
        test('queries QRS for the blur tag when one is supplied', async () => {
            const paths = await qrsPathsFor({ blurSheetTag: ['blur-me'] });

            expect(paths.some((path) => path.includes("tags.name eq 'blur-me'"))).toBe(true);
        });

        test.each([
            ['the option is absent', undefined],
            ['an empty environment variable yields a blank entry', ['']],
            ['an empty array is passed programmatically', []],
        ])('skips the blur-tag lookup when %s', async (_label, blurSheetTag) => {
            const paths = await qrsPathsFor({ blurSheetTag, excludeSheetTag: undefined });

            expect(paths.some((path) => path.includes('tags.name eq'))).toBe(false);
        });

        test('uses an or-group when several blur tags are given', async () => {
            const paths = await qrsPathsFor({ blurSheetTag: ['blur-me', 'R&D'] });

            const tagQuery = paths.find((path) => path.includes("tags.name eq 'blur-me'"));

            expect(tagQuery).toContain("(tags.name eq 'blur-me' or tags.name eq 'R&D')");
            expect(tagQuery).not.toContain("'blur-me,R&D'");
        });

        test('asks for the exclude tag and the blur tag as two separate queries', async () => {
            // One combined lookup would lose track of which rule a sheet matched.
            const paths = await qrsPathsFor({
                excludeSheetTag: ['exclude-me'],
                blurSheetTag: ['blur-me'],
            });

            expect(paths.some((path) => path.includes("tags.name eq 'exclude-me'"))).toBe(true);
            expect(paths.some((path) => path.includes("tags.name eq 'blur-me'"))).toBe(true);
            expect(
                paths.some((path) => path.includes('exclude-me') && path.includes('blur-me'))
            ).toBe(false);
        });

        test('reports the matched-sheet count at info so a mistyped tag is visible', async () => {
            // The silent no-op this closes: with a misspelled tag the run logged exactly what a
            // run without the option logs, and the blur rule failing open publishes readable
            // thumbnails. A count of 0 on every app is the signal that the tag matched nothing.
            await qrsPathsFor({ blurSheetTag: ['blur-me'], excludeSheetTag: undefined });

            const infos = logger.info.mock.calls.map((call) => String(call[0]));

            expect(
                infos.some(
                    (line) =>
                        line.includes('--blur-sheet-tag') &&
                        line.includes('0') &&
                        line.includes('blur-me')
                )
            ).toBe(true);
        });

        test('does not report a count for an option that was not supplied', async () => {
            await qrsPathsFor({ blurSheetTag: undefined, excludeSheetTag: undefined });

            const infos = logger.info.mock.calls.map((call) => String(call[0])).join('\n');

            expect(infos).not.toContain('Sheets carrying a tag named by');
        });

        test('hands the blur-tag sheets to the thumbnail update, never the exclude-tag ones', async () => {
            // The regression this guards: the obvious fix was to pass the exclude-tag metadata
            // that was already in scope, which would have blurred every sheet the operator
            // asked to leave alone - a silent wrong answer in place of a loud crash.
            const blurTagged = [{ id: 'r1', engineObjectId: 'engine-blur-1' }];
            const excludeTagged = [{ id: 'r2', engineObjectId: 'engine-exclude-1' }];

            const mockGet = jest.fn().mockImplementation((encodedPath) => {
                const path = decodeURIComponent(encodedPath);
                if (path.includes('app?filter=id eq')) {
                    return Promise.resolve({ body: [{ id: 'test-app-id', name: 'Test App' }] });
                }
                if (path.includes("tags.name eq 'blur-me'")) {
                    return Promise.resolve({ body: blurTagged });
                }
                if (path.includes("tags.name eq 'exclude-me'")) {
                    return Promise.resolve({ body: excludeTagged });
                }
                if (path.includes('app/object/full?filter=objectType eq')) {
                    return Promise.resolve({
                        body: [{ id: 'sheet-id-1', engineObjectId: 'engine-sheet-id-1' }],
                    });
                }
                return Promise.resolve({ body: [] });
            });

            qrsInteract.mockImplementation(() => ({ Get: mockGet }));
            wireEnigmaSession();
            puppeteer.launch.mockResolvedValue(buildMockBrowser());
            qseowUpdateSheetThumbnails.mockResolvedValue(1);

            await qseowProcessApp('test-app-id', {
                ...defaultOptions,
                excludeSheetTag: ['exclude-me'],
                blurSheetTag: ['blur-me'],
            });

            expect(qseowUpdateSheetThumbnails).toHaveBeenCalledWith(
                expect.anything(),
                'test-app-id',
                expect.anything(),
                blurTagged
            );
        });
    });

    test('launches puppeteer with v25-compatible options (headless: true, acceptInsecureCerts)', async () => {
        setupHappyPath();

        await qseowProcessApp('test-app-id', defaultOptions);

        expect(puppeteer.launch).toHaveBeenCalledTimes(1);
        expect(puppeteer.launch).toHaveBeenCalledWith(
            expect.objectContaining({
                executablePath: '/test/browser',
                headless: true,
                acceptInsecureCerts: true,
            })
        );

        // Self-signed certificates are the norm on a QSEoW server, so this is the platform where
        // getting the option name wrong matters most. `ignoreHTTPSErrors` was removed in Puppeteer
        // v23 and is silently ignored, which is exactly why it survived the v25 upgrade unnoticed.
        expect(puppeteer.launch).not.toHaveBeenCalledWith(
            expect.objectContaining({ ignoreHTTPSErrors: expect.anything() })
        );
    });

    test('passes button: "left", delay: 10 to page.click (no clickCount in v25 shape)', async () => {
        const browser = setupHappyPath();

        await qseowProcessApp('test-app-id', defaultOptions);

        const clickOpts = browser._page.click.mock.calls
            .map((call) => call[1])
            .filter((opts) => opts !== undefined);

        expect(clickOpts.length).toBeGreaterThan(0);
        for (const opts of clickOpts) {
            expect(opts).toEqual(
                expect.objectContaining({
                    button: 'left',
                    delay: 10,
                })
            );
            expect(opts).not.toHaveProperty('clickCount');
        }
    });

    test('closes the enigma session without branching on its resolved value', async () => {
        setupHappyPath();

        await qseowProcessApp('test-app-id', defaultOptions);

        const session = await enigma.create.mock.results[0].value;
        expect(session.close).toHaveBeenCalled();

        // The removed `else` branch logged this on any non-true resolution. enigma.js always
        // resolves close() truthy, so it only ever fired on a misreading of the contract.
        const logged = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
        expect(logged).not.toContain('Error closing session');
    });

    test('reports the app context when browser installation fails', async () => {
        setupHappyPath();
        // Force the download branch, then make the install fail. browserInstall() signals
        // failure by throwing, never by returning false.
        detectAvailableBrowser.mockResolvedValue(null);
        browserInstall.mockRejectedValue(new Error('network unreachable'));

        // qseowProcessApp logs in detail and then rethrows, so the app loop above it can
        // count this app as failed. Isolation between apps is the loop's job, not this
        // function's - it used to swallow here, and the run reported success.
        await expect(qseowProcessApp('test-app-id', defaultOptions)).rejects.toThrow();

        const logged = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
        expect(logged).toContain('Could not obtain a browser for QSEoW app test-app-id');
        expect(puppeteer.launch).not.toHaveBeenCalled();
    });

    describe('--port reaches the web URL', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            detectAvailableBrowser.mockResolvedValue({
                executablePath: '/test/browser',
                source: 'system',
                browser: 'chrome',
                buildId: 'system-installed',
            });
            browserInstall.mockReset();
        });

        /**
         * Runs the app and returns the URL the browser was pointed at.
         *
         * @param {object} overrides - Option overrides merged over defaultOptions.
         *
         * @returns {Promise<string>} The URL passed to page.goto.
         */
        const gotoUrl = async (overrides) => {
            const mockGet = jest.fn();
            qrsInteract.mockImplementation(() => ({ Get: mockGet }));
            wireQrsGetSequence(mockGet);
            wireEnigmaSession();
            const browser = buildMockBrowser();
            puppeteer.launch.mockResolvedValue(browser);

            await qseowProcessApp('test-app-id', { ...defaultOptions, ...overrides });

            return String(browser._page.goto.mock.calls[0][0]);
        };

        test('includes the port when --port is given', async () => {
            // --port is the web port, distinct from --engineport and --qrsport. It was declared
            // and parsed but never reached the URL, so a server on a non-standard web port could
            // not be reached at all.
            const url = await gotoUrl({ port: '8443' });

            expect(url).toBe('https://test-server.example.com:8443/sense/app/test-app-id');
        });

        test('omits the port when --port is not given', async () => {
            const url = await gotoUrl({});

            expect(url).toBe('https://test-server.example.com/sense/app/test-app-id');
        });

        test('places the port before the virtual proxy prefix', async () => {
            // The prefixed and unprefixed URLs are built in separate branches, so both need
            // covering - the port belongs to the origin, ahead of the prefix path segment.
            const url = await gotoUrl({ port: '8443', prefix: 'sso' });

            expect(url).toBe('https://test-server.example.com:8443/sso/sense/app/test-app-id');
        });

        test('applies to http as well as https', async () => {
            const url = await gotoUrl({ port: '8080', secure: 'false' });

            expect(url).toBe('http://test-server.example.com:8080/sense/app/test-app-id');
        });
    });

    describe('session and sheet-list wiring', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            detectAvailableBrowser.mockResolvedValue({
                executablePath: '/test/browser',
                source: 'system',
                browser: 'chrome',
                buildId: 'system-installed',
            });
            browserInstall.mockReset();
        });

        test('asks the engine for showCondition, which sheet exclusion depends on', async () => {
            // The screenshot paths need a wider projection than the other callers. Requesting the
            // default set would leave qData.showCondition undefined on every sheet, which reads as
            // "no show condition" rather than as an error - silently disabling that exclusion rule.
            const session = wireEnigmaSession();
            const mockGet = jest.fn();
            qrsInteract.mockImplementation(() => ({ Get: mockGet }));
            wireQrsGetSequence(mockGet);
            puppeteer.launch.mockResolvedValue(buildMockBrowser());

            await qseowProcessApp('test-app-id', defaultOptions);

            const qData = session._app.createSessionObject.mock.calls[0][0].qAppObjectListDef.qData;
            expect(qData).toHaveProperty('showCondition', '/showCondition');
            expect(qData).toHaveProperty('rank', '/rank');
            expect(qData).toHaveProperty('title', '/qMetaDef/title');
        });

        test('logs the created session at info, the level operators see by default', async () => {
            // The four non-screenshot callers log this at verbose; these two always logged it at
            // info, and the default log level is info. Letting the shared helper demote it would
            // remove a line from every run.
            wireEnigmaSession();
            const mockGet = jest.fn();
            qrsInteract.mockImplementation(() => ({ Get: mockGet }));
            wireQrsGetSequence(mockGet);
            puppeteer.launch.mockResolvedValue(buildMockBrowser());

            await qseowProcessApp('test-app-id', defaultOptions);

            const atInfo = logger.info.mock.calls.map((call) => String(call[0])).join('\n');
            expect(atInfo).toContain('Created session to server test-server.example.com');
            expect(atInfo).toContain('engine version is');
        });
    });

    describe('the virtual browser is released when the app fails', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            detectAvailableBrowser.mockResolvedValue({
                executablePath: '/test/browser',
                source: 'system',
                browser: 'chrome',
                buildId: 'system-installed',
            });
            browserInstall.mockReset();
        });

        test('closes the browser when a page operation throws', async () => {
            // The browser was launched ~290 lines above its close and released on the happy
            // path only, so any failure in between stranded a Chrome process for the life of
            // the run - once per failing app, at hundreds of MB each.
            const browser = setupHappyPath();
            browser._page.goto.mockRejectedValue(new Error('navigation timed out'));

            await expect(qseowProcessApp('test-app-id', defaultOptions)).rejects.toThrow();

            expect(browser.close).toHaveBeenCalledTimes(1);
        });

        test('closes the browser when creating the page throws', async () => {
            const browser = setupHappyPath();
            browser.newPage.mockRejectedValue(new Error('no page for you'));

            await expect(qseowProcessApp('test-app-id', defaultOptions)).rejects.toThrow();

            expect(browser.close).toHaveBeenCalledTimes(1);
        });

        test('a browser that will not close does not mask the real failure', async () => {
            const browser = setupHappyPath();
            browser._page.goto.mockRejectedValue(new Error('navigation timed out'));
            browser.close.mockRejectedValue(new Error('browser is wedged'));

            await expect(qseowProcessApp('test-app-id', defaultOptions)).rejects.toThrow();

            const logged = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
            expect(logged).toContain('navigation timed out');
        });

        test('closes the browser exactly once on a clean run', async () => {
            const browser = setupHappyPath();

            await qseowProcessApp('test-app-id', defaultOptions);

            expect(browser.close).toHaveBeenCalledTimes(1);
        });

        test('uses the API-first logout flow with the configured hub and version selector', async () => {
            const browser = setupHappyPath();

            await qseowProcessApp('test-app-id', {
                ...defaultOptions,
                prefix: 'form',
                senseVersion: '2026-May',
            });

            expect(qseowLogoutQuietly).toHaveBeenCalledWith(
                browser._page,
                expect.objectContaining({
                    prefix: 'form',
                    hubUrl: 'https://test-server.example.com/form/hub',
                    senseVersion: '2026-May',
                }),
                'xpath/.//*[@id="q-hub-toolbar"]/div[2]/div[5]/div/div/div/button/span/span',
                'xpath/.//*[@id="q-hub-menu-override"]/ng-transclude/ul/li[4]/span[2]'
            );
        });

        test('continues uploading and updating when logout cannot be completed', async () => {
            setupHappyPath();
            qseowLogoutQuietly.mockResolvedValueOnce(undefined);

            await qseowProcessApp('test-app-id', defaultOptions);

            expect(qseowUploadToContentLibrary).toHaveBeenCalledTimes(1);
            expect(qseowUpdateSheetThumbnails).toHaveBeenCalledTimes(1);
        });

        test('logs out even when the sheet loop fails (#1119 follow-up)', async () => {
            // Logging out is what releases the Qlik Sense proxy session; closing the browser
            // does not. The logout used to sit at the end of the try, so any failure here
            // skipped it and stranded the session until it timed out - and because stranded
            // sessions count against the user's parallel-session limit, one failed run made
            // the next likelier to fail, until Qlik Sense refused to open apps at all.
            const browser = setupHappyPath();
            browser._page.waitForSelector.mockRejectedValue(new Error('#grid-wrap timed out'));

            await expect(qseowProcessApp('test-app-id', defaultOptions)).rejects.toThrow();

            expect(qseowLogoutQuietly).toHaveBeenCalled();
            expect(browser.close).toHaveBeenCalled();
        });

        test('does not attempt a logout when the run never signed in', async () => {
            // No page means no session was ever established, so there is nothing to release
            // and nothing to warn about.
            const browser = setupHappyPath();
            browser.newPage.mockRejectedValue(new Error('browser died on arrival'));

            await expect(qseowProcessApp('test-app-id', defaultOptions)).rejects.toThrow();

            expect(qseowLogoutQuietly).toHaveBeenCalledWith(
                undefined,
                expect.anything(),
                expect.anything(),
                expect.anything()
            );
        });
    });

    describe('the engine session is released when the app fails', () => {
        beforeEach(() => {
            // The enclosing describe has no beforeEach, so both call counts and mock
            // implementations accumulate across its tests - the failing browser install above
            // otherwise leaks into every test declared after it. clearAllMocks resets the counts
            // but deliberately keeps implementations, so the browser mocks are restored by hand.
            jest.clearAllMocks();
            detectAvailableBrowser.mockResolvedValue({
                executablePath: '/test/browser',
                source: 'system',
                browser: 'chrome',
                buildId: 'system-installed',
            });
            browserInstall.mockReset();
            qseowUploadToContentLibrary.mockResolvedValue(true);
            qseowUpdateSheetThumbnails.mockResolvedValue(1);
        });

        /**
         * Resolves the session object handed back by the mocked `enigma.create`.
         *
         * @returns {Promise<object>} The mock session.
         */
        const createdSession = async () => enigma.create.mock.results[0].value;

        test('releases the session when the browser cannot be installed', async () => {
            // The session is opened before the browser is launched and was closed ~360 lines
            // later on the happy path only, with no finally. Every failure in between left the
            // engine websocket open for the life of the process, once per failing app.
            setupHappyPath();
            detectAvailableBrowser.mockResolvedValue(null);
            browserInstall.mockRejectedValue(new Error('network unreachable'));

            await expect(qseowProcessApp('test-app-id', defaultOptions)).rejects.toThrow();

            expect((await createdSession()).close).toHaveBeenCalledTimes(1);
        });

        test('releases the session when opening the app fails', async () => {
            // A failure on the engine side rather than the browser side, so the guard is not
            // pinned to one specific throw site.
            const browser = setupHappyPath();
            browser.newPage.mockRejectedValue(new Error('page could not be created'));

            await expect(qseowProcessApp('test-app-id', defaultOptions)).rejects.toThrow();

            expect((await createdSession()).close).toHaveBeenCalledTimes(1);
        });

        test('closes the session before the thumbnails are uploaded and applied', async () => {
            // Ordering, not just occurrence. qseowUpdateSheetThumbnails opens its own session to
            // the same app - if the close drifted below it, QSEoW would hold two engine sessions
            // per app, doubling licence consumption and failing at a per-user session ceiling
            // after the screenshots were already taken.
            const order = [];
            const mockGet = jest.fn();
            qrsInteract.mockImplementation(() => ({ Get: mockGet }));
            wireQrsGetSequence(mockGet);
            const session = wireEnigmaSession();
            puppeteer.launch.mockResolvedValue(buildMockBrowser());
            session.close.mockImplementation(async () => {
                order.push('session-close');
                return true;
            });
            qseowUploadToContentLibrary.mockImplementation(async () => {
                order.push('upload');
                return true;
            });
            qseowUpdateSheetThumbnails.mockImplementation(async () => {
                order.push('update');
                return true;
            });

            await qseowProcessApp('test-app-id', defaultOptions);

            expect(order).toEqual(['session-close', 'upload', 'update']);
        });

        test('opens exactly one engine session per app', async () => {
            setupHappyPath();

            await qseowProcessApp('test-app-id', defaultOptions);

            expect(enigma.create).toHaveBeenCalledTimes(1);
        });
    });

    // Issue #1119. A short --pagewait can have the shutter fall while Qlik Sense is still
    // opening the sheet, and the loading screen is then uploaded as the thumbnail. The run
    // reported that as a success, which is the part this makes impossible.
    describe('a thumbnail captured while the sheet was still loading (#1119)', () => {
        test('says so, naming the sheet and the option that fixes it', async () => {
            const browser = setupHappyPath();
            browser._page.evaluate.mockResolvedValue(true);

            await qseowProcessApp('test-app-id', { ...defaultOptions, pagewait: 1 });

            const warnings = logger.warn.mock.calls.map((call) => String(call[0])).join('\n');
            expect(warnings).toContain('was still opening when its thumbnail was captured');
            expect(warnings).toContain('--pagewait (currently 1)');
        });

        test('still captures and uploads it, rather than quietly dropping the sheet', async () => {
            const browser = setupHappyPath();
            browser._page.evaluate.mockResolvedValue(true);

            await qseowProcessApp('test-app-id', defaultOptions);

            // Detection reports; it does not change what a run does. Silently skipping the
            // sheet would trade one invisible outcome for another.
            expect(browser._page.screenshot).toHaveBeenCalled();
            expect(qseowUploadToContentLibrary).toHaveBeenCalled();
            expect(qseowUpdateSheetThumbnails).toHaveBeenCalled();
        });

        test('stays quiet when the sheet had finished rendering', async () => {
            const browser = setupHappyPath();
            browser._page.evaluate.mockResolvedValue(false);

            await qseowProcessApp('test-app-id', defaultOptions);

            const warnings = logger.warn.mock.calls.map((call) => String(call[0])).join('\n');
            expect(warnings).not.toContain('still opening');
        });
    });

    // Issue #735. The after-capture is the only part of a run that opens a second browser
    // session, and it does so after the thumbnails are already uploaded and assigned - which
    // is precisely why it must never be able to fail the run.
    describe('app overview captured after the update (#735)', () => {
        beforeEach(() => {
            // The enclosing describe has no beforeEach, so both call counts and mock
            // implementations accumulate across its tests. clearAllMocks resets the counts but
            // deliberately keeps implementations, so the browser mocks are restored by hand.
            jest.clearAllMocks();
            detectAvailableBrowser.mockResolvedValue({
                executablePath: '/test/browser',
                source: 'system',
                browser: 'chrome',
                buildId: 'system-installed',
            });
            browserInstall.mockReset();
            qseowUploadToContentLibrary.mockResolvedValue(true);
            qseowUpdateSheetThumbnails.mockResolvedValue(1);
        });

        afterEach(() => {
            // These tests queue one-shot launch and logout outcomes. clearAllMocks keeps
            // queued implementations, so an unconsumed one would surface in an unrelated
            // test several describes later, where it makes no sense at all.
            puppeteer.launch.mockReset();
            qseowLogout.mockReset();
            qseowLogout.mockResolvedValue(true);
            qseowLogoutQuietly.mockReset();
            qseowLogoutQuietly.mockResolvedValue(undefined);
        });

        /**
         * Every path the run passed to `page.screenshot`.
         *
         * @param {object} browser - Mock browser returned by setupHappyPath.
         *
         * @returns {string[]} Screenshot paths, in the order they were written.
         */
        const shotPaths = (browser) => browser._page.screenshot.mock.calls.map(([arg]) => arg.path);

        test('names the main session overview after the state it shows', async () => {
            const browser = setupHappyPath();

            await qseowProcessApp('test-app-id', defaultOptions);

            // Renamed from overview-1.png: with a second capture in play, a positional
            // name no longer says which of the two an operator is looking at.
            expect(shotPaths(browser)).toContain('./img/qseow/test-app-id/overview-before.png');
        });

        test('signs in again and captures the overview when enabled', async () => {
            const browser = setupHappyPath();

            await qseowProcessApp('test-app-id', {
                ...defaultOptions,
                captureOverviewAfter: true,
            });

            expect(puppeteer.launch).toHaveBeenCalledTimes(2);
            expect(browser.close).toHaveBeenCalledTimes(2);
            expect(shotPaths(browser)).toContain('./img/qseow/test-app-id/overview-after.png');
        });

        test('captures only after the sheets have been pointed at the new thumbnails', async () => {
            const browser = setupHappyPath();

            await qseowProcessApp('test-app-id', {
                ...defaultOptions,
                captureOverviewAfter: true,
            });

            // Ordering is the whole point: capture too early and the screenshot shows the
            // starting state while claiming to show the result.
            const index = browser._page.screenshot.mock.calls.findIndex(([arg]) =>
                arg.path.endsWith('overview-after.png')
            );
            const capturedAt = browser._page.screenshot.mock.invocationCallOrder[index];
            const updatedAt = qseowUpdateSheetThumbnails.mock.invocationCallOrder[0];

            expect(capturedAt).toBeGreaterThan(updatedAt);
        });

        test('gives the second login its own screenshots rather than overwriting the first', async () => {
            const browser = setupHappyPath();

            await qseowProcessApp('test-app-id', {
                ...defaultOptions,
                captureOverviewAfter: true,
            });

            const paths = shotPaths(browser);

            expect(paths).toContain('./img/qseow/test-app-id/loginpage-after-1.png');
            expect(paths).toContain('./img/qseow/test-app-id/loginpage-after-2.png');

            // The first session's login evidence is what an operator reads when a run fails
            // to sign in. A second session reusing those names would erase it.
            expect(paths.filter((path) => path.endsWith('/loginpage-1.png'))).toHaveLength(1);
            expect(paths.filter((path) => path.endsWith('/loginpage-2.png'))).toHaveLength(1);
        });

        test('opens no second session when switched off', async () => {
            const browser = setupHappyPath();

            await qseowProcessApp('test-app-id', {
                ...defaultOptions,
                captureOverviewAfter: false,
            });

            expect(puppeteer.launch).toHaveBeenCalledTimes(1);
            expect(shotPaths(browser)).not.toContain('./img/qseow/test-app-id/overview-after.png');
        });

        test('clears a stale after-image before attempting the capture', async () => {
            setupHappyPath();

            await qseowProcessApp('test-app-id', {
                ...defaultOptions,
                captureOverviewAfter: true,
            });

            // The run has already overwritten overview-before.png by this point. If the
            // capture then fails, an after-image left by an earlier run would pair a fresh
            // before with a stale after and read as one run's evidence.
            expect(fs.rmSync).toHaveBeenCalledWith('./img/qseow/test-app-id/overview-after.png', {
                force: true,
            });
        });

        test('logs the after-capture session out once the screenshot is on disk', async () => {
            const browser = setupHappyPath();

            await qseowProcessApp('test-app-id', {
                ...defaultOptions,
                captureOverviewAfter: true,
            });

            // Both sessions are released. Whether a logout that fails can take the capture
            // down with it is settled in qseow_logout.test.js, which owns the wrapper that
            // swallows it - here it is enough that the second session is logged out at all.
            expect(shotPaths(browser)).toContain('./img/qseow/test-app-id/overview-after.png');
            expect(qseowLogoutQuietly).toHaveBeenCalledTimes(2);
        });

        test('survives a rejection that carries no message', async () => {
            const browser = setupHappyPath();
            // The main session gets its page; the after-capture's newPage rejects with a bare
            // undefined. Nothing between there and the caller's catch wraps it - rejecting the
            // browser launch instead would be wrapped in a QseowError and prove nothing.
            browser.newPage.mockResolvedValueOnce(browser._page);
            browser.newPage.mockRejectedValueOnce(undefined);

            // Reading `.message` off this would throw from inside the very catch block that
            // exists to keep the capture from failing the run, turning a run whose thumbnails
            // were fully applied into a failed one.
            await expect(
                qseowProcessApp('test-app-id', { ...defaultOptions, captureOverviewAfter: true })
            ).resolves.not.toThrow();

            const warnings = logger.warn.mock.calls.map((call) => String(call[0])).join('\n');
            expect(warnings).toContain('Could not capture the app overview after the update');
        });

        test('warns but does not fail the run when the second session cannot start', async () => {
            const browser = setupHappyPath();
            puppeteer.launch.mockResolvedValueOnce(browser);
            puppeteer.launch.mockRejectedValueOnce(new Error('no browser available'));

            await expect(
                qseowProcessApp('test-app-id', { ...defaultOptions, captureOverviewAfter: true })
            ).resolves.not.toThrow();

            const warnings = logger.warn.mock.calls.map((call) => String(call[0])).join('\n');
            expect(warnings).toContain('Could not capture the app overview after the update');

            // The thumbnails were applied before the capture was attempted, so the run stands.
            expect(qseowUpdateSheetThumbnails).toHaveBeenCalled();
        });
    });

    describe('qseow-process-app.js — the sheet loop stops when the run is interrupted (#1107)', () => {
        afterEach(() => {
            resetInterruptState();
        });

        test('abandons the app rather than working through the remaining sheets', async () => {
            const browser = setupHappyPath();
            markInterrupted('SIGINT');

            await expect(
                qseowProcessApp('test-app-id', { ...defaultOptions, pagewait: 0 })
            ).rejects.toThrow(/abandoned when the run was interrupted/);

            // No sheet was captured, so no thumbnail was uploaded and no sheet was
            // repointed - the app is left exactly as it was.
            expect(qseowUploadToContentLibrary).not.toHaveBeenCalled();
            expect(qseowUpdateSheetThumbnails).not.toHaveBeenCalled();
            expect(browser.close).toHaveBeenCalled();
        });

        test('the QSEoW session is still logged out on the way past', async () => {
            setupHappyPath();
            markInterrupted('SIGINT');

            await qseowProcessApp('test-app-id', { ...defaultOptions, pagewait: 0 }).catch(
                () => {}
            );

            // A stranded Sense session counts against the parallel-session limit,
            // so an interrupted run must not leave one behind either.
            expect(qseowLogoutQuietly).toHaveBeenCalled();
        });

        test('an uninterrupted run is unaffected', async () => {
            setupHappyPath();

            await qseowProcessApp('test-app-id', { ...defaultOptions, pagewait: 0 });

            expect(qseowUpdateSheetThumbnails).toHaveBeenCalled();
        });
    });
});

describe('qseow-process-app.js — a sheet with no metadata does not abort the app', () => {
    const options = {
        senseVersion: '2023-Nov',
        // Always present in real runs: Commander supplies both via option defaults. The launch
        // path treats their absence as a caller bug rather than silently picking a build.
        browser: 'chrome',
        browserVersion: 'recommended',
        imagedir: './img',
        host: 'test-server.example.com',
        logonuserdir: 'INTERNAL',
        logonuserid: 'sa_api',
        logonpwd: 'password',
        excludeSheetNumber: [],
        excludeSheetTitle: [],
        excludeSheetStatus: [],
        includesheetpart: '1',
        pagewait: 0,
        secure: true,
        prefix: '',
        headless: true,
        blurFactor: 5,
        loglevel: 'info',
    };

    /**
     * Builds a well-formed sheet list item.
     *
     * @param {string} qId - Engine object id.
     * @param {number} rank - Sheet rank.
     *
     * @returns {object} A sheet list item.
     */
    const sheetItem = (qId, rank) => ({
        qInfo: { qId },
        qMeta: { title: qId, description: '', approved: false, published: false },
        qData: { rank, showCondition: null },
    });

    /**
     * Wires the full mock stack over a caller-supplied sheet list.
     *
     * Everything is re-established here rather than shared with the describe block above,
     * because that block's last test leaves `detectAvailableBrowser` and `browserInstall`
     * in a failure state and this file does not reset between tests.
     *
     * @param {Array<object>} qItems - Sheets the SheetList session object should report.
     *
     * @returns {void}
     */
    function setup(qItems) {
        jest.clearAllMocks();

        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/test/browser',
            source: 'system',
            browser: 'chrome',
            buildId: 'system-installed',
        });
        determineSheetExcludeStatus.mockResolvedValue({
            excludeSheet: false,
            sheetIsHidden: false,
        });
        qseowUploadToContentLibrary.mockResolvedValue(true);
        qseowUpdateSheetThumbnails.mockResolvedValue(1);

        const mockGet = jest.fn().mockImplementation((encodedPath) => {
            // Match on the decoded filter, i.e. what QRS parses, rather than on the wire
            // encoding. Filters are URL-encoded before they leave, so matching the raw path
            // would tie these mocks to that encoding.
            const path = decodeURIComponent(encodedPath);
            if (path.includes('app?filter=id eq')) {
                return Promise.resolve({
                    body: [{ id: 'test-app-id', name: 'Test App', published: true }],
                });
            }
            return Promise.resolve({ body: [] });
        });
        qrsInteract.mockImplementation(() => ({ Get: mockGet }));

        const mockApp = {
            createSessionObject: jest.fn().mockResolvedValue({
                getLayout: jest.fn().mockResolvedValue({ qAppObjectList: { qItems } }),
            }),
            getObject: jest.fn().mockResolvedValue({ screenshot: jest.fn() }),
            evaluateEx: jest.fn().mockResolvedValue({ qIsNumeric: false, qNumber: 1 }),
        };
        enigma.create.mockResolvedValue({
            open: jest.fn().mockResolvedValue({
                engineVersion: jest.fn().mockResolvedValue({ qComponentVersion: '1.0.0' }),
                openDoc: jest.fn().mockResolvedValue(mockApp),
            }),
            close: jest.fn().mockResolvedValue(true),
            on: jest.fn(),
        });

        const page = {
            setViewport: jest.fn().mockResolvedValue(true),
            setDefaultTimeout: jest.fn().mockResolvedValue(true),
            goto: jest.fn().mockResolvedValue(true),
            waitForNavigation: jest.fn().mockResolvedValue(true),
            screenshot: jest.fn().mockResolvedValue(true),
            click: jest.fn().mockResolvedValue(true),
            keyboard: { type: jest.fn().mockResolvedValue(true) },
            waitForSelector: jest.fn().mockResolvedValue(true),
            $: jest.fn().mockResolvedValue({ screenshot: jest.fn().mockResolvedValue(true) }),
            $$: jest.fn().mockResolvedValue([{ click: jest.fn().mockResolvedValue(true) }]),
        };
        puppeteer.launch.mockResolvedValue({
            // launchBrowserForApp health checks the browser and watches for an unexpected
            // disconnect, so a browser-shaped mock has to answer both (issue #878).
            version: jest.fn().mockResolvedValue('Chrome/150.0.7871.24'),
            on: jest.fn(),
            newPage: jest.fn().mockResolvedValue(page),
            close: jest.fn().mockResolvedValue(true),
        });
    }

    test('still examines the well-formed sheets when one sheet has no qData', async () => {
        // Sorting runs before the per-sheet handling, so an unguarded read of
        // sheet.qData.rank in the comparator aborted the whole app before a single
        // sheet was looked at. The rank-less sheet now sorts last.
        setup([
            sheetItem('sheet-b', 2),
            { qInfo: { qId: 'broken' }, qMeta: { title: 'Broken', description: '' } },
            sheetItem('sheet-a', 1),
        ]);

        await qseowProcessApp('test-app-id', options);

        const examined = determineSheetExcludeStatus.mock.calls.map((call) => call[1].qInfo.qId);
        expect(examined).toEqual(['sheet-a', 'sheet-b', 'broken']);

        const logged = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
        expect(logged).not.toContain("reading 'rank'");
    });

    test('does not point sheets at images that failed to upload', async () => {
        // The upload used to swallow every failure and return normally, so the caller
        // went straight on to repoint every sheet at files that were never uploaded.
        // Sheets that had working icons ended up showing broken ones.
        setup([sheetItem('sheet-a', 1)]);
        qseowUploadToContentLibrary.mockRejectedValue(
            new Error('Failed to upload 1 of 1 thumbnail image(s)')
        );

        await expect(qseowProcessApp('test-app-id', options)).rejects.toThrow();

        expect(qseowUploadToContentLibrary).toHaveBeenCalledTimes(1);
        expect(qseowUpdateSheetThumbnails).not.toHaveBeenCalled();
    });
});

describe('qseow-process-app.js — a blurred thumbnail that cannot be created', () => {
    const options = {
        senseVersion: '2023-Nov',
        // Always present in real runs: Commander supplies both via option defaults. The launch
        // path treats their absence as a caller bug rather than silently picking a build.
        browser: 'chrome',
        browserVersion: 'recommended',
        imagedir: './img',
        host: 'test-server.example.com',
        logonuserdir: 'INTERNAL',
        logonuserid: 'sa_api',
        logonpwd: 'password',
        excludeSheetNumber: [],
        excludeSheetTitle: [],
        excludeSheetStatus: [],
        includesheetpart: '1',
        pagewait: 0,
        secure: true,
        prefix: '',
        headless: true,
        blurFactor: 5,
        loglevel: 'info',
    };

    /**
     * Wires the stack with one sheet and a Jimp that fails to write the blurred image.
     *
     * @returns {void}
     */
    function setupBlurFailure() {
        jest.clearAllMocks();

        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/test/browser',
            source: 'system',
            browser: 'chrome',
            buildId: 'system-installed',
        });
        determineSheetExcludeStatus.mockResolvedValue({
            excludeSheet: false,
            sheetIsHidden: false,
        });
        qseowUploadToContentLibrary.mockResolvedValue(true);
        qseowUpdateSheetThumbnails.mockResolvedValue(1);

        const mockGet = jest.fn().mockImplementation((encodedPath) => {
            // Match on the decoded filter, i.e. what QRS parses, rather than on the wire
            // encoding. Filters are URL-encoded before they leave, so matching the raw path
            // would tie these mocks to that encoding.
            const path = decodeURIComponent(encodedPath);
            if (path.includes('app?filter=id eq')) {
                return Promise.resolve({
                    body: [{ id: 'test-app-id', name: 'Test App', published: true }],
                });
            }
            return Promise.resolve({ body: [] });
        });
        qrsInteract.mockImplementation(() => ({ Get: mockGet }));

        const mockApp = {
            createSessionObject: jest.fn().mockResolvedValue({
                getLayout: jest.fn().mockResolvedValue({
                    qAppObjectList: {
                        qItems: [
                            {
                                qInfo: { qId: 'sheet-a' },
                                qMeta: {
                                    title: 'Sheet A',
                                    description: '',
                                    approved: false,
                                    published: false,
                                },
                                qData: { rank: 1, showCondition: null },
                            },
                        ],
                    },
                }),
            }),
            getObject: jest.fn().mockResolvedValue({ screenshot: jest.fn() }),
            evaluateEx: jest.fn().mockResolvedValue({ qIsNumeric: false, qNumber: 1 }),
        };
        enigma.create.mockResolvedValue({
            open: jest.fn().mockResolvedValue({
                engineVersion: jest.fn().mockResolvedValue({ qComponentVersion: '1.0.0' }),
                openDoc: jest.fn().mockResolvedValue(mockApp),
            }),
            close: jest.fn().mockResolvedValue(true),
            on: jest.fn(),
        });

        puppeteer.launch.mockResolvedValue({
            // launchBrowserForApp health checks the browser and watches for an unexpected
            // disconnect, so a browser-shaped mock has to answer both (issue #878).
            version: jest.fn().mockResolvedValue('Chrome/150.0.7871.24'),
            on: jest.fn(),
            newPage: jest.fn().mockResolvedValue({
                setViewport: jest.fn().mockResolvedValue(true),
                setDefaultTimeout: jest.fn().mockResolvedValue(true),
                goto: jest.fn().mockResolvedValue(true),
                waitForNavigation: jest.fn().mockResolvedValue(true),
                screenshot: jest.fn().mockResolvedValue(true),
                click: jest.fn().mockResolvedValue(true),
                keyboard: { type: jest.fn().mockResolvedValue(true) },
                waitForSelector: jest.fn().mockResolvedValue(true),
                $: jest.fn().mockResolvedValue({ screenshot: jest.fn().mockResolvedValue(true) }),
                $$: jest.fn().mockResolvedValue([{ click: jest.fn().mockResolvedValue(true) }]),
            }),
            close: jest.fn().mockResolvedValue(true),
        });
    }

    test('does not leave the unblurred screenshot behind for that sheet', async () => {
        // The blur decision is made later, from the CLI options alone, so leaving the
        // unblurred entry meant the sheet was repointed at a `-blurred.png` that was never
        // created - a broken icon. Falling back to the plain image is not an option either:
        // --blur-sheet-* is a redaction control.
        setupBlurFailure();
        Jimp.read.mockResolvedValue({
            blur: jest.fn().mockReturnThis(),
            write: jest.fn().mockRejectedValue(new Error('disk full')),
        });

        await expect(qseowProcessApp('test-app-id', options)).rejects.toThrow();

        const uploaded = qseowUploadToContentLibrary.mock.calls[0][0];
        expect(uploaded.filter((f) => f.sheetPos === 1)).toEqual([]);
    });

    test('reports the app as failed', async () => {
        setupBlurFailure();
        Jimp.read.mockResolvedValue({
            blur: jest.fn().mockReturnThis(),
            write: jest.fn().mockRejectedValue(new Error('disk full')),
        });

        await expect(qseowProcessApp('test-app-id', options)).rejects.toThrow(
            'Failed to create a blurred thumbnail for 1 sheet(s)'
        );
    });
});

describe('qseow-process-app.js — a QRS reply that is not a list', () => {
    // The three per-app lookups used to read `.body` straight off the qrs-interact result. A
    // reply that parsed as JSON but was not an array then flowed on: the sheet-id map blew up as
    // `TypeError: ... .forEach is not a function`, the app-metadata read reported
    // `App name: "undefined"` and carried on, and the tag lookup reported a fabricated sheet
    // count. Reading through qrsGetList makes the response itself the reported problem.
    //
    // Only the 200-with-wrong-shape case is reachable: qrs-interact rejects every other status,
    // and its unguarded JSON.parse throws on a non-JSON body before the promise resolves.
    const options = {
        senseVersion: '2023-Nov',
        browser: 'chrome',
        browserVersion: 'recommended',
        imagedir: './img',
        host: 'test-server.example.com',
        logonuserdir: 'INTERNAL',
        logonuserid: 'sa_api',
        logonpwd: 'password',
        excludeSheetNumber: [],
        excludeSheetTitle: [],
        excludeSheetStatus: [],
        includesheetpart: '1',
        pagewait: 0,
        secure: true,
        prefix: '',
        headless: true,
        blurFactor: 5,
        loglevel: 'info',
    };

    const APP_METADATA = [{ id: 'test-app-id', name: 'Test App', published: true }];
    const SHEET_ROWS = [{ id: 'sheet-id-1', engineObjectId: 'engine-sheet-id-1' }];

    /**
     * Wires the mock stack with one QRS lookup answering a caller-supplied body.
     *
     * Everything is re-established here rather than shared with the blocks above, because this
     * file does not reset between describes and earlier tests leave mocks in a failure state.
     *
     * @param {'appMetadata'|'tagLookup'|'sheetMap'} target - Which lookup should misbehave.
     * @param {object|Array<object>|string|number|null} body - The body that lookup should answer
     *     with. Anything but an array is what the assertions are about.
     *
     * @returns {void}
     */
    function wireBadBody(target, body) {
        jest.clearAllMocks();

        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/test/browser',
            source: 'system',
            browser: 'chrome',
            buildId: 'system-installed',
        });
        qseowUploadToContentLibrary.mockResolvedValue(true);
        qseowUpdateSheetThumbnails.mockResolvedValue(1);

        const mockGet = jest.fn().mockImplementation((encodedPath) => {
            const path = decodeURIComponent(encodedPath);

            if (path.includes('app?filter=id eq')) {
                return Promise.resolve({
                    statusCode: 200,
                    body: target === 'appMetadata' ? body : APP_METADATA,
                });
            }
            if (path.includes('tags.name eq')) {
                return Promise.resolve({
                    statusCode: 200,
                    body: target === 'tagLookup' ? body : [],
                });
            }
            if (path.includes('app/object/full?filter=objectType eq')) {
                return Promise.resolve({
                    statusCode: 200,
                    body: target === 'sheetMap' ? body : SHEET_ROWS,
                });
            }
            return Promise.resolve({ statusCode: 200, body: [] });
        });

        qrsInteract.mockImplementation(() => ({ Get: mockGet }));
    }

    const badBodies = [
        ['an error object', { error: 'proxy failure' }],
        ['null', null],
        ['a quoted JSON string', 'Unauthorized'],
        ['a number', 42],
    ];

    describe.each(badBodies)('%s from the sheet-id map lookup', (_label, body) => {
        test('fails the app naming QRS, before any engine session or browser', async () => {
            wireBadBody('sheetMap', body);

            await expect(qseowProcessApp('test-app-id', options)).rejects.toThrow(
                /unusable response/
            );

            // The point of failing here rather than downstream: nothing has been spent yet.
            expect(enigma.create).not.toHaveBeenCalled();
            expect(puppeteer.launch).not.toHaveBeenCalled();
        });
    });

    test('names the endpoint that answered badly, not the symptom', async () => {
        wireBadBody('sheetMap', { error: 'proxy failure' });

        await expect(qseowProcessApp('test-app-id', options)).rejects.toThrow(
            /app%2Fobject%2Ffull|app\/object\/full/
        );
    });

    test('app metadata: fails instead of reporting the app name as undefined', async () => {
        // This was the genuine silent wrong answer. A quoted string made appMetadata[0] the
        // first character, so `.name` was undefined and the run continued to completion -
        // taking screenshots and repointing sheet icons for an app it could not describe.
        wireBadBody('appMetadata', 'Unauthorized');

        await expect(qseowProcessApp('test-app-id', options)).rejects.toThrow(/unusable response/);

        const infos = logger.info.mock.calls.map((call) => String(call[0])).join('\n');
        expect(infos).not.toContain('App name: "undefined"');
        expect(enigma.create).not.toHaveBeenCalled();
    });

    test('app metadata: an empty list names the app and --appid', async () => {
        wireBadBody('appMetadata', []);

        await expect(qseowProcessApp('test-app-id', options)).rejects.toThrow(
            /test-app-id[\s\S]*--appid/
        );

        expect(enigma.create).not.toHaveBeenCalled();
    });

    test('tag lookup: refuses to report a fabricated sheet count', async () => {
        // A quoted string has a .length, so the count line added to expose a mistyped tag
        // would have reported its character count as though that many sheets carried the tag.
        wireBadBody('tagLookup', 'Unauthorized');

        await expect(
            qseowProcessApp('test-app-id', { ...options, excludeSheetTag: ['exclude-me'] })
        ).rejects.toThrow(/unusable response/);

        const infos = logger.info.mock.calls.map((call) => String(call[0])).join('\n');
        expect(infos).not.toContain('Sheets carrying a tag named by');
    });
});
