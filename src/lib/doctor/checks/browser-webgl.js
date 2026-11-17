import { SEVERITY, finding } from '../findings.js';
import { rerunWith } from './rerun-command.js';

/**
 * Whether the browser a run would start can draw WebGL 2 (issue #1235).
 *
 * A chart drawn with WebGL - the Network.qs extension is the case that prompted this - needs a
 * browser that offers it. Without WebGL the chart draws its own error message instead, the
 * thumbnail shows that message, and the run reports success: from Butler Sheet Icons' side nothing
 * failed. This check is the only place an administrator can see it coming.
 *
 * Five outcomes:
 *
 * - **WebGL 2, on a GPU.** Charts drawn with WebGL will appear in thumbnails.
 * - **WebGL 2, in software.** They will appear, drawn by SwiftShader or another software
 *   renderer - slower, but correct. The normal case on a server or in a container with no GPU.
 * - **No WebGL 2, GPU off.** The default: Butler Sheet Icons starts the browser with
 *   `--disable-gpu` unless `--browser-gpu` is on. Not a warning, because most sheets draw without
 *   WebGL and every machine on the default would otherwise warn.
 * - **No WebGL 2, GPU on.** The administrator asked for it and did not get it - a warning.
 * - **Not checked.** The page could not be asked, which also leaves the answer unknown.
 *
 * None of them is an error. A real run without WebGL still writes every thumbnail; only the charts
 * that need it come out wrong, so failing a deployment gate over it would be too strong.
 *
 * Like the launch check, this reports what the worker found and does no I/O of its own: the page is
 * opened in `browser-facts.js`, and this stays a pure function of the context.
 *
 * `needsNetwork: false` - the page is blank and never navigated.
 */

/**
 * What to do when WebGL 2 is missing although `--browser-gpu` is on.
 *
 * @returns {import('../findings.js').Remediation[]} Steps that apply whatever the platform.
 */
const missingWithGpuRemediation = () => [
    {
        text: 'Without a GPU, WebGL is drawn in software by SwiftShader. The Chrome that Butler Sheet Icons downloads includes it; a Linux distribution\'s Chromium may ship it as a separate package - on Alpine Linux, "chromium-swiftshader".',
    },
    {
        text: 'If the browser is named by --browser-executable-path, try the browser Butler Sheet Icons downloads instead, to tell the browser from the machine.',
    },
];

export const check = {
    id: 'browser-webgl',
    title: 'The browser can draw WebGL 2',
    // The launch check's section, so these rows read as part of the same test: the browser
    // started, it answered, and this is what it can draw.
    section: 'Launch test',
    area: 'browser',
    needsNetwork: false,
    findingIds: [
        'BSI-BROWSER-024',
        'BSI-BROWSER-025',
        'BSI-BROWSER-026',
        'BSI-BROWSER-027',
        'BSI-BROWSER-028',
    ],

    // Only a browser that started and answered was asked. The launch check has already said why
    // any other one was not, and a second, emptier answer beneath it would add nothing.
    appliesTo: (ctx) => Boolean(ctx.launch?.ok && ctx.launch?.webgl),

    /**
     * Reports what the browser said about WebGL.
     *
     * @param {object} ctx - The check context.
     *
     * @returns {Promise<import('../findings.js').Finding[]>} One finding.
     */
    run: async (ctx) => {
        const { webgl, gpu } = ctx.launch;
        const evidence = { gpu, ...webgl };

        if (!webgl.checked) {
            return [
                finding({
                    id: 'BSI-BROWSER-028',
                    severity: SEVERITY.WARNING,
                    title: 'whether the browser can draw WebGL 2 could not be checked',
                    detail: `The browser started and answered, but a blank page could not be asked whether it can draw WebGL 2, so whether charts drawn with WebGL will appear in thumbnails is unknown. The error was: ${webgl.error}`,
                    facts: [{ label: 'WebGL 2', value: 'not checked' }],
                    evidence,
                }),
            ];
        }

        if (webgl.webgl2 && !webgl.software) {
            return [
                finding({
                    id: 'BSI-BROWSER-024',
                    severity: SEVERITY.OK,
                    title: 'The browser can draw WebGL 2',
                    detail: `The browser draws WebGL 2 with ${webgl.renderer}, so charts drawn with WebGL will appear in thumbnails.`,
                    facts: [
                        { label: 'WebGL 2', value: 'yes' },
                        { label: 'WebGL renderer', value: webgl.renderer },
                    ],
                    evidence,
                }),
            ];
        }

        if (webgl.webgl2) {
            return [
                finding({
                    id: 'BSI-BROWSER-025',
                    severity: SEVERITY.INFO,
                    title: 'The browser can draw WebGL 2, in software',
                    detail: `The browser draws WebGL 2 in software, with ${webgl.renderer}. Charts drawn with WebGL will appear in thumbnails, but take longer to draw than on a GPU.`,
                    facts: [
                        { label: 'WebGL 2', value: 'yes, in software' },
                        { label: 'WebGL renderer', value: webgl.renderer },
                    ],
                    evidence,
                }),
            ];
        }

        if (!gpu) {
            return [
                finding({
                    id: 'BSI-BROWSER-026',
                    severity: SEVERITY.INFO,
                    title: 'The browser cannot draw WebGL 2, because it is not allowed to use the GPU',
                    detail: 'The browser was started without the GPU, which is the default, and offers no WebGL 2. Charts drawn with WebGL, such as Network.qs charts, will show an error message in thumbnails instead of the chart. --browser-gpu true lets them draw.',
                    facts: [{ label: 'WebGL 2', value: 'no - GPU off, see --browser-gpu' }],
                    evidence,
                    remediation: [
                        {
                            text: 'If a sheet has a chart drawn with WebGL, check again with the GPU allowed.',
                            command: rerunWith(ctx, '--browser-gpu true'),
                        },
                        {
                            text: 'For a real run, set --browser-gpu true on create-sheet-thumbnails, or BSI_BROWSER_GPU=true.',
                        },
                    ],
                }),
            ];
        }

        return [
            finding({
                id: 'BSI-BROWSER-027',
                severity: SEVERITY.WARNING,
                title: 'the browser cannot draw WebGL 2, although it may use the GPU',
                // The SwiftShader sentence is in the detail, not only in the remediation: a
                // warning's remediation reaches the JSON report but is not printed, and this is
                // the one line the administrator reads. A fact about SwiftShader, not a claim that
                // it is the cause here - that cannot be observed from inside the browser.
                detail: 'The browser was started with --browser-gpu and still offers no WebGL 2, neither on a GPU nor in software. Charts drawn with WebGL, such as Network.qs charts, will show an error message in thumbnails instead of the chart. Without a GPU, the browser needs SwiftShader to draw WebGL in software; a Linux distribution\'s Chromium may ship it as a separate package - on Alpine Linux, "chromium-swiftshader".',
                facts: [{ label: 'WebGL 2', value: 'no, although --browser-gpu is on' }],
                evidence,
                remediation: missingWithGpuRemediation(),
            }),
        ];
    },
};
