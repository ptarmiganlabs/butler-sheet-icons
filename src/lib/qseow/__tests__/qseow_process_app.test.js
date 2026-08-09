import { describe, test, expect, beforeAll, beforeEach, jest } from '@jest/globals';

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
    },
    mkdirSync: jest.fn(),
    existsSync: jest.fn().mockReturnValue(false),
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
}));

const mockQseowEnigma = jest.unstable_mockModule('../qseow-enigma.js', () => ({
    setupEnigmaConnection: jest.fn().mockReturnValue({ url: 'wss://test' }),
}));

const mockQseowUpload = jest.unstable_mockModule('../qseow-upload.js', () => ({
    qseowUploadToContentLibrary: jest.fn().mockResolvedValue(true),
}));

const mockQseowUpdateSheets = jest.unstable_mockModule('../qseow-updatesheets.js', () => ({
    qseowUpdateSheetThumbnails: jest.fn().mockResolvedValue(true),
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

let qseowProcessApp;
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
    ({ qseowProcessApp } = await import('../qseow-process-app.js'));
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

    test('launches puppeteer with v25-compatible options (headless: true, no acceptInsecureCerts)', async () => {
        setupHappyPath();

        await qseowProcessApp('test-app-id', defaultOptions);

        expect(puppeteer.launch).toHaveBeenCalledTimes(1);
        expect(puppeteer.launch).toHaveBeenCalledWith(
            expect.objectContaining({
                executablePath: '/test/browser',
                headless: true,
                ignoreHTTPSErrors: true,
            })
        );
        expect(puppeteer.launch).not.toHaveBeenCalledWith(
            expect.objectContaining({ acceptInsecureCerts: expect.anything() })
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
        expect(logged).toContain('Failed to install a browser for QSEoW app test-app-id');
        expect(puppeteer.launch).not.toHaveBeenCalled();
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
            qseowUpdateSheetThumbnails.mockResolvedValue(true);
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
        qseowUpdateSheetThumbnails.mockResolvedValue(true);

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
        qseowUpdateSheetThumbnails.mockResolvedValue(true);

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
