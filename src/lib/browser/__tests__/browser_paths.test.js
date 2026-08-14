import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import fs from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { Browser } from '@puppeteer/browsers';

/**
 * Where the browser cache lives is decided by four things that are all ambient - two
 * environment variables, whether this is a SEA binary, and the home directory - so every
 * test here loads the module afresh with exactly the ambience it wants.
 *
 * `isSea` is fixed in the module namespace at import time, so one shared mock could never
 * cover both the standalone and the plain-Node tiers. `jest.resetModules()` plus a
 * re-registered mock and a fresh import is the pattern this repo already uses for that
 * (log-error.test.js, enigma-util_sea.test.js).
 */

const REAL_HOME = homedir();
const REAL_EXEC_PATH = process.execPath;

/** Directories created by a test, removed afterwards. */
let tempDirs = [];

/**
 * Make a throwaway directory that is deleted when the test ends.
 *
 * @param {string} prefix - Prefix for the directory name.
 *
 * @returns {string} Absolute path to the new directory.
 */
const tempDir = (prefix) => {
    const dir = fs.mkdtempSync(path.join(tmpdir(), `bsi-${prefix}-`));
    tempDirs.push(dir);

    return dir;
};

/**
 * Plant a cached browser build, the way `@puppeteer/browsers` lays one out.
 *
 * @param {string} cacheDir - Cache directory to plant it in.
 * @param {string} [browser] - Browser type, e.g. `chrome`.
 * @param {string} [buildId] - Build id, e.g. `151.0.7922.77`.
 *
 * @returns {string} The installation folder that was created.
 */
const plantBuild = (cacheDir, browser = 'chrome', buildId = '151.0.7922.77') => {
    const dir = path.join(cacheDir, browser, `mac_arm-${buildId}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'chrome'), 'not really a browser');

    return dir;
};

/**
 * Load `browser-paths.js` with a chosen ambience.
 *
 * @param {object} [ambience] - What the module should see.
 * @param {boolean} [ambience.isSea] - Whether this is a standalone build.
 * @param {string} [ambience.home] - Home directory `os.homedir()` should report.
 * @param {string} [ambience.execPath] - Value for `process.execPath`.
 *
 * @returns {Promise<object>} `{ paths, logger }` - the module's exports and the mocked logger.
 */
const loadPaths = async ({ isSea = false, home = REAL_HOME, execPath } = {}) => {
    jest.resetModules();

    process.execPath = execPath ?? REAL_EXEC_PATH;

    jest.unstable_mockModule('os', () => ({
        default: { homedir: () => home, tmpdir },
        homedir: () => home,
        tmpdir,
    }));

    jest.unstable_mockModule('../../../globals.js', () => ({
        logger: {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            verbose: jest.fn(),
            debug: jest.fn(),
        },
        isSea,
    }));

    const { logger } = await import('../../../globals.js');
    const paths = await import('../browser-paths.js');

    return { paths, logger };
};

// POSIX only, and not an oversight. Node maps `chmod` on Windows to the read-only file
// attribute, which does not apply to directories, so a directory made "unwritable" this way is
// perfectly writable there and `fs.access(W_OK)` says so. That is the same limitation the
// production code has - which is why `browser-install.js` also translates an `EACCES` raised by
// the install itself, and why that translation, not the pre-flight check, is what covers a
// binary unzipped under `C:\Program Files\`.
const testOnPosix = process.platform === 'win32' ? test.skip : test;

// Both are ambient and now behaviour-affecting: a developer shell or a CI image may have
// either set, and PUPPETEER_CACHE_DIR in particular did nothing at all until this change.
const SAVED_ENV = {
    BSI_BROWSER_CACHE_DIR: process.env.BSI_BROWSER_CACHE_DIR,
    PUPPETEER_CACHE_DIR: process.env.PUPPETEER_CACHE_DIR,
    BSI_BROWSER_EXECUTABLE_PATH: process.env.BSI_BROWSER_EXECUTABLE_PATH,
    PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH,
};

beforeEach(() => {
    for (const name of Object.keys(SAVED_ENV)) {
        delete process.env[name];
    }
});

afterEach(() => {
    for (const [name, value] of Object.entries(SAVED_ENV)) {
        if (value === undefined) {
            delete process.env[name];
        } else {
            process.env[name] = value;
        }
    }

    process.execPath = REAL_EXEC_PATH;

    for (const dir of tempDirs) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs = [];
});

describe('the default location', () => {
    test('is the puppeteer cache under the real home directory', async () => {
        const { paths } = await loadPaths();

        // Byte-identical to what every previous release used, and the reason a
        // non-standalone user sees no change at all. This repo never mocks homedir() for
        // this assertion on purpose - the real one is what ships.
        expect(paths.resolveBrowserCacheDir({})).toBe(path.join(homedir(), '.cache', 'puppeteer'));
    });

    test('is what an absent options object resolves to', async () => {
        const { paths } = await loadPaths();

        // Workers are called with a bare {} by the integration tests, and with nothing at
        // all by getBrowserInventory's default parameter.
        expect(() => paths.resolveBrowserCacheDir()).not.toThrow();
        expect(paths.resolveBrowserCacheDir()).toBe(paths.resolveBrowserCacheDir({}));
    });
});

describe('precedence', () => {
    test('the option beats PUPPETEER_CACHE_DIR, the SEA location and the default', async () => {
        const sea = tempDir('sea');
        process.env.PUPPETEER_CACHE_DIR = '/from/puppeteer';
        const { paths } = await loadPaths({
            isSea: true,
            execPath: path.join(sea, 'butler-sheet-icons'),
        });

        expect(paths.resolveBrowserCacheDir({ browserCacheDir: '/from/option' })).toBe(
            path.resolve('/from/option')
        );
    });

    test('PUPPETEER_CACHE_DIR beats the SEA location and the default', async () => {
        const sea = tempDir('sea');
        process.env.PUPPETEER_CACHE_DIR = '/from/puppeteer';
        const { paths } = await loadPaths({
            isSea: true,
            execPath: path.join(sea, 'butler-sheet-icons'),
        });

        expect(paths.resolveBrowserCacheDir({})).toBe(path.resolve('/from/puppeteer'));
    });

    test('a standalone build defaults to a folder beside the executable', async () => {
        const sea = tempDir('sea');
        // An empty home, or the developer's own cache would trigger the legacy fallback and
        // this would be testing that instead.
        const { paths } = await loadPaths({
            isSea: true,
            home: tempDir('home'),
            execPath: path.join(sea, 'butler-sheet-icons'),
        });

        expect(paths.resolveBrowserCacheDir({})).toBe(path.join(sea, 'browser-cache'));
    });

    test('a plain-Node run never uses the executable location, whatever it is', async () => {
        // The hazard this closes: bsiExecutablePath falls back to process.cwd() when not
        // running as a SEA binary, and the working directory of a scheduled task must
        // never become a cache location.
        const notSea = tempDir('node');
        const { paths } = await loadPaths({
            isSea: false,
            execPath: path.join(notSea, 'node'),
        });

        expect(paths.resolveBrowserCacheDir({})).toBe(path.join(homedir(), '.cache', 'puppeteer'));
    });

    test('a relative directory is resolved to an absolute one', async () => {
        // Under a scheduled task the working directory is rarely what the administrator
        // expects, so the log line has to name the path that was really used.
        const { paths } = await loadPaths();

        expect(paths.resolveBrowserCacheDir({ browserCacheDir: 'browsers' })).toBe(
            path.resolve('browsers')
        );
    });
});

describe('an empty value means unset', () => {
    // PUPPETEER_EXECUTABLE_PATH="" is already a documented BSI idiom for Docker users, and
    // Commander stores '' for a bare `BSI_BROWSER_CACHE_DIR=` line in a unit file.
    test.each([
        ['empty string', ''],
        ['whitespace', '   '],
    ])('the option set to %s falls through to PUPPETEER_CACHE_DIR', async (_name, value) => {
        process.env.PUPPETEER_CACHE_DIR = '/from/puppeteer';
        const { paths } = await loadPaths();

        expect(paths.resolveBrowserCacheDir({ browserCacheDir: value })).toBe(
            path.resolve('/from/puppeteer')
        );
    });

    test.each([
        ['empty string', ''],
        ['whitespace', '   '],
    ])('PUPPETEER_CACHE_DIR set to %s falls through to the default', async (_name, value) => {
        process.env.PUPPETEER_CACHE_DIR = value;
        const { paths } = await loadPaths();

        expect(paths.resolveBrowserCacheDir({})).toBe(path.join(homedir(), '.cache', 'puppeteer'));
    });
});

describe('the legacy-cache fallback', () => {
    /**
     * A standalone install whose cache is beside the binary, plus the old home location.
     *
     * @returns {Promise<object>} `{ paths, logger, seaDir, legacyDir }`.
     */
    const standaloneWithLegacy = async () => {
        const seaDir = tempDir('sea');
        const home = tempDir('home');
        const legacyDir = path.join(home, '.cache', 'puppeteer');
        fs.mkdirSync(legacyDir, { recursive: true });

        const { paths, logger } = await loadPaths({
            isSea: true,
            home,
            execPath: path.join(seaDir, 'butler-sheet-icons'),
        });

        return { paths, logger, seaDir, legacyDir };
    };

    test('reads the previous location when nothing is beside the executable', async () => {
        const { paths, seaDir, legacyDir } = await standaloneWithLegacy();
        plantBuild(legacyDir);

        expect(paths.resolveBrowserCacheDir({})).toBe(legacyDir);
        expect(paths.resolveBrowserCacheDir({})).not.toBe(path.join(seaDir, 'browser-cache'));
    });

    test('says so once, naming both directories and the fix', async () => {
        const { paths, logger, seaDir, legacyDir } = await standaloneWithLegacy();
        plantBuild(legacyDir);

        paths.resolveBrowserCacheDir({});

        const message = logger.info.mock.calls.map(([line]) => line).join('\n');
        expect(message).toContain(path.join(seaDir, 'browser-cache'));
        expect(message).toContain(legacyDir);
        expect(message).toMatch(/--browser-cache-dir/);
    });

    test('is read-only: installs still write beside the executable', async () => {
        const { paths, seaDir, legacyDir } = await standaloneWithLegacy();
        plantBuild(legacyDir);

        expect(paths.resolveBrowserCacheDirForWriting({})).toBe(path.join(seaDir, 'browser-cache'));
    });

    test('is not announced on the write path, where it would be untrue', async () => {
        // "Using the previous location for now" describes a read. Said while installing, it
        // would tell an administrator the browser went somewhere it did not.
        const { paths, logger, seaDir, legacyDir } = await standaloneWithLegacy();
        plantBuild(legacyDir);

        paths.resolveBrowserCacheDirForWriting({});

        const said = logger.info.mock.calls.map(([line]) => line).join('\n');
        expect(said).not.toContain('previous default location');
        expect(said).toContain(path.join(seaDir, 'browser-cache'));
    });

    test('does not apply once a browser is present beside the executable', async () => {
        const { paths, seaDir, legacyDir } = await standaloneWithLegacy();
        plantBuild(legacyDir);
        plantBuild(path.join(seaDir, 'browser-cache'));

        expect(paths.resolveBrowserCacheDir({})).toBe(path.join(seaDir, 'browser-cache'));
    });

    test('does not apply when a directory was named explicitly', async () => {
        const { paths, legacyDir } = await standaloneWithLegacy();
        plantBuild(legacyDir);
        const named = tempDir('named');

        expect(paths.resolveBrowserCacheDir({ browserCacheDir: named })).toBe(named);
    });

    test('does not apply when PUPPETEER_CACHE_DIR was set', async () => {
        const chosen = tempDir('puppeteer');
        process.env.PUPPETEER_CACHE_DIR = chosen;
        const { paths, legacyDir } = await standaloneWithLegacy();
        plantBuild(legacyDir);

        expect(paths.resolveBrowserCacheDir({})).toBe(chosen);
    });

    test('does not apply when the previous location is empty either', async () => {
        const { paths, seaDir } = await standaloneWithLegacy();

        expect(paths.resolveBrowserCacheDir({})).toBe(path.join(seaDir, 'browser-cache'));
    });

    test('is not offered to a plain-Node run, whose default is the legacy location', async () => {
        const home = tempDir('home');
        const legacyDir = path.join(home, '.cache', 'puppeteer');
        fs.mkdirSync(legacyDir, { recursive: true });
        plantBuild(legacyDir);

        const { paths } = await loadPaths({ isSea: false, home });

        expect(paths.resolveBrowserCacheDir({})).toBe(legacyDir);
        expect(paths.describeBrowserCacheDir({}).source).toBe('default');
    });
});

describe('logging', () => {
    test('a non-default source is announced once, not once per app', async () => {
        // launchBrowserForApp runs once per app and resolves twice, so an unconditional
        // info line would print this forty times in a twenty-app run.
        const chosen = tempDir('chosen');
        const { paths, logger } = await loadPaths();

        paths.resolveBrowserCacheDir({ browserCacheDir: chosen });
        paths.resolveBrowserCacheDir({ browserCacheDir: chosen });
        paths.resolveBrowserCacheDir({ browserCacheDir: chosen });

        expect(logger.info).toHaveBeenCalledTimes(1);
        expect(logger.info.mock.calls[0][0]).toContain(chosen);
    });

    test('the default location is not announced at all', async () => {
        const { paths, logger } = await loadPaths();

        paths.resolveBrowserCacheDir({});

        expect(logger.info).not.toHaveBeenCalled();
        expect(logger.debug).toHaveBeenCalled();
    });

    test('two alternating messages are each announced once, not once per app', async () => {
        // The shape of a real thumbnail run on a standalone build that still reads the
        // previous location: launchBrowserForApp resolves the write side and then, through
        // detection, the read side - once per app. Those two produce different sentences, so
        // remembering only the last one announced suppresses nothing at all.
        const seaDir = tempDir('sea');
        const home = tempDir('home');
        const legacyDir = path.join(home, '.cache', 'puppeteer');
        fs.mkdirSync(legacyDir, { recursive: true });
        plantBuild(legacyDir);

        const { paths, logger } = await loadPaths({
            isSea: true,
            home,
            execPath: path.join(seaDir, 'butler-sheet-icons'),
        });

        for (let app = 0; app < 3; app++) {
            paths.resolveBrowserCacheDirForWriting({});
            paths.resolveBrowserCacheDir({});
        }

        expect(logger.info).toHaveBeenCalledTimes(2);
    });

    test('a changed directory is announced again', async () => {
        const first = tempDir('first');
        const second = tempDir('second');
        const { paths, logger } = await loadPaths();

        paths.resolveBrowserCacheDir({ browserCacheDir: first });
        paths.resolveBrowserCacheDir({ browserCacheDir: second });

        expect(logger.info).toHaveBeenCalledTimes(2);
    });
});

describe('describeBrowserCacheDir', () => {
    test('names the source of every tier', async () => {
        const seaDir = tempDir('sea');
        const { paths } = await loadPaths({
            isSea: true,
            home: tempDir('home'),
            execPath: path.join(seaDir, 'butler-sheet-icons'),
        });

        expect(paths.describeBrowserCacheDir({ browserCacheDir: '/x' }).source).toBe('option');
        expect(paths.describeBrowserCacheDir({}).source).toBe('standalone');

        process.env.PUPPETEER_CACHE_DIR = '/y';
        expect(paths.describeBrowserCacheDir({}).source).toBe('puppeteer-env');
    });

    test('has a human-readable label for every source it can report', async () => {
        const { paths } = await loadPaths();

        for (const source of ['option', 'puppeteer-env', 'standalone', 'default', 'legacy']) {
            expect(typeof paths.SOURCE_LABELS[source]).toBe('string');
        }
    });
});

describe('BROWSER_CACHE_SUBDIRS', () => {
    test('covers every browser type @puppeteer/browsers can install', async () => {
        // The list is maintained here rather than imported, because this module must not
        // depend on @puppeteer/browsers. That is exactly why it can drift, so the real
        // package is the reference in this one test: an added browser type fails here
        // instead of leaving a directory behind on uninstall-all.
        const { paths } = await loadPaths();

        expect([...paths.BROWSER_CACHE_SUBDIRS].sort()).toEqual(Object.values(Browser).sort());
    });
});

describe('isPermissionDenied', () => {
    /**
     * A filesystem error as Node really builds one.
     *
     * @param {string} code - Error code, e.g. `EACCES`.
     *
     * @returns {Error} The error, carrying `code`, `syscall` and `path`.
     */
    const fsError = (code) =>
        Object.assign(new Error(`${code}: permission denied, mkdir '/opt/browsers/chrome'`), {
            code,
            errno: -13,
            syscall: 'mkdir',
            path: '/opt/browsers/chrome',
        });

    test.each([['EACCES'], ['EPERM'], ['EROFS']])('recognises a filesystem %s', async (code) => {
        const { paths } = await loadPaths();

        expect(paths.isPermissionDenied(fsError(code))).toBe(true);
    });

    test('recognises one wrapped in the "All providers failed" summary', async () => {
        // @puppeteer/browsers catches each provider's error and rebuilds a plain Error from
        // the messages, so the code, the path and the cause are all gone by the time the
        // install rejects. The message text is the only evidence left.
        const { paths } = await loadPaths();
        const wrapped = new Error(
            "All providers failed for chrome 151.0.7922.77:\n  - DefaultProvider: EACCES: permission denied, mkdir '/opt/browsers/chrome'"
        );

        expect(paths.isPermissionDenied(wrapped)).toBe(true);
    });

    test('does not mistake a blocked network connection for an unwritable directory', async () => {
        // Windows firewalls and endpoint protection commonly fail an outbound connection with
        // EPERM. Reported as a permission problem with the cache directory, it sends an
        // administrator to fix a directory that is perfectly writable - on exactly the
        // air-gapped servers this option exists for.
        const { paths } = await loadPaths();
        const netError = Object.assign(new Error('connect EPERM 142.250.74.14:443'), {
            code: 'EPERM',
            errno: -1,
            syscall: 'connect',
            address: '142.250.74.14',
            port: 443,
        });

        expect(paths.isPermissionDenied(netError)).toBe(false);
    });

    test('does not mistake a wrapped network failure either', async () => {
        const { paths } = await loadPaths();
        const wrapped = new Error(
            'All providers failed for chrome 151.0.7922.77:\n  - DefaultProvider: connect EPERM 142.250.74.14:443'
        );

        expect(paths.isPermissionDenied(wrapped)).toBe(false);
    });

    test.each([[undefined], [null], ['a string throw'], [new Error('boom')]])(
        'says no for %p',
        async (value) => {
            const { paths } = await loadPaths();

            expect(paths.isPermissionDenied(value)).toBe(false);
        }
    );

    testOnPosix('the error the pre-flight check throws is recognised as one', async () => {
        // Otherwise browserInstall's own refusal falls through to the generic branch and is
        // reported as an unexplained install failure.
        const { paths } = await loadPaths();
        const parent = tempDir('readonly');
        fs.chmodSync(parent, 0o500);

        try {
            paths.assertCacheDirWritable(path.join(parent, 'browser-cache'));
            expect('should have thrown').toBe('but did not');
        } catch (err) {
            expect(paths.isPermissionDenied(err)).toBe(true);
        } finally {
            fs.chmodSync(parent, 0o700);
        }
    });
});

describe('assertCacheDirWritable', () => {
    test('accepts a writable directory', async () => {
        const { paths } = await loadPaths();
        const dir = tempDir('writable');

        expect(() => paths.assertCacheDirWritable(dir)).not.toThrow();
    });

    test('accepts a directory that does not exist yet but can be created', async () => {
        const { paths } = await loadPaths();
        const dir = tempDir('writable');

        expect(() =>
            paths.assertCacheDirWritable(path.join(dir, 'not', 'there', 'yet'))
        ).not.toThrow();
    });

    testOnPosix('refuses an unwritable location by naming the fix, not the errno', async () => {
        const { paths } = await loadPaths();
        const parent = tempDir('readonly');
        const dir = path.join(parent, 'browser-cache');
        fs.chmodSync(parent, 0o500);

        try {
            expect(() => paths.assertCacheDirWritable(dir)).toThrow(/--browser-cache-dir/);
            expect(() => paths.assertCacheDirWritable(dir)).toThrow(/BSI_BROWSER_CACHE_DIR/);
            expect(() => paths.assertCacheDirWritable(dir)).not.toThrow(/EACCES/);
        } finally {
            // Restored so the afterEach cleanup can remove it.
            fs.chmodSync(parent, 0o700);
        }
    });
});

describe('the browser executable override', () => {
    test('is absent when nothing names one', async () => {
        const { paths } = await loadPaths();

        expect(paths.resolveExecutablePathOverride({})).toBeNull();
        expect(paths.resolveExecutablePathOverride(undefined)).toBeNull();
    });

    test('takes --browser-executable-path, and marks it explicit', async () => {
        const { paths } = await loadPaths();

        expect(
            paths.resolveExecutablePathOverride({ browserExecutablePath: '/opt/chrome' })
        ).toEqual({
            path: path.resolve('/opt/chrome'),
            configuredValue: '/opt/chrome',
            source: 'option',
            explicit: true,
        });
    });

    test('falls back to PUPPETEER_EXECUTABLE_PATH, and does not mark it explicit', async () => {
        // The `explicit` flag is load-bearing: a path named with a Butler Sheet Icons option is
        // a stated intent and a missing file is fatal, while a stale inherited environment
        // variable is a much weaker signal that thousands of Docker setups rely on falling
        // through.
        process.env.PUPPETEER_EXECUTABLE_PATH = '/usr/bin/chromium';
        const { paths } = await loadPaths();

        expect(paths.resolveExecutablePathOverride({})).toEqual({
            path: path.resolve('/usr/bin/chromium'),
            configuredValue: '/usr/bin/chromium',
            source: 'puppeteer-env',
            explicit: false,
        });
    });

    test('prefers the option over PUPPETEER_EXECUTABLE_PATH', async () => {
        // Which also means it outranks the value the Docker image sets - that is how a
        // container user overrides the embedded Chromium, and it has to be documented.
        process.env.PUPPETEER_EXECUTABLE_PATH = '/usr/bin/chromium';
        const { paths } = await loadPaths();

        expect(
            paths.resolveExecutablePathOverride({ browserExecutablePath: '/opt/chrome' }).path
        ).toBe(path.resolve('/opt/chrome'));
    });

    test('reads BSI_BROWSER_EXECUTABLE_PATH as the option', async () => {
        // Commander puts the environment value on the same option property, so this is really
        // a check that nothing downstream cares which of the two the operator used.
        const { paths } = await loadPaths();

        expect(paths.resolveExecutablePathOverride({ browserExecutablePath: '/from/env' })).toEqual(
            {
                path: path.resolve('/from/env'),
                configuredValue: '/from/env',
                source: 'option',
                explicit: true,
            }
        );
    });

    test.each([
        ['an empty string', ''],
        ['whitespace', '   '],
    ])('treats %s as unset at every tier', async (_label, value) => {
        // `PUPPETEER_EXECUTABLE_PATH=""` meaning "ignore this" is a documented idiom for Docker
        // users; breaking it would be a regression, and Commander hands a bare
        // `BSI_BROWSER_EXECUTABLE_PATH=` line through as an empty string too.
        process.env.PUPPETEER_EXECUTABLE_PATH = value;
        const { paths } = await loadPaths();

        expect(paths.resolveExecutablePathOverride({ browserExecutablePath: value })).toBeNull();
    });

    test('resolves a relative path against the working directory', async () => {
        const { paths } = await loadPaths();

        expect(
            paths.resolveExecutablePathOverride({ browserExecutablePath: './chrome' }).path
        ).toBe(path.resolve('./chrome'));
    });
});

describe('the configured value a message should quote', () => {
    test('is the value as written, not as resolved', async () => {
        // A relative path printed back absolute is a string the operator cannot find in the
        // unit file or Dockerfile they are searching.
        const { paths } = await loadPaths();

        const override = paths.resolveExecutablePathOverride({
            browserExecutablePath: 'browsers/chrome',
        });

        expect(override.configuredValue).toBe('browsers/chrome');
        expect(override.path).toBe(path.resolve('browsers/chrome'));
    });

    test('is trimmed, so surrounding whitespace never reaches a message', async () => {
        const { paths } = await loadPaths();

        expect(
            paths.resolveExecutablePathOverride({ browserExecutablePath: '  /opt/chrome  ' })
                .configuredValue
        ).toBe('/opt/chrome');
    });
});
