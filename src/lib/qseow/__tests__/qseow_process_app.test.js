import { describe, test, expect, beforeAll, jest } from '@jest/globals';

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
    ({ qseowUploadToContentLibrary } = await import('../qseow-upload.js'));
    ({ qseowUpdateSheetThumbnails } = await import('../qseow-updatesheets.js'));
    ({ qseowProcessApp } = await import('../qseow-process-app.js'));
});

describe('qseow-process-app.js — puppeteer launch and click options', () => {
    const defaultOptions = {
        senseVersion: '2023-Nov',
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
        mockGet.mockImplementation((path) => {
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

        // qseowProcessApp catches and logs rather than rethrowing, so callers can continue
        // to the next app. Assert it resolves; `rejects.toThrow` would fail here.
        await qseowProcessApp('test-app-id', defaultOptions);

        const logged = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
        expect(logged).toContain('Failed to install a browser for QSEoW app test-app-id');
        expect(puppeteer.launch).not.toHaveBeenCalled();
    });
});

describe('qseow-process-app.js — a sheet with no metadata does not abort the app', () => {
    const options = {
        senseVersion: '2023-Nov',
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

        const mockGet = jest.fn().mockImplementation((path) => {
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

        await qseowProcessApp('test-app-id', options);

        expect(qseowUploadToContentLibrary).toHaveBeenCalledTimes(1);
        expect(qseowUpdateSheetThumbnails).not.toHaveBeenCalled();
    });
});
