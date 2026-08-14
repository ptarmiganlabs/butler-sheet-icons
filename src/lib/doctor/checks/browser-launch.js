import { SEVERITY, finding } from '../findings.js';
import { BROWSER_LAUNCH_TIMEOUT_MS } from '../../browser/browser-launch.js';

/**
 * Whether the selected browser actually starts and answers.
 *
 * Resolving a path proves far less than starting the process. A browser build can be present,
 * correct for the platform, complete on disk - and still fail to start, because endpoint
 * protection holds it, because a shared library is missing on a minimal Linux image, or because
 * the build is one Puppeteer cannot drive at all.
 *
 * Three outcomes, and they are deliberately not one:
 *
 * - **The process never started.** Usually the environment: permissions, missing libraries,
 *   security software.
 * - **It started and then could not be driven.** Issue #878: the browser launches perfectly well
 *   and dies on the first command sent to it. The remedy is a different *build*, and nothing in
 *   the protocol error says so. Reporting this as "could not be started" was false, and it put
 *   antivirus advice in front of the fix.
 * - **It started slowly and worked.** The stall no timeout catches, because process creation is
 *   synchronous inside libuv and blocks the event loop. Reported as a clean pass before, which is
 *   how an administrator rules the browser out and then spends a week on the wrong thing.
 *
 * The launch itself is performed by the worker, before any check runs, and this reports the
 * result. That is not squeamishness about the rule that a check must not mutate anything: it is
 * what keeps this check a pure function of its context, so every branch here is unit-testable
 * without a browser.
 *
 * `needsNetwork: false` - starting a local process reaches nothing.
 */

/**
 * Remediation for a browser that never started, aimed at where the browser actually came from.
 *
 * A browser named by `--browser-executable-path` is not in the cache and is not chosen by
 * `--browser-version`: detection returns the override before it consults either. Offering the
 * cached-browser advice there sent administrators to exclude a directory nothing reads and to
 * paste a command that reproduces the identical failure.
 *
 * @param {object} ctx - The check context.
 *
 * @returns {import('../findings.js').Remediation[]} Steps that apply to this configuration.
 */
const startFailureRemediation = (ctx) => {
    const { executablePath, source } = ctx.detection.selection;

    if (source === 'system') {
        return [
            {
                text: `Check that ${executablePath} is a browser this machine can run, and that the account Butler Sheet Icons runs as (${ctx.host.user}) is allowed to execute it.`,
            },
            {
                text: 'On Windows, exclude that executable from real-time antivirus scanning. Endpoint protection holding a browser it has not seen before is the most common cause of this on a Sense server.',
            },
            {
                text: 'Or remove --browser-executable-path / BSI_BROWSER_EXECUTABLE_PATH and let Butler Sheet Icons use a browser from its own cache instead.',
            },
        ];
    }

    return [
        {
            text: 'On Windows, exclude the Butler Sheet Icons browser cache directory from real-time antivirus scanning. Endpoint protection holding a browser executable it has not seen before is the most common cause of this on a Sense server.',
        },
        {
            text: 'Try a different browser build - "recommended" selects the one Butler Sheet Icons is tested with.',
            command: {
                powershell: 'butler-sheet-icons.exe browser check --browser-version recommended',
                bash: './butler-sheet-icons browser check --browser-version recommended',
            },
        },
        {
            text: "On Linux, check that the browser's shared library dependencies are installed. A minimal container image often lacks them, and the failure names none of them.",
        },
    ];
};

export const check = {
    id: 'browser-launch',
    title: 'The selected browser starts and responds',
    section: 'Launch test',
    area: 'browser',
    needsNetwork: false,
    findingIds: [
        'BSI-BROWSER-014',
        'BSI-BROWSER-015',
        'BSI-BROWSER-016',
        'BSI-BROWSER-020',
        'BSI-BROWSER-021',
    ],

    // Nothing to launch, and nothing to say about it. The selection check has already reported
    // why there is no browser, and a "not attempted" line under a heading of its own would put a
    // second, emptier answer beneath the real one.
    appliesTo: (ctx) => Boolean(ctx.detection.selection),

    /**
     * Reports the launch attempt.
     *
     * @param {object} ctx - The check context.
     *
     * @returns {Promise<import('../findings.js').Finding[]>} One finding, or two when a launch
     * succeeded but took longer than the launch budget allows for.
     */
    run: async (ctx) => {
        const { launch, detection } = ctx;
        const { executablePath } = detection.selection;

        if (launch.skipped) {
            return [
                finding({
                    id: 'BSI-BROWSER-016',
                    severity: SEVERITY.INFO,
                    title: 'The launch test was skipped',
                    detail: `--skip-launch was given, so the browser at ${executablePath} was found but never started. Whether it runs on this machine has not been established.`,
                    facts: [{ label: 'Launched', value: 'no (--skip-launch)' }],
                }),
            ];
        }

        if (!launch.started) {
            return [
                finding({
                    id: 'BSI-BROWSER-015',
                    severity: SEVERITY.ERROR,
                    title: 'the browser could not be started',
                    detail: `The browser at ${executablePath} was found, but the process would not start: ${launch.error}`,
                    facts: [{ label: 'Launched', value: 'no' }],
                    evidence: { executablePath, error: launch.error },
                    remediation: startFailureRemediation(ctx),
                }),
            ];
        }

        if (!launch.ok) {
            // Issue #878. The build id is named because it is the thing to change, and because a
            // protocol error mentions nothing that ties the failure to --browser-version.
            const build = detection.selection.buildId;

            return [
                finding({
                    id: 'BSI-BROWSER-020',
                    severity: SEVERITY.ERROR,
                    title: 'the browser starts but cannot be driven by Butler Sheet Icons',
                    // The interpolated error goes last. Puppeteer's protocol errors end in a
                    // period of their own, so embedding one mid-sentence produced "Session
                    // closed.. The process is fine" - which reads as a typo in a line an
                    // administrator is being asked to trust.
                    detail: `The browser at ${executablePath} started and then stopped responding on the first command sent to it. The process is fine; this build cannot be driven. A real run fails the same way, part-way through a sheet. The error was: ${launch.error}`,
                    facts: [
                        { label: 'Launched', value: 'yes' },
                        { label: 'Responded', value: 'no' },
                        { label: 'Build', value: build },
                    ],
                    evidence: { executablePath, buildId: build, error: launch.error },
                    remediation: [
                        {
                            text: `Use a different browser build. "recommended" selects the build Butler Sheet Icons is tested against${build && build !== 'system-installed' ? `, rather than ${build}` : ''}.`,
                            command: {
                                powershell:
                                    'butler-sheet-icons.exe browser check --browser-version recommended',
                                bash: './butler-sheet-icons browser check --browser-version recommended',
                            },
                        },
                        {
                            text: "The same value can be set for a real run through the command's BSI_*_BROWSER_VERSION environment variable.",
                        },
                    ],
                }),
            ];
        }

        const findings = [
            finding({
                id: 'BSI-BROWSER-014',
                severity: SEVERITY.OK,
                title: 'The browser started and responded',
                detail: `The browser at ${executablePath} started and reported version ${launch.version}.`,
                facts: [
                    { label: 'Launched', value: 'yes' },
                    { label: 'Reported version', value: launch.version },
                ],
                evidence: { version: launch.version, elapsedMs: launch.elapsedMs },
            }),
        ];

        // A pass, with a caveat that matters more than it looks. `timeout` bounds the wait for the
        // browser to announce its debugging endpoint - it does not bound getting the process off
        // the ground, and on Windows process creation blocks the event loop, so no timer can fire
        // while it happens. Anything over the launch budget is by definition time that budget did
        // not account for, which makes it the natural threshold and means no second number to keep
        // in sync.
        if (launch.elapsedMs > BROWSER_LAUNCH_TIMEOUT_MS) {
            findings.push(
                finding({
                    id: 'BSI-BROWSER-021',
                    severity: SEVERITY.WARNING,
                    title: 'the browser started, but took far longer than it should have',
                    detail: `Starting the browser took ${Math.round(launch.elapsedMs / 1000)}s, longer than the ${BROWSER_LAUNCH_TIMEOUT_MS / 1000}s launch timeout allows for. It worked this time, so this check passes - but a real run can exceed the timeout on the same machine and fail with an error naming none of this.`,
                    facts: [{ label: 'Launch took', value: `${Math.round(launch.elapsedMs)} ms` }],
                    evidence: {
                        elapsedMs: launch.elapsedMs,
                        budgetMs: BROWSER_LAUNCH_TIMEOUT_MS,
                    },
                    remediation: [
                        {
                            text: 'On Windows this is typically antivirus or endpoint protection scanning a browser executable it has not seen before. Excluding the Butler Sheet Icons browser cache directory from real-time scanning avoids it.',
                        },
                    ],
                })
            );
        }

        return findings;
    },
};
