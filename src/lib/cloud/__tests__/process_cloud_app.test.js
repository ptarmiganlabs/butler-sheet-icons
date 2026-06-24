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
let computeExecutablePath;
let fs;
let Jimp;
let enigma;
let logger;
let sleep;
let setupEnigmaConnection;
let qscloudUploadToApp;
let qscloudUpdateSheetThumbnails;
let browserInstall;
let detectAvailableBrowser;
let deleteCloudAppThumbnail;
let takeSheetScreenshot;

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
    ({ computeExecutablePath } = await import('@puppeteer/browsers'));
    fs = (await import('fs')).default;
    ({ Jimp } = await import('jimp'));
    enigma = (await import('enigma.js')).default;
    ({ logger, sleep } = await import('../../../globals.js'));
    ({ setupEnigmaConnection } = await import('../cloud-enigma.js'));
    ({ qscloudUploadToApp } = await import('../cloud-upload.js'));
    ({ qscloudUpdateSheetThumbnails } = await import('../cloud-updatesheets.js'));
    ({ browserInstall } = await import('../../browser/browser-install.js'));
    ({ detectAvailableBrowser } = await import('../../browser/browser-detect.js'));
    ({ deleteCloudAppThumbnail } = await import('../cloud-delete-thumbnails.js'));
    ({ takeSheetScreenshot } = await import('../sheet-screenshot.js'));
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
});
