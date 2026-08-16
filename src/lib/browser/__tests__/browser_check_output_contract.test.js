import { jest, test, expect, describe, beforeEach } from '@jest/globals';
import os from 'node:os';
import path from 'node:path';

/**
 * `browser check` - the printed output, line for line.
 *
 * A characterisation test, and deliberately the least clever kind. `browser check` shipped in
 * #1069 and is documented as a deployment gate, so people have already scripted against its
 * output. When `doctor check` was added (#1063) the worker was re-pointed at a shared runner so
 * the two commands could not drift apart in formatting - and "did that change what `browser check`
 * prints?" is a question no assertion about `report.ok` can answer.
 *
 * So this records every line, at the level it was logged, in the order it was logged, for one
 * healthy machine and one that cannot take screenshots. It fails on a reordered block, a reworded
 * verdict, a lost fact row, a dropped disclaimer line and a changed exit verdict alike.
 *
 * Machine-specific values are scrubbed rather than asserted: the home directory, the account name
 * and the host platform belong to whoever runs the suite, and the remediation command's prefix is
 * chosen by `process.platform`. Everything else - wording, order, indentation, level - is exact.
 */

const logged = [];

const record =
    (level) =>
    (...args) => {
        logged.push(`${level}: ${String(args[0])}`);
    };

const loggerMock = {
    info: jest.fn(record('info')),
    warn: jest.fn(record('warn')),
    error: jest.fn(record('error')),
    // verbose and debug are recorded too, so a fact quietly demoted out of the visible report
    // shows up here as a level change rather than as a silently missing line.
    verbose: jest.fn(record('verbose')),
    debug: jest.fn(record('debug')),
};

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: loggerMock,
    setLoggingLevel: jest.fn(),
    isSea: false,
    bsiExecutablePath: '/opt/bsi',
    appVersion: 'test-version',
}));

jest.unstable_mockModule('@puppeteer/browsers', () => ({
    canDownload: jest.fn().mockResolvedValue(true),
    computeExecutablePath: jest.fn(),
    detectBrowserPlatform: jest.fn().mockReturnValue('win64'),
    getInstalledBrowsers: jest.fn().mockResolvedValue([]),
    getVersionComparator: jest.fn(),
    install: jest.fn(),
    resolveBuildId: jest.fn(),
    uninstall: jest.fn(),
}));

jest.unstable_mockModule('../browser-detect.js', () => ({
    detectAvailableBrowser: jest.fn(),
}));

jest.unstable_mockModule('../browser-inventory.js', () => ({
    getBrowserInventory: jest.fn().mockResolvedValue([]),
    hasUsableExecutable: jest.fn().mockReturnValue(true),
    canRunOnHost: jest.fn().mockReturnValue(true),
}));

jest.unstable_mockModule('../browser-install.js', () => ({
    browserInstall: jest.fn(),
}));

const launchMock = jest.fn();
jest.unstable_mockModule('puppeteer-core', () => ({
    default: { launch: launchMock },
}));

const { detectAvailableBrowser } = await import('../browser-detect.js');
const { getBrowserInventory } = await import('../browser-inventory.js');
const { browserCheck } = await import('../browser-check.js');

const CACHE_DIR = path.join(os.tmpdir(), 'bsi-browser-check-output-contract');

/**
 * The account name, resolved the way the context builder resolves it.
 *
 * @returns {string} The username, or `unknown` where there is no passwd entry.
 */
const currentUser = () => {
    try {
        return os.userInfo().username;
    } catch {
        return 'unknown';
    }
};

/**
 * Replaces the values that belong to whoever is running the suite.
 *
 * Longest-first, because the working directory is frequently a path under the home directory and
 * scrubbing the shorter one first would leave a half-substituted line.
 *
 * @param {string} line - A logged line.
 *
 * @returns {string} The line with machine-specific values replaced by placeholders.
 */
const scrub = (line) => {
    const replacements = [
        [CACHE_DIR, '<cacheDir>'],
        [process.execPath, '<execPath>'],
        [process.cwd(), '<cwd>'],
        [os.homedir(), '<home>'],
        [`${process.platform} ${process.arch}`, '<platform> <arch>'],
        [currentUser(), '<user>'],
        // The renderer prints the command for this host only, and picks it by `process.platform`.
        ['butler-sheet-icons.exe ', '<bsi> '],
        ['./butler-sheet-icons ', '<bsi> '],
    ].sort((a, b) => b[0].length - a[0].length);

    return replacements.reduce((text, [from, to]) => text.split(from).join(to), line);
};

/** The first line of the report, and the anchor everything below is measured from. */
const HEADING = 'info: Butler Sheet Icons browser check';

/**
 * The report as printed, scrubbed, in the order it was logged.
 *
 * Anchored on the heading rather than taking everything the logger was handed. What comes before
 * it is worker chatter - the options dump, the launch arguments - and some of it is genuinely
 * host-dependent: `buildBrowserArgs()` adds `--single-process` on non-Windows only, so a full
 * transcript would assert on which machine ran the suite. The report itself is what shipped and
 * what people have scripted against.
 *
 * @returns {string[]} The report lines, `level: text`.
 */
const lines = () => {
    const all = logged.map(scrub);
    const start = all.indexOf(HEADING);

    // Not `-1` silently becoming `slice(0)`: a report with no heading is a failure worth seeing as
    // one, rather than as a diff of the whole transcript against the expected report.
    expect(start).toBeGreaterThanOrEqual(0);

    return all.slice(start);
};

/**
 * Options with a cache directory of this suite's own, so nothing depends on the real one.
 *
 * @param {object} [extra] - Extra options to merge in.
 *
 * @returns {object} An options bag.
 */
const options = (extra = {}) => ({
    browser: 'chrome',
    browserVersion: '138.0.7204.94',
    headless: 'true',
    browserCacheDir: CACHE_DIR,
    ...extra,
});

beforeEach(() => {
    logged.length = 0;
    delete process.env.PUPPETEER_CACHE_DIR;
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
    getBrowserInventory.mockResolvedValue([]);
    launchMock.mockResolvedValue({
        version: jest.fn().mockResolvedValue('Chrome/138.0.7204.94'),
        close: jest.fn().mockResolvedValue(undefined),
    });
});

describe('the report a healthy machine gets', () => {
    test('is printed exactly as it was when the command shipped', async () => {
        detectAvailableBrowser.mockResolvedValue({
            executablePath: '/usr/bin/chromium',
            source: 'system',
            browser: 'chrome',
            buildId: '138.0.7204.94',
        });

        const report = await browserCheck(options({ browserExecutablePath: process.execPath }));

        expect(report.ok).toBe(true);
        expect(lines()).toEqual(HEALTHY);
    });
});

describe('the report a machine with no usable browser gets', () => {
    test('is printed exactly as it was when the command shipped', async () => {
        detectAvailableBrowser.mockResolvedValue(null);

        const report = await browserCheck(options());

        expect(report.ok).toBe(false);
        expect(lines()).toEqual(NOTHING_USABLE);
    });
});

/** The whole report, on a machine that can take screenshots. */
const HEALTHY = [
    HEADING,
    'info: Environment',
    'info:     Platform            : <platform> <arch> (Puppeteer platform "win64")',
    'info:     Running as user     : <user>',
    'info:     Home directory      : <home>',
    'info:     Working directory   : <cwd>',
    'info:     Standalone binary   : false',
    'verbose:     Machine and account details',
    'info: Browser executable',
    'info:     Source              : from --browser-executable-path / BSI_BROWSER_EXECUTABLE_PATH',
    'info:     Path                : <execPath>',
    'info:     Exists              : yes',
    'verbose:     The configured browser executable exists',
    'info: Browser cache',
    'info:     Source              : from --browser-cache-dir / BSI_BROWSER_CACHE_DIR',
    'info:     Directory           : <cacheDir>',
    'info:     Directory exists    : no',
    'info:     In use              : no (an executable path is configured, so the cache is not consulted)',
    'info:     Cached builds       : 0',
    'verbose:     The browser cache holds no browser builds',
    'info: Selection',
    'info:     Requested           : chrome 138.0.7204.94',
    'info:     Would use           : system browser',
    'info:     Executable          : /usr/bin/chromium',
    'verbose:     A browser was selected without downloading one',
    'info: Launch test',
    'info:     Launched            : yes',
    'info:     Reported version    : Chrome/138.0.7204.94',
    'verbose:     The browser started and responded',
    'info: Note: these findings are best-effort. Butler Sheet Icons reports what it can observe on this',
    'info: machine, and cannot see everything about your environment - group policy, antivirus, proxy rules',
    'info: and Qlik Sense itself are all invisible to it. Review suggested commands before running them on a',
    'info: production server.',
    'info: Result: OK - Butler Sheet Icons can take screenshots on this machine without internet access.',
];

/** The whole report, on a machine where a real run would have to download a browser. */
const NOTHING_USABLE = [
    HEADING,
    'info: Environment',
    'info:     Platform            : <platform> <arch> (Puppeteer platform "win64")',
    'info:     Running as user     : <user>',
    'info:     Home directory      : <home>',
    'info:     Working directory   : <cwd>',
    'info:     Standalone binary   : false',
    'verbose:     Machine and account details',
    'info: Browser executable',
    'info:     Configured          : no',
    'verbose:     No browser executable is configured',
    'info: Browser cache',
    'info:     Source              : from --browser-cache-dir / BSI_BROWSER_CACHE_DIR',
    'info:     Directory           : <cacheDir>',
    'info:     Directory exists    : no',
    'info:     In use              : yes',
    'info:     Cached builds       : 0',
    'verbose:     The browser cache holds no browser builds',
    'info: Selection',
    'info:     Requested           : chrome 138.0.7204.94',
    'info:     Would use           : nothing - a browser would have to be downloaded',
    'error:     Neither a configured browser executable nor a usable build in <cacheDir> could be used for chrome 138.0.7204.94. A real run would try to download a browser, which needs internet access.',
    'info: Note: these findings are best-effort. Butler Sheet Icons reports what it can observe on this',
    'info: machine, and cannot see everything about your environment - group policy, antivirus, proxy rules',
    'info: and Qlik Sense itself are all invisible to it. Review suggested commands before running them on a',
    'info: production server.',
    'error: Result: FAILED - no usable browser was found, and taking screenshots would require downloading one over the internet',
    'error: Next steps:',
    'error:     1. On a machine with internet access, and the same operating system as this one, run:',
    'error:        <bsi> browser install --browser chrome --browser-version recommended',
    "error:     2. Copy that machine's browser cache directory to this machine, and point Butler Sheet Icons at it with --browser-cache-dir or BSI_BROWSER_CACHE_DIR.",
    'error:     3. Or, if Chrome or Edge is already installed here, point at it with --browser-executable-path or BSI_BROWSER_EXECUTABLE_PATH.',
];
