import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';

import { logger, isSea } from '../../globals.js';

/**
 * Where Butler Sheet Icons keeps downloaded browsers, and who decided that.
 *
 * This lives in its own module, with no dependency on `@puppeteer/browsers`, because almost
 * every module in this directory needs the path and only two need the cache's contents.
 * Putting it beside `getBrowserInventory` would drag `getInstalledBrowsers` and
 * `detectBrowserPlatform` into the import graph of every caller - which, in a codebase whose
 * tests mock `@puppeteer/browsers` by enumerating its exports, turns a one-line change into
 * churn across five test files for no benefit.
 *
 * Everything here is computed on every call rather than captured in module constants, so a
 * test that mocks `os.homedir` still gets its own answer - an import-time constant would be
 * fixed before the mock was installed.
 */

/**
 * The subdirectories of a cache directory that belong to Butler Sheet Icons.
 *
 * `@puppeteer/browsers` lays out a cache as `<cacheDir>/<browser>/<platform>-<buildId>/`, and
 * puts the downloaded archive under the same `<cacheDir>/<browser>` folder while it unpacks.
 * Nothing it owns is ever written directly into the cache root.
 *
 * That matters because the cache directory is now chosen by the administrator: `uninstall-all`
 * used to empty the whole directory, which was harmless while the path was hardcoded and is
 * not harmless when someone points `BSI_BROWSER_CACHE_DIR` at a folder holding other things.
 *
 * Maintained here rather than imported from `@puppeteer/browsers` to keep this module free of
 * that dependency; `browser_paths.test.js` compares the list against the real package so it
 * cannot drift.
 */
export const BROWSER_CACHE_SUBDIRS = Object.freeze([
    'chrome',
    'chrome-headless-shell',
    'chromium',
    'firefox',
    'chromedriver',
]);

/**
 * Human-readable phrase for each way the cache directory can be decided.
 *
 * The CLI flag and its environment variable share one label on purpose. Commander can tell
 * them apart through `cmd.getOptionValueSource()`, but the worker functions do not reliably
 * receive the `Command` object - `commands.test.js` passes `{}`, and the integration tests
 * call workers directly - so one combined label is the honest thing to print.
 */
export const SOURCE_LABELS = Object.freeze({
    option: 'from --browser-cache-dir / BSI_BROWSER_CACHE_DIR',
    'puppeteer-env': 'from PUPPETEER_CACHE_DIR',
    standalone: 'default location next to the Butler Sheet Icons executable',
    default: 'default location',
    legacy: 'previous default location',
});

/**
 * Human-readable phrase for each way the browser executable can be named.
 *
 * Separate from {@link SOURCE_LABELS} rather than sharing its `option` and `puppeteer-env`
 * keys, because the two answer different questions and print different variable names. A
 * message that said "from --browser-cache-dir" about an executable would be actively wrong.
 */
export const EXECUTABLE_SOURCE_LABELS = Object.freeze({
    option: 'from --browser-executable-path / BSI_BROWSER_EXECUTABLE_PATH',
    'puppeteer-env': 'from PUPPETEER_EXECUTABLE_PATH',
});

/**
 * How to stop each source winning, phrased as the start of a sentence.
 *
 * A remedy that says "remove that setting" makes the reader work out which of two possible
 * settings was meant. Naming it is what makes the line copy-pasteable, which is the whole
 * point of putting a remedy in a log message.
 */
export const EXECUTABLE_SOURCE_REMOVAL = Object.freeze({
    option: 'Remove --browser-executable-path / BSI_BROWSER_EXECUTABLE_PATH',
    'puppeteer-env': 'Unset PUPPETEER_EXECUTABLE_PATH',
});

/**
 * The cache directory Butler Sheet Icons has always used.
 *
 * Built with `path.join(homedir(), '.cache', 'puppeteer')`, which is byte-identical to the
 * previous `path.join(homedir(), '.cache/puppeteer')` on both POSIX and Windows because
 * `path.join` normalises separators. That equivalence is what makes this change a no-op for
 * everyone not running a standalone binary, so it is asserted in a test rather than assumed -
 * this repo has been bitten by a separator assumption once already (issue #855).
 *
 * @returns {string} Absolute path to the default browser cache directory.
 */
export const getDefaultBrowserCacheDir = () => path.join(homedir(), '.cache', 'puppeteer');

/**
 * A configured value, or `undefined` when it is absent or blank.
 *
 * Empty means unset at every tier. Commander's environment handling tests
 * `option.envVar in process.env`, so a bare `BSI_BROWSER_CACHE_DIR=` line in a systemd unit
 * or docker-compose file arrives here as `''` rather than `undefined` - and
 * `PUPPETEER_EXECUTABLE_PATH=""` meaning "ignore this" is already a documented Butler Sheet
 * Icons idiom for Docker users, so the empty string has to keep meaning the same thing.
 *
 * `path.resolve` so a relative value is used, and logged, as the absolute path it really
 * names: under a scheduled task the working directory is rarely what the administrator
 * expects. `~` is deliberately not expanded - Node does not, and doing so would surprise.
 *
 * @param {string} [value] - Raw configured value.
 *
 * @returns {string|undefined} The absolute path, or `undefined` when nothing was configured.
 */
const configured = (value) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';

    return trimmed === '' ? undefined : path.resolve(trimmed);
};

/**
 * How many cached browser builds a directory holds.
 *
 * Only the directories the cache owns are looked at, and any failure counts as "none": an
 * unreadable or missing directory is not a reason to abort resolving a path, and this is
 * called on every resolution.
 *
 * @param {string} cacheDir - Directory to inspect.
 *
 * @returns {number} Number of build directories found.
 */
const countCachedBuilds = (cacheDir) => {
    let count = 0;

    for (const subdir of BROWSER_CACHE_SUBDIRS) {
        try {
            count += fs
                .readdirSync(path.join(cacheDir, subdir), { withFileTypes: true })
                .filter((entry) => entry.isDirectory()).length;
        } catch {
            // Missing or unreadable: nothing to count, and nothing worth saying.
        }
    }

    return count;
};

/**
 * Decide which cache directory to use, and say where the decision came from.
 *
 * Pure: no logging, no filesystem writes. The precedence is
 *
 * 1. `--browser-cache-dir` / `BSI_BROWSER_CACHE_DIR`
 * 2. `PUPPETEER_CACHE_DIR`
 * 3. standalone builds only: `<directory containing the executable>/browser-cache`
 * 4. `~/.cache/puppeteer`
 *
 * Tier 3 is gated strictly on `isSea`, and reads `process.execPath` rather than
 * `bsiExecutablePath`: that export falls back to `process.cwd()` when not running as a
 * standalone binary, and the working directory of a scheduled task must never become a cache
 * location. The Docker image runs plain Node, so `isSea` is false there and its behaviour is
 * unchanged.
 *
 * `PUPPETEER_CACHE_DIR` is read here, in code, because Commander cannot express it:
 * `Option.env()` stores a single variable name, there is only one environment precedence
 * level so `BSI_` could not be made to beat `PUPPETEER_`, and a `.default()` on the option
 * would make the value always truthy and this tier unreachable. `AGENTS.md` says to avoid
 * scattering hardcoded environment reads through business logic; one read in the one module
 * that owns this decision honours that, and `browser-detect.js` and `globals.js` set the
 * precedent.
 *
 * @param {object} [options] - Options bag as Commander produces it.
 * @param {string} [options.browserCacheDir] - Directory named by the administrator.
 *
 * @returns {{cacheDir: string, source: string, primaryCacheDir: string, primarySource: string, legacyCacheDir: string|undefined, legacyBuildCount: number}}
 * `cacheDir` is where browsers should be read from and `primaryCacheDir` where they must be
 * written; the two differ only when the legacy fallback applies.
 */
export const describeBrowserCacheDir = (options) => {
    const fromOption = configured(options?.browserCacheDir);
    const fromPuppeteerEnv = configured(process.env.PUPPETEER_CACHE_DIR);

    let primaryCacheDir;
    let primarySource;

    if (fromOption) {
        primaryCacheDir = fromOption;
        primarySource = 'option';
    } else if (fromPuppeteerEnv) {
        primaryCacheDir = fromPuppeteerEnv;
        primarySource = 'puppeteer-env';
    } else if (isSea) {
        primaryCacheDir = path.join(path.dirname(process.execPath), 'browser-cache');
        primarySource = 'standalone';
    } else {
        primaryCacheDir = getDefaultBrowserCacheDir();
        primarySource = 'default';
    }

    const described = {
        cacheDir: primaryCacheDir,
        source: primarySource,
        primaryCacheDir,
        primarySource,
        legacyCacheDir: undefined,
        legacyBuildCount: 0,
    };

    // The read-only fallback to the previous default location.
    //
    // Moving the standalone default would otherwise mean every existing standalone user
    // silently re-downloads ~150 MB once - precisely the failure this work exists to prevent,
    // and unrecoverable for anyone who has already gone offline.
    //
    // Only tier 3 gets this. Someone who named a directory, or set PUPPETEER_CACHE_DIR, meant
    // it, and quietly reading somewhere else would be worse than finding nothing.
    //
    // It is READ-ONLY, which is why `primaryCacheDir` is reported separately: installs always
    // write to the resolved primary, so the cache migrates by being used rather than growing a
    // second copy. Do not "tidy up" the asymmetry.
    if (primarySource !== 'standalone') {
        return described;
    }

    const legacyCacheDir = getDefaultBrowserCacheDir();

    if (legacyCacheDir === primaryCacheDir || countCachedBuilds(primaryCacheDir) > 0) {
        return described;
    }

    const legacyBuildCount = countCachedBuilds(legacyCacheDir);

    if (legacyBuildCount === 0) {
        return described;
    }

    return {
        ...described,
        cacheDir: legacyCacheDir,
        source: 'legacy',
        legacyCacheDir,
        legacyBuildCount,
    };
};

/**
 * Every line already announced at `info`, so the same news is not repeated.
 *
 * `launchBrowserForApp` runs once per app and resolves the cache directory twice, so an
 * unconditional `info` line would print the same sentence forty times in a twenty-app run.
 * A message not seen before is still announced, which is what makes this deduplication rather
 * than suppression.
 *
 * A set rather than "the last one announced": the two resolutions per app do not always agree.
 * On a standalone build reading from the previous default location, the write side announces
 * the primary directory and the read side announces the migration line, so a single-slot memory
 * sees a different message every time and suppresses nothing - the exact case this exists for.
 */
const announced = new Set();

/**
 * Log where the cache directory came from: always at `debug`, once at `info` when it is not
 * the historical default.
 *
 * The `info` line matters most for `PUPPETEER_CACHE_DIR`: anyone who already has it set has
 * had Butler Sheet Icons ignore it until now, and after this change Butler Sheet Icons looks
 * somewhere else and appears to have lost its browsers. This line is what makes that
 * diagnosable from a log an administrator sends in.
 *
 * @param {object} described - The result of {@link describeBrowserCacheDir}.
 *
 * @returns {void}
 */
const announce = (described) => {
    const { cacheDir, source, primaryCacheDir, legacyBuildCount } = described;

    logger.debug(`Browser cache directory: ${cacheDir} (${SOURCE_LABELS[source]})`);

    if (source === 'default') {
        return;
    }

    const message =
        source === 'legacy'
            ? `No browsers found in ${primaryCacheDir}, but ${legacyBuildCount} ${
                  legacyBuildCount === 1 ? 'was' : 'were'
              } found in the previous default location ${cacheDir}. Using the previous location for now. Move that directory next to the Butler Sheet Icons executable, or set --browser-cache-dir, to keep using it.`
            : `Browser cache directory: ${cacheDir} (${SOURCE_LABELS[source]})`;

    if (announced.has(message)) {
        return;
    }

    announced.add(message);
    logger.info(message);
};

/**
 * The cache directory to read browsers from.
 *
 * Called at the point of use inside each worker rather than once at the command layer.
 * Several integration tests call workers directly with a bare object - `browserInstalled({})`,
 * for one - and eager resolution would hand them `cacheDir: undefined`, which throws inside
 * `@puppeteer/browsers` on the first `path.join`. Resolving lazily keeps every worker
 * independently callable, touches no command handler, and is idempotent.
 *
 * @param {object} [options] - Options bag as Commander produces it.
 * @param {string} [options.browserCacheDir] - Directory named by the administrator.
 *
 * @returns {string} Absolute path to the cache directory to read.
 */
export const resolveBrowserCacheDir = (options) => {
    const described = describeBrowserCacheDir(options);

    announce(described);

    return described.cacheDir;
};

/**
 * The cache directory to install browsers into.
 *
 * Differs from {@link resolveBrowserCacheDir} only when the legacy fallback is in play, where
 * reads come from the previous default location but writes must not.
 *
 * @param {object} [options] - Options bag as Commander produces it.
 * @param {string} [options.browserCacheDir] - Directory named by the administrator.
 *
 * @returns {string} Absolute path to the cache directory to write to.
 */
export const resolveBrowserCacheDirForWriting = (options) => {
    const described = describeBrowserCacheDir(options);

    // Announced as the primary, never as the legacy fallback. "Using the previous location for
    // now" is true of a read and false of the install that is about to happen, and printing it
    // here would tell an administrator the browser went somewhere it did not.
    announce({
        ...described,
        cacheDir: described.primaryCacheDir,
        source: described.primarySource,
    });

    return described.primaryCacheDir;
};

/**
 * The browser executable an administrator has named, if any.
 *
 * Two tiers, and the order between them matters more than it looks:
 *
 * 1. `--browser-executable-path` / `BSI_BROWSER_EXECUTABLE_PATH`
 * 2. `PUPPETEER_EXECUTABLE_PATH`
 *
 * `explicit` is what separates them, and it is load-bearing rather than decorative. A path
 * named through a Butler Sheet Icons option is a stated intent: if the file is not there,
 * quietly downloading some other browser instead is a compliance problem in a regulated Qlik
 * estate and, on an air-gapped machine, a guaranteed failure with a misleading error. A
 * `PUPPETEER_EXECUTABLE_PATH` inherited from a container image or a developer shell is a far
 * weaker signal, and thousands of existing setups depend on it falling through to the cache.
 * `detectAvailableBrowser` acts on that distinction; this function only records it.
 *
 * The option outranking `PUPPETEER_EXECUTABLE_PATH` also means it outranks the value the
 * official Docker image sets. That is intended - it is how a container user points Butler
 * Sheet Icons at a different browser - and it is documented.
 *
 * Read here rather than through Commander for the same reasons `PUPPETEER_CACHE_DIR` is:
 * `Option.env()` holds one variable name, and Commander has a single environment precedence
 * level, so "BSI_ beats PUPPETEER_" is not expressible there.
 *
 * `configuredValue` is the value as the operator wrote it, and messages quote that rather than
 * `path`. The two differ for a relative path, and quoting the resolved one back at someone
 * hunting through a unit file for a string they never typed helps nobody.
 *
 * @param {object} [options] - Options bag as Commander produces it.
 * @param {string} [options.browserExecutablePath] - Path named by the administrator.
 *
 * @returns {{path: string, configuredValue: string, source: string, explicit: boolean}|null}
 * The override, or `null` when nothing names one.
 */
export const resolveExecutablePathOverride = (options) => {
    /**
     * One tier of the lookup.
     *
     * @param {string} [value] - Raw configured value.
     * @param {string} source - Which setting it came from.
     * @param {boolean} explicit - Whether it was named through a Butler Sheet Icons option.
     *
     * @returns {object|null} The override for this tier, or `null` when it is unset.
     */
    const tier = (value, source, explicit) => {
        const resolved = configured(value);

        return resolved
            ? { path: resolved, configuredValue: value.trim(), source, explicit }
            : null;
    };

    return (
        tier(options?.browserExecutablePath, 'option', true) ??
        tier(process.env.PUPPETEER_EXECUTABLE_PATH, 'puppeteer-env', false)
    );
};

/**
 * The message shown when the cache directory cannot be written to.
 *
 * @param {string} cacheDir - The directory that could not be written to.
 *
 * @returns {string} A message naming the fix.
 */
export const unwritableCacheDirMessage = (cacheDir) =>
    `Cannot write to the browser cache directory ${cacheDir}. Choose a writable location with --browser-cache-dir or BSI_BROWSER_CACHE_DIR, or run Butler Sheet Icons from a directory you can write to.`;

/** Error codes the operating system uses to refuse access to a file or directory. */
const PERMISSION_CODES = ['EACCES', 'EPERM', 'EROFS'];

/**
 * Node's own wording for a refused filesystem operation: `EACCES: permission denied, mkdir '/x'`.
 *
 * The trailing syscall and quoted path are what make this specific to the filesystem. A network
 * failure carrying the same code reads `connect EPERM 142.250.74.14:443` and does not match.
 */
const PERMISSION_MESSAGE = /\b(?:EACCES|EPERM|EROFS): [^,]+, \w+ '/;

/**
 * Whether an error is the operating system refusing access **to a file or directory**.
 *
 * The distinction matters because `EPERM` is not exclusive to the filesystem: on Windows a
 * firewall or endpoint-protection product routinely fails an outbound connection with
 * `connect EPERM <address>:443`. Treating that as an unwritable cache directory would send an
 * administrator to fix permissions on a directory that is perfectly writable - on exactly the
 * locked-down servers this option exists for.
 *
 * Two ways an error qualifies, because the second is not optional: `@puppeteer/browsers` catches
 * each provider's failure and rebuilds a plain `Error` from the messages, so by the time
 * `install()` rejects, the code, the path and the cause are all gone and the message text is the
 * only evidence left.
 *
 * @param {unknown} err - The error to test.
 *
 * @returns {boolean} `true` when the filesystem refused access.
 */
export const isPermissionDenied = (err) => {
    if (PERMISSION_CODES.includes(err?.code)) {
        // A real filesystem error always names the path it could not touch; a socket error
        // carries `address` and `port` instead.
        return typeof err.path === 'string';
    }

    return PERMISSION_MESSAGE.test(err?.message ?? '');
};

/**
 * The closest ancestor of a path that exists, including the path itself.
 *
 * @param {string} target - Path to walk up from.
 *
 * @returns {string|undefined} The existing ancestor, or `undefined` if none was found.
 */
const nearestExistingAncestor = (target) => {
    let current = target;

    for (;;) {
        if (fs.existsSync(current)) {
            return current;
        }

        const parent = path.dirname(current);

        if (parent === current) {
            return undefined;
        }

        current = parent;
    }
};

/**
 * Refuse an unwritable cache directory before anything is downloaded.
 *
 * A standalone binary unzipped under `C:\Program Files\` resolves to a cache directory nobody
 * can write to, and the raw `EACCES` that follows names neither the directory nor the fix.
 *
 * The nearest existing ancestor is tested rather than the directory itself, because the cache
 * directory usually does not exist yet and this check must not create it.
 *
 * Only a refusal by the operating system is treated as an answer. Anything else - including a
 * stubbed `fs` in a unit test - means "cannot tell", and the install is left to produce its own
 * error. Note also that on Windows `fs.access(W_OK)` only inspects the read-only attribute and
 * not the ACLs, so this check can pass on exactly the `C:\Program Files\` case above; the
 * `EACCES` translation in `browser-install.js` is what covers that.
 *
 * @param {string} cacheDir - The resolved cache directory an install would write to.
 *
 * @returns {void}
 *
 * @throws {Error} When the directory is known to be unwritable.
 */
export const assertCacheDirWritable = (cacheDir) => {
    try {
        const existing = nearestExistingAncestor(cacheDir);

        if (!existing) {
            return;
        }

        fs.accessSync(existing, fs.constants.W_OK);

        return;
    } catch (err) {
        if (!isPermissionDenied(err)) {
            logger.debug(`Could not check whether ${cacheDir} is writable: ${err?.message ?? err}`);

            return;
        }
    }

    // Shaped like the filesystem error it stands for - code *and* path - so that
    // `isPermissionDenied` recognises it and `browserInstall` reports it through the same
    // branch as an EACCES raised by the install itself.
    const err = new Error(unwritableCacheDirMessage(cacheDir));
    err.code = 'EACCES';
    err.path = cacheDir;

    throw err;
};
