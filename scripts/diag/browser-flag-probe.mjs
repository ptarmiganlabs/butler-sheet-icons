#!/usr/bin/env node
/**
 * Diagnostic probe for issue #913 - "--single-process makes every screenshot hang on macOS
 * depending on machine state".
 *
 * The failure is not reproducible on demand: the same machine, the same Chrome build and the same
 * code passed a few hours before it failed. Every data point so far lines up with the state of the
 * host's display and login session, but that is correlation. This probe exists to turn it into
 * evidence, so the flag is removed on a measurement rather than on a hunch.
 *
 * What it does, per trial:
 *
 *   1. Records the host session state - console user, screen lock, Aqua vs background launchd
 *      session, power assertions, and the last display on/off transition. A trial result is
 *      worthless without knowing which state the machine was in when it ran.
 *   2. Launches the browser Butler Sheet Icons would actually launch, using the product's own
 *      resolution and argument list, with and without `--single-process`.
 *   3. Screenshots `about:blank`. No Qlik, no network, no BSI code - the reporter isolated the
 *      failure this far already, and anything more would reintroduce variables.
 *   4. On a hang, samples the browser process with `sample(1)` before killing it. That stack is the
 *      whole point: it names what the single-process browser is blocked on, which is the difference
 *      between "we removed a flag that correlated with failures" and knowing why.
 *
 * The trial order is off / on / off. Running both variants inside one invocation is deliberate -
 * machine state drifts, and two runs minutes apart are not a controlled comparison.
 *
 * Usage:
 *   node scripts/diag/browser-flag-probe.mjs [--label <text>] [--timeout <ms>]
 *                                            [--browser <name>] [--browser-version <version>]
 *                                            [--artifact-dir <dir>]
 *
 * Exit code: 0 when every trial *without* the flag succeeded. A trial with the flag is reported
 * but never fails the run - observing that failure is the objective, and a canary that goes red
 * for the expected finding trains people to ignore it. Reporting is via stdout and, when present,
 * $GITHUB_STEP_SUMMARY.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

import { BASE_BROWSER_ARGS, resolveBrowserExecutablePath } from '../../src/lib/browser/browser-launch.js';
import { VERSION_RECOMMENDED } from '../../src/lib/browser/browser-version.js';

const SINGLE_PROCESS = '--single-process';

/**
 * Parses `--key value` pairs into an object, applying defaults for anything not supplied.
 *
 * Hand-rolled rather than pulled from commander: this script is run by CI and by hand on a build
 * host, and it should stay runnable straight from a checkout without caring whether dev
 * dependencies are installed.
 *
 * @param {string[]} argv - Raw arguments, i.e. `process.argv.slice(2)`.
 *
 * @returns {object} Parsed options with defaults applied.
 */
const parseArgs = (argv) => {
    const options = {
        label: 'unspecified',
        timeout: 20000,
        browser: 'chrome',
        browserVersion: VERSION_RECOMMENDED,
        artifactDir: path.join(process.cwd(), 'flag-probe-artifacts'),
    };

    const keys = {
        '--label': 'label',
        '--timeout': 'timeout',
        '--browser': 'browser',
        '--browser-version': 'browserVersion',
        '--artifact-dir': 'artifactDir',
    };

    for (let i = 0; i < argv.length; i += 2) {
        const key = keys[argv[i]];
        if (!key) {
            throw new Error(`Unknown argument: ${argv[i]}`);
        }
        options[key] = key === 'timeout' ? Number(argv[i + 1]) : argv[i + 1];
    }

    return options;
};

/**
 * Runs a command and returns its trimmed output, or a marker when it is unavailable.
 *
 * Every state probe below is best-effort by design. `ioreg`, `pmset` and friends differ between
 * macOS releases and between Apple Silicon and Intel, and a probe that crashed because one
 * diagnostic is missing on the host would lose the trial it was meant to describe.
 *
 * @param {string} command - Executable to run.
 * @param {string[]} args - Arguments for the command.
 *
 * @returns {string} Trimmed stdout, or `'(unavailable)'` if the command could not run.
 */
const capture = (command, args) => {
    try {
        return execFileSync(command, args, { encoding: 'utf8', timeout: 15000 }).trim();
    } catch {
        return '(unavailable)';
    }
};

/**
 * Reads the last display power transition out of the power management log.
 *
 * There is no cheap direct query for this on Apple Silicon - `IODisplayWrangler` does not exist
 * and `pmset -g powerstate` fails - so the log is the reliable source. It costs about a second.
 *
 * @returns {string} The last `Display is turned on|off` line, or a marker.
 */
const lastDisplayTransition = () => {
    const log = capture('/bin/sh', ['-c', "pmset -g log | grep 'Display is turned' | tail -1"]);
    return log === '' ? '(no transition logged)' : log;
};

/**
 * Snapshots everything about the host that could plausibly gate the failure.
 *
 * `launchctl managername` is the one worth calling out: it reports `Aqua` for a process inside a
 * logged-in GUI session and `Background` for one without. A self-hosted runner installed as a
 * LaunchAgent moves between those, and that is a candidate trigger the display state alone does
 * not distinguish.
 *
 * @returns {object} Named state readings, all strings.
 */
const captureHostState = () => ({
    consoleUser: capture('/usr/bin/stat', ['-f%Su', '/dev/console']),
    launchdSession: capture('/bin/launchctl', ['managername']),
    screenLocked: capture('/bin/sh', [
        '-c',
        "ioreg -n Root -d1 -r -k CGSSessionScreenIsLocked | grep -c CGSSessionScreenIsLocked || true",
    ]).trim() === '0'
        ? 'no'
        : 'yes',
    lastDisplayEvent: lastDisplayTransition(),
    userIsActive: capture('/bin/sh', [
        '-c',
        "pmset -g assertions | awk '/UserIsActive/ {print $2; exit}'",
    ]),
    loginwindowRunning: capture('/bin/sh', ['-c', 'pgrep -x loginwindow >/dev/null && echo yes || echo no']),
});

/**
 * Rejects after `ms` milliseconds, so a hung CDP call fails in seconds instead of puppeteer's
 * 180 s default.
 *
 * The launch-level `protocolTimeout` already bounds the protocol call, but it does not bound
 * `page.goto`'s own waiting, and a probe that takes three minutes per trial is one nobody runs.
 *
 * @param {number} ms - Timeout in milliseconds.
 * @param {string} what - Operation name, used in the rejection message.
 *
 * @returns {{promise: Promise<never>, cancel: () => void}} The timer promise and its canceller.
 * The caller must cancel, or Node keeps the timer alive and the process will not exit.
 */
const deadline = (ms, what) => {
    let timer;
    const promise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${what} did not complete within ${ms} ms`)), ms);
    });
    return { promise, cancel: () => clearTimeout(timer) };
};

/**
 * Races an operation against a deadline.
 *
 * @param {Promise} operation - The operation to bound.
 * @param {number} ms - Timeout in milliseconds.
 * @param {string} what - Operation name for the error message.
 *
 * @returns {Promise<*>} The operation's value, or a rejection once the deadline passes.
 */
const withDeadline = async (operation, ms, what) => {
    const timer = deadline(ms, what);
    try {
        return await Promise.race([operation, timer.promise]);
    } finally {
        timer.cancel();
    }
};

/**
 * Captures a user-space stack trace of a browser process that stopped responding.
 *
 * This is the diagnostic the investigation is missing. `Page.captureScreenshot timed out` says
 * nothing about why; a `sample` taken while the process is still wedged shows which thread is
 * blocked and on what, which is what distinguishes a compositor starved of frames from, say, a
 * deadlock on a window server connection.
 *
 * `spindump` would say more but needs root, which a runner does not have. `sample` works on a
 * process the caller owns.
 *
 * @param {number} pid - Process id of the wedged browser.
 * @param {string} artifactDir - Directory to write the sample into.
 * @param {string} trialName - Used to name the file.
 *
 * @returns {string|undefined} Path to the sample file, or `undefined` if sampling failed.
 */
const sampleWedgedProcess = (pid, artifactDir, trialName) => {
    mkdirSync(artifactDir, { recursive: true });
    const outFile = path.join(artifactDir, `sample-${trialName}-pid${pid}.txt`);

    try {
        execFileSync('/usr/bin/sample', [String(pid), '5', '-file', outFile], {
            encoding: 'utf8',
            timeout: 60000,
        });
        return outFile;
    } catch (err) {
        console.error(`  could not sample pid ${pid}: ${err.message}`);
        return undefined;
    }
};

/**
 * Runs one trial: launch, health check, navigate, screenshot.
 *
 * Every step is bounded and reported separately, because *where* it stalls is itself evidence.
 * The reporter saw the hang wander between the first screenshot and a mid-sheet
 * `Runtime.callFunctionOn`, which suggests whatever needs the renderer first is what blocks - so
 * the probe records the first step that failed rather than just pass/fail.
 *
 * @param {object} params - Trial parameters.
 * @param {string} params.executablePath - Browser binary to launch.
 * @param {boolean} params.singleProcess - Whether to add `--single-process`.
 * @param {number} params.timeout - Per-step deadline in milliseconds.
 * @param {string} params.artifactDir - Where to write a sample if the browser wedges.
 *
 * @returns {Promise<object>} Trial result: `{ name, singleProcess, ok, failedAt, detail, timings,
 * samplePath, state }`.
 */
const runTrial = async ({ executablePath, singleProcess, timeout, artifactDir }) => {
    const name = singleProcess ? 'with-single-process' : 'without-single-process';
    const args = singleProcess ? [...BASE_BROWSER_ARGS, SINGLE_PROCESS] : [...BASE_BROWSER_ARGS];
    const state = captureHostState();
    const timings = {};

    console.log(`\n=== trial: ${name} ===`);
    console.log(
        `  host: consoleUser=${state.consoleUser} session=${state.launchdSession} ` +
            `locked=${state.screenLocked} userIsActive=${state.userIsActive}`
    );
    console.log(`  last display event: ${state.lastDisplayEvent}`);

    let browser;
    let pid;
    let failedAt;
    let detail;
    let samplePath;

    try {
        let t0 = Date.now();
        browser = await withDeadline(
            puppeteer.launch({
                executablePath,
                headless: true,
                ignoreHTTPSErrors: true,
                protocolTimeout: timeout,
                args,
            }),
            timeout,
            'launch'
        );
        timings.launch = Date.now() - t0;
        pid = browser.process()?.pid;

        // Browser.getVersion never reaches the renderer. It is included because it is what the
        // product's own health check does today, and showing it passing while the screenshot hangs
        // is the argument for making that check render something (issue #913, point 3).
        t0 = Date.now();
        const version = await withDeadline(browser.version(), timeout, 'browser.version()');
        timings.version = Date.now() - t0;
        detail = version;

        t0 = Date.now();
        const page = await withDeadline(browser.newPage(), timeout, 'newPage()');
        timings.newPage = Date.now() - t0;

        t0 = Date.now();
        await withDeadline(page.goto('about:blank'), timeout, 'goto(about:blank)');
        timings.goto = Date.now() - t0;

        t0 = Date.now();
        await withDeadline(
            page.screenshot({ encoding: 'base64' }),
            timeout,
            'Page.captureScreenshot'
        );
        timings.screenshot = Date.now() - t0;

        console.log(`  PASS  ${JSON.stringify(timings)}`);
        return { name, singleProcess, ok: true, timings, detail, state };
    } catch (err) {
        failedAt = err.message;
        console.error(`  FAIL  ${failedAt}`);

        if (pid) {
            samplePath = sampleWedgedProcess(pid, artifactDir, name);
            if (samplePath) {
                console.error(`  stack sample written to ${samplePath}`);
            }
        }

        return { name, singleProcess, ok: false, failedAt, timings, detail, samplePath, state };
    } finally {
        // A wedged browser will not close politely - browser.close() waits on the same protocol
        // that just timed out. Try the clean path briefly, then kill, so the next trial starts
        // against a machine that is not hosting a stuck Chromium.
        if (browser) {
            try {
                await withDeadline(browser.close(), 5000, 'browser.close()');
            } catch {
                browser.process()?.kill('SIGKILL');
            }
        }
    }
};

/**
 * Renders the trial results as a GitHub-flavoured markdown table.
 *
 * @param {object[]} results - Trial results from `runTrial`.
 * @param {string} label - The state label supplied by the caller, e.g. `display-asleep`.
 *
 * @returns {string} Markdown ready for a step summary.
 */
const renderSummary = (results, label) => {
    const state = results[0]?.state ?? {};
    const lines = [
        `### Browser flag probe - \`${label}\``,
        '',
        `- console user: \`${state.consoleUser}\``,
        `- launchd session: \`${state.launchdSession}\``,
        `- screen locked: \`${state.screenLocked}\``,
        `- UserIsActive assertion: \`${state.userIsActive}\``,
        `- last display event: \`${state.lastDisplayEvent}\``,
        '',
        '| Trial | `--single-process` | Result | Detail |',
        '| --- | --- | --- | --- |',
    ];

    for (const result of results) {
        const outcome = result.ok
            ? `screenshot OK in ${result.timings.screenshot} ms`
            : `**FAILED** - ${result.failedAt}`;
        lines.push(
            `| ${result.name} | ${result.singleProcess ? 'yes' : 'no'} | ${result.ok ? 'pass' : 'fail'} | ${outcome} |`
        );
    }

    return `${lines.join('\n')}\n`;
};

/**
 * Resolves the browser, runs the off/on/off trial sequence and reports.
 *
 * @returns {Promise<void>} Resolves once results are written; sets `process.exitCode` on failure.
 */
const main = async () => {
    const options = parseArgs(process.argv.slice(2));

    console.log(`Butler Sheet Icons browser flag probe - label "${options.label}"`);
    console.log(`platform=${process.platform} arch=${process.arch} node=${process.version}`);

    const { executablePath, buildId, source } = await resolveBrowserExecutablePath(options);
    console.log(`browser: ${options.browser} ${buildId} (${source})`);
    console.log(`base args: ${BASE_BROWSER_ARGS.join(' ')}`);

    const results = [];
    for (const singleProcess of [false, true, false]) {
        results.push(
            // eslint-disable-next-line no-await-in-loop -- the trials must be sequential; two
            // browsers competing for the same machine is not the thing being measured.
            await runTrial({
                executablePath,
                singleProcess,
                timeout: options.timeout,
                artifactDir: options.artifactDir,
            })
        );
    }

    const summary = renderSummary(results, options.label);
    console.log(`\n${summary}`);

    if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    }

    const controlFailed = results.some((result) => !result.singleProcess && !result.ok);
    const flaggedFailed = results.some((result) => result.singleProcess && !result.ok);

    if (controlFailed) {
        console.error(
            'CONTROL FAILED: screenshots hang in this state even without --single-process. ' +
                'Removing the flag would not fix issue #913 on its own.'
        );
        process.exitCode = 1;
        return;
    }

    if (flaggedFailed) {
        console.log(
            'REPRODUCED: --single-process hangs in this state while the same machine, at the same ' +
                'moment, screenshots fine without it. This is the evidence issue #913 needs.'
        );
        return;
    }

    console.log('No difference observed in this state - the machine was not in the failing state.');
};

await main();
