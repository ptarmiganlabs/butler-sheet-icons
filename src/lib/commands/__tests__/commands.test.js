import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { InvalidArgumentError } from 'commander';

const loggerMock = {
    info: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
};

const mockGlobalsPromise = jest.unstable_mockModule('../../../globals.js', () => ({
    logger: loggerMock,
    appVersion: 'test-version',
}));

const mockQseowPromise = jest.unstable_mockModule('../../qseow/qseow-create-thumbnails.js', () => ({
    qseowCreateThumbnails: jest.fn().mockResolvedValue(true),
}));

const mockQscloudCreatePromise = jest.unstable_mockModule(
    '../../cloud/cloud-create-thumbnails.js',
    () => ({
        qscloudCreateThumbnails: jest.fn().mockResolvedValue(true),
    })
);

const mockQscloudCollectionsPromise = jest.unstable_mockModule(
    '../../cloud/cloud-collections.js',
    () => ({
        qscloudListCollections: jest.fn().mockResolvedValue(true),
    })
);

const mockQscloudRemovePromise = jest.unstable_mockModule(
    '../../cloud/cloud-remove-sheet-icons.js',
    () => ({
        qscloudRemoveSheetIcons: jest.fn().mockResolvedValue(true),
    })
);

const mockBrowserInstalledPromise = jest.unstable_mockModule(
    '../../browser/browser-installed.js',
    () => ({
        browserInstalled: jest.fn().mockResolvedValue([]),
    })
);

const mockBrowserUninstallPromise = jest.unstable_mockModule(
    '../../browser/browser-uninstall.js',
    () => ({
        browserUninstall: jest.fn().mockResolvedValue(true),
        browserUninstallAll: jest.fn().mockResolvedValue(true),
    })
);

const mockBrowserListAvailablePromise = jest.unstable_mockModule(
    '../../browser/browser-list-available.js',
    () => ({
        browserListAvailable: jest
            .fn()
            .mockResolvedValue([{ browser: 'chrome', version: 'latest' }]),
    })
);

let logger;
let qseowCreateThumbnails;
let qscloudCreateThumbnails;
let qscloudListCollections;
let qscloudRemoveSheetIcons;
let browserInstalled;
let browserUninstall;
let browserUninstallAll;
let browserListAvailable;
let parsePositiveInteger;
let buildQseowCommand;
let handleQseowCreateSheetThumbnails;
let handleCloudCreateSheetThumbnails;
let handleCloudListCollections;
let handleCloudRemoveSheetIcons;
let buildQscloudCommand;
let buildBrowserCommand;
let handleBrowserListInstalled;
let handleBrowserUninstall;
let handleBrowserUninstallAll;
let handleBrowserInstall;
let handleBrowserListAvailable;

beforeAll(async () => {
    await Promise.all([
        mockGlobalsPromise,
        mockQseowPromise,
        mockQscloudCreatePromise,
        mockQscloudCollectionsPromise,
        mockQscloudRemovePromise,
        mockBrowserInstalledPromise,
        mockBrowserUninstallPromise,
        mockBrowserListAvailablePromise,
    ]);
    ({ logger } = await import('../../../globals.js'));
    ({ qseowCreateThumbnails } = await import('../../qseow/qseow-create-thumbnails.js'));
    ({ qscloudCreateThumbnails } = await import('../../cloud/cloud-create-thumbnails.js'));
    ({ qscloudListCollections } = await import('../../cloud/cloud-collections.js'));
    ({ qscloudRemoveSheetIcons } = await import('../../cloud/cloud-remove-sheet-icons.js'));
    ({ browserInstalled } = await import('../../browser/browser-installed.js'));
    ({ browserUninstall, browserUninstallAll } = await import(
        '../../browser/browser-uninstall.js'
    ));
    ({ browserListAvailable } = await import('../../browser/browser-list-available.js'));
    ({ parsePositiveInteger } = await import('../helpers.js'));
    ({ buildQseowCommand, handleQseowCreateSheetThumbnails } = await import('../qseow/index.js'));
    ({ handleCloudCreateSheetThumbnails } = await import('../qscloud/create-sheet-thumbnails.js'));
    ({ handleCloudListCollections } = await import('../qscloud/list-collections.js'));
    ({ handleCloudRemoveSheetIcons } = await import('../qscloud/remove-sheet-icons.js'));
    ({ buildQscloudCommand } = await import('../qscloud/index.js'));
    ({ buildBrowserCommand } = await import('../browser/index.js'));
    ({ handleBrowserListInstalled } = await import('../browser/list-installed.js'));
    ({ handleBrowserUninstall } = await import('../browser/uninstall.js'));
    ({ handleBrowserUninstallAll } = await import('../browser/uninstall-all.js'));
    ({ handleBrowserInstall } = await import('../browser/install.js'));
    ({ handleBrowserListAvailable } = await import('../browser/list-available.js'));
});

describe('parsePositiveInteger', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('returns trimmed string by default', () => {
        expect(parsePositiveInteger(' 42 ')).toBe('42');
    });

    test('returns numeric value when requested', () => {
        expect(parsePositiveInteger('07', { returnNumber: true, min: 0, max: 10 })).toBe(7);
    });

    test('throws for non-digit input', () => {
        expect(() => parsePositiveInteger('abc')).toThrow(InvalidArgumentError);
    });

    test('enforces configured boundaries', () => {
        expect(() => parsePositiveInteger('1', { min: 2 })).toThrow(InvalidArgumentError);
        expect(() => parsePositiveInteger('10', { max: 5 })).toThrow(InvalidArgumentError);
    });
});

describe('qseow command', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        qseowCreateThumbnails.mockResolvedValue(true);
    });

    test('registers create-sheet-thumbnails subcommand', () => {
        const qseow = buildQseowCommand();
        expect(qseow.name()).toBe('qseow');
        expect(qseow.commands.map((cmd) => cmd.name())).toContain('create-sheet-thumbnails');
    });

    test('invokes qseowCreateThumbnails with normalized browser version', async () => {
        const options = { browser: 'chrome', browserVersion: '', appid: 'abc' };
        const command = { name: () => 'qseow' };

        await handleQseowCreateSheetThumbnails(options, command);

        expect(qseowCreateThumbnails).toHaveBeenCalledWith(
            expect.objectContaining({ browserVersion: 'latest', appid: 'abc' }),
            command
        );
    });

    test('logs errors from qseowCreateThumbnails', async () => {
        qseowCreateThumbnails.mockRejectedValueOnce(new Error('boom'));

        await handleQseowCreateSheetThumbnails({ browser: 'chrome', browserVersion: '1' }, {});

        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('QSEOW MAIN 1'));
    });
});

describe('qscloud commands', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        qscloudCreateThumbnails.mockResolvedValue(true);
        qscloudListCollections.mockResolvedValue(true);
        qscloudRemoveSheetIcons.mockResolvedValue(true);
    });

    test('buildQscloudCommand wires expected subcommands', () => {
        const cloud = buildQscloudCommand();
        expect(cloud.commands.map((cmd) => cmd.name())).toEqual(
            expect.arrayContaining([
                'create-sheet-thumbnails',
                'list-collections',
                'remove-sheet-icons',
            ])
        );
    });

    test('create-sheet-thumbnails defaults browser version when missing', async () => {
        const options = {
            browser: 'firefox',
            browserVersion: '',
            tenanturl: 'https://tenant',
            apikey: 'key',
        };

        await handleCloudCreateSheetThumbnails(options, {});

        expect(qscloudCreateThumbnails).toHaveBeenCalledWith(
            expect.objectContaining({ browserVersion: 'latest', tenanturl: 'https://tenant' }),
            {}
        );
    });

    test('create-sheet-thumbnails logs errors from worker', async () => {
        qscloudCreateThumbnails.mockRejectedValueOnce(new Error('nope'));

        await handleCloudCreateSheetThumbnails(
            { browser: 'chrome', browserVersion: '1', tenanturl: 't', apikey: 'a' },
            {}
        );

        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('CLOUD MAIN 3'));
    });

    test('list-collections forwards options', async () => {
        const options = { tenanturl: 'https://tenant', apikey: 'abc', outputformat: 'json' };

        await handleCloudListCollections(options, {});

        expect(qscloudListCollections).toHaveBeenCalledWith(options, {});
    });

    test('remove-sheet-icons forwards options', async () => {
        const options = { tenanturl: 'https://tenant', apikey: 'abc', appid: '123' };

        await handleCloudRemoveSheetIcons(options, {});

        expect(qscloudRemoveSheetIcons).toHaveBeenCalledWith(options, {});
    });
});

describe('browser commands', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('buildBrowserCommand registers expected subcommands', () => {
        const browser = buildBrowserCommand();
        expect(browser.commands.map((cmd) => cmd.name())).toEqual(
            expect.arrayContaining([
                'list-installed',
                'uninstall',
                'uninstall-all',
                'install',
                'list-available',
            ])
        );
    });

    test('list-installed delegates to browserInstalled', async () => {
        const options = { loglevel: 'debug' };

        await handleBrowserListInstalled(options, {});

        expect(browserInstalled).toHaveBeenCalledWith(options, {});
    });

    test('uninstall delegates to browserUninstall', async () => {
        const options = { browser: 'chrome', browserVersion: '123' };

        await handleBrowserUninstall(options, {});

        expect(browserUninstall).toHaveBeenCalledWith(options, {});
    });

    test('uninstall-all delegates to browserUninstallAll', async () => {
        const options = { loglevel: 'info' };

        await handleBrowserUninstallAll(options, {});

        expect(browserUninstallAll).toHaveBeenCalledWith(options, {});
    });

    test('list-available delegates to browserListAvailable and logs errors', async () => {
        const options = { browser: 'chrome', channel: 'stable' };

        await handleBrowserListAvailable(options, {});
        expect(browserListAvailable).toHaveBeenCalledWith(options, {});

        browserListAvailable.mockRejectedValueOnce(new Error('bad'));
        await handleBrowserListAvailable(options, {});
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('BROWSER MAIN 10'));
    });

    test('install normalizes chrome and firefox defaults', async () => {
        const chromeOptions = { browser: 'chrome', browserVersion: '' };
        const firefoxOptions = { browser: 'firefox', browserVersion: '' };

        await handleBrowserInstall(chromeOptions);
        await handleBrowserInstall(firefoxOptions);

        expect(chromeOptions.browserVersion).toBe('stable');
        expect(firefoxOptions.browserVersion).toBe('latest');
    });

    test('install logs unexpected errors without throwing', async () => {
        await expect(handleBrowserInstall(null)).resolves.toBeUndefined();
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('BROWSER MAIN 9'));
    });
});
