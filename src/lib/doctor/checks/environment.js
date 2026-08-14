import { SEVERITY, finding } from '../findings.js';

/**
 * What this machine is, and who Butler Sheet Icons is running as.
 *
 * No verdict: this reports facts and leaves the reading to the administrator. It is nonetheless
 * the most valuable block in the report on Windows Server, because it turns the LocalSystem trap
 * into something visible. A scheduled task running as LocalSystem has its home directory under
 * `C:\Windows\system32\config\systemprofile` and its working directory at `C:\Windows\system32`,
 * so the browser cache an administrator staged into their own profile is not there, and the `.env`
 * file beside the executable is never loaded. Every one of those symptoms is baffling until these
 * five lines are in front of you.
 */
export const check = {
    id: 'environment',
    title: 'This machine, and the account Butler Sheet Icons is running as',
    section: 'Environment',
    area: 'environment',
    needsNetwork: false,
    findingIds: ['BSI-ENV-001'],
    appliesTo: () => true,

    /**
     * Reports the machine facts.
     *
     * @param {object} ctx - The check context.
     *
     * @returns {Promise<import('../findings.js').Finding[]>} One informational finding.
     */
    run: async (ctx) => {
        const { hostPlatform, nodePlatform, arch, user, homeDir, cwd, isSea } = ctx.host;

        // Naming the Puppeteer platform matters: it is the name cached browser builds are filed
        // under, so it is the value a "built for another platform" message has to be compared
        // against. An unrecognised host is stated rather than left blank - it changes how
        // detection behaves, because an undetectable platform makes every cached build eligible.
        const platformValue = hostPlatform
            ? `${nodePlatform} ${arch} (Puppeteer platform "${hostPlatform}")`
            : `${nodePlatform} ${arch} (Puppeteer platform not recognised)`;

        return [
            finding({
                id: 'BSI-ENV-001',
                severity: SEVERITY.INFO,
                title: 'Machine and account details',
                detail: `Running on ${platformValue} as user "${user}", from working directory ${cwd}.`,
                facts: [
                    { label: 'Platform', value: platformValue },
                    { label: 'Running as user', value: user },
                    { label: 'Home directory', value: homeDir },
                    { label: 'Working directory', value: cwd },
                    { label: 'Standalone binary', value: String(isSea) },
                ],
                evidence: { hostPlatform, nodePlatform, arch, user, homeDir, cwd, isSea },
            }),
        ];
    },
};
