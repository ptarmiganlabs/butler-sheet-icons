import { describe, test, expect, beforeAll, jest } from '@jest/globals';

// Mock every dependency of processCloudApp using the ESM-native
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

const mockCloudEnigma = jest.unstable_mockModule('../cloud-enigma.js', () => ({
    setupEnigmaConnection: jest.fn().mockReturnValue({ url: 'wss://test' }),
}));

const mockCloudUpload = jest.unstable_mockModule('../cloud-upload.js', () => ({
    qscloudUploadToApp: jest.fn().mockResolvedValue(true),
}));

const mockCloudUpdateSheets = jest.unstable_mockModule('../cloud-updatesheets.js', () => ({
    qscloudUpdateSheetThumbnails: jest.fn().mockResolvedValue(true),
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

const mockCloudDeleteThumbnails = jest.unstable_mockModule('../cloud-delete-thumbnails.js', () => ({
    deleteCloudAppThumbnail: jest.fn().mockResolvedValue(true),
}));

const mockSheetScreenshot = jest.unstable_mockModule('../sheet-screenshot.js', () => ({
    takeSheetScreenshot: jest.fn().mockResolvedValue(true),
}));

let processCloudApp;
let puppeteer;
let enigma;
let logger;
let browserInstall;
let detectAvailableBrowser;
let takeSheetScreenshot;
let qscloudUploadToApp;
let qscloudUpdateSheetThumbnails;

beforeAll(async () => {
    await Promise.all([
        mockPuppeteerCore,
        mockPuppeteerBrowsers,
        mockEnigma,
        mockFs,
        mockJimp,
        mockGlobals,
        mockCloudEnigma,
        mockCloudUpload,
        mockCloudUpdateSheets,
        mockBrowserInstall,
        mockBrowserDetect,
        mockCloudDeleteThumbnails,
        mockSheetScreenshot,
    ]);

    puppeteer = (await import('puppeteer-core')).default;
    enigma = (await import('enigma.js')).default;
    ({ logger } = await import('../../../globals.js'));
    ({ browserInstall } = await import('../../browser/browser-install.js'));
    ({ detectAvailableBrowser } = await import('../../browser/browser-detect.js'));
    ({ takeSheetScreenshot } = await import('../sheet-screenshot.js'));
    ({ qscloudUploadToApp } = await import('../cloud-upload.js'));
    ({ qscloudUpdateSheetThumbnails } = await import('../cloud-updatesheets.js'));
    ({ processCloudApp } = await import('../process-cloud-app.js'));
});

describe('process-cloud-app.js — puppeteer launch and click options', () => {
    const defaultOptions = {
        tenanturl: 'test-tenant.eu.qlikcloud.com',
        apikey: 'test-api-key',
        imagedir: './img',
        logonuserid: 'test-user',
        logonpwd: 'password',
        collectionid: '',
        appid: 'test-app-id',
        includesheetpart: '1',
        schemaversion: '12.612.0',
        browser: 'chrome',
        browserVersion: 'latest',
        headless: true,
        pagewait: 0,
        loglevel: 'info',
        excludeSheetStatus: ['private'],
        excludeSheetNumber: [],
        excludeSheetTitle: [],
    };

    const defaultSaasInstance = {
        Get: jest.fn(),
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
     * @returns {object} Mock page exposing every method invoked by processCloudApp.
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
     * inspect call arguments after `processCloudApp` has run.
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
     * Wire the SaaS `Get` mock to return canned responses for the two endpoints
     * `processCloudApp` calls: media list (no thumbnails) and app metadata.
     *
     * @returns {void}
     */
    function wireSaasGet() {
        defaultSaasInstance.Get.mockImplementation((path) => {
            if (path.includes('media/list') && !path.includes('thumbnails')) {
                return Promise.resolve([]);
            }
            if (path.includes('apps/test-app-id') && !path.includes('media')) {
                return Promise.resolve({
                    attributes: { name: 'Test App', published: true, publishTime: null },
                });
            }
            return Promise.resolve({});
        });
    }

    /**
     * Wire the Enigma.js mocks (session → global → app → generic list) so that
     * `processCloudApp` traverses the sheet-listing path successfully.
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
     * Wire SaaS, Enigma, and puppeteer.launch with a single mock browser that
     * exposes its underlying page on `_page` for inspection.
     *
     * @returns {object} The mock browser returned by `puppeteer.launch`.
     */
    function setupHappyPath() {
        wireSaasGet();
        wireEnigmaSession();
        const browser = buildMockBrowser();
        puppeteer.launch.mockResolvedValue(browser);
        return browser;
    }

    test('launches puppeteer with v25-compatible options (headless: true, no acceptInsecureCerts)', async () => {
        setupHappyPath();

        await processCloudApp('test-app-id', defaultSaasInstance, defaultOptions);

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

        await processCloudApp('test-app-id', defaultSaasInstance, defaultOptions);

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

        await processCloudApp('test-app-id', defaultSaasInstance, defaultOptions);

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

        // processCloudApp logs in detail and then rethrows, so the app loop above it can
        // count this app as failed. Isolation between apps is the loop's job, not this
        // function's - it used to swallow here, and the run reported success.
        await expect(
            processCloudApp('test-app-id', defaultSaasInstance, defaultOptions)
        ).rejects.toThrow();

        const logged = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
        expect(logged).toContain(
            'Failed to install a browser for Qlik Sense Cloud app test-app-id'
        );
        expect(puppeteer.launch).not.toHaveBeenCalled();
    });
});

describe('process-cloud-app.js — a sheet with no metadata does not abort the app', () => {
    const options = {
        tenanturl: 'test-tenant.eu.qlikcloud.com',
        apikey: 'test-api-key',
        imagedir: './img',
        logonuserid: 'test-user',
        logonpwd: 'password',
        appid: 'test-app-id',
        includesheetpart: '1',
        schemaversion: '12.612.0',
        browser: 'chrome',
        browserVersion: 'latest',
        headless: true,
        pagewait: 0,
        loglevel: 'info',
        excludeSheetStatus: [],
        excludeSheetNumber: [],
        excludeSheetTitle: [],
    };

    /**
     * Builds a well-formed sheet as the engine's `SheetList` returns it.
     *
     * @param {string} id - Engine object id for the sheet.
     * @param {number} rank - Sheet rank.
     *
     * @returns {object} A sheet object with complete metadata.
     */
    const goodSheet = (id, rank) => ({
        qInfo: { qId: id },
        qMeta: { title: id, description: '', approved: false, published: false },
        qData: { rank, showCondition: null },
    });

    /**
     * Wires the full mock stack, with a caller-supplied sheet list.
     *
     * The whole stack is re-established here rather than shared with the describe block
     * above, because that block's last test leaves `detectAvailableBrowser` and
     * `browserInstall` in a failure state and this file does not reset between tests.
     *
     * @param {Array<object>} qItems - Sheets to return from the SheetList session object.
     *
     * @returns {object} The mock SaaS instance to pass to `processCloudApp`.
     */
    function setup(qItems) {
        jest.clearAllMocks();

        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/test/browser',
            source: 'system',
            browser: 'chrome',
            buildId: 'system-installed',
        });
        takeSheetScreenshot.mockResolvedValue(true);
        qscloudUploadToApp.mockResolvedValue(true);
        qscloudUpdateSheetThumbnails.mockResolvedValue(true);

        const mockApp = {
            createSessionObject: jest.fn().mockResolvedValue({
                getLayout: jest.fn().mockResolvedValue({ qAppObjectList: { qItems } }),
            }),
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
        };
        puppeteer.launch.mockResolvedValue({
            newPage: jest.fn().mockResolvedValue(page),
            close: jest.fn().mockResolvedValue(true),
        });

        const saasInstance = { Get: jest.fn() };
        saasInstance.Get.mockImplementation((path) => {
            if (path.includes('media/list')) return Promise.resolve([]);
            return Promise.resolve({
                attributes: { name: 'Test App', published: false, publishTime: null },
            });
        });
        return saasInstance;
    }

    test('sorts the rank-less sheet last instead of throwing from the comparator', async () => {
        // Sorting happens before any per-sheet handling, so an unguarded read of
        // sheet.qData.rank inside the comparator aborted the app before a single
        // screenshot was taken.
        const saasInstance = setup([
            goodSheet('sheet-b', 2),
            { qInfo: { qId: 'broken' }, qMeta: { title: 'Broken' } },
            goodSheet('sheet-a', 1),
        ]);

        await processCloudApp('test-app-id', saasInstance, options);

        // The rank-less sheet sorts last but is still a real sheet, with an id and a
        // title, so it is processed like any other once the comparator stops throwing.
        const screenshotted = takeSheetScreenshot.mock.calls.map((call) => call[4].qInfo.qId);
        expect(screenshotted).toEqual(['sheet-a', 'sheet-b', 'broken']);

        const logged = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
        expect(logged).not.toContain("reading 'rank'");
    });

    test('finishes the app, uploading the thumbnails it managed to create', async () => {
        // Getting past the sort is not enough on its own: the show-condition read a few
        // lines further down was unguarded too, so the app still died before the upload
        // and every screenshot taken was discarded.
        const saasInstance = setup([
            goodSheet('sheet-a', 1),
            { qInfo: { qId: 'broken' }, qMeta: { title: 'Broken' } },
        ]);

        await processCloudApp('test-app-id', saasInstance, options);

        expect(qscloudUploadToApp).toHaveBeenCalledTimes(1);

        const logged = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
        expect(logged).not.toContain("reading 'showCondition'");
    });
});

describe('process-cloud-app.js — a failed upload must not update the sheets', () => {
    /**
     * Wires just enough of the stack to reach the upload step with one sheet.
     *
     * @returns {object} The mock SaaS instance to pass to `processCloudApp`.
     */
    function setupToUploadStep() {
        jest.clearAllMocks();

        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/test/browser',
            source: 'system',
            browser: 'chrome',
            buildId: 'system-installed',
        });
        takeSheetScreenshot.mockResolvedValue(true);
        qscloudUpdateSheetThumbnails.mockResolvedValue(true);

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
            newPage: jest.fn().mockResolvedValue({
                setViewport: jest.fn().mockResolvedValue(true),
                setDefaultTimeout: jest.fn().mockResolvedValue(true),
                goto: jest.fn().mockResolvedValue(true),
                waitForNavigation: jest.fn().mockResolvedValue(true),
                screenshot: jest.fn().mockResolvedValue(true),
                click: jest.fn().mockResolvedValue(true),
                keyboard: { type: jest.fn().mockResolvedValue(true) },
            }),
            close: jest.fn().mockResolvedValue(true),
        });

        const saasInstance = { Get: jest.fn() };
        saasInstance.Get.mockImplementation((p) => {
            if (p.includes('media/list')) return Promise.resolve([]);
            return Promise.resolve({
                attributes: { name: 'Test App', published: false, publishTime: null },
            });
        });
        return saasInstance;
    }

    test('does not point sheets at images that failed to upload', async () => {
        // The upload used to swallow every failure and return normally, so the caller
        // went straight on to repoint every sheet at files that were never uploaded.
        // Sheets that had working icons ended up showing broken ones.
        const saasInstance = setupToUploadStep();
        qscloudUploadToApp.mockRejectedValue(new Error('Failed to upload 1 of 1 image(s)'));

        await expect(
            processCloudApp('test-app-id', saasInstance, {
                tenanturl: 'test-tenant.eu.qlikcloud.com',
                apikey: 'test-api-key',
                imagedir: './img',
                logonuserid: 'test-user',
                logonpwd: 'password',
                appid: 'test-app-id',
                includesheetpart: '1',
                schemaversion: '12.612.0',
                browser: 'chrome',
                browserVersion: 'latest',
                headless: true,
                pagewait: 0,
                loglevel: 'info',
                excludeSheetStatus: [],
                excludeSheetNumber: [],
                excludeSheetTitle: [],
            })
        ).rejects.toThrow('Failed to upload 1 of 1 image(s)');

        expect(qscloudUploadToApp).toHaveBeenCalledTimes(1);
        expect(qscloudUpdateSheetThumbnails).not.toHaveBeenCalled();
    });
});
