import { describe, test, expect, beforeEach, afterEach, jest, beforeAll } from '@jest/globals';
import { Command, InvalidArgumentError } from 'commander';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_QSEOW_SENSE_VERSION, QSEOW_SENSE_VERSIONS } from '../../qseow/qseow-selectors.js';

// Root of the platform code that consumes CLI options, resolved from this file so the
// option-name guard below does not depend on the working directory jest was started in.
const PLATFORM_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

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

const mockBrowserCheckPromise = jest.unstable_mockModule('../../browser/browser-check.js', () => ({
    browserCheck: jest.fn().mockResolvedValue({ ok: true, findings: [] }),
}));

// Mocked for the same reason its browser sibling is: this file tests how commands are wired, and
// the real worker reaches through the check context into browser-paths.js, which reads `isSea` off
// the globals mock above. That mock carries only what the command layer needs, so importing the
// worker for real fails at link time - a suite-load error, with every test in the file reported as
// failing for a reason that has nothing to do with any of them.
const mockDoctorCheckPromise = jest.unstable_mockModule('../../doctor/doctor-check.js', () => ({
    doctorCheck: jest.fn().mockResolvedValue({ ok: true, findings: [] }),
}));

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
let browserCheck;
let parsePositiveInteger;
let collectPositiveIntegers;
let collectAppIds;
let buildQseowCommand;
let handleQseowCreateSheetThumbnails;
let handleCloudCreateSheetThumbnails;
let handleCloudListCollections;
let handleCloudRemoveSheetIcons;
let buildQscloudCommand;
let buildBrowserCommand;
let buildDoctorCommand;
let handleBrowserListInstalled;
let handleBrowserUninstall;
let handleBrowserUninstallAll;
let handleBrowserInstall;
let handleBrowserListAvailable;
let buildBrowserInstallCommand;
let buildBrowserUninstallCommand;
let buildBrowserListAvailableCommand;
let handleBrowserCheck;
let buildBrowserCheckCommand;

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
        mockBrowserCheckPromise,
        mockDoctorCheckPromise,
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
    ({ parsePositiveInteger, collectPositiveIntegers, collectAppIds } =
        await import('../helpers.js'));
    ({ buildQseowCommand, handleQseowCreateSheetThumbnails } = await import('../qseow/index.js'));
    ({ handleCloudCreateSheetThumbnails } = await import('../qscloud/create-sheet-thumbnails.js'));
    ({ handleCloudListCollections } = await import('../qscloud/list-collections.js'));
    ({ handleCloudRemoveSheetIcons } = await import('../qscloud/remove-sheet-icons.js'));
    ({ buildQscloudCommand } = await import('../qscloud/index.js'));
    ({ buildBrowserCommand } = await import('../browser/index.js'));
    ({ buildDoctorCommand } = await import('../doctor/index.js'));
    ({ handleBrowserListInstalled } = await import('../browser/list-installed.js'));
    ({ handleBrowserUninstall, buildBrowserUninstallCommand } =
        await import('../browser/uninstall.js'));
    ({ handleBrowserUninstallAll } = await import('../browser/uninstall-all.js'));
    ({ handleBrowserInstall, buildBrowserInstallCommand } = await import('../browser/install.js'));
    ({ handleBrowserListAvailable, buildBrowserListAvailableCommand } =
        await import('../browser/list-available.js'));
    ({ browserCheck } = await import('../../browser/browser-check.js'));
    ({ handleBrowserCheck, buildBrowserCheckCommand } = await import('../browser/check.js'));
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

describe('collectAppIds', () => {
    test('accumulates onto the previous value instead of replacing it', () => {
        // Same trap as collectPositiveIntegers: a variadic option with a parser
        // that ignores the accumulator keeps only the last value.
        expect(collectAppIds('a')).toEqual(['a']);
        expect(collectAppIds('b', ['a'])).toEqual(['a', 'b']);
    });

    test('does not mutate the accumulator it is given', () => {
        const previous = ['a'];
        collectAppIds('b', previous);
        expect(previous).toEqual(['a']);
    });

    test('splits on commas and trims, so both separators behave the same', () => {
        expect(collectAppIds('a,b , c')).toEqual(['a', 'b', 'c']);
    });

    test('drops empty entries, so a set-but-empty value means nothing supplied', () => {
        expect(collectAppIds('')).toEqual([]);
        expect(collectAppIds('   ')).toEqual([]);
        expect(collectAppIds('a,,b')).toEqual(['a', 'b']);
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

/**
 * Resolves the `create-sheet-thumbnails` subcommand for a platform.
 *
 * @param {import('commander').Command} parent - Platform command, e.g. `qseow`.
 *
 * @returns {import('commander').Command} The thumbnail subcommand.
 */
const thumbnailCommand = (parent) =>
    parent.commands.find((cmd) => cmd.name() === 'create-sheet-thumbnails');

describe('--browser-version defaults (issue #878)', () => {
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

describe('--browser-cache-dir (issue #1024)', () => {
    /**
     * The subcommand of `browser` with the given name.
     *
     * @param {string} name - Leaf command name, e.g. `install`.
     *
     * @returns {import('commander').Command} The subcommand.
     */
    const browserCommand = (name) =>
        buildBrowserCommand().commands.find((cmd) => cmd.name() === name);

    // Structural, and asserted against the declarations rather than through a run: this is
    // what stops a later edit from missing one command, or reintroducing a .default() that
    // would make the option always truthy and the PUPPETEER_CACHE_DIR tier unreachable.
    const carriers = [
        ['browser install', () => buildBrowserInstallCommand()],
        ['browser list-installed', () => browserCommand('list-installed')],
        ['browser uninstall', () => buildBrowserUninstallCommand()],
        ['browser uninstall-all', () => browserCommand('uninstall-all')],
        ['browser check', () => browserCommand('check')],
        ['qseow create-sheet-thumbnails', () => thumbnailCommand(buildQseowCommand())],
        ['qscloud create-sheet-thumbnails', () => thumbnailCommand(buildQscloudCommand())],
    ];

    test.each(carriers)('%s carries the option', (_name, build) => {
        const option = build().options.find((opt) => opt.long === '--browser-cache-dir');

        expect(option).toBeDefined();
    });

    // One shared name across every command, not the per-command BSI_BROWSER_I_* convention:
    // the browser location is a property of the machine, and the value `browser install`
    // writes to must be the one `create-sheet-thumbnails` reads from.
    test.each(carriers)('%s reads the shared environment variable', (_name, build) => {
        const option = build().options.find((opt) => opt.long === '--browser-cache-dir');

        expect(option.envVar).toBe('BSI_BROWSER_CACHE_DIR');
    });

    test.each(carriers)('%s leaves the default to the resolver', (_name, build) => {
        const option = build().options.find((opt) => opt.long === '--browser-cache-dir');

        expect(option.defaultValue).toBeUndefined();
    });

    // Commander runs parseArg on values sourced from the environment too, so a validator
    // here would turn `BSI_BROWSER_CACHE_DIR=` into a hard CLI error rather than the no-op
    // that PUPPETEER_EXECUTABLE_PATH="" has always been for Docker users.
    test.each(carriers)('%s accepts a set-but-empty environment variable', (_name, build) => {
        const option = build().options.find((opt) => opt.long === '--browser-cache-dir');

        expect(option.parseArg).toBeUndefined();

        const saved = process.env.BSI_BROWSER_CACHE_DIR;
        process.env.BSI_BROWSER_CACHE_DIR = '';

        try {
            const parent = new Command();
            parent.exitOverride();
            parent.addOption(option);

            expect(() => parent.parse(['node', 'test'])).not.toThrow();
            expect(parent.opts().browserCacheDir).toBe('');
        } finally {
            if (saved === undefined) {
                delete process.env.BSI_BROWSER_CACHE_DIR;
            } else {
                process.env.BSI_BROWSER_CACHE_DIR = saved;
            }
        }
    });

    // Both cache paths in browser-list-available.js are handed to canDownload(), which
    // ignores cacheDir entirely. Advertising the option there would be a knob that provably
    // does nothing.
    test('browser list-available deliberately does not carry it', () => {
        const option = browserCommand('list-available').options.find(
            (opt) => opt.long === '--browser-cache-dir'
        );

        expect(option).toBeUndefined();
    });
});

describe('--sense-version choices', () => {
    test('uses the shared QSEoW version list and defaults to 2026-May', () => {
        const option = thumbnailCommand(buildQseowCommand()).options.find(
            (opt) => opt.long === '--sense-version'
        );

        expect(option.argChoices).toEqual(QSEOW_SENSE_VERSIONS);
        expect(option.defaultValue).toBe(DEFAULT_QSEOW_SENSE_VERSION);
    });

    test.each(['2025-Nov', '2026-May'])('accepts %s explicitly', (senseVersion) => {
        const opts = parseOptionInIsolation(
            thumbnailCommand(buildQseowCommand()),
            '--sense-version',
            [senseVersion]
        );

        expect(opts.senseVersion).toBe(senseVersion);
    });
});

describe('--browser choices', () => {
    // Chrome is the only value any command accepts, on every command that has the option.
    // The launch path speaks the Chrome DevTools Protocol and passes a Chromium-only argument
    // list, so anything else would fail somewhere the operator could not interpret it.
    test.each([
        ['qseow', () => thumbnailCommand(buildQseowCommand())],
        ['qscloud', () => thumbnailCommand(buildQscloudCommand())],
        ['browser install', () => buildBrowserInstallCommand()],
        ['browser uninstall', () => buildBrowserUninstallCommand()],
        ['browser list-available', () => buildBrowserListAvailableCommand()],
    ])('%s offers chrome only', (_name, build) => {
        const option = build().options.find((opt) => opt.long === '--browser');

        expect(option.argChoices).toEqual(['chrome']);
    });
});

describe('--includesheetpart choices (issue #891)', () => {
    test('qseow accepts 1, 2, 3 and 4', () => {
        const cmd = thumbnailCommand(buildQseowCommand());

        for (const value of ['1', '2', '3', '4']) {
            const opts = parseOptionInIsolation(cmd, '--includesheetpart', [value]);
            expect(opts.includesheetpart).toBe(value);
        }
    });

    test('qseow rejects values outside 1-4', () => {
        const cmd = thumbnailCommand(buildQseowCommand());

        for (const value of ['0', '5', '9', 'abc']) {
            expect(() => parseOptionInIsolation(cmd, '--includesheetpart', [value])).toThrow(
                /allowed choices/i
            );
        }
    });

    test('qseow argChoices lists the valid values', () => {
        const option = thumbnailCommand(buildQseowCommand()).options.find(
            (opt) => opt.long === '--includesheetpart'
        );

        expect(option.argChoices).toEqual(['1', '2', '3', '4']);
    });

    test('qscloud accepts 1, 2 and 4', () => {
        const cmd = thumbnailCommand(buildQscloudCommand());

        for (const value of ['1', '2', '4']) {
            const opts = parseOptionInIsolation(cmd, '--includesheetpart', [value]);
            expect(opts.includesheetpart).toBe(value);
        }
    });

    test('qscloud rejects value 3, which is unused on Cloud', () => {
        const cmd = thumbnailCommand(buildQscloudCommand());

        expect(() => parseOptionInIsolation(cmd, '--includesheetpart', ['3'])).toThrow(
            /allowed choices/i
        );
    });

    test('qscloud rejects other invalid values', () => {
        const cmd = thumbnailCommand(buildQscloudCommand());

        for (const value of ['0', '5', '9', 'abc']) {
            expect(() => parseOptionInIsolation(cmd, '--includesheetpart', [value])).toThrow(
                /allowed choices/i
            );
        }
    });

    test('qscloud argChoices lists the valid values', () => {
        const option = thumbnailCommand(buildQscloudCommand()).options.find(
            (opt) => opt.long === '--includesheetpart'
        );

        expect(option.argChoices).toEqual(['1', '2', '4']);
    });

    test('qscloud --includesheetpart error comes from choices, not a custom argParser', () => {
        // .choices() overwrites parseArg in Commander, so a custom argParser declared before
        // .choices() never runs. The dead parser was removed; verify the error message is the
        // choices validator's, not the old "must be a non-negative integer" message.
        const cmd = thumbnailCommand(buildQscloudCommand());
        const parse = () => parseOptionInIsolation(cmd, '--includesheetpart', ['abc']);

        expect(parse).toThrow(/allowed choices/i);
        expect(parse).not.toThrow(/non-negative integer/i);
    });

    // The environment variable is how this option is set in practice: the CI workflow, the
    // documented docker examples and any scheduled job all use BSI_..._INCLUDE_SHEET_PART rather
    // than passing the flag. Commander runs the same parseArg for env values as for argv, but via
    // a separate listener and with a different message, so argv coverage alone would not notice
    // the env path losing its validation.
    const envCases = [
        ['qseow', () => buildQseowCommand(), 'BSI_QSEOW_CST_INCLUDE_SHEET_PART', '3'],
        ['qscloud', () => buildQscloudCommand(), 'BSI_QSCLOUD_CST_INCLUDE_SHEET_PART', '4'],
    ];

    /**
     * Parses `--includesheetpart` with only an environment variable set, restoring the previous
     * value afterwards so the variable cannot leak into other tests.
     *
     * @param {() => import('commander').Command} build - Builds the platform command.
     * @param {string} envVar - Environment variable backing the option.
     * @param {string} value - Value to place in the environment variable.
     *
     * @returns {object} The parsed options object.
     */
    const parseFromEnv = (build, envVar, value) => {
        const saved = process.env[envVar];
        process.env[envVar] = value;

        try {
            const option = thumbnailCommand(build()).options.find(
                (opt) => opt.long === '--includesheetpart'
            );
            const parent = new Command();
            parent.exitOverride();
            parent.addOption(option);
            parent.parse(['node', 'test']);

            return parent.opts();
        } finally {
            if (saved === undefined) {
                delete process.env[envVar];
            } else {
                process.env[envVar] = saved;
            }
        }
    };

    test.each(envCases)('%s accepts a valid value from the env var', (_n, build, envVar, valid) => {
        expect(parseFromEnv(build, envVar, valid).includesheetpart).toBe(valid);
    });

    test.each(envCases)('%s rejects an invalid value from the env var', (_n, build, envVar) => {
        // Asserted on "from env" as well as the choices text, so this cannot pass by accidentally
        // exercising the command-line path: Commander words the two messages differently.
        expect(() => parseFromEnv(build, envVar, '9')).toThrow(/allowed choices/i);
        expect(() => parseFromEnv(build, envVar, '9')).toThrow(
            new RegExp(`value '9' from env '${envVar}' is invalid`)
        );
    });

    test('qscloud rejects 3 from the env var, the value only QSEoW supports', () => {
        expect(() =>
            parseFromEnv(() => buildQscloudCommand(), 'BSI_QSCLOUD_CST_INCLUDE_SHEET_PART', '3')
        ).toThrow(/allowed choices/i);
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

describe('--appid accepts several apps (issue #895)', () => {
    // Processing several named apps in one run was not expressible, even though
    // everything downstream is already list-shaped: the workers build an array and
    // runOverApps() dedupes it. The limitation was purely in the option declaration.
    const cases = [
        ['qseow', () => buildQseowCommand(), 'create-sheet-thumbnails', 'BSI_QSEOW_CST_APP_ID'],
        [
            'qscloud',
            () => buildQscloudCommand(),
            'create-sheet-thumbnails',
            'BSI_QSCLOUD_CST_APP_ID',
        ],
        ['qscloud', () => buildQscloudCommand(), 'remove-sheet-icons', 'BSI_QSCLOUD_RSI_APPID'],
    ];

    describe.each(cases)('%s %s', (platform, build, leaf, envVar) => {
        /**
         * Resolves the subcommand under test.
         *
         * @returns {import('commander').Command} The subcommand carrying --appid.
         */
        const subcommand = () => build().commands.find((cmd) => cmd.name() === leaf);

        /**
         * Parses with no `--appid` on the command line, so the env var is the only source.
         *
         * `parseOptionInIsolation` always prepends the flag, which for a variadic option
         * with nothing after it is `argument missing` rather than "not supplied".
         *
         * @returns {object} The parsed options object.
         */
        const parseEnvOnly = () => {
            const parent = new Command();
            parent.exitOverride();
            parent.addOption(subcommand().options.find((opt) => opt.long === '--appid'));
            parent.parse(['node', 'test']);

            return parent.opts();
        };

        afterEach(() => {
            delete process.env[envVar];
        });

        test('keeps every id when several are supplied', () => {
            const opts = parseOptionInIsolation(subcommand(), '--appid', ['a', 'b', 'c']);
            expect(opts.appid).toEqual(['a', 'b', 'c']);
        });

        test('yields a one-element array for a single id, as before', () => {
            const opts = parseOptionInIsolation(subcommand(), '--appid', ['a']);
            expect(opts.appid).toEqual(['a']);
        });

        test('splits a comma-separated value', () => {
            const opts = parseOptionInIsolation(subcommand(), '--appid', ['a,b,c']);
            expect(opts.appid).toEqual(['a', 'b', 'c']);
        });

        test('tolerates spaces around the commas', () => {
            const opts = parseOptionInIsolation(subcommand(), '--appid', ['a, b , c']);
            expect(opts.appid).toEqual(['a', 'b', 'c']);
        });

        test('splits a comma-separated environment variable', () => {
            // Commander wraps an env-var value in a one-element array without
            // splitting it, so without the parser this is one app whose id
            // contains commas. Every option here has an .env() binding, so this
            // path is first-class.
            process.env[envVar] = 'a,b,c';
            expect(parseEnvOnly().appid).toEqual(['a', 'b', 'c']);
        });

        test('treats a set-but-empty environment variable as nothing supplied', () => {
            // This repo has been bitten by set-but-empty before: Commander lets a
            // bare `BSI_..._APP_ID=` line in a unit file beat .default().
            process.env[envVar] = '';
            expect(parseEnvOnly().appid).toEqual([]);
        });

        test('lets the command line win over the environment variable', () => {
            process.env[envVar] = 'from-env';
            const opts = parseOptionInIsolation(subcommand(), '--appid', ['from-cli']);
            expect(opts.appid).toEqual(['from-cli']);
        });
    });
});

describe('sheet-tag options accept several tags on both platforms', () => {
    // --blur-sheet-tag was declared `<value>` while its --exclude-sheet-tag sibling was
    // `<value...>`. A scalar option stops after one value, so a second tag was parsed as a
    // positional argument and Commander aborted with `too many arguments` before the action
    // handler ran - on qscloud that meant the "not supported" warning never printed. See #840.
    const cases = [
        ['qseow', () => buildQseowCommand(), 'excludeSheetTag', '--exclude-sheet-tag'],
        ['qseow', () => buildQseowCommand(), 'blurSheetTag', '--blur-sheet-tag'],
        ['qscloud', () => buildQscloudCommand(), 'excludeSheetTag', '--exclude-sheet-tag'],
        ['qscloud', () => buildQscloudCommand(), 'blurSheetTag', '--blur-sheet-tag'],
    ];

    describe.each(cases)('%s %s', (platform, build, optionKey, flag) => {
        /**
         * Resolves the `create-sheet-thumbnails` subcommand for the platform under test.
         *
         * @returns {import('commander').Command} The subcommand carrying the sheet-tag options.
         */
        const subcommand = () =>
            build().commands.find((cmd) => cmd.name() === 'create-sheet-thumbnails');

        test('keeps every tag when several are supplied', () => {
            const opts = parseOptionInIsolation(subcommand(), flag, ['Secret', 'Draft']);
            expect(opts[optionKey]).toEqual(['Secret', 'Draft']);
        });

        test('yields a one-element array for a single tag', () => {
            const opts = parseOptionInIsolation(subcommand(), flag, ['Secret']);
            expect(opts[optionKey]).toEqual(['Secret']);
        });

        test('keeps a tag name containing spaces and punctuation intact', () => {
            const opts = parseOptionInIsolation(subcommand(), flag, ["Q1'25 R&D"]);
            expect(opts[optionKey]).toEqual(["Q1'25 R&D"]);
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
                'check',
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

    describe('check', () => {
        test('delegates to browserCheck', async () => {
            const options = { browser: 'chrome', browserVersion: 'recommended' };

            await handleBrowserCheck(options, {});

            expect(browserCheck).toHaveBeenCalledWith(options);
        });

        // §7.4. `browser check` is meant to be a gate in a deployment script on the Sense server,
        // so the outcome has to reach the shell. `process.exitCode`, never `process.exit()`: the
        // latter would cut winston off mid-flush and lose the report that explains the exit code.
        test('a healthy machine leaves the exit code alone', async () => {
            browserCheck.mockResolvedValueOnce({ ok: true, findings: [] });

            await handleBrowserCheck({}, {});

            expect(process.exitCode).toBeUndefined();
        });

        test('a failing check exits 1', async () => {
            browserCheck.mockResolvedValueOnce({ ok: false, findings: [] });

            await handleBrowserCheck({}, {});

            expect(process.exitCode).toBe(1);
        });

        test('a thrown check exits 1 rather than reporting success', async () => {
            browserCheck.mockRejectedValueOnce(new Error('bad'));

            await handleBrowserCheck({}, {});

            expect(process.exitCode).toBe(1);
        });

        test('carries the options a real run would use', () => {
            // A doctor that reports OK under different settings than the real run is worse than
            // no doctor. Every option here changes which browser a thumbnail run would pick, or
            // how it would be started.
            const declared = buildBrowserCheckCommand().options.map((opt) => opt.long);

            expect(declared).toEqual(
                expect.arrayContaining([
                    '--browser',
                    '--browser-version',
                    '--browser-cache-dir',
                    '--browser-executable-path',
                    '--headless',
                    '--skip-launch',
                ])
            );
        });

        test('--skip-launch is stored under skipLaunch and defaults to false', () => {
            const option = buildBrowserCheckCommand().options.find(
                (opt) => opt.long === '--skip-launch'
            );

            expect(option.attributeName()).toBe('skipLaunch');
            expect(option.defaultValue).toBe(false);
        });

        test('bare --skip-launch still turns it on', () => {
            const opts = parseOptionInIsolation(buildBrowserCheckCommand(), '--skip-launch', []);

            expect(opts.skipLaunch).toBe(true);
        });

        // The trap this closes: as a no-argument flag, Commander set skipLaunch on the mere
        // PRESENCE of the environment variable and never read its value, so
        // BSI_BROWSER_C_SKIP_LAUNCH=false turned skip-launch ON. The deployment gate then exited 0
        // having never started a browser - the most valuable part of the check - and the generated
        // doc table, which lists the variable with default `false`, invites exactly that line.
        test.each([
            ['false', false],
            ['FALSE', false],
            ['0', false],
            ['no', false],
            ['', false],
            ['true', true],
            ['1', true],
            ['yes', true],
        ])('BSI_BROWSER_C_SKIP_LAUNCH=%s parses to %s', (value, expected) => {
            const saved = process.env.BSI_BROWSER_C_SKIP_LAUNCH;
            process.env.BSI_BROWSER_C_SKIP_LAUNCH = value;

            try {
                const command = buildBrowserCheckCommand();
                command.exitOverride();
                command.parse([], { from: 'user' });

                expect(command.opts().skipLaunch).toBe(expected);
            } finally {
                if (saved === undefined) {
                    delete process.env.BSI_BROWSER_C_SKIP_LAUNCH;
                } else {
                    process.env.BSI_BROWSER_C_SKIP_LAUNCH = saved;
                }
            }
        });

        // A stray word after the flag used to be swallowed as its value and quietly parsed to
        // false, so `browser check --skip-launch oops` ran the full check with the flag the
        // operator typed silently discarded - and no diagnostic. As a bare flag Commander's arity
        // check caught that; making the argument optional removed it, so the parser has to.
        test.each(['oops', 'maybe', 'yes-please'])(
            '--skip-launch %s is refused rather than silently ignored',
            (value) => {
                // Commander converts an argParser's InvalidArgumentError into its own
                // CommanderError, so the assertion is on the message the operator sees.
                expect(() =>
                    parseOptionInIsolation(buildBrowserCheckCommand(), '--skip-launch', [value])
                ).toThrow(/is not a true\/false value/);
            }
        );

        test('--headless reads the same vocabulary as --skip-launch', () => {
            // Two boolean options on one command accepted different words: `--headless off` ran
            // headless while `--skip-launch off` worked. The doc page recommends `--headless` for
            // exactly the case a silent coercion to headless would hide.
            for (const [value, expected] of [
                ['false', false],
                ['FALSE', false],
                ['off', false],
                ['no', false],
                ['0', false],
                ['true', true],
                ['on', true],
            ]) {
                const opts = parseOptionInIsolation(buildBrowserCheckCommand(), '--headless', [
                    value,
                ]);

                expect({ value, headless: opts.headless }).toEqual({ value, headless: expected });
            }
        });

        test('--headless rejects a value it cannot interpret', () => {
            expect(() =>
                parseOptionInIsolation(buildBrowserCheckCommand(), '--headless', ['maybe'])
            ).toThrow(/is not a true\/false value/);
        });

        test('an empty BSI_BROWSER_C_HEADLESS means unset, not headed', () => {
            // Empty means "unset" everywhere else in this codebase, and --headless defaults to
            // true - so a bare `BSI_BROWSER_C_HEADLESS=` line must leave it headless rather than
            // flipping it.
            const saved = process.env.BSI_BROWSER_C_HEADLESS;
            process.env.BSI_BROWSER_C_HEADLESS = '';

            try {
                const command = buildBrowserCheckCommand();
                command.exitOverride();
                command.parse([], { from: 'user' });

                expect(command.opts().headless).toBe(true);
            } finally {
                if (saved === undefined) {
                    delete process.env.BSI_BROWSER_C_HEADLESS;
                } else {
                    process.env.BSI_BROWSER_C_HEADLESS = saved;
                }
            }
        });

        test('--skip-launch false on the command line means do not skip', () => {
            const opts = parseOptionInIsolation(buildBrowserCheckCommand(), '--skip-launch', [
                'false',
            ]);

            expect(opts.skipLaunch).toBe(false);
        });

        test('offers no wizard flag, matching the interactive registry', () => {
            // registry.test.js asserts the other direction; this is the half that fails inside
            // this file if -i is ever added without a wizard behind it.
            const flags = buildBrowserCheckCommand().options.map((opt) => opt.short);

            expect(flags).not.toContain('-i');
        });
    });

    test.each([
        ['chrome', 'recommended'],
        ['chrome', 'stable'],
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
        const options = { browser: 'chrome', browserVersion: 'latest', loglevel: 'debug' };
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

describe('option keys match the property names the code reads (issue #890)', () => {
    /**
     * Every command that declares the log-level option, resolved from its real builder.
     *
     * @returns {Array<[string, import('commander').Command]>} Name/command pairs.
     */
    /**
     * Finds a subcommand by name.
     *
     * @param {import('commander').Command} parent - Platform command, e.g. `qseow`.
     * @param {string} name - Subcommand name.
     *
     * @returns {import('commander').Command|undefined} The subcommand, if present.
     */
    const sub = (parent, name) => parent.commands.find((cmd) => cmd.name() === name);

    // Lazy thunks: test.each() is evaluated when the describe block is built, which happens
    // before beforeAll() has resolved the dynamic imports.
    const EVERY_COMMAND = [
        [
            'qseow create-sheet-thumbnails',
            () => sub(buildQseowCommand(), 'create-sheet-thumbnails'),
        ],
        [
            'qscloud create-sheet-thumbnails',
            () => sub(buildQscloudCommand(), 'create-sheet-thumbnails'),
        ],
        ['qscloud list-collections', () => sub(buildQscloudCommand(), 'list-collections')],
        ['qscloud remove-sheet-icons', () => sub(buildQscloudCommand(), 'remove-sheet-icons')],
        ['browser install', () => sub(buildBrowserCommand(), 'install')],
        ['browser list-available', () => sub(buildBrowserCommand(), 'list-available')],
        ['browser list-installed', () => sub(buildBrowserCommand(), 'list-installed')],
        ['browser uninstall', () => sub(buildBrowserCommand(), 'uninstall')],
        ['browser uninstall-all', () => sub(buildBrowserCommand(), 'uninstall-all')],
        ['browser check', () => sub(buildBrowserCommand(), 'check')],
    ];

    /**
     * Finds the log-level option on a command, whichever slot Commander put it in.
     *
     * @param {import('commander').Command} command - Command to search.
     *
     * @returns {import('commander').Option|undefined} The option, if declared.
     */
    const logLevelOption = (command) =>
        command.options.find((opt) => opt.long === '--loglevel' || opt.short === '--loglevel');

    describe('--skip-login', () => {
        /**
         * The declared `--skip-login` option, taken from the real command builder.
         *
         * @returns {import('commander').Option} The declared option.
         */
        const skipLoginOption = () =>
            buildQscloudCommand()
                .commands.find((cmd) => cmd.name() === 'create-sheet-thumbnails')
                .options.find((opt) => opt.long === '--skip-login');

        test('is stored under skipLogin, which is what process-cloud-app.js reads', () => {
            // The bug in #890: the flag was read as `options.skiplogin`, which Commander never
            // sets, so the skip branch was unreachable and login was always attempted. Asserted
            // against the real declared Option rather than a hand-built options object - a mock
            // would happily carry whichever spelling the test author chose.
            expect(skipLoginOption().attributeName()).toBe('skipLogin');
        });

        test('parses to a real boolean, so the === true check is right', () => {
            const parent = new Command();
            parent.exitOverride();
            parent.addOption(skipLoginOption());
            parent.parse(['node', 'test', '--skip-login']);

            expect(parent.opts().skipLogin).toBe(true);
        });

        test('defaults to false rather than undefined', () => {
            expect(skipLoginOption().defaultValue).toBe(false);
        });
    });

    describe('the log-level option', () => {
        // Declared `--log-level, --loglevel <level>`. Commander takes the *second* long form as
        // the attribute name, so this stores `loglevel` - the spelling ~40 reads already use.
        // With the forms the other way round it stored `logLevel`, and twelve handlers each
        // carried an alias shim to bridge the gap. A handler added without the shim silently
        // called setLoggingLevel(undefined).
        test.each(EVERY_COMMAND)('%s stores it as loglevel', (_name, build) => {
            const option = logLevelOption(build());

            expect(option).toBeDefined();
            expect(option.attributeName()).toBe('loglevel');
        });

        test.each(EVERY_COMMAND)('%s accepts both spellings', (_name, build) => {
            const option = logLevelOption(build());

            for (const spelling of ['--loglevel', '--log-level']) {
                const parent = new Command();
                parent.exitOverride();
                parent.addOption(option);
                parent.parse(['node', 'test', spelling, 'debug']);

                expect(parent.opts().loglevel).toBe('debug');
            }
        });

        test('no command stores it under logLevel any more', () => {
            // The shims are gone, so a command that reverted to the old flag order would leave
            // every downstream `options.loglevel` read undefined.
            const wrong = EVERY_COMMAND.filter(([, build]) =>
                build().options.some((opt) => opt.attributeName() === 'logLevel')
            );

            expect(wrong.map(([name]) => name)).toEqual([]);
        });
    });

    describe('every option the platform code reads is actually declared', () => {
        // The guard #890 asked for. Both bugs it catches were invisible to every other kind of
        // test: a hand-built options object in a unit test carries whichever spelling its author
        // chose, so it agrees with the reader and the mismatch never surfaces.
        //
        // Scoped to src/lib/{cloud,qseow,browser,doctor} because those consume CLI options
        // directly. Deliberately no allowlist - it currently passes with none, and an allowlist is
        // where a rule like this rots.
        const optionReads = () => {
            const files = [];
            const walkDir = (dir) => {
                for (const entry of readdirSync(dir, { withFileTypes: true })) {
                    const full = join(dir, entry.name);
                    if (entry.isDirectory()) {
                        if (entry.name !== '__tests__') walkDir(full);
                    } else if (entry.name.endsWith('.js')) {
                        files.push(full);
                    }
                }
            };
            ['cloud', 'qseow', 'browser', 'doctor'].forEach((area) =>
                walkDir(join(PLATFORM_ROOT, area))
            );

            const found = new Map();
            for (const file of files) {
                readFileSync(file, 'utf8')
                    .split('\n')
                    .forEach((line, index) => {
                        const trimmed = line.trim();
                        // Skip comments and JSDoc: they document option names loosely, and a
                        // stale doc line is a different problem from a broken read.
                        if (trimmed.startsWith('*') || trimmed.startsWith('//')) return;
                        for (const match of line.matchAll(/\boptions\??\.([a-zA-Z_][\w]*)/g)) {
                            if (!found.has(match[1])) {
                                found.set(match[1], `${file}:${index + 1}`);
                            }
                        }
                    });
            }
            return found;
        };

        const declaredNames = () => {
            const names = new Set();
            const collect = (command) => {
                command.options.forEach((opt) => names.add(opt.attributeName()));
                command.commands.forEach(collect);
            };
            [
                buildQseowCommand(),
                buildQscloudCommand(),
                buildBrowserCommand(),
                buildDoctorCommand(),
            ].forEach(collect);
            return names;
        };

        test('no options.<name> read has a name commander never stores', () => {
            const declared = declaredNames();
            const unmatched = [...optionReads().entries()]
                .filter(([name]) => !declared.has(name))
                .map(([name, where]) => `options.${name} (${where})`);

            expect(unmatched).toEqual([]);
        });

        test('the scan actually found something, so an empty pass is not a false negative', () => {
            // Without this, a broken walk or regex would make the test above pass vacuously.
            expect(optionReads().size).toBeGreaterThan(30);
            expect(declaredNames().size).toBeGreaterThan(30);
        });
    });

    describe('option argument placeholders', () => {
        // `browser list-available` declared `--channel <browser>` for a long time. Commander
        // takes the stored name from the long flag, so nothing broke and no test failed - it
        // only ever showed up as a confusing `--help` line, which is exactly the kind of defect
        // nobody reads closely enough to catch. Generating the doc site's option tables from
        // these declarations put it on a page, where it was obvious.
        //
        // A placeholder naming a *different* option of the same command is the signature of an
        // option block copy-pasted and not fully edited - but only when it has nothing to do
        // with its own option. `--engineport <port>` and `--qrsport <port>` sit beside a
        // `--port` on the qseow command and are perfectly clear, because each placeholder
        // describes the value that option takes. `--channel <browser>` does not.
        // Walked here rather than through command-tree.js: importing that statically would pull
        // the real worker modules in before this file's mocks are installed.
        const everyLeaf = () => {
            const leaves = [];

            const walk = (command, path) => {
                if (command.commands.length === 0) {
                    leaves.push({ path: path.join(' '), command });

                    return;
                }

                for (const child of command.commands) {
                    walk(child, [...path, child.name()]);
                }
            };

            for (const namespace of [
                buildQseowCommand(),
                buildQscloudCommand(),
                buildBrowserCommand(),
            ]) {
                walk(namespace, [namespace.name()]);
            }

            return leaves;
        };

        test('no placeholder is named after a different option on the same command', () => {
            const offenders = [];

            for (const { path, command } of everyLeaf()) {
                const names = new Set(
                    command.options
                        .filter((option) => option.long)
                        .map((option) => option.long.replace(/^--/, ''))
                );

                for (const option of command.options) {
                    const placeholder = option.flags
                        .match(/[<[]([^>\]]+)[>\]]/)?.[1]
                        ?.replace(/\.\.\.$/, '');
                    const own = option.long?.replace(/^--/, '');

                    // `own.includes(placeholder)` is the "describes its own option" test:
                    // `port` is part of `engineport`, `browser` is no part of `channel`.
                    if (
                        placeholder &&
                        placeholder !== own &&
                        names.has(placeholder) &&
                        !own?.includes(placeholder)
                    ) {
                        offenders.push(
                            `${path}: ${option.flags} (placeholder names --${placeholder})`
                        );
                    }
                }
            }

            expect(offenders).toEqual([]);
        });

        test('the scan actually walked some options, so an empty pass is not a false negative', () => {
            const optionCount = everyLeaf().reduce(
                (total, { command }) => total + command.options.length,
                0
            );

            expect(optionCount).toBeGreaterThan(30);
        });
    });
});

describe('--browser-executable-path (issue #929)', () => {
    // Only the commands that launch a browser. `browser install` deliberately does not carry it:
    // pointing at an executable is the alternative to installing one, so the option would be a
    // knob that does nothing there. `browser check` carries it because a configuration it cannot
    // see is a configuration it cannot diagnose.
    const carriers = [
        ['qseow create-sheet-thumbnails', () => thumbnailCommand(buildQseowCommand())],
        ['qscloud create-sheet-thumbnails', () => thumbnailCommand(buildQscloudCommand())],
        [
            'browser check',
            () => buildBrowserCommand().commands.find((cmd) => cmd.name() === 'check'),
        ],
    ];

    test.each(carriers)('%s carries the option', (_name, build) => {
        const option = build().options.find((opt) => opt.long === '--browser-executable-path');

        expect(option).toBeDefined();
    });

    test.each(carriers)('%s reads the shared environment variable', (_name, build) => {
        const option = build().options.find((opt) => opt.long === '--browser-executable-path');

        expect(option.envVar).toBe('BSI_BROWSER_EXECUTABLE_PATH');
    });

    test.each(carriers)('%s leaves the tiers to the resolver', (_name, build) => {
        // A Commander default would make the value always truthy, so PUPPETEER_EXECUTABLE_PATH
        // would never be consulted.
        const option = build().options.find((opt) => opt.long === '--browser-executable-path');

        expect(option.defaultValue).toBeUndefined();
    });

    test.each(carriers)('%s accepts a set-but-empty environment variable', (_name, build) => {
        // Same reasoning as the cache directory: `PUPPETEER_EXECUTABLE_PATH=""` meaning
        // "ignore this" is a documented Docker idiom, and an argParser would turn the
        // equivalent BSI_ line into a hard CLI error instead of a no-op.
        const option = build().options.find((opt) => opt.long === '--browser-executable-path');

        expect(option.parseArg).toBeUndefined();

        const saved = process.env.BSI_BROWSER_EXECUTABLE_PATH;
        process.env.BSI_BROWSER_EXECUTABLE_PATH = '';

        try {
            const parent = new Command();
            parent.exitOverride();
            parent.addOption(option);

            expect(() => parent.parse(['node', 'test'])).not.toThrow();
            expect(parent.opts().browserExecutablePath).toBe('');
        } finally {
            if (saved === undefined) {
                delete process.env.BSI_BROWSER_EXECUTABLE_PATH;
            } else {
                process.env.BSI_BROWSER_EXECUTABLE_PATH = saved;
            }
        }
    });

    test('browser install does not carry it', () => {
        const option = buildBrowserInstallCommand().options.find(
            (opt) => opt.long === '--browser-executable-path'
        );

        expect(option).toBeUndefined();
    });
});
