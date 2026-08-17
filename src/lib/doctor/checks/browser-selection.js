import { SEVERITY, finding } from '../findings.js';
import { VERSION_FORM } from '../../browser/browser-version.js';
import { rerunWith } from './rerun-command.js';

/**
 * Which browser a real run would use, decided the same way a real run decides it.
 *
 * This is the check the whole command exists for. Detection has already run - without touching the
 * network, see `browserCheck()` - and this reports what it chose, or why it chose nothing.
 *
 * "Would have to download one" is an error even on a machine with a working internet connection.
 * The question `browser check` answers is whether this machine can take screenshots *by itself*;
 * a run that depends on reaching the Chrome for Testing servers is a run that will fail the first
 * time a proxy rule changes, and on the air-gapped hosts this work is about it fails today.
 */
export const check = {
    id: 'browser-selection',
    title: 'A browser can be selected without downloading one',
    section: 'Selection',
    area: 'browser',
    needsNetwork: false,
    findingIds: [
        'BSI-BROWSER-010',
        'BSI-BROWSER-011',
        'BSI-BROWSER-012',
        'BSI-BROWSER-013',
        'BSI-BROWSER-017',
        'BSI-BROWSER-018',
        'BSI-BROWSER-022',
        'BSI-BROWSER-023',
    ],
    appliesTo: () => true,

    /**
     * Reports the selected browser, or the reason there is none.
     *
     * @param {object} ctx - The check context.
     *
     * @returns {Promise<import('../findings.js').Finding[]>} One finding, or two when a version
     * pin could not be checked.
     */
    run: async (ctx) => {
        const { detection, cache } = ctx;
        const findings = [];
        const usable = cache.builds.filter((build) => build.usable);
        const requestedBrowser = ctx.options.browser ?? 'chrome';

        // Whether `--browser-version` has any bearing on this run at all. It does not when a named
        // executable exists: `resolveBrowserExecutablePath` skips version resolution entirely in
        // that case, so a real run neither validates the value nor uses it.
        //
        // Both directions of that matter. Warning about version drift sent customers chasing a
        // problem their configuration cannot have - and, since an invalid version became an error,
        // failing the check for it would be worse still: the doctor would report FAILED for a
        // configuration on which a real run succeeds.
        const versionDecidesTheBuild = !ctx.executableOverride?.exists;

        // The browser itself is unsupported, so nothing about the version is worth saying: the
        // version findings below would all be describing a setting that is not the problem.
        if (detection.browserError) {
            findings.push(
                finding({
                    id: 'BSI-BROWSER-023',
                    severity: SEVERITY.ERROR,
                    title: 'the requested browser is not one Butler Sheet Icons can drive',
                    detail: `--browser is set to "${requestedBrowser}", which Butler Sheet Icons cannot use: ${detection.browserError} Chrome is the only supported browser - the screenshot path speaks the Chrome DevTools Protocol and passes a Chromium-only argument list, so no other browser could be driven.`,
                    facts: [{ label: 'Requested browser', value: requestedBrowser }],
                    evidence: { browser: requestedBrowser, error: detection.browserError },
                    remediation: [
                        {
                            text: 'Set --browser to "chrome", or leave it unset - "chrome" is the default.',
                        },
                    ],
                })
            );

            return findings;
        }

        if (detection.selection) {
            const { source, executablePath, browser, buildId } = detection.selection;
            const wouldUse =
                source === 'system' ? 'system browser' : `cached browser (${browser} ${buildId})`;

            findings.push(
                finding({
                    id: 'BSI-BROWSER-010',
                    severity: SEVERITY.OK,
                    title: 'A browser was selected without downloading one',
                    detail: `A real run would use the ${wouldUse} at ${executablePath}.`,
                    facts: [
                        { label: 'Requested', value: detection.requested },
                        { label: 'Would use', value: wouldUse },
                        { label: 'Executable', value: executablePath },
                    ],
                    evidence: { source, executablePath, browser, buildId },
                })
            );
        } else if (detection.error) {
            // Detection refused to continue rather than finding nothing. Today the only way that
            // happens is an explicitly named executable that is not there, which the
            // executable-override check reports in full - so this names that finding as its cause
            // and the runner demotes this one when it is present. Declaring the cause rather than
            // predicting it is what keeps an unexplained detection failure a failure.
            findings.push(
                finding({
                    id: 'BSI-BROWSER-012',
                    severity: SEVERITY.ERROR,
                    title: 'no browser could be selected',
                    detail: `Browser detection stopped with an error, so no browser was selected: ${detection.error.message}`,
                    facts: [
                        { label: 'Requested', value: detection.requested },
                        { label: 'Would use', value: 'nothing - detection could not complete' },
                    ],
                    evidence: { error: detection.error.message },
                    supersededBy: ['BSI-BROWSER-002'],
                    remediation: [
                        {
                            text: 'Correct the browser configuration named in the error above, then run this check again.',
                        },
                    ],
                })
            );
        } else if (usable.length > 0) {
            // The difference between a lookup table and an investigator, and it is a distinct
            // condition rather than a variation on the one below: this machine has a browser it
            // can run, and the only obstacle is that a *different* build was asked for. Telling
            // this administrator to go and download something would send them to fix a problem
            // they do not have - which is exactly the "wrong advice is worse than none" risk.
            //
            // Since issue #878 every version, keyword included, resolves to exactly one build
            // before the cache is searched, so "use --browser-version latest instead" is not a
            // way out: it would miss in precisely the same way. Naming the build ids is the only
            // advice that works.
            findings.push(
                finding({
                    id: 'BSI-BROWSER-017',
                    severity: SEVERITY.ERROR,
                    title: 'the requested browser build is not in the cache, although other builds are',
                    detail: `${detection.requested} was requested, and ${cache.dir} holds no such build. It does hold ${usable.length} build(s) this machine can run: ${usable.map((build) => `${build.browser} ${build.buildId}`).join(', ')}. A real run would try to download the requested build, which needs internet access.`,
                    facts: [
                        { label: 'Requested', value: detection.requested },
                        {
                            label: 'Would use',
                            value: 'nothing - the requested build would have to be downloaded',
                        },
                    ],
                    evidence: {
                        cacheDir: cache.dir,
                        requested: detection.requested,
                        usableBuildIds: usable.map((build) => build.buildId),
                    },
                    remediation: [
                        {
                            text: `Use one of the builds already on this machine: set --browser-version to ${usable.map((build) => build.buildId).join(' or ')}, or set the matching BSI_*_BROWSER_VERSION environment variable.`,
                            // The command the administrator actually ran - see rerun-command.js.
                            command: rerunWith(ctx, `--browser-version ${usable[0].buildId}`),
                        },
                        {
                            text: 'Or, on a machine with internet access and the same operating system as this one, install the requested build and copy the browser cache directory here.',
                            // The normalised values from `detection`, never the raw options bag:
                            // `browserCheck({})` is a supported call shape, and reading
                            // `ctx.options.browserVersion` there printed
                            // `--browser-version undefined` into a command an administrator is
                            // being invited to paste.
                            command: {
                                powershell: `butler-sheet-icons.exe browser install --browser ${requestedBrowser} --browser-version ${detection.requestedVersion}`,
                                bash: `./butler-sheet-icons browser install --browser ${requestedBrowser} --browser-version ${detection.requestedVersion}`,
                            },
                        },
                    ],
                    docs: 'guide/advanced/air-gapped-installation',
                })
            );
        } else {
            // Nothing usable at all. Always an error, with the full remediation - the runner
            // demotes it if one of the cache checks named below is actually reporting the reason.
            //
            // It used to decide that for itself, from `cache.inUse && cache.builds.length > 0`.
            // That was a prediction about two other checks, and it held only while `usable` meant
            // exactly `canRunHere && executableExists`: the moment a build could be unusable for a
            // third reason, both cache checks reported OK, this demoted itself anyway, and the
            // command exited 0 on a machine that could not take a screenshot.
            findings.push(
                finding({
                    id: 'BSI-BROWSER-011',
                    severity: SEVERITY.ERROR,
                    title: 'no usable browser was found, and taking screenshots would require downloading one over the internet',
                    detail: `Neither a configured browser executable nor a usable build in ${cache.dir} could be used for ${detection.requested}. A real run would try to download a browser, which needs internet access.`,
                    facts: [
                        { label: 'Requested', value: detection.requested },
                        {
                            label: 'Would use',
                            value: 'nothing - a browser would have to be downloaded',
                        },
                    ],
                    evidence: { cacheDir: cache.dir, requested: detection.requested },
                    supersededBy: ['BSI-BROWSER-006', 'BSI-BROWSER-009', 'BSI-BROWSER-019'],
                    remediation: [
                        {
                            text: 'On a machine with internet access, and the same operating system as this one, run:',
                            command: {
                                powershell:
                                    'butler-sheet-icons.exe browser install --browser chrome --browser-version recommended',
                                bash: './butler-sheet-icons browser install --browser chrome --browser-version recommended',
                            },
                        },
                        {
                            text: `Copy that machine's browser cache directory to this machine, and point Butler Sheet Icons at it with --browser-cache-dir or BSI_BROWSER_CACHE_DIR.`,
                        },
                        {
                            text: 'Or, if Chrome or Edge is already installed here, point at it with --browser-executable-path or BSI_BROWSER_EXECUTABLE_PATH.',
                        },
                    ],
                    docs: 'guide/advanced/air-gapped-installation',
                })
            );
        }

        // A version a real run refuses outright. Reported as an error rather than a warning, and
        // independently of whether a browser was found: `browser check` used to accept any
        // unrecognised value as a floating keyword and exit 0, while `resolveBrowserVersion`
        // threw for the same value and killed the real thumbnail run. A gate that passes on the
        // misconfiguration it was run to catch is worse than no gate.
        if (versionDecidesTheBuild && detection.versionForm === VERSION_FORM.INVALID) {
            findings.push(
                finding({
                    id: 'BSI-BROWSER-018',
                    severity: SEVERITY.ERROR,
                    title: 'the requested browser version is not a value Butler Sheet Icons accepts',
                    detail: `--browser-version "${detection.requestedVersion}" is neither a keyword nor a build id, so a real run would stop with "Invalid --browser-version" before it looked for a browser at all. Whatever this check reports about the browser on this machine, a run with this setting cannot start.`,
                    facts: [{ label: 'Requested version', value: detection.requestedVersion }],
                    evidence: { browserVersion: detection.requestedVersion },
                    remediation: [
                        {
                            text: 'Use a keyword - "recommended" for the build Butler Sheet Icons is tested against, or "stable" for the newest stable release - or an exact version: a milestone such as "151", a build prefix such as "151.0.7922", or a full build id such as "151.0.7922.77".',
                        },
                        {
                            text: 'To see which builds are already on this machine, run:',
                            command: {
                                powershell: 'butler-sheet-icons.exe browser list-installed',
                                bash: './butler-sheet-icons browser list-installed',
                            },
                        },
                    ],
                })
            );
        }

        // The pin is valid but could not be confirmed without the network. Worth saying whatever
        // the outcome, because the doctor must not report OK under different pin semantics than
        // the real run would use - and this command will not make that call, since a diagnostic
        // that hangs on a DNS timeout on an air-gapped server is worse than no diagnostic.
        //
        // The two forms are described separately. A milestone or build prefix is an *explicit
        // pin* that happens to need a lookup; calling it a value that "names whichever build is
        // newest" told an administrator their deliberate pin was floating, and then advised them
        // to name an exact build id - which is what they thought they had done.
        // A milestone or build prefix. Its own finding, and an error - not a variation on the
        // floating-keyword warning below, which is what it used to be.
        //
        // The difference is in `resolveRequestedBuildId` (browser-launch.js): a failed lookup
        // degrades to the newest cached build **only** when `isVersionKeyword` is true, and
        // `isVersionKeyword('151')` is false. So on an air-gapped host a real run does not quietly
        // use a different build - it throws before it ever reaches the cache. Sharing a WARNING
        // with `stable` reported OK for a configuration that cannot start, on exactly the machines
        // this command exists for.
        if (versionDecidesTheBuild && detection.versionForm === VERSION_FORM.PARTIAL) {
            findings.push(
                finding({
                    id: 'BSI-BROWSER-022',
                    severity: SEVERITY.ERROR,
                    title: 'the requested browser version can only be resolved over the internet',
                    detail: `--browser-version "${detection.requestedVersion}" names a milestone or a partial build id, and turning that into a single build is the browser vendor's lookup. Butler Sheet Icons does not fall back to a cached build for this form - only for keywords such as "recommended" and "stable" - so a real run on a machine without internet access stops with a lookup error before it looks at the cache at all. Whatever this check reports about the browser here, a run with this setting cannot start offline.`,
                    facts: [{ label: 'Requested version', value: detection.requestedVersion }],
                    evidence: { browserVersion: detection.requestedVersion, form: 'partial' },
                    remediation: [
                        {
                            text: 'Name the full build id, such as "151.0.7922.77" - "butler-sheet-icons browser list-installed" shows the builds already on this machine.',
                            command: {
                                powershell: 'butler-sheet-icons.exe browser list-installed',
                                bash: './butler-sheet-icons browser list-installed',
                            },
                        },
                        {
                            text: 'Or use "recommended", which resolves from a value compiled into Butler Sheet Icons and needs no lookup at all.',
                        },
                    ],
                    docs: 'guide/advanced/air-gapped-installation',
                })
            );
        }

        if (versionDecidesTheBuild && detection.versionForm === VERSION_FORM.FLOATING) {
            findings.push(
                finding({
                    id: 'BSI-BROWSER-013',
                    severity: SEVERITY.WARNING,
                    title: 'the requested browser version could not be checked without internet access',
                    detail: `--browser-version "${detection.requestedVersion}" names whichever build is newest at the time it runs, which can only be resolved over the internet. This check did not make that call, so it accepted the newest suitable build already present instead. A real run on a machine with internet access may therefore choose a different build than the one reported here.`,
                    evidence: { browserVersion: detection.requestedVersion, form: 'floating' },
                    remediation: [
                        {
                            text: 'Use --browser-version recommended, which resolves from a value compiled into Butler Sheet Icons and needs no lookup, or name an exact build id.',
                        },
                    ],
                })
            );
        }

        return findings;
    },
};
