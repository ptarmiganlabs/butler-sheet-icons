import { describe, test, expect, beforeEach, afterEach, jest, beforeAll } from '@jest/globals';
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
let buildBrowserInstallCommand;
let buildBrowserUninstallCommand;

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
    ({ handleBrowserUninstall, buildBrowserUninstallCommand } =
        await import('../browser/uninstall.js'));
    ({ handleBrowserUninstallAll } = await import('../browser/uninstall-all.js'));
    ({ handleBrowserInstall, buildBrowserInstallCommand } = await import('../browser/install.js'));
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

describe('--browser-version defaults (issue #878)', () => {
    /**
     * Resolves the `create-sheet-thumbnails` subcommand for a platform.
     *
     * @param {import('commander').Command} parent - Platform command, e.g. `qseow`.
     *
     * @returns {import('commander').Command} The thumbnail subcommand.
     */
    const thumbnailCommand = (parent) =>
        parent.commands.find((cmd) => cmd.name() === 'create-sheet-thumbnails');

    // Asserted against the declared Option rather than a handler, because that is where the
    // default actually lives. Butler Sheet Icons shipped with `.default('latest')` here and a
    // handler that tried to correct it but never could, and no test covered the value that a
    // real run would end up with - which is why the wrong default went unnoticed until every
    // app in every run started failing.
    const declarations = [
        ['browser install', () => buildBrowserInstallCommand()],
        ['qseow create-sheet-thumbnails', () => thumbnailCommand(buildQseowCommand())],
        ['qscloud create-sheet-thumbnails', () => thumbnailCommand(buildQscloudCommand())],
    ];

    test.each(declarations)('%s defaults to the recommended build', (_name, build) => {
        const option = build().options.find((opt) => opt.long === '--browser-version');

        expect(option.defaultValue).toBe('recommended');
    });

    test.each(declarations)('%s still accepts an explicit build id', (_name, build) => {
        const opts = parseOptionInIsolation(build(), '--browser-version', ['151.0.7922.77']);

        expect(opts.browserVersion).toBe('151.0.7922.77');
    });

    // `latest` used to be the default, so it is in existing scripts and scheduled jobs. It has
    // to keep parsing; browser-version.js is what re-points it at the stable channel.
    test.each(declarations)('%s still accepts the legacy "latest" value', (_name, build) => {
        const opts = parseOptionInIsolation(build(), '--browser-version', ['latest']);

        expect(opts.browserVersion).toBe('latest');
    });

    test('browser uninstall requires the build to be named, with no default', () => {
        const option = buildBrowserUninstallCommand().options.find(
            (opt) => opt.long === '--browser-version'
        );

        expect(option.defaultValue).toBeUndefined();
        expect(option.mandatory).toBe(true);
    });

    // Commander checks `envVar in process.env`, so a set-but-empty variable - a bare
    // `BSI_..._BROWSER_VERSION=` line in a systemd unit or docker-compose file - beats
    // `.default()`. On 3.11 the handler normalization absorbed exactly this input; without the
    // argParser it would reach the resolver as an empty string and fail the run (issue #878
    // review).
    const envVars = [
        ['browser install', () => buildBrowserInstallCommand(), 'BSI_BROWSER_I_BROWSER_VERSION'],
        [
            'qseow create-sheet-thumbnails',
            () => thumbnailCommand(buildQseowCommand()),
            'BSI_QSEOW_CST_BROWSER_VERSION',
        ],
        [
            'qscloud create-sheet-thumbnails',
            () => thumbnailCommand(buildQscloudCommand()),
            'BSI_QSCLOUD_CST_BROWSER_VERSION',
        ],
    ];

    test.each(envVars)('%s treats a set-but-empty env var as the default', (_n, build, envVar) => {
        const saved = process.env[envVar];
        process.env[envVar] = '';

        try {
            const option = build().options.find((opt) => opt.long === '--browser-version');
            const parent = new Command();
            parent.exitOverride();
            parent.addOption(option);
            parent.parse(['node', 'test']);

            expect(parent.opts().browserVersion).toBe('recommended');
        } finally {
            if (saved === undefined) {
                delete process.env[envVar];
            } else {
                process.env[envVar] = saved;
            }
        }
    });

    test.each(envVars)('%s still takes a real value from the env var', (_n, build, envVar) => {
        const saved = process.env[envVar];
        process.env[envVar] = '151.0.7922.77';

        try {
            const option = build().options.find((opt) => opt.long === '--browser-version');
            const parent = new Command();
            parent.exitOverride();
            parent.addOption(option);
            parent.parse(['node', 'test']);

            expect(parent.opts().browserVersion).toBe('151.0.7922.77');
        } finally {
            if (saved === undefined) {
                delete process.env[envVar];
            } else {
                process.env[envVar] = saved;
            }
        }
    });

    test.each(declarations)('%s treats an empty command-line value as the default', (_n, build) => {
        const opts = parseOptionInIsolation(build(), '--browser-version', ['']);

        expect(opts.browserVersion).toBe('recommended');
    });
});

describe('--browser choices', () => {
    // Firefox can be installed, but cannot render thumbnails: the launch path speaks the Chrome
    // DevTools Protocol and passes a Chromium-only argument list. Offering it here only moved
    // the failure somewhere the operator could not interpret it.
    test.each([
        ['qseow', () => buildQseowCommand()],
        ['qscloud', () => buildQscloudCommand()],
    ])('%s create-sheet-thumbnails offers chrome only', (_name, build) => {
        const command = build().commands.find((cmd) => cmd.name() === 'create-sheet-thumbnails');
        const option = command.options.find((opt) => opt.long === '--browser');

        expect(option.argChoices).toEqual(['chrome']);
    });

    test.each([
        ['browser install', () => buildBrowserInstallCommand()],
        ['browser uninstall', () => buildBrowserUninstallCommand()],
    ])('%s still offers both browsers', (_name, build) => {
        const option = build().options.find((opt) => opt.long === '--browser');

        expect(option.argChoices).toEqual(['chrome', 'firefox']);
    });
});

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

    test('invokes qseowCreateThumbnails with the options as given', async () => {
        // The handler used to re-derive a browser version here. It could never fire - Commander
        // had already applied the option default - so the default now lives in exactly one
        // place, the option declaration, where the tests above assert it.
        const options = { browser: 'chrome', browserVersion: 'recommended', appid: 'abc' };
        /**
         * Stub of a Commander command whose `name()` always returns `'qseow'`.
         *
         * @returns {string} The constant `'qseow'`.
         */
        const nameFn = () => 'qseow';
        const command = { name: nameFn };

        await handleQseowCreateSheetThumbnails(options, command);

        expect(qseowCreateThumbnails).toHaveBeenCalledWith(
            expect.objectContaining({ browserVersion: 'recommended', appid: 'abc' }),
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

    test('create-sheet-thumbnails passes the options through unchanged', async () => {
        const options = {
            browser: 'chrome',
            browserVersion: 'recommended',
            tenanturl: 'https://tenant',
            apikey: 'key',
        };

        await handleCloudCreateSheetThumbnails(options, {});

        expect(qscloudCreateThumbnails).toHaveBeenCalledWith(
            expect.objectContaining({ browserVersion: 'recommended', tenanturl: 'https://tenant' }),
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

    test.each([
        ['chrome', 'recommended'],
        ['firefox', 'stable'],
        ['chrome', '114.0.5735.133'],
    ])('install delegates %s %s to browserInstall unchanged', async (browser, browserVersion) => {
        // The handler used to rewrite browserVersion when it was empty. That could not happen
        // from the CLI, because Commander had already applied the option default - so the branch
        // that mapped chrome to "stable" was unreachable, and these tests were the only thing
        // exercising it. Interpreting the version now happens in one place, browser-version.js.
        const options = { browser, browserVersion };

        await handleBrowserInstall(options, {});

        expect(options.browserVersion).toBe(browserVersion);
        expect(browserInstall).toHaveBeenCalledWith(options, {});
    });

    test('install logs errors from browserInstall', async () => {
        browserInstall.mockRejectedValueOnce(new Error('installation failed'));

        await handleBrowserInstall({ browser: 'chrome', browserVersion: 'stable' }, {});

        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('BROWSER MAIN 9'));
    });

    test('install handles null options gracefully', async () => {
        // Reports failure rather than throwing. It used to resolve undefined, which the
        // caller could not distinguish from success.
        //
        // The handler is a pure delegator now, so the rejection comes from browserInstall - which
        // really does reject a nullish options object; see browser_install_offline.test.js.
        browserInstall.mockRejectedValueOnce(
            new Error('Missing required options: "browser" and "browserVersion"')
        );

        await expect(handleBrowserInstall(null)).resolves.toBe(false);
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

describe('exit code reflects whether the command succeeded', () => {
    // process.exitCode is global to the worker, and a stray 1 left behind here would make
    // Jest itself report failure. Every test restores it.
    let originalExitCode;

    beforeEach(() => {
        jest.clearAllMocks();
        originalExitCode = process.exitCode;
        process.exitCode = undefined;
    });

    afterEach(() => {
        process.exitCode = originalExitCode;
    });

    test('leaves the exit code alone when the command succeeds', async () => {
        qscloudCreateThumbnails.mockResolvedValue(true);

        await handleCloudCreateSheetThumbnails({ browser: 'chrome' }, {});

        expect(process.exitCode).toBeUndefined();
    });

    test('sets exit code 1 when the command reports failure', async () => {
        // The whole point of the change: a run in which nothing worked used to exit 0, so
        // no scheduler or CI job could tell it apart from a clean run.
        qscloudCreateThumbnails.mockResolvedValue(false);

        await handleCloudCreateSheetThumbnails({ browser: 'chrome' }, {});

        expect(process.exitCode).toBe(1);
    });

    test('sets exit code 1 when the command throws', async () => {
        qscloudCreateThumbnails.mockRejectedValue(new Error('tenant unreachable'));

        await handleCloudCreateSheetThumbnails({ browser: 'chrome' }, {});

        expect(process.exitCode).toBe(1);
    });

    test('does not let a command failure escape as an unhandled rejection', async () => {
        // Throwing on out of the handler would reach the process-level unhandledRejection
        // handler, which writes a crash dump - the wrong response to an unreachable server.
        qscloudCreateThumbnails.mockRejectedValue(new Error('tenant unreachable'));

        await expect(handleCloudCreateSheetThumbnails({ browser: 'chrome' }, {})).resolves.toBe(
            false
        );
    });

    test('applies to the QSEoW command too', async () => {
        qseowCreateThumbnails.mockResolvedValue(false);

        await handleQseowCreateSheetThumbnails({ browser: 'chrome' }, {});

        expect(process.exitCode).toBe(1);
    });

    test('applies to the cloud remove-sheet-icons command too', async () => {
        qscloudRemoveSheetIcons.mockResolvedValue(false);

        await handleCloudRemoveSheetIcons({}, {});

        expect(process.exitCode).toBe(1);
    });
});
