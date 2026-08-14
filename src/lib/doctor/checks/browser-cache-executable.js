import { SEVERITY, finding } from '../findings.js';
import { failedTheRun } from './cache-severity.js';

/**
 * Whether the cached builds have a browser behind them.
 *
 * `computeExecutablePath()` derives the binary's path from the cache layout without ever stat-ing
 * it, so a cache copied without its binaries - or without the `.metadata` file, which is what a
 * `tar` invocation that skips dotfiles produces - yields a perfectly plausible path to nothing.
 * The directory listing looks right, `browser list-installed` looks right, and the run fails at
 * launch.
 *
 * Renders under the same heading as {@link ./browser-cache-platform.js}, which carries the cache
 * overview facts. This check adds only its verdict.
 */
export const check = {
    id: 'browser-cache-executable',
    title: 'Cached browsers have their executables',
    section: 'Browser cache',
    area: 'browser',
    needsNetwork: false,
    findingIds: ['BSI-BROWSER-008', 'BSI-BROWSER-009'],

    // Applies only when there is a build whose binary is the *remaining* question: of the
    // requested browser, and able to run here. Everything else is the platform check's subject.
    //
    // That precedence is `unusableReason`'s, and honouring it is what stops one build producing
    // two diagnoses. A cache that is both foreign-platform and binary-less used to emit
    // BSI-BROWSER-006 and BSI-BROWSER-009 together, giving a four-step "Next steps" whose last two
    // entries told the administrator to re-copy the cache preserving hidden files - advice that
    // cannot help a build compiled for another operating system.
    //
    // An empty or unreadable cache is excluded for the same reason: the platform check reports
    // both, and "0 of 0 builds are missing their binaries" is noise.
    appliesTo: (ctx) =>
        !ctx.cache.readError &&
        ctx.cache.builds.some(
            (build) => build.browser === (ctx.options.browser ?? 'chrome') && build.canRunHere
        ),

    /**
     * Reports which cached builds are missing their binary.
     *
     * @param {object} ctx - The check context.
     *
     * @returns {Promise<import('../findings.js').Finding[]>} One finding.
     */
    run: async (ctx) => {
        const { cache } = ctx;
        // Only builds a real run would actually reach for. A chrome-headless-shell build with no
        // binary behind it is not this run's problem, and reporting it as an error would fail a
        // machine over a browser Butler Sheet Icons never looks at.
        const requestedBrowser = ctx.options.browser ?? 'chrome';
        const ofType = cache.builds.filter(
            (build) => build.browser === requestedBrowser && build.canRunHere
        );
        const incomplete = ofType.filter((build) => !build.executableExists);

        if (incomplete.length === 0) {
            return [
                finding({
                    id: 'BSI-BROWSER-008',
                    severity: SEVERITY.OK,
                    title: 'Every cached browser has its executable',
                    detail: `All ${ofType.length} cached ${requestedBrowser} build(s) in ${cache.dir} have their browser binary on disk.`,
                    evidence: { cacheDir: cache.dir, buildCount: ofType.length },
                }),
            ];
        }

        return [
            finding({
                id: 'BSI-BROWSER-009',
                // Only a failure when it actually stopped the run. An incomplete build sitting
                // beside a working one is cruft, not a fault: the real run selected the good build
                // and took its screenshots. Judging every build in isolation made `browser check`
                // print "Launched: yes / Reported version: Chrome/..." and then FAIL, blocking a
                // Sense server that demonstrably works - and one leftover directory from an
                // interrupted install is ordinary, which is what made this the likeliest way for
                // the gate to reject a healthy machine.
                //
                // The real run's own policy, from browser-detect.js: "a healthy run with one stale
                // directory beside a usable build stays quiet, because warnings that fire on
                // success get ignored."
                severity: failedTheRun(ctx) ? SEVERITY.ERROR : SEVERITY.WARNING,
                title: 'cached browsers are missing their executable files',
                detail: `${incomplete.length} of ${ofType.length} cached ${requestedBrowser} build(s) in ${cache.dir} have no browser binary where one should be: ${incomplete.map((build) => `${build.browser} ${build.buildId} (expected at ${build.executablePath})`).join('; ')}. The cache directory is incomplete - copied without the browser binary, or left behind by a failed install.`,
                evidence: {
                    cacheDir: cache.dir,
                    incomplete: incomplete.map((build) => ({
                        browser: build.browser,
                        buildId: build.buildId,
                        executablePath: build.executablePath,
                    })),
                },
                remediation: [
                    {
                        text: 'Copy the browser cache directory again, preserving hidden files - a tar or robocopy invocation that skips dotfiles leaves the .metadata file behind and produces exactly this.',
                    },
                    {
                        text: 'Or install the browser again on a machine with internet access, and copy the whole cache directory here.',
                        command: {
                            powershell:
                                'butler-sheet-icons.exe browser install --browser chrome --browser-version recommended',
                            bash: './butler-sheet-icons browser install --browser chrome --browser-version recommended',
                        },
                    },
                ],
                docs: 'guide/advanced/air-gapped-installation',
            }),
        ];
    },
};
