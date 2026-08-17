import { Option } from 'commander';

import {
    VERSION_RECOMMENDED,
    describeBrowserVersionOption,
    parseBrowserVersionValue,
} from '../browser/browser-version.js';
import { booleanOptionParser } from '../util/boolean-option.js';
import { buildBrowserCacheDirOption, buildBrowserExecutablePathOption } from './helpers.js';

/**
 * The options that describe how a real run would find and start a browser.
 *
 * Shared by `browser check` and `doctor check`, and shared deliberately. **A doctor that reports
 * OK under different settings than the run it is meant to predict is worse than no doctor**, so
 * both commands have to carry every option that changes which browser is picked or how it is
 * started - and two hand-maintained copies of that list is how one of them quietly stops matching.
 *
 * Several of these declarations encode a defect that has already been shipped once, which is the
 * other reason they belong in one place rather than being copied.
 *
 * @param {string} envPrefix - Per-command environment variable stem, e.g. `BSI_BROWSER_C`.
 * Applies to the four options that describe **this command's run**: `--browser`,
 * `--browser-version`, `--headless` and `--skip-launch`. It deliberately does NOT apply to
 * `--browser-cache-dir` and `--browser-executable-path`, whose variables are the unprefixed
 * `BSI_BROWSER_CACHE_DIR` and `BSI_BROWSER_EXECUTABLE_PATH` on every command that carries them:
 * where the browser lives is a property of the *machine*, not of a command, and the whole point
 * of a diagnostic is to read the same cache the real run reads. A per-command
 * `BSI_DOCTOR_C_BROWSER_CACHE_DIR` would let the doctor be pointed at a different cache than the
 * run it predicts - the one configuration this file's opening paragraph exists to prevent. An
 * administrator setting it by analogy with the four working siblings gets an "unknown variable"
 * that silently does nothing, which is why the split is documented on the doc site's option table
 * (the generated table shows the real variable name for every option) as well as here.
 *
 * @returns {Option[]} New option instances, in the order they should be declared.
 */
export const buildBrowserDiagnosticOptions = (envPrefix) => [
    // Chrome only: the render path speaks the Chrome DevTools Protocol. The option is carried so
    // the check accepts the same command line the other browser commands do.
    new Option('--browser <browser>', 'Browser to check for. Only "chrome" is supported.')
        .choices(['chrome'])
        .default('chrome')
        .env(`${envPrefix}_BROWSER`),

    // Same `'' -> recommended` normalisation the other browser commands apply, so a bare
    // `BSI_..._BROWSER_VERSION=` line in a unit file means "unset" rather than an error - and so
    // the check cannot report OK under different pin semantics than a real run would use.
    new Option('--browser-version <version>', describeBrowserVersionOption('check for'))
        .default(VERSION_RECOMMENDED)
        .argParser(parseBrowserVersionValue)
        .env(`${envPrefix}_BROWSER_VERSION`),

    buildBrowserCacheDirOption(),
    buildBrowserExecutablePathOption(),

    // A headed launch on a display-less server is a genuinely different test from a headless one,
    // which is what earns this option its place on a diagnostic.
    //
    // Parsed here rather than left to `parseHeadlessOption` at the point of use. That helper
    // accepts only the exact strings 'true'/'false' and quietly returns `true` for everything
    // else, so `--headless off` and `BSI_..._HEADLESS=0` ran headless - a false negative in the
    // one option whose stated purpose is to catch a headless-only failure. An empty value means
    // unset, and unset here is the default.
    new Option('--headless <true|false>', 'Headless (=not visible) browser (true, false)')
        .default(true)
        .argParser(booleanOptionParser({ whenEmpty: true }))
        .env(`${envPrefix}_HEADLESS`),

    // The argument is optional, not absent, and that is load-bearing. Declared as a bare flag,
    // Commander sets it from the mere *presence* of the environment variable and never reads the
    // value - so `BSI_BROWSER_C_SKIP_LAUNCH=false` turned skip-launch on, and the deployment gate
    // passed having never started a browser. With an optional argument the value reaches
    // `argParser`, which Commander also runs on environment values, so `--skip-launch false` and
    // `BSI_..._SKIP_LAUNCH=false` agree.
    //
    // Bare `--skip-launch` still means true: Commander stores boolean `true` for an
    // optional-argument option supplied without a value, and the parser passes booleans through
    // untouched.
    new Option(
        '--skip-launch [true|false]',
        'Find a browser but do not start it. Faster, and useful where starting a browser is not allowed - but it leaves the most valuable part of the check undone.'
    )
        .default(false)
        .argParser(booleanOptionParser({ whenEmpty: false }))
        .env(`${envPrefix}_SKIP_LAUNCH`),
];
