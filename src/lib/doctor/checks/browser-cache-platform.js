import { SEVERITY, finding } from '../findings.js';
import { failedTheRun } from './cache-severity.js';

/**
 * Whether the browser cache holds a build this machine can actually run.
 *
 * The most likely staging mistake, and the one whose old symptom named nothing useful: the
 * connected machine an administrator downloads a browser on is usually their own Mac, and the
 * target is a Windows server. A cache copied between the two contains perfectly real browser
 * builds that this machine cannot execute.
 *
 * This check also carries the cache overview - where the cache is, whether it exists, whether it
 * will be consulted at all, and what is in it. Those facts belong to the section rather than to
 * one check, and this is the first check in it. The second cache check ({@link
 * ./browser-cache-executable.js}) renders under the same heading.
 */

/** Column widths for the per-build lines, so the list reads as a table. */
const NAME_WIDTH = 24;
const PLATFORM_WIDTH = 18;

/**
 * One line describing a cached build.
 *
 * @param {object} build - A build from the context's cache inventory.
 *
 * @returns {string} The rendered line.
 */
const buildLine = (build) => {
    const name = `${build.browser} ${build.buildId}`.padEnd(NAME_WIDTH);
    const platform = `platform=${build.platform}`.padEnd(PLATFORM_WIDTH);
    const executable = build.executableExists ? 'executable present' : 'executable MISSING';

    return `${name} ${platform} ${executable.padEnd(20)} ${build.usable ? 'usable' : `not usable (${build.reason})`}`;
};

/**
 * The cache facts every finding in this section is read against.
 *
 * @param {object} ctx - The check context.
 *
 * @returns {import('../findings.js').Fact[]} The facts.
 */
const cacheFacts = (ctx) => {
    const { cache } = ctx;

    return [
        { label: 'Source', value: cache.sourceLabel },
        { label: 'Directory', value: cache.dir },
        { label: 'Directory exists', value: cache.exists ? 'yes' : 'no' },
        {
            // Not decoration. When both an executable path and a cache directory are configured,
            // the cache is not consulted at all - and without this line administrators file bugs
            // about a cache directory that "does nothing".
            label: 'In use',
            value: cache.inUse ? 'yes' : `no (${cache.notConsultedReason})`,
        },
        {
            label: 'Cached builds',
            value: String(cache.builds.length),
            sublines: cache.builds.map(buildLine),
        },
    ];
};

export const check = {
    id: 'browser-cache-platform',
    title: 'Cached browsers match this machine',
    section: 'Browser cache',
    area: 'browser',
    needsNetwork: false,
    findingIds: ['BSI-BROWSER-005', 'BSI-BROWSER-006', 'BSI-BROWSER-007', 'BSI-BROWSER-019'],
    appliesTo: () => true,

    /**
     * Reports which cached builds this machine can run.
     *
     * @param {object} ctx - The check context.
     *
     * @returns {Promise<import('../findings.js').Finding[]>} One finding.
     */
    run: async (ctx) => {
        const { cache, host } = ctx;
        const facts = cacheFacts(ctx);
        // This check judges the browser type and the platform, and nothing else. Deliberately not
        // `build.usable`: that also folds in whether the binary is on disk, which is the sibling
        // check's question, and reading it here made a build whose binary is present but
        // unusable for some third reason report as "built for a different operating system" -
        // a headline naming a cause that was not the cause.
        const requestedBrowser = ctx.options.browser ?? 'chrome';
        const ofType = cache.builds.filter((build) => build.browser === requestedBrowser);
        const runnable = ofType.filter((build) => build.canRunHere);

        if (cache.readError) {
            // The cache could not be read at all. An error, because on a machine with no browser
            // executable configured this is the whole of what a real run would look at - and it
            // is the LocalSystem symptom this command exists to surface: a directory staged by an
            // administrator that the service account cannot open.
            return [
                finding({
                    id: 'BSI-BROWSER-019',
                    // Gated like its siblings. An unreadable cache that nothing was going to read
                    // - because --browser-executable-path names a browser that works - is worth
                    // saying and is not a failure. Unconditional ERROR here failed machines whose
                    // report said, three lines earlier, that the browser had launched.
                    severity: failedTheRun(ctx) ? SEVERITY.ERROR : SEVERITY.WARNING,
                    title: 'the browser cache directory could not be read',
                    // Same shape as the launch check's: the interpolated error is last, because a
                    // message that ends in its own period would otherwise produce two.
                    detail: `Butler Sheet Icons could not read ${cache.dir}. Whatever browsers are staged there, this account cannot see them, so a real run would behave as though the cache were empty. The error was: ${cache.readError}`,
                    facts,
                    evidence: { cacheDir: cache.dir, error: cache.readError },
                    remediation: [
                        {
                            text: `Check that the account this runs as (${ctx.host.user}) can read ${cache.dir} and everything under it. A cache staged from an administrator's own profile is the usual cause - under a Windows scheduled task Butler Sheet Icons often runs as LocalSystem, not as the person who staged it.`,
                        },
                        {
                            text: 'Or move the browser cache somewhere the service account can read, and point Butler Sheet Icons at it with --browser-cache-dir or BSI_BROWSER_CACHE_DIR.',
                        },
                    ],
                    docs: 'guide/advanced/air-gapped-installation',
                }),
            ];
        }

        if (cache.builds.length === 0) {
            return [
                finding({
                    id: 'BSI-BROWSER-007',
                    severity: SEVERITY.INFO,
                    title: 'The browser cache holds no browser builds',
                    // Informational rather than an error on its own: a machine with a system
                    // browser named by --browser-executable-path needs nothing in the cache. The
                    // selection check is what decides whether the absence matters.
                    detail: `No browser builds were found in ${cache.dir}${cache.exists ? '' : ', which does not exist'}.`,
                    facts,
                    evidence: { cacheDir: cache.dir, cacheDirExists: cache.exists },
                }),
            ];
        }

        // The cache holds browsers, but none of the type this run needs. Reported before the
        // platform question because the remedy is different and the platform sentence would be
        // simply false: `~/.cache/puppeteer` is shared with any other Puppeteer install on the
        // host, so a cache full of perfectly good chrome-headless-shell builds for exactly this
        // platform is a normal way to arrive here.
        if (ofType.length === 0) {
            const types = [...new Set(cache.builds.map((build) => build.browser))];

            return [
                finding({
                    id: 'BSI-BROWSER-007',
                    severity: SEVERITY.INFO,
                    title: `The browser cache holds no ${requestedBrowser} builds`,
                    detail: `The cache at ${cache.dir} holds ${cache.builds.length} build(s), but of ${types.join(', ')} rather than ${requestedBrowser}. Butler Sheet Icons only looks for ${requestedBrowser}, so none of them can be used.`,
                    facts,
                    evidence: { cacheDir: cache.dir, cachedTypes: types, requestedBrowser },
                }),
            ];
        }

        if (runnable.length > 0) {
            return [
                finding({
                    id: 'BSI-BROWSER-005',
                    severity: SEVERITY.OK,
                    title: 'Cached browsers match this machine',
                    detail: `${runnable.length} of ${ofType.length} cached ${requestedBrowser} build(s) in ${cache.dir} can run on this machine (platform "${host.hostPlatform ?? 'unknown'}").`,
                    facts,
                    evidence: {
                        cacheDir: cache.dir,
                        hostPlatform: host.hostPlatform,
                        runnableBuildIds: runnable.map((build) => build.buildId),
                    },
                }),
            ];
        }

        const platforms = [...new Set(ofType.map((build) => build.platform))];

        return [
            finding({
                id: 'BSI-BROWSER-006',
                // The same rule as its siblings: an observation about the cache is a failure only
                // when the cache is what this run depended on and nothing was selected. §7.3's
                // healthy sample is exactly the other case - a foreign build listed beside a
                // working executable override.
                severity: failedTheRun(ctx) ? SEVERITY.ERROR : SEVERITY.WARNING,
                title: 'the cached browsers were built for a different operating system',
                detail: `The cache at ${cache.dir} holds ${ofType.length} ${requestedBrowser} build(s), for ${platforms.join(', ')}. This machine is ${host.hostPlatform ?? 'a platform Butler Sheet Icons does not recognise'}. A browser cache copied from a machine with a different operating system cannot be used.`,
                facts,
                evidence: {
                    cacheDir: cache.dir,
                    hostPlatform: host.hostPlatform,
                    cachedPlatforms: platforms,
                },
                remediation: [
                    {
                        text: "Stage the browser from a machine running the same operating system as this one, and copy that machine's browser cache directory here.",
                        command: {
                            powershell:
                                'butler-sheet-icons.exe browser install --browser chrome --browser-version recommended',
                            bash: './butler-sheet-icons browser install --browser chrome --browser-version recommended',
                        },
                    },
                    {
                        text: 'Or, if Chrome or Edge is already installed on this machine, point Butler Sheet Icons at it with --browser-executable-path or BSI_BROWSER_EXECUTABLE_PATH.',
                    },
                ],
                docs: 'guide/advanced/air-gapped-installation',
            }),
        ];
    },
};
