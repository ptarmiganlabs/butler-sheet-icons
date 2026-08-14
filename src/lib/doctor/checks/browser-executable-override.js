import { SEVERITY, finding } from '../findings.js';

/**
 * Whether a browser executable named by the administrator is actually there.
 *
 * The single most valuable thing this command can catch, because it means somebody's *explicit*
 * configuration is wrong - and until issue #1061 the only symptom was a run that failed much later
 * with an error naming none of this.
 *
 * The two tiers are treated differently on purpose, mirroring `detectAvailableBrowser`:
 *
 * - `--browser-executable-path` / `BSI_BROWSER_EXECUTABLE_PATH` is a stated intent. If the file is
 *   not there, a real run stops rather than downloading some other browser, so this is an error.
 * - `PUPPETEER_EXECUTABLE_PATH` is a much weaker signal - typically inherited from a container
 *   image or a developer shell - and a real run falls through to the cache, so this is a warning.
 *   Reporting it as an error would fail the check on every machine that has the variable set and
 *   works perfectly.
 */
export const check = {
    id: 'browser-executable-override',
    title: 'A named browser executable resolves and exists',
    section: 'Browser executable',
    area: 'browser',
    needsNetwork: false,
    findingIds: ['BSI-BROWSER-001', 'BSI-BROWSER-002', 'BSI-BROWSER-003', 'BSI-BROWSER-004'],
    appliesTo: () => true,

    /**
     * Reports on the configured browser executable, if there is one.
     *
     * @param {object} ctx - The check context.
     *
     * @returns {Promise<import('../findings.js').Finding[]>} One finding.
     */
    run: async (ctx) => {
        const override = ctx.executableOverride;

        if (!override) {
            return [
                finding({
                    id: 'BSI-BROWSER-004',
                    severity: SEVERITY.OK,
                    title: 'No browser executable is configured',
                    detail: `Neither --browser-executable-path nor PUPPETEER_EXECUTABLE_PATH is set, so Butler Sheet Icons will use a browser from its cache at ${ctx.cache.dir}.`,
                    facts: [{ label: 'Configured', value: 'no' }],
                }),
            ];
        }

        const facts = [
            { label: 'Source', value: override.sourceLabel },
            { label: 'Path', value: override.path },
            { label: 'Exists', value: override.exists ? 'yes' : 'no' },
        ];

        if (override.exists) {
            return [
                finding({
                    id: 'BSI-BROWSER-001',
                    severity: SEVERITY.OK,
                    title: 'The configured browser executable exists',
                    detail: `${override.sourceLabel}: ${override.path}, which is present on this machine.`,
                    facts,
                    evidence: { path: override.path, source: override.source },
                }),
            ];
        }

        if (override.explicit) {
            return [
                finding({
                    id: 'BSI-BROWSER-002',
                    severity: SEVERITY.ERROR,
                    title: 'the configured browser executable does not exist',
                    // The value as the operator wrote it, not as it resolved. A relative path
                    // printed back absolute is one they cannot find in their unit file.
                    detail: `--browser-executable-path / BSI_BROWSER_EXECUTABLE_PATH is set to "${override.configuredValue}", and no such file exists on this machine. Butler Sheet Icons will not fall back to downloading a browser when an executable path has been given explicitly, so every thumbnail run will stop here.`,
                    facts,
                    evidence: {
                        configuredValue: override.configuredValue,
                        path: override.path,
                        source: override.source,
                    },
                    remediation: [
                        {
                            text: `Correct the path so it names a browser that exists on this machine, or remove the setting to let Butler Sheet Icons find a browser itself. On Windows, Google Chrome is usually at C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe and Microsoft Edge at C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe.`,
                        },
                    ],
                    docs: 'guide/advanced/air-gapped-installation',
                }),
            ];
        }

        return [
            finding({
                id: 'BSI-BROWSER-003',
                severity: SEVERITY.WARNING,
                title: 'PUPPETEER_EXECUTABLE_PATH names a file that does not exist',
                detail: `PUPPETEER_EXECUTABLE_PATH is set to "${override.configuredValue}", and no such file exists on this machine. Butler Sheet Icons will ignore it and look in the browser cache instead, so this is not fatal - but the variable is doing nothing, and on a Docker image it usually means the browser is not where the image put it.`,
                facts,
                evidence: { configuredValue: override.configuredValue, path: override.path },
                remediation: [
                    {
                        text: 'Unset PUPPETEER_EXECUTABLE_PATH, or point it at a browser that exists.',
                    },
                ],
            }),
        ];
    },
};
