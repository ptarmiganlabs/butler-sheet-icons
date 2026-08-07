import { describe, test, expect, beforeEach, jest, beforeAll } from '@jest/globals';
import { Command, InvalidArgumentError } from 'commander';

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

const mockBrowserInstallPromise = jest.unstable_mockModule(
    '../../browser/browser-install.js',
    () => ({
        browserInstall: jest.fn().mockResolvedValue({ browser: 'chrome', buildId: '123.0.456.78' }),
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
let browserInstall;
let browserUninstall;
let browserUninstallAll;
let browserListAvailable;
let parsePositiveInteger;
let collectPositiveIntegers;
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
        mockBrowserInstallPromise,
        mockBrowserUninstallPromise,
        mockBrowserListAvailablePromise,
    ]);
    ({ logger } = await import('../../../globals.js'));
    ({ qseowCreateThumbnails } = await import('../../qseow/qseow-create-thumbnails.js'));
    ({ qscloudCreateThumbnails } = await import('../../cloud/cloud-create-thumbnails.js'));
    ({ qscloudListCollections } = await import('../../cloud/cloud-collections.js'));
    ({ qscloudRemoveSheetIcons } = await import('../../cloud/cloud-remove-sheet-icons.js'));
    ({ browserInstalled } = await import('../../browser/browser-installed.js'));
    ({ browserInstall } = await import('../../browser/browser-install.js'));
    ({ browserUninstall, browserUninstallAll } =
        await import('../../browser/browser-uninstall.js'));
    ({ browserListAvailable } = await import('../../browser/browser-list-available.js'));
    ({ parsePositiveInteger, collectPositiveIntegers } = await import('../helpers.js'));
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

describe('collectPositiveIntegers', () => {
    test('accumulates onto the previous value instead of replacing it', () => {
        const parser = collectPositiveIntegers();
        expect(parser('1')).toEqual(['1']);
        expect(parser('2', ['1'])).toEqual(['1', '2']);
        expect(parser('12', ['1', '2'])).toEqual(['1', '2', '12']);
    });

    test('does not mutate the accumulator it is given', () => {
        const previous = ['1'];
        collectPositiveIntegers()('2', previous);
        expect(previous).toEqual(['1']);
    });

    test('validates each value with the configured message', () => {
        const parser = collectPositiveIntegers({ errorMessage: 'nope' });
        expect(() => parser('abc')).toThrow(InvalidArgumentError);
        expect(() => parser('abc')).toThrow('nope');
    });
});

/**
 * Drives a single real `Option` instance, taken from a real command builder, through
 * Commander. A bare parent `Command` is used so no action handler fires - the point is
 * to observe exactly what Commander stores for that option, with the option's real
 * variadic declaration and real `argParser` in place.
 *
 * @param {import('commander').Command} command - Command owning the option.
 * @param {string} flag - Long flag to exercise, e.g. `'--exclude-sheet-number'`.
 * @param {string[]} argv - Argument words to parse, excluding the flag itself.
 *
 * @returns {object} The parsed options object.
 */
const parseOptionInIsolation = (command, flag, argv) => {
    const option = command.options.find((opt) => opt.long === flag);
    if (!option) {
        throw new Error(`Option ${flag} not found on command ${command.name()}`);
    }
    const parent = new Command();
    parent.exitOverride();
    parent.addOption(option);
    parent.parse(['node', 'test', flag, ...argv]);
    return parent.opts();
};

describe('variadic sheet-number options collect into arrays', () => {
    // A variadic option that also has an argParser takes Commander's parser branch, not
    // its array-collecting branch. A parser ignoring the accumulator leaves the option a
    // bare string - and the consumers all use `.includes()`, which on a string means
    // substring matching. `--exclude-sheet-number 12` then also excludes sheets 1 and 2.
    const cases = [
        ['qseow', () => buildQseowCommand(), 'excludeSheetNumber', '--exclude-sheet-number'],
        ['qseow', () => buildQseowCommand(), 'blurSheetNumber', '--blur-sheet-number'],
        ['qscloud', () => buildQscloudCommand(), 'excludeSheetNumber', '--exclude-sheet-number'],
        ['qscloud', () => buildQscloudCommand(), 'blurSheetNumber', '--blur-sheet-number'],
    ];

    describe.each(cases)('%s %s', (platform, build, optionKey, flag) => {
        /**
         * Resolves the `create-sheet-thumbnails` subcommand for the platform under test.
         *
         * @returns {import('commander').Command} The subcommand carrying the sheet-number options.
         */
        const subcommand = () =>
            build().commands.find((cmd) => cmd.name() === 'create-sheet-thumbnails');

        test('keeps every value when several are supplied', () => {
            const opts = parseOptionInIsolation(subcommand(), flag, ['1', '2', '12']);
            expect(opts[optionKey]).toEqual(['1', '2', '12']);
        });

        test('yields a one-element array for a single value', () => {
            const opts = parseOptionInIsolation(subcommand(), flag, ['12']);
            expect(opts[optionKey]).toEqual(['12']);
        });

        test('does not substring-match other sheet numbers', () => {
            const opts = parseOptionInIsolation(subcommand(), flag, ['12']);
            // The regression this guards: as the string '12' both of these were true.
            expect(opts[optionKey].includes('1')).toBe(false);
            expect(opts[optionKey].includes('2')).toBe(false);
            expect(opts[optionKey].includes('12')).toBe(true);
        });

        test('still rejects a non-integer value', () => {
            expect(() => parseOptionInIsolation(subcommand(), flag, ['abc'])).toThrow(
                /must be a non-negative integer/i
            );
        });
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
        /**
         * Stub of a Commander command whose `name()` always returns `'qseow'`.
         *
         * @returns {string} The constant `'qseow'`.
         */
        const nameFn = () => 'qseow';
        const command = { name: nameFn };

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

        // The handler used to log the same failure three times, prefixed "BROWSER MAIN 10",
        // including a full stack trace. browserListAvailable has already explained the cause by
        // this point, so the handler now adds one line and puts the stack at debug (issue #785).
        const errors = logger.error.mock.calls.map((call) => String(call[0]));
        expect(errors).toContain('Could not list available browsers.');
        expect(errors.join('\n')).not.toContain('BROWSER MAIN 10');
        expect(errors.join('\n')).not.toContain('at ');
    });

    test('install delegates to browserInstall after normalizing chrome defaults', async () => {
        const chromeOptions = { browser: 'chrome', browserVersion: '' };

        await handleBrowserInstall(chromeOptions, {});

        // Verify normalization happened
        expect(chromeOptions.browserVersion).toBe('stable');
        // Verify delegation to worker function
        expect(browserInstall).toHaveBeenCalledWith(chromeOptions, {});
    });

    test('install delegates to browserInstall after normalizing firefox defaults', async () => {
        const firefoxOptions = { browser: 'firefox', browserVersion: '' };

        await handleBrowserInstall(firefoxOptions, {});

        expect(firefoxOptions.browserVersion).toBe('latest');
        expect(browserInstall).toHaveBeenCalledWith(firefoxOptions, {});
    });

    test('install passes through explicit browser versions without modification', async () => {
        const options = { browser: 'chrome', browserVersion: '114.0.5735.133' };

        await handleBrowserInstall(options, {});

        expect(options.browserVersion).toBe('114.0.5735.133');
        expect(browserInstall).toHaveBeenCalledWith(options, {});
    });

    test('install logs errors from browserInstall', async () => {
        browserInstall.mockRejectedValueOnce(new Error('installation failed'));

        await handleBrowserInstall({ browser: 'chrome', browserVersion: 'stable' }, {});

        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('BROWSER MAIN 9'));
    });

    test('install handles null options gracefully', async () => {
        await expect(handleBrowserInstall(null)).resolves.toBeUndefined();
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('BROWSER MAIN 9'));
    });

    test('install delegates with command parameter', async () => {
        const options = { browser: 'firefox', browserVersion: 'latest', loglevel: 'debug' };
        /**
         * Stub of a Commander command whose `name()` always returns `'browser'`.
         *
         * @returns {string} The constant `'browser'`.
         */
        const nameFn = () => 'browser';
        const command = { name: nameFn };

        await handleBrowserInstall(options, command);

        expect(browserInstall).toHaveBeenCalledWith(options, command);
    });
});
